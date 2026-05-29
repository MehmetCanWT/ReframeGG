mod ffmpeg;

use ffmpeg::{run_reframer, set_cancel_render, probe_duration, Layer, RenderEvent};
use rfd::FileDialog;
use serde::Serialize;
use tauri::{AppHandle, ipc::Channel};

#[derive(Serialize)]
pub struct VideoInfo {
    duration: f64,
}

#[tauri::command]
fn select_video_file() -> Option<String> {
    let file = FileDialog::new()
        .add_filter("Video Files", &["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v", "ts", "3gp"])
        .pick_file();
    
    file.map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_video_info(app_handle: AppHandle, path: String) -> Result<VideoInfo, String> {
    if !std::path::Path::new(&path).exists() {
        return Err("Video file not found!".to_string());
    }

    let duration = probe_duration(app_handle, path);
    Ok(VideoInfo { duration })
}

#[tauri::command]
fn reframe_video(
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
    std::thread::spawn(move || {
        run_reframer(
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
    });
}

#[tauri::command]
fn select_output_file(default_name: String) -> Option<String> {
    let file = FileDialog::new()
        .set_file_name(&default_name)
        .add_filter("MP4 Video", &["mp4"])
        .save_file();
    
    file.map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn cancel_render() {
    set_cancel_render(true);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            select_video_file,
            get_video_info,
            reframe_video,
            cancel_render,
            select_output_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

