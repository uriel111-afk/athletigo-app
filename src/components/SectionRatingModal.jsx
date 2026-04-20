import { useState } from "react";
import { getSectionType } from "@/lib/sectionTypes";

const O = "#FF6F20";
const G = "#16a34a";

export default function SectionRatingModal({ open, section, onSubmit }) {
  const [mastery, setMastery] = useState(null);
  const [difficulty, setDifficulty] = useState(null);
  const [mood, setMood] = useState(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open || !section) return null;

  const type = getSectionType(section.category || section.section_type);
  const canSubmit = mastery !== null && difficulty !== null && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      await onSubmit({ mastery, difficulty, mood, note: note.trim() || null });
    } catch (e) {
      console.error("[SectionRating] submit error:", e);
      setError("לא הצלחנו לשמור. נסה שוב.");
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      zIndex: 9999, display: "flex", alignItems: "flex-end",
      justifyContent: "center", padding: 12, direction: "rtl",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%",
        maxWidth: 380, maxHeight: "90vh", display: "flex",
        flexDirection: "column", overflow: "hidden", direction: "rtl",
      }}>
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: 20, minHeight: 0 }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%", background: "#dcfce7",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 10px", fontSize: 28,
          }}>✓</div>
          <div style={{ fontSize: 18, fontWeight: 500, color: "#1a1a1a", marginBottom: 4 }}>
            סיימת את סקשן {section.section_name || section.title || type.label}!
          </div>
          <div style={{ fontSize: 13, color: "#666" }}>10 שניות וסיימנו</div>
        </div>

        {/* Q1 — Mastery */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>מידת השליטה בתרגילים</span>
            {mastery !== null && <span style={{ fontSize: 20, fontWeight: 700, color: O }}>{mastery}</span>}
          </div>
          <div style={{ display: "flex", gap: 4, direction: "ltr" }}>
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <button key={n} onClick={() => setMastery(n)} style={{
                flex: 1, height: 32, border: `1.5px solid ${mastery === n ? O : "#e5e5e5"}`,
                borderRadius: 6, fontSize: 12, fontWeight: 500,
                background: mastery === n ? O : "white",
                color: mastery === n ? "white" : "#555",
                cursor: "pointer", touchAction: "manipulation",
              }}>{n}</button>
            ))}
          </div>
        </div>

        {/* Q2 — Difficulty */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>רמת הקושי</span>
            {difficulty !== null && <span style={{ fontSize: 20, fontWeight: 700, color: G }}>{difficulty}</span>}
          </div>
          <div style={{ display: "flex", gap: 4, direction: "ltr" }}>
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <button key={n} onClick={() => setDifficulty(n)} style={{
                flex: 1, height: 32, border: `1.5px solid ${difficulty === n ? G : "#e5e5e5"}`,
                borderRadius: 6, fontSize: 12, fontWeight: 500,
                background: difficulty === n ? G : "white",
                color: difficulty === n ? "white" : "#555",
                cursor: "pointer", touchAction: "manipulation",
              }}>{n}</button>
            ))}
          </div>
        </div>

        {/* Q3 — Mood */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 8 }}>איך הרגשת?</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { key: "great", emoji: "😃" },
              { key: "ok", emoji: "😐" },
              { key: "tough", emoji: "😓" },
            ].map(m => (
              <button key={m.key} onClick={() => setMood(mood === m.key ? null : m.key)} style={{
                flex: 1, padding: 10, borderRadius: 12, fontSize: 24,
                border: `1.5px solid ${mood === m.key ? O : "#e5e5e5"}`,
                background: mood === m.key ? "#FFF3EB" : "white",
                cursor: "pointer", touchAction: "manipulation",
              }}>{m.emoji}</button>
            ))}
          </div>
        </div>

        {/* Q4 — Note */}
        <div style={{ marginBottom: 16 }}>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="הערה לסקשן (אופציונלי)" rows={2}
            style={{
              width: "100%", padding: "10px 12px", border: "1px solid #e5e5e5",
              borderRadius: 10, fontSize: 13, fontFamily: "inherit",
              direction: "rtl", resize: "none", outline: "none", boxSizing: "border-box",
            }} />
        </div>

      </div>

        {/* Fixed footer */}
        <div style={{ flexShrink: 0, padding: "12px 20px", borderTop: "0.5px solid #f0f0f0", paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
          {error && (
            <div style={{ background: "#fee2e2", color: "#dc2626", padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 10, textAlign: "center" }}>
              {error}
            </div>
          )}
          <button onClick={handleSubmit} disabled={!canSubmit} style={{
            width: "100%", padding: 14, borderRadius: 10, border: "none",
            background: canSubmit ? O : "#e5e5e5",
            color: canSubmit ? "white" : "#999",
            fontSize: 15, fontWeight: 500, cursor: canSubmit ? "pointer" : "not-allowed",
          }}>
            {loading ? "שומר..." : "שמור והמשך"}
          </button>
        </div>
      </div>
    </div>
  );
}
