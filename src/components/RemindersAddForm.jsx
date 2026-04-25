import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

// Compact add/edit form for coach reminders. Uses the existing
// `notifications` table — no new schema. See RemindersPanel for the
// list + delete/toggle side. The reminder time + description live in
// `notifications.data` (jsonb) since the table has no `scheduled_at`.
//
// Draft persistence: only the "new reminder" flow (no `existing`)
// auto-saves to localStorage so an accidental close doesn't lose
// what the coach typed. Edit flow always reads from `existing`.
const DRAFT_KEY = "athletigo_draft_reminder";

export default function RemindersAddForm({ isOpen, onClose, onSaved, userId, existing }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (existing) {
      setTitle(existing.message || existing.title || "");
      setDescription(existing.data?.description || "");
      const at = existing.data?.remind_at ? new Date(existing.data.remind_at) : null;
      if (at && !isNaN(at)) {
        setDate(at.toISOString().slice(0, 10));
        setTime(at.toTimeString().slice(0, 5));
      }
    } else {
      // Restore draft if present, else fresh
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) {
          const d = JSON.parse(raw);
          setTitle(d.title || "");
          setDescription(d.description || "");
          setDate(d.date || "");
          setTime(d.time || "");
          return;
        }
      } catch {}
      setTitle(""); setDescription(""); setDate(""); setTime("");
    }
  }, [isOpen, existing]);

  // Persist draft on every keystroke (only for the "new reminder" flow,
  // and only while the dialog is open).
  useEffect(() => {
    if (!isOpen || existing) return;
    if (!title && !description && !date && !time) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, description, date, time }));
    } catch {}
  }, [isOpen, existing, title, description, date, time]);

  if (!isOpen) return null;

  const quickSet = (preset) => {
    const d = new Date();
    if (preset === "hour") d.setHours(d.getHours() + 1);
    else if (preset === "tomorrow9") { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
    else if (preset === "week") d.setDate(d.getDate() + 7);
    setDate(d.toISOString().slice(0, 10));
    setTime(d.toTimeString().slice(0, 5));
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error("יש להזין כותרת"); return; }
    if (!date) { toast.error("יש לבחור תאריך"); return; }

    const remindAt = new Date(`${date}T${time || "09:00"}`);
    if (isNaN(remindAt)) { toast.error("תאריך לא תקין"); return; }

    setSaving(true);
    const payload = {
      user_id: userId,
      coach_id: userId,
      created_by: userId,
      type: "coach_reminder",
      message: title.trim(),
      title: title.trim(),
      is_read: false,
      data: { remind_at: remindAt.toISOString(), description: description.trim() || null },
    };

    const { error } = existing
      ? await supabase.from("notifications").update(payload).eq("id", existing.id)
      : await supabase.from("notifications").insert(payload);
    setSaving(false);

    if (error) {
      console.error("[RemindersAddForm] save failed:", error);
      toast.error("שגיאה: " + (error.message || "נסה שוב"));
      return;
    }
    toast.success(existing ? "התזכורת עודכנה" : "התזכורת נשמרה");
    // Clear draft only on a successful new-reminder save; edits don't
    // touch the draft slot.
    if (!existing) {
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
    }
    onSaved?.();
    onClose();
  };

  const canSave = title.trim() && date && !saving;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 12000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFF9F0",
          borderRadius: 24,
          padding: 24,
          width: "100%", maxWidth: 380,
          direction: "rtl",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, textAlign: "center", marginBottom: 16 }}>
          ⏰ {existing ? "עריכת תזכורת" : "תזכורת חדשה"}
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="מה לזכור?..."
          style={{
            width: "100%", padding: 12, borderRadius: 14,
            border: "1.5px solid #F0E4D0", fontSize: 15, fontWeight: 600,
            direction: "rtl", marginBottom: 10, background: "white",
            boxSizing: "border-box", outline: "none",
          }}
        />

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="פרטים נוספים (אופציונלי)..."
          style={{
            width: "100%", padding: 10, borderRadius: 14,
            border: "0.5px solid #F0E4D0", fontSize: 13,
            direction: "rtl", minHeight: 60, resize: "vertical",
            marginBottom: 10, background: "white",
            boxSizing: "border-box", outline: "none", fontFamily: "inherit",
          }}
        />

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>📅 מתי להזכיר</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              flex: 1, padding: 10, borderRadius: 12,
              border: "0.5px solid #F0E4D0", fontSize: 14, background: "white",
              boxSizing: "border-box", outline: "none",
            }}
          />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            style={{
              width: 120, padding: 10, borderRadius: 12,
              border: "0.5px solid #F0E4D0", fontSize: 14, background: "white",
              boxSizing: "border-box", outline: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
          {[
            { key: "hour",      label: "עוד שעה" },
            { key: "tomorrow9", label: "מחר 9:00" },
            { key: "week",      label: "עוד שבוע" },
          ].map((q) => (
            <div
              key={q.key}
              onClick={() => quickSet(q.key)}
              style={{
                flex: 1, padding: 8, borderRadius: 10,
                textAlign: "center", fontSize: 11, fontWeight: 600,
                cursor: "pointer", background: "#FFF0E4",
                color: "#FF6F20", border: "1px solid #F0E4D0",
              }}
            >{q.label}</div>
          ))}
        </div>

        <button
          onClick={handleSave}
          disabled={!canSave}
          style={{
            width: "100%", padding: 14, borderRadius: 14, border: "none",
            background: canSave ? "#FF6F20" : "#ccc",
            color: "white", fontSize: 16, fontWeight: 700,
            cursor: canSave ? "pointer" : "default",
          }}
        >{saving ? "שומר..." : existing ? "💾 עדכן" : "⏰ שמור תזכורת"}</button>

        <div
          onClick={onClose}
          style={{ textAlign: "center", padding: 10, color: "#888", fontSize: 14, cursor: "pointer" }}
        >ביטול</div>
      </div>
    </div>
  );
}
