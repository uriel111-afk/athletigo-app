import { useState } from "react";
import { getSectionType } from "@/lib/sectionTypes";
import { formatParams, exerciseToParams } from "@/lib/paramFormatters";

export default function CollapsibleSection({
  section,
  mode = "view",
  defaultOpen = true,
  onExerciseCheck,
  completedIds = new Set(),
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!section) return null;

  const type = getSectionType(section.category);
  const exercises = section.exercises || [];
  const completedCount = exercises.filter(e => completedIds.has(e?.id)).length;
  const total = exercises.length;
  const isPlay = mode === "play";

  return (
    <div style={{
      background: "#fff", border: "0.5px solid #e5e5e5",
      borderTop: `3px solid ${type.color}`,
      borderRadius: 12, overflow: "hidden", marginBottom: 12,
    }}>
      {/* Header */}
      <div onClick={() => setOpen(!open)} style={{
        padding: "11px 12px", display: "flex", justifyContent: "space-between",
        alignItems: "center", cursor: "pointer",
        borderBottom: open ? "0.5px solid #f0f0f0" : "none",
        direction: "rtl",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            background: type.bgColor, display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0,
          }}>
            {section.icon || type.icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {section.section_name || section.title || type.label}
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>
              {type.label} · {total} תרגילים
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {isPlay && total > 0 && (
            <span style={{
              background: "#FFF3EB", color: "#FF6F20",
              padding: "3px 9px", borderRadius: 9999,
              fontSize: 12, fontWeight: 500,
            }}>
              {completedCount}/{total}
            </span>
          )}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Progress bar */}
      {isPlay && open && total > 0 && (
        <div style={{ height: 3, background: "#f0f0f0", margin: "0 12px 10px", borderRadius: 2 }}>
          <div style={{ height: "100%", background: "#FF6F20", borderRadius: 2, width: `${(completedCount / total) * 100}%`, transition: "width 0.3s" }} />
        </div>
      )}

      {/* Body */}
      {open && (
        <div>
          {isPlay ? (
            exercises.map((ex) => {
              if (!ex) return null;
              const checked = completedIds.has(ex.id);
              const params = exerciseToParams(ex);
              const pills = formatParams(params);
              return (
                <div key={ex.id} onClick={() => onExerciseCheck?.(ex.id, !checked)} style={{
                  padding: "10px 12px", display: "flex", alignItems: "flex-start",
                  gap: 10, borderBottom: "0.5px solid #f5f5f5", cursor: "pointer", direction: "rtl",
                }}>
                  <div style={{
                    width: 22, height: 22,
                    border: `2px solid ${checked ? "#FF6F20" : "#d4d4d4"}`,
                    background: checked ? "#FF6F20" : "#fff",
                    borderRadius: 6, flexShrink: 0, marginTop: 2,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontSize: 14, transition: "all 0.15s",
                  }}>
                    {checked ? "✓" : ""}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 15, fontWeight: 500,
                      color: checked ? "#999" : "#1a1a1a",
                      textDecoration: checked ? "line-through" : "none",
                      marginBottom: 4,
                    }}>
                      {ex.exercise_name || ex.name || "תרגיל"}
                    </div>
                    {pills.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {pills.map((pill, i) => (
                          <span key={i} style={{
                            background: "#f5f5f5", color: "#555",
                            padding: "2px 8px", borderRadius: 9999, fontSize: 11,
                          }}>{pill}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}
