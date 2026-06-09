import React, { useState, useContext } from "react";
import { X, Plus, Minus, Save } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { AuthContext } from "@/lib/AuthContext";
import { toast } from "sonner";

function intensityColor(level) {
  if (level >= 8) return "var(--ag-error)";
  if (level >= 4) return "var(--ag-accent)";
  return "var(--ag-success)";
}

function intensityLabel(level) {
  if (level >= 8) return "קשה מאוד";
  if (level >= 6) return "קשה";
  if (level >= 4) return "בינוני";
  if (level >= 2) return "קל";
  return "קל מאוד";
}

export default function VariationForm({ exerciseId, exerciseName, variation, onClose, onSaved }) {
  const { user } = useContext(AuthContext);
  const isEdit = Boolean(variation?.id);

  const [name, setName] = useState(variation?.name || "");
  const [description, setDescription] = useState(variation?.description || "");
  const [intensityLevel, setIntensityLevel] = useState(
    Number.isFinite(variation?.intensity_level) ? variation.intensity_level : 5
  );
  const [mediaUrl, setMediaUrl] = useState(variation?.media_url || "");
  const [saving, setSaving] = useState(false);

  const adjustLevel = (delta) => {
    setIntensityLevel((prev) => Math.max(1, Math.min(10, prev + delta)));
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("חובה להזין שם וריאציה");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        const { error } = await supabase
          .from("exercise_variations")
          .update({
            name: trimmedName,
            description: description.trim() || null,
            intensity_level: intensityLevel,
            media_url: mediaUrl.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", variation.id);
        if (error) throw error;
        toast.success("הוריאציה עודכנה");
      } else {
        const { error } = await supabase.from("exercise_variations").insert({
          exercise_id: exerciseId,
          name: trimmedName,
          description: description.trim() || null,
          intensity_level: intensityLevel,
          media_url: mediaUrl.trim() || null,
          created_by: user?.id || null,
        });
        if (error) throw error;
        toast.success("הוריאציה נוספה");
      }
      onSaved?.();
      onClose();
    } catch (err) {
      console.error("[VariationForm] save failed", err);
      toast.error(err?.message || "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  const color = intensityColor(intensityLevel);

  return (
    <div
      dir="rtl"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 11100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#FFF",
          borderRadius: 16,
          width: "100%",
          maxWidth: 460,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, var(--ag-accent) 0%, #FF8A4C 100%)",
            color: "white",
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600 }}>
              {isEdit ? "ערוך וריאציה" : "וריאציה חדשה"}
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {isEdit ? variation?.name : exerciseName}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              color: "white",
              width: 32,
              height: 32,
              borderRadius: 8,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#6B7280",
                letterSpacing: 0.5,
                textTransform: "uppercase",
                display: "block",
                marginBottom: 6,
              }}
            >
              שם הוריאציה
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="לדוגמה: שכיבות סמיכה על הברכיים"
              dir="rtl"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1.5px solid #E5E7EB",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--ag-text)",
                outline: "none",
                background: "#fff",
              }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#6B7280",
                letterSpacing: 0.5,
                textTransform: "uppercase",
                display: "block",
                marginBottom: 6,
              }}
            >
              תיאור (אופציונלי) · יוצג למתאמן
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="הסבר קצר על הוריאציה, איך לבצע, על מה לשים לב..."
              dir="rtl"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1.5px solid #E5E7EB",
                borderRadius: 10,
                fontSize: 13,
                color: "var(--ag-text)",
                outline: "none",
                background: "#fff",
                minHeight: 60,
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#6B7280",
                letterSpacing: 0.5,
                textTransform: "uppercase",
                display: "block",
                marginBottom: 8,
              }}
            >
              דירוג קושי (1 = קל ביותר · 10 = קשה ביותר)
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 14px",
                background: "#FFF7ED",
                border: `2px solid ${color}`,
                borderRadius: 12,
              }}
            >
              <button
                type="button"
                onClick={() => adjustLevel(-1)}
                disabled={intensityLevel <= 1}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: "none",
                  background: intensityLevel <= 1 ? "#E5E7EB" : "var(--ag-accent)",
                  color: "white",
                  cursor: intensityLevel <= 1 ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Minus size={18} />
              </button>

              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontFamily: "Bebas Neue, Barlow Condensed, sans-serif",
                    fontSize: 44,
                    lineHeight: 1,
                    fontWeight: 700,
                    color,
                  }}
                >
                  {intensityLevel}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#777", marginTop: 2 }}>
                  {intensityLabel(intensityLevel)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => adjustLevel(1)}
                disabled={intensityLevel >= 10}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: "none",
                  background: intensityLevel >= 10 ? "#E5E7EB" : "var(--ag-accent)",
                  color: "white",
                  cursor: intensityLevel >= 10 ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 4 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#6B7280",
                letterSpacing: 0.5,
                textTransform: "uppercase",
                display: "block",
                marginBottom: 6,
              }}
            >
              וידאו / תמונה (URL · אופציונלי)
            </label>
            <input
              type="url"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="https://..."
              dir="ltr"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1.5px solid #E5E7EB",
                borderRadius: 10,
                fontSize: 13,
                color: "var(--ag-text)",
                outline: "none",
                background: "#fff",
                textAlign: "left",
              }}
            />
          </div>
        </div>

        <div
          style={{
            padding: 12,
            borderTop: "1px solid var(--ag-border)",
            background: "var(--ag-bg)",
            display: "flex",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1,
              padding: "10px 14px",
              background: "#fff",
              border: "1.5px solid #E5E7EB",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              color: "#6B7280",
              cursor: saving ? "default" : "pointer",
            }}
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 2,
              padding: "10px 14px",
              background: saving
                ? "#FFB280"
                : "linear-gradient(135deg, var(--ag-accent) 0%, #FF8A4C 100%)",
              border: "none",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 800,
              color: "white",
              cursor: saving ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Save size={16} />
            {saving ? "שומר..." : "שמור וריאציה"}
          </button>
        </div>
      </div>
    </div>
  );
}
