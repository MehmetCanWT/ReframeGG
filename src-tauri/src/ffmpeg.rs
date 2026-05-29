use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, ipc::Channel};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

lazy_static::lazy_static! {
    static ref CANCEL_FLAG: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Layer {
    pub id: String,
    pub label: String,
    #[serde(rename = "cropArea")]
    pub crop_area: Rect,
    #[serde(rename = "canvasPos")]
    pub canvas_pos: Rect,
    pub locked: bool,
    pub visible: bool,
    #[serde(rename = "maskShape")]
    pub mask_shape: Option<String>,
    #[serde(rename = "maskBase64")]
    pub mask_base64: Option<String>,
    pub blur: Option<f32>,
    pub brightness: Option<f32>,
    pub contrast: Option<f32>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", content = "data")]
pub enum RenderEvent {
    Progress { progress: f32, status: String },
    Complete { path: String },
    Error { message: String },
}

// Function to cancel active rendering
pub fn set_cancel_render(cancel: bool) {
    CANCEL_FLAG.store(cancel, Ordering::SeqCst);
}

// Check if ffmpeg is in path or resolves from the sidecar
fn get_ffmpeg_path(app_handle: &AppHandle) -> PathBuf {
    match app_handle.path().resource_dir() {
        Ok(dir) => {
            let sidecar_bin = dir.join("binaries").join("ffmpeg-x86_64-pc-windows-msvc.exe");
            if sidecar_bin.exists() {
                return sidecar_bin;
            }
        }
        Err(_) => {}
    }
    let local_bin = PathBuf::from("src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe");
    if local_bin.exists() {
        return local_bin;
    }
    PathBuf::from("ffmpeg")
}

pub fn probe_video_duration(ffmpeg_path: &Path, video_path: &str) -> f64 {
    let ffprobe_path = ffmpeg_path.to_string_lossy().replace("ffmpeg", "ffprobe");
    let output = Command::new(&ffprobe_path)
        .args(&[
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path,
        ])
        .output();

    if let Ok(out) = output {
        let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if let Ok(duration) = text.parse::<f64>() {
            return duration;
        }
    }

    let output = Command::new(ffmpeg_path)
        .args(&["-i", video_path])
        .output();

    if let Ok(out) = output {
        let err_text = String::from_utf8_lossy(&out.stderr);
        if let Some(pos) = err_text.find("Duration: ") {
            let sub = &err_text[pos + 10..pos + 21];
            let parts: Vec<&str> = sub.split(':').collect();
            if parts.len() == 3 {
                let hrs: f64 = parts[0].parse().unwrap_or(0.0);
                let mins: f64 = parts[1].parse().unwrap_or(0.0);
                let secs: f64 = parts[2].parse().unwrap_or(0.0);
                return hrs * 3600.0 + mins * 60.0 + secs;
            }
        }
    }
    10.0
}

pub fn run_reframer(
    app_handle: AppHandle,
    video_path: String,
    layers: Vec<Layer>,
    trim_start: f64,
    trim_end: f64,
    output_res: String,
    output_fps: i32,
    background_mode: String,
    use_gpu: bool,
    output_path: String,
    on_event: Channel<RenderEvent>,
) {
    run_reframer_internal(
        app_handle,
        video_path,
        layers,
        trim_start,
        trim_end,
        output_res,
        output_fps,
        background_mode,
        use_gpu,
        output_path,
        on_event,
    );
}

fn run_reframer_internal(
    app_handle: AppHandle,
    video_path: String,
    layers: Vec<Layer>,
    trim_start: f64,
    trim_end: f64,
    output_res: String,
    output_fps: i32,
    background_mode: String,
    use_gpu: bool,
    output_path: String,
    on_event: Channel<RenderEvent>,
) {
    CANCEL_FLAG.store(false, Ordering::SeqCst);

    let ffmpeg_path = get_ffmpeg_path(&app_handle);
    let video_duration = trim_end - trim_start;

    // Parse output dimensions (e.g. "1080x1920")
    let res_parts: Vec<&str> = output_res.split('x').collect();
    if res_parts.len() != 2 {
        let _ = on_event.send(RenderEvent::Error { message: "Invalid output resolution format!".to_string() });
        return;
    }

    let out_w: i32 = res_parts[0].parse().unwrap_or(1080);
    let out_h: i32 = res_parts[1].parse().unwrap_or(1920);

    // Create output path in same directory
    let input_path = Path::new(&video_path);
    let parent = input_path.parent().unwrap_or_else(|| Path::new("."));
    let stem = input_path.file_stem().unwrap_or_default().to_string_lossy();
    let output_str = output_path.clone();

    // 1. Build FFMPEG Complex Filter Complex String
    // We will scale everything based on target dimensions (out_w, out_h)
    let mut filter_complex = String::new();

    // Base background setup
    if background_mode == "blur" {
        // Crop the background blur using the gameplay layer crop coordinates if available, to completely eliminate black letterboxes.
        let mut bg_crop = String::new();
        if let Some(gp) = layers.iter().find(|l| l.id == "layer_0") {
            let crop = &gp.crop_area;
            if crop.w > 0 && crop.h > 0 {
                bg_crop = format!("crop={}:{}:{}:{},", crop.w, crop.h, crop.x, crop.y);
            }
        }
        filter_complex.push_str(&format!(
            "[0:v]{}scale={}:{}:force_original_aspect_ratio=increase,crop={}:{}[bg_scaled];[bg_scaled]boxblur=25:5[bg];",
            bg_crop, out_w, out_h, out_w, out_h
        ));
    } else {
        // Black background
        filter_complex.push_str(&format!(
            "color=s={}x{}:c=black[bg];",
            out_w, out_h
        ));
    }

    // Process each visible layer
    let visible_layers: Vec<&Layer> = layers.iter().filter(|l| l.visible).collect();
    let mut last_overlay_label = "bg".to_string();
    
    // Track dynamic input files (mask PNGs)
    let mut dynamic_inputs = Vec::new();
    let mut current_input_idx = 1; // 0 is the main video

    // Separate mask layers from crop layers for the blur-on-crop logic
    let _mask_layers: Vec<&Layer> = visible_layers.iter()
        .filter(|l| {
            let ms = l.mask_shape.as_deref().unwrap_or("square");
            ms == "freeform" || ms == "circle"
        })
        .cloned()
        .collect();

    for (idx, layer) in visible_layers.iter().enumerate() {
        let crop = &layer.crop_area;
        let canvas = &layer.canvas_pos;
        let layer_label = format!("layer_{}", idx);

        let mut layer_filter = format!(
            "[0:v]crop={}:{}:{}:{},scale={}:{}",
            crop.w, crop.h, crop.x, crop.y,
            canvas.w, canvas.h
        );

        // Process mask if available
        let mask_shape = layer.mask_shape.as_deref().unwrap_or("square");
        let is_censor = mask_shape == "censor" && layer.mask_base64.is_some();
        let is_mask_overlay = mask_shape == "freeform" || mask_shape == "circle";

        // Apply blur globally ONLY for plain crop layers (not censor, not mask overlays)
        // Mask overlays must be CLEAN (sharp) — blur goes onto the crop layer beneath.
        if !is_censor && !is_mask_overlay {
            if let Some(blur_val) = layer.blur {
                if blur_val > 0.0 {
                    layer_filter.push_str(&format!(",boxblur={}:3", blur_val));
                }
            }
        }

        let bri = layer.brightness.unwrap_or(1.0);
        let con = layer.contrast.unwrap_or(1.0);

        // For mask overlays, only apply brightness/contrast (no blur)
        if is_mask_overlay {
            if bri != 1.0 || con != 1.0 {
                let eq_bri = bri - 1.0;
                layer_filter.push_str(&format!(",eq=brightness={}:contrast={}", eq_bri, con));
            }
        } else {
            if bri != 1.0 || con != 1.0 {
                let eq_bri = bri - 1.0;
                layer_filter.push_str(&format!(",eq=brightness={}:contrast={}", eq_bri, con));
            }
        }

        if mask_shape == "circle" {
            // Circle mask: clean overlay (no blur applied above)
            layer_filter.push_str(",format=yuva420p,geq=a='if(lte(hypot(X-W/2,Y-H/2),W/2),255,0)'");
            filter_complex.push_str(&format!("{}[{}];", layer_filter, layer_label));
        } else if mask_shape == "freeform" && layer.mask_base64.is_some() {
            // Freeform mask: clean overlay (no blur applied above)
            let b64 = layer.mask_base64.as_ref().unwrap();
            let mask_path = parent.join(format!("{}_mask_{}.png", stem, idx));
            if let Ok(bytes) = general_purpose::STANDARD.decode(b64) {
                let _ = std::fs::write(&mask_path, bytes);
                dynamic_inputs.push(mask_path.to_string_lossy().to_string());
                
                // 1. the cropped video (clean, no blur)
                filter_complex.push_str(&format!("{}[cropped_{}];", layer_filter, idx));
                // 2. format mask and alphamerge
                filter_complex.push_str(&format!(
                    "[{}:v]format=rgba,scale={}:{}[mask_{}];[cropped_{}][mask_{}]alphamerge[{}];",
                    current_input_idx, canvas.w, canvas.h, idx,
                    idx, idx,
                    layer_label
                ));
                current_input_idx += 1;
            } else {
                filter_complex.push_str(&format!("{}[{}];", layer_filter, layer_label));
            }
        } else if mask_shape == "censor" && layer.mask_base64.is_some() {
            // Write censor base64 to temp PNG
            let b64 = layer.mask_base64.as_ref().unwrap();
            let mask_path = parent.join(format!("{}_censor_{}.png", stem, idx));
            if let Ok(bytes) = general_purpose::STANDARD.decode(b64) {
                let _ = std::fs::write(&mask_path, bytes);
                dynamic_inputs.push(mask_path.to_string_lossy().to_string());

                // Define intermediate labels
                let pre_split_lbl = format!("presplit_{}", idx);
                let clean_lbl = format!("clean_{}", idx);
                let to_blur_lbl = format!("toblur_{}", idx);
                let blurred_lbl = format!("blurred_{}", idx);
                let censor_lbl = format!("censor_{}", idx);

                // 1. Output the clean scaled segment
                filter_complex.push_str(&format!("{}[{}];", layer_filter, pre_split_lbl));
                // 2. Split into clean and blur inputs
                filter_complex.push_str(&format!("[{}]split[{}][{}];", pre_split_lbl, clean_lbl, to_blur_lbl));
                // 3. Blur the target stream (defaulting to 20 if layer blur is not set)
                let blur_val = layer.blur.unwrap_or(0.0);
                let censor_blur_val = if blur_val > 0.0 { blur_val } else { 20.0 };
                filter_complex.push_str(&format!("[{}]boxblur={}:3[{}];", to_blur_lbl, censor_blur_val, blurred_lbl));
                // 4. Merge blurred stream with PNG censor alpha mask (scaled to fit)
                filter_complex.push_str(&format!(
                    "[{}:v]format=rgba,scale={}:{}[mask_{}];[{}][mask_{}]alphamerge[{}];",
                    current_input_idx, canvas.w, canvas.h, idx,
                    blurred_lbl, idx,
                    censor_lbl
                ));
                current_input_idx += 1;
                // 5. Overlay censored pixels onto the clean scaled segment
                filter_complex.push_str(&format!(
                    "[{}][{}]overlay=0:0[{}];",
                    clean_lbl, censor_lbl, layer_label
                ));
            } else {
                filter_complex.push_str(&format!("{}[{}];", layer_filter, layer_label));
            }
        } else {
            // ── Plain crop layer: apply mask-layer blur onto this crop ──
            // If there are mask layers with blur, we need to blur the crop layer
            // in the regions where those masks sit, BEFORE the mask overlay.
            filter_complex.push_str(&format!("{}[{}];", layer_filter, layer_label));
        }

        // Overlay onto current canvas
        let next_overlay = format!("ov_{}", idx);
        filter_complex.push_str(&format!(
            "[{}][{}]overlay={}:{}[{}];",
            last_overlay_label, layer_label,
            canvas.x, canvas.y,
            next_overlay
        ));
        last_overlay_label = next_overlay;
    }

    // The final video stream label is the last overlay label
    let final_video_label = last_overlay_label;

    // 2. Build Arguments
    let mut args = vec![
        "-y".to_string(),
        "-ss".to_string(), trim_start.to_string(),
        "-to".to_string(), trim_end.to_string(),
        "-i".to_string(), video_path.clone(),
    ];
    
    // Add dynamic mask inputs
    for mask_input in dynamic_inputs {
        args.push("-i".to_string());
        args.push(mask_input);
    }
    
    args.extend(vec![
        "-filter_complex".to_string(), filter_complex,
        "-map".to_string(), format!("[{}]", final_video_label),
        "-map".to_string(), "0:a?".to_string(), // map audio if exists, optional
    ]);

    // Hardware Acceleration or CPU standard based on format
    let is_webm = ext_clean == "webm";

    if use_gpu {
        if is_webm {
            // WebM with GPU NVENC
            args.extend(vec![
                "-c:v".to_string(), "vp9_nvenc".to_string(),
                "-b:v".to_string(), "6M".to_string(),
            ]);
        } else {
            // H.264 MP4/MKV/MOV with GPU NVENC
            args.extend(vec![
                "-c:v".to_string(), "h264_nvenc".to_string(),
                "-preset".to_string(), "p4".to_string(),
                "-tune".to_string(), "hq".to_string(),
                "-rc".to_string(), "cbr".to_string(),
                "-b:v".to_string(), "6M".to_string(),
            ]);
        }
    } else {
        if is_webm {
            // WebM standard CPU (libvpx-vp9)
            args.extend(vec![
                "-c:v".to_string(), "libvpx-vp9".to_string(),
                "-crf".to_string(), "30".to_string(),
                "-b:v".to_string(), "0".to_string(),
            ]);
        } else {
            // standard CPU (libx264)
            args.extend(vec![
                "-c:v".to_string(), "libx264".to_string(),
                "-preset".to_string(), "fast".to_string(),
                "-crf".to_string(), "20".to_string(),
            ]);
        }
    }

    // Audio encoding fallback and framerate
    let audio_codec = if is_webm { "libopus".to_string() } else { "aac".to_string() };

    args.extend(vec![
        "-c:a".to_string(), audio_codec,
        "-b:a".to_string(), "192k".to_string(),
        "-r".to_string(), output_fps.to_string(),
        "-progress".to_string(), "pipe:1".to_string(), // print progress to stdout
        output_str.clone(),
    ]);

    println!("Running FFmpeg: {} {:?}", ffmpeg_path.display(), args);

    // 3. Spawn FFmpeg Process
    let mut child = match Command::new(&ffmpeg_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null()) // Set to null to prevent OS pipe buffering locks!
        .spawn() {
            Ok(c) => c,
            Err(e) => {
                if use_gpu {
                    println!("GPU NVENC spawn failed. Falling back to CPU...");
                    let _ = on_event.send(RenderEvent::Progress {
                        progress: 0.0,
                        status: "GPU error. Falling back to CPU...".to_string(),
                    });
                    run_reframer_internal(
                        app_handle,
                        video_path,
                        layers,
                        trim_start,
                        trim_end,
                        output_res,
                        output_fps,
                        background_mode,
                        false, // fallback to CPU
                        output_ext,
                        on_event,
                    );
                } else {
                    let _ = on_event.send(RenderEvent::Error { message: format!("Could not start FFmpeg: {}. Please check sidecar file.", e) });
                }
                return;
            }
        };

    // Wait a brief moment to see if it crashed/exited immediately (e.g. due to unsupported GPU nvenc)
    if use_gpu {
        std::thread::sleep(std::time::Duration::from_millis(600));
        if let Ok(Some(status)) = child.try_wait() {
            if !status.success() {
                println!("GPU NVENC failed immediately. Falling back to CPU...");
                let _ = on_event.send(RenderEvent::Progress {
                    progress: 0.0,
                    status: "GPU error. Falling back to CPU...".to_string(),
                });
                run_reframer_internal(
                    app_handle,
                    video_path,
                    layers,
                    trim_start,
                    trim_end,
                    output_res,
                    output_fps,
                    background_mode,
                    false, // fallback to CPU
                    output_path,
                    on_event,
                );
                return;
            }
        }
    }

    let stdout = child.stdout.take().unwrap();
    let reader = BufReader::new(stdout);

    // Read progress line-by-line
    for line_result in reader.lines() {
        if CANCEL_FLAG.load(Ordering::SeqCst) {
            let _ = child.kill();
            for path in &dynamic_inputs {
                let _ = std::fs::remove_file(Path::new(path));
            }
            let _ = on_event.send(RenderEvent::Error { message: "Cancelled by user.".to_string() });
            return;
        }

        if let Ok(line) = line_result {
            if line.starts_with("out_time_us=") {
                let us_str = &line[12..];
                if let Ok(us) = us_str.parse::<f64>() {
                    let seconds = us / 1_000_000.0;
                    let percentage = ((seconds / video_duration) * 100.0)
                        .min(99.0) as f32;

                    let _ = on_event.send(RenderEvent::Progress {
                        progress: percentage,
                        status: format!("Processing frames: {:.1}s / {:.1}s", seconds, video_duration),
                    });
                }
            }
        }
    }

    // Wait for process completion
    let status = child.wait().unwrap();
    if status.success() {
        let _ = on_event.send(RenderEvent::Progress {
            progress: 100.0,
            status: "Render complete!".to_string(),
        });
        let _ = on_event.send(RenderEvent::Complete { path: output_str });
    } else {
        let _ = on_event.send(RenderEvent::Error { message: "FFmpeg reported an error during render.".to_string() });
    }

    // Cleanup temporary mask/censor PNG files
    for path in &dynamic_inputs {
        let _ = std::fs::remove_file(Path::new(path));
    }
    }

pub fn probe_duration(app_handle: AppHandle, video_path: String) -> f64 {
    let ffmpeg_path = get_ffmpeg_path(&app_handle);
    probe_video_duration(&ffmpeg_path, &video_path)
}

