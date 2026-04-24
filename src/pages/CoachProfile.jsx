import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { base44 } from "@/api/base44Client";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import PageLoader from "@/components/PageLoader";
import { toast } from "sonner";

const PERMISSION_TYPES = [
  { id: "view_plan",        label: "צפייה בתוכנית אימון", icon: "📋" },
  { id: "view_baseline",    label: "צפייה בבייסליין",     icon: "📊" },
  { id: "view_records",     label: "צפייה בשיאים",         icon: "🏆" },
  { id: "view_progress",    label: "צפייה בהתקדמות",      icon: "📈" },
  { id: "edit_profile",     label: "עריכת פרופיל",         icon: "✏️" },
  { id: "submit_feedback",  label: "שליחת משוב",           icon: "💬" },
  { id: "view_documents",   label: "צפייה במסמכים",        icon: "📄" },
];

export default function CoachProfile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trainees, setTrainees] = useState([]);

  // View mode — persists across sessions per spec
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem("athletigo_view_mode") || "professional"; }
    catch { return "professional"; }
  });

  // Trainee permissions — persisted per coach
  const PERMS_KEY = user?.id ? `athletigo_perms_${user.id}` : null;
  const [permissions, setPermissions] = useState({});
  const [expandedTrainee, setExpandedTrainee] = useState(null);

  // Send notification dialog state
  const [showSendNotif, setShowSendNotif] = useState(false);
  const [notifTarget, setNotifTarget] = useState("all");
  const [notifMessage, setNotifMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Change password dialog state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);
      } catch (e) {
        console.error("[CoachProfile] load user:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load trainees + permissions once we know the coach
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("coach_id", user.id)
        .order("full_name");
      setTrainees(data || []);
    })();
    try {
      const raw = localStorage.getItem(`athletigo_perms_${user.id}`);
      if (raw) setPermissions(JSON.parse(raw));
    } catch {}
  }, [user?.id]);

  const getPermission = (traineeId, permId) => {
    // Default to enabled so existing permissions don't silently block trainees
    return permissions[traineeId]?.[permId] ?? true;
  };

  const togglePermission = (traineeId, permId) => {
    setPermissions(prev => {
      const current = prev[traineeId]?.[permId] ?? true;
      const updated = {
        ...prev,
        [traineeId]: {
          ...(prev[traineeId] || {}),
          [permId]: !current,
        },
      };
      if (PERMS_KEY) {
        try { localStorage.setItem(PERMS_KEY, JSON.stringify(updated)); } catch {}
      }
      return updated;
    });
  };

  const handleChangeViewMode = (mode) => {
    setViewMode(mode);
    try { localStorage.setItem("athletigo_view_mode", mode); } catch {}
  };

  const handleChangePassword = async () => {
    if (!currentPw) { toast.error("יש להזין את הסיסמה הנוכחית"); return; }
    if (newPw !== confirmPw) { toast.error("הסיסמאות החדשות לא תואמות"); return; }
    if (newPw.length < 6) { toast.error("הסיסמה חייבת להכיל לפחות 6 תווים"); return; }
    setPwLoading(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPw,
      });
      if (signInErr) { toast.error("סיסמה נוכחית שגויה"); return; }
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) { toast.error("שגיאה: " + error.message); return; }
      toast.success("הסיסמה שונתה בהצלחה");
      setShowChangePassword(false);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } finally {
      setPwLoading(false);
    }
  };

  const sendNotification = async () => {
    const msg = notifMessage.trim();
    if (!msg) { toast.error("יש לכתוב הודעה"); return; }
    if (!trainees.length) { toast.error("אין מתאמנים"); return; }
    const targetIds = notifTarget === "all"
      ? trainees.map(t => t.id)
      : [notifTarget];
    const inserts = targetIds.map(tid => ({
      user_id: tid,
      type: "coach_message",
      message: msg,
      is_read: false,
      data: { from_coach: user.id, coach_name: user.full_name },
    }));
    setSending(true);
    try {
      const { error } = await supabase.from("notifications").insert(inserts);
      if (error) { toast.error("שגיאה: " + error.message); return; }
      toast.success(`נשלח ל-${targetIds.length} מתאמנים`);
      setShowSendNotif(false);
      setNotifMessage("");
      setNotifTarget("all");
    } finally {
      setSending(false);
    }
  };

  const handleLogout = async () => {
    try { await supabase.auth.signOut(); } catch {}
    navigate("/login", { replace: true });
  };

  if (loading || !user) {
    return <ProtectedCoachPage><PageLoader /></ProtectedCoachPage>;
  }

  const initial = (user.full_name || "?").trim().charAt(0);

  return (
    <ProtectedCoachPage>
      <div style={{ minHeight: "100vh", background: "#FFF9F0", paddingBottom: 100, direction: "rtl" }}>
        {/* A. Profile header */}
        <div style={{
          background: "white", borderRadius: 20,
          padding: 20, margin: 12,
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          textAlign: "center",
        }}>
          <div style={{
            width: 70, height: 70, borderRadius: "50%",
            background: "#FFF0E4",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 10px",
            fontSize: 28, fontWeight: 700, color: "#FF6F20",
          }}>{initial}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>
            {user.full_name || "מאמן"}
          </div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
            {user.email}
          </div>
          <div style={{ fontSize: 12, color: "#FF6F20", marginTop: 4, fontWeight: 600 }}>
            מאמן AthletiGo
          </div>
        </div>

        {/* B. View mode toggle */}
        <div style={{
          margin: "0 12px 12px", background: "white",
          borderRadius: 16, padding: 14,
          boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>🔄 מצב תצוגה</div>
          <div style={{
            display: "flex", gap: 6,
            background: "#FFF9F0", borderRadius: 12, padding: 4,
          }}>
            {[
              { id: "professional", label: "🏋️ מקצועי" },
              { id: "financial",    label: "💰 פיננסי" },
            ].map(m => {
              const active = viewMode === m.id;
              return (
                <div key={m.id} onClick={() => handleChangeViewMode(m.id)} style={{
                  flex: 1, padding: 10, borderRadius: 10,
                  textAlign: "center", fontSize: 14, fontWeight: 600,
                  cursor: "pointer",
                  background: active ? "#FF6F20" : "transparent",
                  color: active ? "white" : "#888",
                }}>{m.label}</div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 6, textAlign: "center" }}>
            {viewMode === "professional"
              ? "תצוגה מקצועית — אימונים, תוכניות, מסלולים"
              : "תצוגה פיננסית — הכנסות, חבילות, תשלומים"}
          </div>
        </div>

        {/* C. Trainee permissions */}
        <div style={{
          margin: "0 12px 12px", background: "white",
          borderRadius: 16, padding: 14,
          boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 10,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>⚙️ הרשאות מתאמנים</div>
            <div style={{ fontSize: 11, color: "#888" }}>{trainees.length} מתאמנים</div>
          </div>

          {trainees.length === 0 ? (
            <div style={{ textAlign: "center", color: "#888", padding: 12, fontSize: 13 }}>אין מתאמנים עדיין</div>
          ) : trainees.map(t => (
            <div key={t.id} style={{
              background: "#FFF9F0", borderRadius: 12,
              padding: 10, marginBottom: 6,
              border: "0.5px solid #F0E4D0",
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "center", cursor: "pointer",
              }}
                onClick={() => setExpandedTrainee(prev => prev === t.id ? null : t.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%",
                    background: "#FFF0E4",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 600, color: "#FF6F20",
                  }}>{(t.full_name || "?").charAt(0)}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{t.full_name}</div>
                </div>
                <span style={{ fontSize: 14, color: "#888" }}>
                  {expandedTrainee === t.id ? "▲" : "▼"}
                </span>
              </div>

              {expandedTrainee === t.id && (
                <div style={{
                  display: "flex", flexDirection: "column", gap: 4,
                  paddingTop: 6, marginTop: 6,
                  borderTop: "0.5px solid #F0E4D0",
                }}>
                  {PERMISSION_TYPES.map(perm => {
                    const isEnabled = getPermission(t.id, perm.id);
                    return (
                      <div key={perm.id} onClick={() => togglePermission(t.id, perm.id)} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: 8, background: "white", borderRadius: 10,
                        cursor: "pointer",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 14 }}>{perm.icon}</span>
                          <span style={{ fontSize: 12, fontWeight: 500 }}>{perm.label}</span>
                        </div>
                        <div style={{
                          width: 40, height: 22, borderRadius: 11,
                          background: isEnabled ? "#16a34a" : "#E8E0D8",
                          position: "relative", transition: "background 0.2s",
                        }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: "50%",
                            background: "white",
                            position: "absolute", top: 2,
                            right: isEnabled ? 2 : 20,
                            transition: "right 0.2s",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* D. Quick actions */}
        <div style={{
          margin: "0 12px 12px", background: "white",
          borderRadius: 16, padding: 14,
          boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>⚡ פעולות מהירות</div>

          <div onClick={() => setShowSendNotif(true)} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: 12, background: "#FFF9F0", borderRadius: 12,
            marginBottom: 6, cursor: "pointer",
            border: "0.5px solid #F0E4D0",
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: "#FFF0E4",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
            }}>📢</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>שלח התראה</div>
              <div style={{ fontSize: 11, color: "#888" }}>שלח הודעה לכל המתאמנים או למתאמן ספציפי</div>
            </div>
            <span style={{ color: "#ccc", fontSize: 14 }}>←</span>
          </div>

          <div onClick={() => setShowChangePassword(true)} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: 12, background: "#FFF9F0", borderRadius: 12,
            marginBottom: 6, cursor: "pointer",
            border: "0.5px solid #F0E4D0",
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: "#FFF0E4",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
            }}>🔒</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>שינוי סיסמה</div>
              <div style={{ fontSize: 11, color: "#888" }}>עדכן את סיסמת החשבון</div>
            </div>
            <span style={{ color: "#ccc", fontSize: 14 }}>←</span>
          </div>
        </div>

        {/* E. Logout */}
        <div style={{ margin: "0 12px 100px" }}>
          <button
            onClick={handleLogout}
            style={{
              width: "100%", padding: 14,
              borderRadius: 14, border: "1.5px solid #dc2626",
              background: "white", color: "#dc2626",
              fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >🚪 יציאה מהחשבון</button>
        </div>

        {/* Change password dialog */}
        {showChangePassword && (
          <div onClick={() => setShowChangePassword(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            zIndex: 11000,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: "#FFF9F0", borderRadius: 20, padding: 20,
              width: "100%", maxWidth: 360, direction: "rtl",
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, textAlign: "center", marginBottom: 14 }}>🔒 שינוי סיסמה</div>

              {[
                { label: "סיסמה נוכחית", value: currentPw, set: setCurrentPw },
                { label: "סיסמה חדשה",   value: newPw,     set: setNewPw },
                { label: "אימות סיסמה חדשה", value: confirmPw, set: setConfirmPw },
              ].map((f, i, arr) => (
                <div key={f.label} style={{ marginBottom: i === arr.length - 1 ? 6 : 10 }}>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>{f.label}</label>
                  <input type="password" value={f.value} onChange={e => f.set(e.target.value)} style={{
                    width: "100%", padding: 10, borderRadius: 12,
                    border: "0.5px solid #F0E4D0",
                    fontSize: 14, direction: "ltr",
                    background: "white", outline: "none", boxSizing: "border-box",
                  }} />
                </div>
              ))}

              {newPw && confirmPw && newPw !== confirmPw && (
                <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>הסיסמאות לא תואמות</div>
              )}

              <button
                onClick={handleChangePassword}
                disabled={pwLoading || !currentPw || !newPw || newPw !== confirmPw || newPw.length < 6}
                style={{
                  width: "100%", padding: 14, borderRadius: 14, border: "none",
                  background: (currentPw && newPw && newPw === confirmPw && newPw.length >= 6) ? "#FF6F20" : "#ccc",
                  color: "white", fontSize: 16, fontWeight: 700,
                  cursor: "pointer", marginTop: 6,
                }}
              >{pwLoading ? "שומר..." : "🔒 שנה סיסמה"}</button>

              <div onClick={() => setShowChangePassword(false)} style={{
                textAlign: "center", padding: 10, color: "#888", fontSize: 14, cursor: "pointer",
              }}>ביטול</div>
            </div>
          </div>
        )}

        {/* Send notification dialog */}
        {showSendNotif && (
          <div onClick={() => setShowSendNotif(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            zIndex: 11000,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: "#FFF9F0", borderRadius: 20, padding: 20,
              width: "100%", maxWidth: 360, direction: "rtl",
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, textAlign: "center", marginBottom: 14 }}>📢 שלח התראה</div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>למי</label>
                <select value={notifTarget} onChange={e => setNotifTarget(e.target.value)} style={{
                  width: "100%", padding: 10, borderRadius: 12,
                  border: "0.5px solid #F0E4D0",
                  fontSize: 14, direction: "rtl", background: "white", outline: "none",
                }}>
                  <option value="all">כל המתאמנים</option>
                  {trainees.map(t => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>הודעה</label>
                <textarea value={notifMessage} onChange={e => setNotifMessage(e.target.value)} placeholder="כתוב הודעה..." style={{
                  width: "100%", padding: 10, borderRadius: 12,
                  border: "0.5px solid #F0E4D0",
                  fontSize: 14, direction: "rtl",
                  minHeight: 80, resize: "vertical",
                  background: "white", outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                }} />
              </div>

              <button
                onClick={sendNotification}
                disabled={sending || !notifMessage.trim()}
                style={{
                  width: "100%", padding: 14, borderRadius: 14, border: "none",
                  background: notifMessage.trim() ? "#FF6F20" : "#ccc",
                  color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer",
                }}
              >{sending ? "שולח..." : "📢 שלח"}</button>

              <div onClick={() => setShowSendNotif(false)} style={{
                textAlign: "center", padding: 10, color: "#888", fontSize: 14, cursor: "pointer",
              }}>ביטול</div>
            </div>
          </div>
        )}
      </div>
    </ProtectedCoachPage>
  );
}
