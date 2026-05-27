import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Scissors, Crop, Image as ImageIcon, Sparkles } from "lucide-react";

// Common Node Container Style
const nodeStyle = {
  background: "#111318",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "12px",
  width: "250px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
  color: "#f5f6f8",
  fontFamily: "'Outfit', sans-serif",
  overflow: "hidden",
  fontSize: "12px",
  backdropFilter: "blur(12px)",
  transition: "border-color 0.25s, box-shadow 0.25s",
};

const headerStyle = (color: string) => ({
  background: "#15181f",
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

// Helper to render transform/effect sliders
function renderTransformAndEffects(id: string, data: any, updateNodeData: any, accentColor: string) {
  const handleChange = (field: string, val: number) => {
    updateNodeData(id, { [field]: val });
  };

  const toggleAspectLock = () => {
    updateNodeData(id, { lockAspectRatio: !data.lockAspectRatio });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "10px", marginTop: "4px" }}>
      <span style={{ ...labelStyle, color: accentColor }}>Transform & Effects</span>

      {/* Lock aspect ratio */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
        <input
          type="checkbox"
          id={`lock-aspect-${id}`}
          checked={data.lockAspectRatio ?? true}
          onChange={toggleAspectLock}
          className="nodrag"
          style={{ accentColor, cursor: "pointer" }}
        />
        <label htmlFor={`lock-aspect-${id}`} style={{ ...labelStyle, marginBottom: 0, cursor: "pointer" }}>Lock aspect ratio</label>
      </div>

      {(["scaleX", "scaleY", "rotation", "x", "y", "blur", "brightness", "contrast"] as const).map(field => {
        let min = "-1000", max = "2000", step = "1";
        if (field.includes("scale")) {
          min = "0.1"; max = "3.0"; step = "0.01";
        } else if (field === "rotation") {
          min = "-180"; max = "180"; step = "1";
        } else if (field === "blur") {
          min = "0"; max = "50"; step = "1";
        } else if (field === "brightness" || field === "contrast") {
          min = "0.5"; max = "2.0"; step = "0.05";
        }

        const label = field === "scaleX" ? "Scale X" :
          field === "scaleY" ? "Scale Y" :
            field.charAt(0).toUpperCase() + field.slice(1);

        const defaultVal = field.includes("scale") || field === "brightness" || field === "contrast" ? 1.0 : 0;
        const currentVal = data[field] ?? defaultVal;

        return (
          <div key={field}>
            <span style={labelStyle}>{label}</span>
            <div style={sliderRowStyle}>
              <input
                className="nodrag"
                type="range"
                min={min} max={max} step={step}
                value={currentVal}
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
                style={{ flex: 1, accentColor }}
              />
              <input
                className="nodrag"
                type="number"
                value={currentVal}
                onChange={e => handleChange(field, parseFloat(e.target.value) || 0)}
                style={{ ...inputStyle, width: "55px", padding: "4px" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- SOURCE NODE ---
export function SourceNode({ id, data }: any) {
  return (
    <div style={{ ...nodeStyle, width: "240px" }} className="rf-node-source">
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
          <div style={{ ...inputStyle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "8px" }}>
            {data.videoName || "No video loaded"}
          </div>

          <button
            className="nodrag"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("triggerVideoSelect"));
            }}
            style={{
              width: "100%",
              background: "transparent",
              border: "1px solid #ea580c",
              color: "#ea580c",
              padding: "6px 12px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: "700",
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              transition: "all 0.2s"
            }}
            onMouseOver={e => {
              e.currentTarget.style.backgroundColor = "rgba(234, 88, 12, 0.1)";
            }}
            onMouseOut={e => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            LOAD VIDEO
          </button>
        </div>

        <div>
          <span style={labelStyle}>Gameplay Aspect Ratio</span>
          <select
            className="nodrag"
            style={inputStyle}
            value={data.aspectRatio || "16:9"}
            onChange={() => { }}
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

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", height: "10px", marginTop: "2px" }}>
          <span style={{ fontSize: "10px", color: "#949ca9", fontWeight: "600", marginRight: "2px" }}>Gameplay</span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="out" style={{ background: "#10b981", width: 10, height: 10, right: "-6px" }} />
    </div>
  );
}

// --- CROP NODE ---
export function CropNode({ id, data }: any) {
  const { updateNodeData } = useReactFlow();

  const handleChange = (field: string, val: number) => {
    updateNodeData(id, { [field]: val });
  };

  const displayName = data.label ? `CROP: ${data.label.toUpperCase()}` : "CROP";

  return (
    <div style={nodeStyle}>
      <Handle type="target" position={Position.Left} id="in" style={{ background: "#f59e0b", width: 10, height: 10, left: "-6px" }} />
      <div style={headerStyle("#f59e0b")}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <Crop size={14} style={{ color: "#f59e0b" }} />
          <span>{displayName}</span>
        </div>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", boxShadow: "0 0 8px #f59e0b", flexShrink: 0 }} />
      </div>
      <div style={contentStyle}>
        <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", height: "10px", marginTop: "-6px" }}>
          <span style={{ fontSize: "10px", color: "#949ca9", fontWeight: "600" }}>In</span>
        </div>

        <span style={{ ...labelStyle, color: "#f59e0b" }}>Crop Parameters</span>
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

        {/* Render transform and effects directly in this node! */}
        {renderTransformAndEffects(id, data, updateNodeData, "#f59e0b")}

        {/* Canvas Preview with Thick Green Outline */}
        <div style={{ ...previewContainerStyle, height: "110px", border: "2.5px solid #10b981" }}>
          <canvas
            className="node-preview-canvas"
            data-node-id={id}
            width={320}
            height={180}
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", height: "10px", marginTop: "2px" }}>
          <span style={{ fontSize: "10px", color: "#949ca9", fontWeight: "600", marginRight: "2px" }}>
            {data.label || "Out"}
          </span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="out" style={{ background: "#f59e0b", width: 10, height: 10, right: "-6px" }} />
    </div>
  );
}

// --- MASK NODE ---
export function MaskNode({ id, data }: any) {
  const { updateNodeData } = useReactFlow();

  const displayName = data.label ? `MASK: ${data.label.toUpperCase()}` : "MASK";

  return (
    <div style={nodeStyle}>
      <Handle type="target" position={Position.Left} id="in" style={{ background: "#ec4899", width: 10, height: 10, left: "-6px" }} />
      <div style={headerStyle("#ec4899")}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <Scissors size={14} style={{ color: "#ec4899" }} />
          <span>{displayName}</span>
        </div>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ec4899", boxShadow: "0 0 8px #ec4899", flexShrink: 0 }} />
      </div>
      <div style={contentStyle}>
        <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", height: "10px", marginTop: "-6px" }}>
          <span style={{ fontSize: "10px", color: "#949ca9", fontWeight: "600" }}>In</span>
        </div>

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

        {/* Render transform and effects directly in this node! */}
        {renderTransformAndEffects(id, data, updateNodeData, "#ec4899")}

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

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", height: "10px", marginTop: "2px" }}>
          <span style={{ fontSize: "10px", color: "#949ca9", fontWeight: "600", marginRight: "2px" }}>
            {data.label || "Masked"}
          </span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="out" style={{ background: "#ec4899", width: 10, height: 10, right: "-6px" }} />
    </div>
  );
}

// --- OUTPUT NODE (Combines Blending and Final Output) ---
export function OutputNode({ id }: any) {
  const outputPorts = [
    { id: "layer_0", label: "Main Video" },
    { id: "layer_1", label: "Minimap" },
    { id: "layer_2", label: "Killfeed" },
    { id: "layer_3", label: "My Team" },
    { id: "layer_4", label: "Enemies" },
    { id: "layer_5", label: "Health" },
    { id: "layer_6", label: "Ammo" },
    { id: "layer_7", label: "Timer" }

  ];

  return (
    <div style={{ ...nodeStyle, width: "260px", border: "1.5px solid #10b981", boxShadow: "0 10px 40px rgba(16, 185, 129, 0.15)" }}>
      <div style={headerStyle("#10b981")}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Sparkles size={14} style={{ color: "#10b981" }} />
          <span>OUTPUT</span>
        </div>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
      </div>
      <div style={{ ...contentStyle, gap: "10px" }}>

        {/* Dynamic Input sockets directly on the Output node! */}
        <span style={{ ...labelStyle, color: "#10b981" }}>Active Inputs</span>
        {outputPorts.map((port) => (
          <div key={port.id} style={{ position: "relative", display: "flex", alignItems: "center", paddingLeft: "10px", height: "20px" }}>
            <Handle
              type="target"
              position={Position.Left}
              id={port.id}
              style={{ background: "#10b981", top: "50%", left: "-14px", width: 10, height: 10 }}
            />
            <span style={{ fontSize: "12px", color: "#e4e4e7", fontWeight: "500" }}>{port.label}</span>
          </div>
        ))}

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "10px", marginTop: "6px" }}>
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
  mask: MaskNode,
  output: OutputNode,
};
