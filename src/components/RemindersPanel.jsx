import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import RemindersAddForm from "./RemindersAddForm";

// Bottom-sheet dialog listing the coach's reminders. Reminders live in
// the existing `notifications` table under `type='coach_reminder'`, with
// the schedule time stored in `data.remind_at` (jsonb) since the table
// has no `scheduled_at` column. `is_read=true` = done.
export default function RemindersPanel({ isOpen, onClose, userId, onChange }) {
  const [tab, setTab] = useState("upcoming");
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchReminders = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .eq("type", "coach_reminder")
      .or("status.is.null,status.neq.deleted")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      console.error("[RemindersPanel] fetch failed:", error);
      return;
    }
    // Sort client-side by remind_at (ascending) since it lives in data jsonb.
    const sorted = (data || []).sort((a, b) => {
      const aT = a.data?.remind_at ? new Date(a.data.remind_at).getTime() : 0;
      const bT = b.data?.remind_at ? new Date(b.data.remind_at).getTime() : 0;
      return aT - bT;
    });
    setReminders(sorted);
    onChange?.(sorted);
  }, [userId, onChange]);

  useEffect(() => { if (isOpen) fetchReminders(); }, [isOpen, fetchReminders]);

  const toggleDone = async (r) => {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: !r.is_read })
      .eq("id", r.id);
    if (error) { toast.error("שגיאה: " + error.message); return; }
    fetchReminders();
  };

  const deleteReminder = async (id) => {
    // Soft-delete — consistent with TraineeNotificationsTab. The fetch
    // query filters status='deleted' so the row drops out of the UI
    // but stays in the DB for accidental-undo / audit.
    const { error } = await supabase
      .from("notifications")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error("שגיאה: " + error.message); return; }
    toast.success("נמחק");
    fetchReminders();
  };

  const formatWhen = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const now = new Date();
    const diff = d - now;
    if (diff < 0) return "עבר הזמן";
    if (diff < 3600000) return `עוד ${Math.max(1, Math.round(diff / 60000))} ד׳`;
    if (diff < 86400000) return `עוד ${Math.round(diff / 3600000)} שעות`;
    return d.toLocaleDateString("he-IL", {
      day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  const isOverdue = (r) =>
    !r.is_read && r.data?.remind_at && new Date(r.data.remind_at) < new Date();

  const filtered = reminders.filter((r) => (tab === "upcoming" ? !r.is_read : r.is_read));

  if (!isOpen) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 11000,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "#FFF9F0",
            borderRadius: "24px 24px 0 0",
            width: "100%", maxWidth: 500,
            maxHeight: "85vh", overflowY: "auto",
            padding: "20px 16px",
            direction: "rtl",
          }}
        >
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 16,
          }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>⏰ תזכורות</div>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", fontSize: 20, color: "#888", cursor: "pointer" }}
            >✕</button>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {[
              { id: "upcoming", label: "פעילות" },
              { id: "done",     label: "הושלמו" },
            ].map((t) => (
              <div
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, textAlign: "center",
                  padding: 8, borderRadius: 12,
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  background: tab === t.id ? "#FF6F20" : "white",
                  color: tab === t.id ? "white" : "#888",
                  border: tab === t.id ? "none" : "0.5px solid #F0E4D0",
                }}
              >{t.label}</div>
            ))}
          </div>

          <button
            onClick={() => { setEditing(null); setAddOpen(true); }}
            style={{
              width: "100%", padding: 12,
              background: "#FF6F20", color: "white",
              border: "none", borderRadius: 14,
              fontSize: 15, fontWeight: 600,
              cursor: "pointer", marginBottom: 14,
            }}
          >+ תזכורת חדשה</button>

          {loading && (
            <div style={{ textAlign: "center", padding: 20, color: "#888" }}>טוען...</div>
          )}

          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: 30, color: "#888" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⏰</div>
              {tab === "upcoming" ? "אין תזכורות פעילות" : "אין תזכורות שהושלמו"}
            </div>
          )}

          {!loading && filtered.map((r) => {
            const overdue = isOverdue(r);
            return (
              <div
                key={r.id}
                style={{
                  background: "white", borderRadius: 14,
                  padding: 12, marginBottom: 8,
                  border: overdue ? "1.5px solid #dc2626" : "0.5px solid #F0E4D0",
                  opacity: r.is_read ? 0.6 : 1,
                  display: "flex", alignItems: "flex-start", gap: 10,
                }}
              >
                <div
                  onClick={() => toggleDone(r)}
                  style={{
                    width: 24, height: 24, borderRadius: 8,
                    border: r.is_read ? "2px solid #16a34a" : "2px solid #F0E4D0",
                    background: r.is_read ? "#E8F5E9" : "white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", flexShrink: 0, marginTop: 2,
                  }}
                >
                  {r.is_read && <span style={{ color: "#16a34a", fontSize: 14 }}>✓</span>}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    onClick={() => { setEditing(r); setAddOpen(true); }}
                    style={{
                      fontSize: 14, fontWeight: 600, color: "#1a1a1a",
                      textDecoration: r.is_read ? "line-through" : "none",
                      cursor: "pointer",
                    }}
                  >{r.message || r.title || "ללא כותרת"}</div>
                  {r.data?.description && (
                    <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{r.data.description}</div>
                  )}
                  <div style={{
                    fontSize: 11, color: overdue ? "#dc2626" : "#888",
                    marginTop: 4,
                  }}>{formatWhen(r.data?.remind_at)}</div>
                </div>

                <button
                  onClick={() => deleteReminder(r.id)}
                  style={{
                    background: "none", border: "none",
                    color: "#ccc", fontSize: 14, cursor: "pointer",
                  }}
                  title="מחק"
                >🗑</button>
              </div>
            );
          })}
        </div>
      </div>

      <RemindersAddForm
        isOpen={addOpen}
        onClose={() => { setAddOpen(false); setEditing(null); }}
        onSaved={fetchReminders}
        userId={userId}
        existing={editing}
      />
    </>
  );
}
