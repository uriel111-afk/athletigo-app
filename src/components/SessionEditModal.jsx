import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { X, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { syncPackageStatus } from "@/lib/packageStatus";

export default function SessionEditModal({ session, isOpen, onClose }) {
  const [formData, setFormData] = useState({
    date: "",
    time: "",
    session_type: "אישי",
    status: "ממתין לאישור",
    notes: "",
  });
  const [packages, setPackages] = useState([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [shouldDeduct, setShouldDeduct] = useState(false);
  const [loading, setLoading] = useState(false);
  const [packagesLoading, setPackagesLoading] = useState(false);

  // Get trainee ID from session participants or direct field
  const traineeId = session?.participants?.[0]?.trainee_id || session?.trainee_id;
  const traineeName = session?.participants?.[0]?.trainee_name || session?.trainee_name || "";

  const draftKey = session?.id ? `athletigo_draft_SessionEdit_${session.id}` : null;

  // Initialize form when session changes — but prefer saved draft over server
  // state so unsaved edits survive a close/reopen.
  useEffect(() => {
    if (!session) return;
    const baseline = {
      date: session.date || "",
      time: session.time || "",
      session_type: session.session_type || "אישי",
      status: session.status || "ממתין לאישור",
      notes: session.coach_notes || session.notes || "",
    };
    let restored = null;
    if (draftKey) {
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?._draftData) restored = parsed._draftData;
        }
      } catch {}
    }
    setFormData({ ...baseline, ...(restored?.formData || {}) });
    setSelectedPackageId(restored?.selectedPackageId ?? (session.service_id || ""));
    setShouldDeduct(!!restored?.shouldDeduct);
  }, [session, draftKey]);

  // Instant draft save — no debounce.
  useEffect(() => {
    if (!isOpen || !draftKey) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        _draftData: { formData, selectedPackageId, shouldDeduct },
        _savedAt: new Date().toISOString(),
      }));
    } catch {}
  }, [isOpen, draftKey, formData, selectedPackageId, shouldDeduct]);

  // Fetch trainee's active packages
  useEffect(() => {
    if (!isOpen || !traineeId) return;
    const fetchPackages = async () => {
      setPackagesLoading(true);
      try {
        const { data } = await supabase
          .from("client_services")
          .select("*")
          .eq("trainee_id", traineeId)
          .in("status", ["active", "פעיל"]);
        setPackages(
          (data || []).filter((p) => {
            const remaining =
              (p.remaining_sessions ?? (p.total_sessions || 0) - (p.used_sessions || 0));
            return remaining > 0;
          })
        );
      } catch {
        setPackages([]);
      }
      setPackagesLoading(false);
    };
    fetchPackages();
  }, [isOpen, traineeId]);

  const selectedPkg = packages.find((p) => p.id === selectedPackageId);
  const remaining = selectedPkg
    ? (selectedPkg.remaining_sessions ??
        (selectedPkg.total_sessions || 0) - (selectedPkg.used_sessions || 0))
    : 0;

  // === SAVE ===
  const handleSave = async () => {
    setLoading(true);
    try {
      // 1. Update session
      const { error: sessionError } = await supabase
        .from("sessions")
        .update({
          date: formData.date,
          time: formData.time,
          session_type: formData.session_type,
          status: formData.status,
          coach_notes: formData.notes,
          service_id: selectedPackageId || null,
        })
        .eq("id", session.id);

      if (sessionError) throw sessionError;

      // 2. Deduct from package if needed
      if (shouldDeduct && selectedPackageId && formData.status === "הושלם") {
        const { data: existingSession } = await supabase
          .from("sessions")
          .select("was_deducted")
          .eq("id", session.id)
          .single();

        if (!existingSession?.was_deducted) {
          const { data: pkg } = await supabase
            .from("client_services")
            .select("remaining_sessions, total_sessions, used_sessions")
            .eq("id", selectedPackageId)
            .single();

          if (pkg) {
            const currentRemaining =
              pkg.remaining_sessions ??
              (pkg.total_sessions || 0) - (pkg.used_sessions || 0);

            if (currentRemaining > 0) {
              const updateData = {};
              if (pkg.remaining_sessions !== null && pkg.remaining_sessions !== undefined) {
                updateData.remaining_sessions = pkg.remaining_sessions - 1;
              }
              updateData.used_sessions = (pkg.used_sessions || 0) + 1;
              updateData.status = currentRemaining - 1 <= 0 ? "completed" : undefined;
              if (!updateData.status) delete updateData.status;

              await supabase
                .from("client_services")
                .update(updateData)
                .eq("id", selectedPackageId);
              await syncPackageStatus(selectedPackageId);

              await supabase
                .from("sessions")
                .update({ was_deducted: true })
                .eq("id", session.id);
            }
          }
        }
      }

      // 3. Notify trainee if status changed
      if (formData.status !== session.status && traineeId) {
        const statusMessages = {
          מאושר: "המפגש שלך אושר",
          בוטל: "המפגש בוטל על ידי המאמן",
          הושלם: "המפגש סומן כהושלם",
        };
        if (statusMessages[formData.status]) {
          await supabase.from("notifications").insert({
            user_id: traineeId,
            type: "session_updated",
            title: statusMessages[formData.status],
            message: `מפגש ב-${formData.date} בשעה ${formData.time}`,
            is_read: false,
          });
        }
      }

      toast.success("המפגש עודכן בהצלחה");
      window.dispatchEvent(new Event("data-changed"));
      if (draftKey) { try { localStorage.removeItem(draftKey); } catch {} }
      onClose();

      // Show renewal alert if package running low
      if (shouldDeduct && selectedPackageId) {
        const { data: updatedPkg } = await supabase
          .from("client_services")
          .select("remaining_sessions, used_sessions, total_sessions, package_name")
          .eq("id", selectedPackageId)
          .single();

        if (updatedPkg) {
          const updRemaining =
            updatedPkg.remaining_sessions ??
            (updatedPkg.total_sessions || 0) - (updatedPkg.used_sessions || 0);
          if (updRemaining === 1) {
            toast.warning(`נותר מפגש אחד בחבילה "${updatedPkg.package_name}"`);
          } else if (updRemaining <= 0) {
            toast.error(`החבילה "${updatedPkg.package_name}" נגמרה`);
          }
        }
      }
    } catch (err) {
      toast.error("שגיאה: " + (err?.message || "נסה שוב"));
    } finally {
      setLoading(false);
    }
  };

  // === DELETE ===
  const handleDelete = async () => {
    if (!window.confirm("למחוק מפגש זה?")) return;
    setLoading(true);
    try {
      // If was deducted — restore to package
      if (session.was_deducted && session.service_id) {
        const { data: pkg } = await supabase
          .from("client_services")
          .select("remaining_sessions, used_sessions")
          .eq("id", session.service_id)
          .single();

        if (pkg) {
          const updateData = { status: "active" };
          if (pkg.remaining_sessions !== null && pkg.remaining_sessions !== undefined) {
            updateData.remaining_sessions = pkg.remaining_sessions + 1;
          }
          if (pkg.used_sessions > 0) {
            updateData.used_sessions = pkg.used_sessions - 1;
          }
          await supabase
            .from("client_services")
            .update(updateData)
            .eq("id", session.service_id);
          await syncPackageStatus(session.service_id);
        }
      }

      await supabase.from("sessions").delete().eq("id", session.id);
      toast.success("המפגש נמחק");
      window.dispatchEvent(new Event("data-changed"));
      onClose();
    } catch (err) {
      toast.error("שגיאה במחיקה: " + (err?.message || "נסה שוב"));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !session) return null;

  const statusColors = {
    "ממתין לאישור": "#9CA3AF",
    מאושר: "#22C55E",
    הושלם: "#3B82F6",
    התקיים: "#3B82F6",
    בוטל: "#EF4444",
    "בוטל על ידי מתאמן": "#EF4444",
    "בוטל על ידי מאמן": "#EF4444",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 11000,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "20px 20px 0 0",
          width: "100%",
          maxWidth: 500,
          maxHeight: "92vh",
          overflowY: "auto",
          direction: "rtl",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #eee",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            position: "sticky",
            top: 0,
            background: "white",
            zIndex: 1,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 900, color: "#1a1a1a" }}>
            עריכת מפגש
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "#f5f5f5",
              border: "none",
              borderRadius: "50%",
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ padding: "16px 20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Trainee info */}
          {traineeName && (
            <div
              style={{
                background: "#FFF8F3",
                border: "1px solid #FFE0CC",
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 14,
                fontWeight: 700,
                color: "#FF6F20",
              }}
            >
              {traineeName}
            </div>
          )}

          {/* Date */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 6, display: "block" }}>תאריך</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              style={{ width: "100%", height: 44, borderRadius: 10, border: "1.5px solid #ddd", padding: "0 12px", fontSize: 16 }}
            />
          </div>

          {/* Time */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 6, display: "block" }}>שעה</label>
            <input
              type="time"
              value={formData.time}
              onChange={(e) => setFormData({ ...formData, time: e.target.value })}
              style={{ width: "100%", height: 44, borderRadius: 10, border: "1.5px solid #ddd", padding: "0 12px", fontSize: 16 }}
            />
          </div>

          {/* Type */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 6, display: "block" }}>סוג</label>
            <select
              value={formData.session_type}
              onChange={(e) => setFormData({ ...formData, session_type: e.target.value })}
              style={{ width: "100%", height: 44, borderRadius: 10, border: "1.5px solid #ddd", padding: "0 12px", fontSize: 15, background: "white" }}
            >
              <option value="אישי">אישי</option>
              <option value="קבוצתי">קבוצתי</option>
              <option value="אונליין">אונליין</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 6, display: "block" }}>סטטוס</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              style={{
                width: "100%",
                height: 44,
                borderRadius: 10,
                border: `1.5px solid ${statusColors[formData.status] || "#ddd"}`,
                padding: "0 12px",
                fontSize: 15,
                background: "white",
                color: statusColors[formData.status] || "#1a1a1a",
                fontWeight: 700,
              }}
            >
              <option value="ממתין לאישור">ממתין לאישור</option>
              <option value="מאושר">מאושר</option>
              <option value="הושלם">הושלם</option>
              <option value="בוטל">בוטל</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 6, display: "block" }}>הערות</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="הערות למפגש..."
              rows={3}
              style={{ width: "100%", borderRadius: 10, border: "1.5px solid #ddd", padding: "10px 12px", fontSize: 15, resize: "none" }}
            />
          </div>

          {/* Package assignment */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 6, display: "block" }}>שיוך לחבילה</label>
            {packagesLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#999", fontSize: 13 }}>
                <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                טוען חבילות...
              </div>
            ) : (
              <select
                value={selectedPackageId}
                onChange={(e) => {
                  setSelectedPackageId(e.target.value);
                  setShouldDeduct(false);
                }}
                style={{ width: "100%", height: 44, borderRadius: 10, border: "1.5px solid #ddd", padding: "0 12px", fontSize: 15, background: "white" }}
              >
                <option value="">ללא שיוך לחבילה</option>
                {packages.map((pkg) => {
                  const r = pkg.remaining_sessions ?? (pkg.total_sessions || 0) - (pkg.used_sessions || 0);
                  return (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.package_name || "חבילה"} — {r} מפגשים נותרו
                    </option>
                  );
                })}
              </select>
            )}
            {selectedPkg && (
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                יתרה נוכחית: {remaining} מפגשים
              </div>
            )}
          </div>

          {/* Deduct toggle */}
          {selectedPackageId && formData.status === "הושלם" && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#FFF8F5",
                border: "1px solid #FFD4B8",
                borderRadius: 10,
                padding: "12px 16px",
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>קזז מפגש מהחבילה</div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  היתרה תרד מ-{remaining} ל-{Math.max(0, remaining - 1)}
                </div>
              </div>
              <input
                type="checkbox"
                checked={shouldDeduct}
                onChange={(e) => setShouldDeduct(e.target.checked)}
                style={{ width: 20, height: 20, accentColor: "#FF6F20" }}
              />
            </div>
          )}

          {/* Already deducted info */}
          {session.was_deducted && (
            <div
              style={{
                background: "#F0FDF4",
                border: "1px solid #BBF7D0",
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 12,
                color: "#166534",
                fontWeight: 600,
              }}
            >
              מפגש זה כבר קוזז מהחבילה
            </div>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={loading}
            style={{
              width: "100%",
              height: 52,
              borderRadius: 12,
              background: "#FF6F20",
              color: "white",
              border: "none",
              fontSize: 18,
              fontWeight: 900,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {loading ? (
              <Loader2 style={{ width: 20, height: 20, animation: "spin 1s linear infinite" }} />
            ) : null}
            {loading ? "שומר..." : "שמור שינויים"}
          </button>

          {/* Delete button */}
          <button
            onClick={handleDelete}
            disabled={loading}
            style={{
              width: "100%",
              height: 44,
              borderRadius: 12,
              background: "white",
              color: "#EF4444",
              border: "1.5px solid #FCA5A5",
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Trash2 style={{ width: 16, height: 16 }} />
            מחק מפגש
          </button>
        </div>
      </div>
    </div>
  );
}
