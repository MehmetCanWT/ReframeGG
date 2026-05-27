import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Scissors, Crop, Move, Image as ImageIcon, Sparkles, Layers, Sliders } from "lucide-react";

// Common Node Container Style
const nodeStyle = {
  background: "rgba(17, 19, 24, 0.95)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "12px",
  width: "240px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
  color: "#f5f6f8",
  fontFamily: "'Outfit', sans-serif",
  overflow: "hidden",
  fontSize: "12px",
  backdropFilter: "blur(12px)",
  transition: "border-color 0.25s, box-shadow 0.25s",
};

const headerStyle = (color: string) => ({
  background: "rgba(39, 39, 42, 0.6)",
  padding: "10px 14px",
  fontWeight: "600" as const,
  borderBottom: `2px solid ${color}`,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  letterSpacing: "0.5px",
});

const contentStyle = {
  padding: "14px",
  display: "flex",
  flexDirection: "column" as const,
  gap: "12px",
};

const labelStyle = {
  fontSize: "10px",
  color: "#949ca9",
  fontWeight: "500",
  marginBottom: "4px",
  display: "block",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
};

const inputStyle = {
  width: "100%",
  background: "#07080a",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "white",
  padding: "6px 10px",
  borderRadius: "6px",
  fontSize: "12px",
  outline: "none",
  transition: "border-color 0.2s",
};

const sliderRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
};

// Preview Area Style
const previewContainerStyle = {
  marginTop: "8px",
  background: "#050505",
  borderRadius: "8px",
  border: "1.5px solid rgba(255,255,255,0.06)",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  position: "relative" as const,
};

// --- SOURCE NODE ---
export function SourceNode({ id, data }: any) {
  return (
    <div style={nodeStyle} className="rf-node-source">
      <div style={headerStyle("#10b981")}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <ImageIcon size={14} style={{ color: "#10b981" }} />
          <span>SOURCE</span>
        </div>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
      </div>
      <div style={contentStyle}>
        <div>
          <span style={labelStyle}>File</span>
          <div style={{ ...inputStyle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {data.videoName || "No video loaded"}
          </div>
        </div>
        <div>
          <span style={labelStyle}>Gameplay Aspect Ratio</span>
          <select 
            className="nodrag"
            style={inputStyle}
            value={data.aspectRatio || "16:9"}
            onChange={() => {}}
          >
            <option value="16:9">16:9</option>
            <option value="4:3">4:3</option>
          </select>
        </div>
        
        {/* Canvas Preview */}
        <div style={{ ...previewContainerStyle, height: "110px" }}>
          <canvas 
            className="node-preview-canvas" 
            data-node-id={id} 
            width={320} 
            height={180} 
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="out" style={{ background: "#10b981", width: 10, height: 10 }} />
    </div>
  );
}

// --- CROP NODE ---
export function CropNode({ id, data }: any) {
  const { updateNodeData } = useReactFlow();

  const handleChange = (field: string, val: number) => {
    updateNodeData(id, { [field]: val });
  };

  return (
    <div style={nodeStyle}>
      <Handle type="target" position={Position.Left} id="in" style={{ background: "#f59e0b", width: 10, height: 10 }} />
      <div style={headerStyle("#f59e0b")}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Crop size={14} style={{ color: "#f59e0b" }} />
          <span>CROP</span>
        </div>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", boxShadow: "0 0 8px #f59e0b" }} />
      </div>
      <div style={contentStyle}>
        {(["top", "bottom", "left", "right"] as const).map(dir => (
          <div key={dir}>
            <span style={labelStyle}>{dir}</span>
            <div style={sliderRowStyle}>
              <input 
                className="nodrag"
                type="range" 
                min="0" max={dir === "left" || dir === "right" ? "1920" : "1080"} 
                value={data[dir] || 0} 
                onChange={e => handleChange(dir, parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: "#f59e0b" }}
              />
              <input 
                className="nodrag"
                type="number" 
                value={data[dir] || 0}
                onChange={e => handleChange(dir, parseFloat(e.target.value) || 0)}
                style={{ ...inputStyle, width: "55px", padding: "4px" }}
              />
            </div>
          </div>
        ))}
        
        {/* Canvas Preview */}
        <div style={{ ...previewContainerStyle, height: "110px", border: "1.5px solid rgba(245, 158, 11, 0.3)" }}>
          <canvas 
            className="node-preview-canvas" 
            data-node-id={id} 
            width={320} 
            height={180} 
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="out" style={{ background: "#f59e0b", width: 10, height: 10 }} />
    </div>
  );
}

// --- TRANSFORM NODE ---
export function TransformNode({ id, data }: any) {
  const { updateNodeData } = useReactFlow();

  const handleChange = (field: string, val: number) => {
    updateNodeData(id, { [field]: val });
  };

  const toggleAspectLock = () => {
    updateNodeData(id, { lockAspectRatio: !data.lockAspectRatio });
  };

  return (
    <div style={nodeStyle}>
      <Handle type="target" position={Position.Left} id="in" style={{ background: "#3b82f6", width: 10, height: 10 }} />
      <div style={headerStyle("#3b82f6")}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Move size={14} style={{ color: "#3b82f6" }} />
          <span>TRANSFORM+</span>
        </div>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", boxShadow: "0 0 8px #3b82f6" }} />
      </div>
      <div style={contentStyle}>
        {/* Lock aspect ratio */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <input 
            type="checkbox" 
            id={`lock-aspect-${id}`}
            checked={data.lockAspectRatio ?? true} 
            onChange={toggleAspectLock} 
            className="nodrag"
            style={{ accentColor: "#3b82f6", cursor: "pointer" }}
          />
          <label htmlFor={`lock-aspect-${id}`} style={{ ...labelStyle, marginBottom: 0, cursor: "pointer" }}>Lock aspect ratio</label>
        </div>

        {(["scaleX", "scaleY", "rotation", "x", "y"] as const).map(field => {
          let min = "-1000", max = "2000", step = "1";
          if (field.includes("scale")) {
            min = "0.1"; max = "3.0"; step = "0.01";
          } else if (field === "rotation") {
            min = "-180"; max = "180"; step = "1";
          }
          
          const label = field === "scaleX" ? "Scale X" : 
                        field === "scaleY" ? "Scale Y" : 
                        field.charAt(0).toUpperCase() + field.slice(1);

          return (
            <div key={field}>
              <span style={labelStyle}>{label}</span>
              <div style={sliderRowStyle}>
                <input 
                  className="nodrag"
                  type="range" 
                  min={min} max={max} step={step}
                  value={data[field] ?? (field.includes("scale") ? 1.0 : 0)} 
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    handleChange(field, val);
                    // Handle locked aspect ratio
                    if (field === "scaleX" && (data.lockAspectRatio ?? true)) {
                      handleChange("scaleY", val);
                    } else if (field === "scaleY" && (data.lockAspectRatio ?? true)) {
                      handleChange("scaleX", val);
                    }
                  }}
                  style={{ flex: 1, accentColor: "#3b82f6" }}
                />
                <input 
                  className="nodrag"
                  type="number" 
                  value={data[field] ?? (field.includes("scale") ? 1.0 : 0)}
                  onChange={e => handleChange(field, parseFloat(e.target.value) || 0)}
                  style={{ ...inputStyle, width: "55px", padding: "4px" }}
                />
              </div>
            </div>
          );
        })}
        
        {/* Canvas Preview */}
        <div style={{ ...previewContainerStyle, height: "130px", border: "1.5px solid rgba(59, 130, 246, 0.3)" }}>
          <canvas 
            className="node-preview-canvas" 
            data-node-id={id} 
            width={180} 
            height={320} 
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="out" style={{ background: "#3b82f6", width: 10, height: 10 }} />
    </div>
  );
}

// --- MASK NODE ---
export function MaskNode({ id, data }: any) {
  return (
    <div style={nodeStyle}>
      <Handle type="target" position={Position.Left} id="in" style={{ background: "#ec4899", width: 10, height: 10 }} />
      <div style={headerStyle("#ec4899")}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Scissors size={14} style={{ color: "#ec4899" }} />
          <span>MASK</span>
        </div>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ec4899", boxShadow: "0 0 8px #ec4899" }} />
      </div>
      <div style={contentStyle}>
        <button 
          className="nodrag"
          onClick={() => {
            const event = new CustomEvent('openMaskEditor', { detail: { nodeId: id, data } });
            window.dispatchEvent(event);
          }}
          style={{
            ...inputStyle, 
            cursor: "pointer", 
            background: "linear-gradient(135deg, rgba(236, 72, 153, 0.2) 0%, rgba(236, 72, 153, 0.05) 100%)", 
            border: "1px solid #ec4899", 
            color: "#ec4899",
            fontWeight: "600",
            padding: "8px 12px",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(236, 72, 153, 0.2)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            transition: "all 0.2s"
          }}
          onMouseOver={e => e.currentTarget.style.filter = "brightness(1.2)"}
          onMouseOut={e => e.currentTarget.style.filter = "none"}
        >
          EDIT MASK
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
          <span style={{ color: "#949ca9", fontSize: "11px" }}>Active Shapes:</span>
          <span style={{ background: "#ec4899", color: "white", padding: "2px 6px", borderRadius: "10px", fontSize: "10px", fontWeight: "bold" }}>
            {data.masks ? data.masks.length : 1}
          </span>
        </div>
        
        {/* Canvas Preview */}
        <div style={{ ...previewContainerStyle, height: "110px", border: "1.5px solid rgba(236, 72, 153, 0.3)" }}>
          <canvas 
            className="node-preview-canvas" 
            data-node-id={id} 
            width={320} 
            height={180} 
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="out" style={{ background: "#ec4899", width: 10, height: 10 }} />
    </div>
  );
}

// --- BLEND NODE ---
export function BlendNode({ id }: any) {
  return (
    <div style={{...nodeStyle, width: "250px"}}>
      <div style={headerStyle("#a855f7")}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Layers size={14} style={{ color: "#a855f7" }} />
          <span>BLEND (OUTPUT)</span>
        </div>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#a855f7", boxShadow: "0 0 8px #a855f7" }} />
      </div>
      <div style={{...contentStyle, gap: "14px"}}>
        {[0, 1, 2, 3, 4].map(idx => (
          <div key={idx} style={{ position: "relative", display: "flex", alignItems: "center", paddingLeft: "10px" }}>
            <Handle 
              type="target" 
              position={Position.Left} 
              id={`layer_${idx}`} 
              style={{ background: "#a855f7", top: "50%", left: "-14px", width: 10, height: 10 }} 
            />
            <span style={{ fontSize: "12px", color: "#e4e4e7", fontWeight: "500" }}>Layer {idx + 1} (Z-Index {idx})</span>
          </div>
        ))}

        {/* Canvas Preview */}
        <div style={{ ...previewContainerStyle, height: "140px", border: "1.5px solid rgba(168, 85, 247, 0.3)" }}>
          <canvas 
            className="node-preview-canvas" 
            data-node-id={id} 
            width={180} 
            height={320} 
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="mix" style={{ background: "#a855f7", width: 10, height: 10 }} />
    </div>
  );
}

// --- OUTPUT NODE ---
export function OutputNode({ id }: any) {
  return (
    <div style={{ ...nodeStyle, border: "1.5px solid #10b981", boxShadow: "0 10px 40px rgba(16, 185, 129, 0.15)" }}>
      <Handle type="target" position={Position.Left} id="in" style={{ background: "#10b981", width: 10, height: 10 }} />
      <div style={headerStyle("#10b981")}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Sparkles size={14} style={{ color: "#10b981" }} />
          <span>OUTPUT</span>
        </div>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
      </div>
      <div style={contentStyle}>
        <div>
          <span style={labelStyle}>Output Resolution</span>
          <div style={{ ...inputStyle, background: "#050505", color: "#10b981", fontWeight: "bold" }}>
            1080 x 1920 (9:16)
          </div>
        </div>

        {/* Canvas Preview */}
        <div style={{ ...previewContainerStyle, height: "190px", border: "1.5px solid rgba(16, 185, 129, 0.4)" }}>
          <canvas 
            className="node-preview-canvas" 
            data-node-id={id} 
            width={180} 
            height={320} 
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
        </div>
      </div>
    </div>
  );
}

export const nodeTypes = {
  source: SourceNode,
  crop: CropNode,
  transform: TransformNode,
  mask: MaskNode,
  blend: BlendNode,
  output: OutputNode,
};
