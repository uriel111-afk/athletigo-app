import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { base44 } from "@/api/base44Client";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import PageLoader from "@/components/PageLoader";
import AppSwitcher from "@/components/lifeos/AppSwitcher";
import { toast } from "sonner";
import { NOTIFICATION_TYPES, isEnabled } from "@/lib/notify";

export default function CoachProfile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trainees, setTrainees] = useState([]);
  // Hero stats: trainees + sessions this month + active days. Each
  // is best-effort — if a query fails we just show 0.
  const [heroStats, setHeroStats] = useState({ trainees: 0, monthlySessions: 0, activeDays: 0 });

  // View mode (kept from previous version)
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem("athletigo_view_mode") || "professional"; }
    catch { return "professional"; }
  });

  // Password dialog (2 tabs)
  const [showPwDialog, setShowPwDialog] = useState(false);
  const [pwTab, setPwTab] = useState("self");
  const [selfNew, setSelfNew] = useState("");
  const [selfConfirm, setSelfConfirm] = useState("");
  const [selfCurrent, setSelfCurrent] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [resetTraineeId, setResetTraineeId] = useState("");
  const [resetPwInput, setResetPwInput] = useState("");
  // Full user list for the password-reset dropdown. Separate from `trainees`
  // (which stays coach-scoped for the notification dialog) so the main admin
  // can reset the password for ANY user in the system.
  const [allUsersForReset, setAllUsersForReset] = useState([]);

  // Send notification dialog
  const [showSendNotif, setShowSendNotif] = useState(false);
  const [notifTarget, setNotifTarget] = useState("all");
  const [notifMessage, setNotifMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Notification preferences — { type: boolean }, missing keys fall back
  // to NOTIFICATION_TYPES[type].recommended (see lib/notify.isEnabled).
  const [notifPrefs, setNotifPrefs] = useState({});
  const [savingPrefs, setSavingPrefs] = useState(false);

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

  const fetchTrainees = useCallback(async () => {
    if (!user?.id) return;
    const { data: t } = await supabase
      .from("users")
      .select("id, full_name, email")
      .eq("coach_id", user.id)
      .order("full_name");
    setTrainees(t || []);
  }, [user?.id]);

  useEffect(() => { fetchTrainees(); }, [fetchTrainees]);

  // Load ALL users for the admin password-reset dropdown (no coach_id / role
  // filter). The actual password change runs server-side via the
  // `reset-password` Edge Function (service role), so RLS on the client read
  // is the only thing that could limit this list.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data: allUsers, error } = await supabase
        .from("users")
        .select("id, full_name, email")
        .order("full_name", { ascending: true });
      if (cancelled) return;
      console.log("password-reset list:", allUsers?.length, error);
      setAllUsersForReset(allUsers || []);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Load this coach's saved notification preferences. Missing types
  // fall back to NOTIFICATION_TYPES[type].recommended at render time
  // so the UI always reflects the effective state.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("users")
          .select("notification_prefs")
          .eq("id", user.id)
          .single();
        if (cancelled) return;
        if (error) { console.warn("[CoachProfile] notif_prefs fetch:", error.message); return; }
        setNotifPrefs(data?.notification_prefs || {});
      } catch (e) {
        console.warn("[CoachProfile] notif_prefs exception:", e?.message);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const toggleNotifPref = (type) => {
    setNotifPrefs(prev => ({ ...prev, [type]: !isEnabled(type, prev) }));
  };

  const saveNotifPrefs = async () => {
    if (!user?.id) return;
    setSavingPrefs(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({ notification_prefs: notifPrefs })
        .eq("id", user.id);
      if (error) {
        toast.error("שגיאה: " + error.message + (error.code === "42703" ? " (יש להריץ ALTER TABLE)" : ""));
        return;
      }
      toast.success("העדפות התראות נשמרו ✓");
    } finally {
      setSavingPrefs(false);
    }
  };

  // Hero stats — fetched in parallel, never blocks render
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const since30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        const [traineesRes, sessionsRes, activityRes] = await Promise.all([
          supabase.from("users").select("id", { count: "exact", head: true }).eq("coach_id", user.id),
          supabase.from("sessions").select("id", { count: "exact", head: true })
            .eq("coach_id", user.id).gte("date", monthStart),
          supabase.from("sessions").select("date")
            .eq("coach_id", user.id).gte("date", since30),
        ]);
        if (cancelled) return;
        const distinctDays = new Set((activityRes.data || []).map(r => r.date)).size;
        setHeroStats({
          trainees: traineesRes.count || 0,
          monthlySessions: sessionsRes.count || 0,
          activeDays: distinctDays,
        });
      } catch (e) {
        console.warn("[CoachProfile] hero stats:", e?.message);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // ── Password handlers ───────────────────────────────────────────
  const handleSelfPassword = async () => {
    if (!selfCurrent) { toast.error("יש להזין את הסיסמה הנוכחית"); return; }
    if (selfNew !== selfConfirm) { toast.error("הסיסמאות לא תואמות"); return; }
    if (selfNew.length < 6) { toast.error("מינימום 6 תווים"); return; }
    setPwLoading(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email, password: selfCurrent,
      });
      if (signInErr) { toast.error("סיסמה נוכחית שגויה"); return; }
      const { error } = await supabase.auth.updateUser({ password: selfNew });
      if (error) { toast.error("שגיאה: " + error.message); return; }
      toast.success("הסיסמה עודכנה ✓");
      setShowPwDialog(false);
      setSelfCurrent(""); setSelfNew(""); setSelfConfirm("");
    } finally {
      setPwLoading(false);
    }
  };

  const handleTraineePasswordReset = async () => {
    if (!resetTraineeId) { toast.error("יש לבחור מתאמן"); return; }
    if (!resetPwInput || resetPwInput.length < 6) { toast.error("סיסמה חייבת להיות לפחות 6 תווים"); return; }
    setPwLoading(true);
    try {
      // Existing Edge Function — server-side service role key
      const { error } = await supabase.functions.invoke("reset-password", {
        body: { userId: resetTraineeId, newPassword: resetPwInput },
      });
      if (error) { toast.error("שגיאה: " + (error?.message || "נסה שוב")); return; }
      toast.success("הסיסמה עודכנה ✓ — המתאמן יכול להיכנס עם הסיסמה החדשה");
      setShowPwDialog(false);
      setResetTraineeId(""); setResetPwInput("");
    } catch (e) {
      console.error("[CoachProfile] trainee password reset:", e);
      toast.error("שגיאה: " + (e?.message || "נסה שוב"));
    } finally {
      setPwLoading(false);
    }
  };

  // ── Send notification ───────────────────────────────────────────
  const sendNotification = async () => {
    const msg = notifMessage.trim();
    if (!msg) { toast.error("יש לכתוב הודעה"); return; }
    if (!trainees.length) { toast.error("אין מתאמנים"); return; }
    const targetIds = notifTarget === "all" ? trainees.map(t => t.id) : [notifTarget];
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

  const handleChangeViewMode = (mode) => {
    setViewMode(mode);
    try { localStorage.setItem("athletigo_view_mode", mode); } catch {}
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

        {/* App switcher — only renders for the Life OS coach */}
        <AppSwitcher />

        {/* Hero card — orange bg, white text, 3 stats */}
        <div style={{
          background: "#FF6F20", borderRadius: 14,
          padding: 18, margin: 12,
          boxShadow: "0 4px 14px rgba(255,111,32,0.25)",
          color: "white", textAlign: "center",
        }}>
          <div style={{
            width: 70, height: 70, borderRadius: "50%",
            background: "white",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 10px",
            fontSize: 30, fontWeight: 700, color: "#FF6F20",
          }}>{initial}</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{user.full_name || "מאמן"}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>
            מאמן ראשי · AthletiGo
          </div>
          <div style={{
            display: "flex", justifyContent: "space-around",
            marginTop: 14, paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.25)",
          }}>
            {[
              { value: heroStats.trainees,        label: "מתאמנים" },
              { value: heroStats.monthlySessions, label: "אימונים החודש" },
              { value: heroStats.activeDays,      label: "ימים פעילים" },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, opacity: 0.85, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* "האפליקציות שלי" + "מצב תצוגה" rubrics removed —
            the app-switcher tabs already live in the header above
            this page, so duplicating them here added clutter
            without surfacing anything new. */}

        {/* Quick actions */}
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
              <div style={{ fontSize: 11, color: "#888" }}>הודעה לכל המתאמנים או לאחד</div>
            </div>
            <span style={{ color: "#ccc", fontSize: 14 }}>←</span>
          </div>

          <div onClick={() => setShowPwDialog(true)} style={{
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
              <div style={{ fontSize: 11, color: "#888" }}>לחשבון שלך או למתאמן</div>
            </div>
            <span style={{ color: "#ccc", fontSize: 14 }}>←</span>
          </div>
        </div>

        {/* Notification preferences */}
        {(() => {
          const grouped = Object.entries(NOTIFICATION_TYPES).reduce((acc, [type, def]) => {
            (acc[def.category] = acc[def.category] || []).push({ type, ...def });
            return acc;
          }, {});
          // Order: non-noise categories in their natural order, "רעש" last.
          const categoryOrder = Object.keys(grouped).filter(c => c !== 'רעש').concat(grouped['רעש'] ? ['רעש'] : []);
          return (
            <div style={{
              margin: "0 12px 12px", background: "white",
              borderRadius: 16, padding: 14,
              boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
              fontFamily: "'Barlow', system-ui, -apple-system, sans-serif",
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>🔔 הגדרות התראות</div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 12 }}>
                סוג כבוי = לא נוצר במסד ולא קופץ
              </div>

              {categoryOrder.map(cat => (
                <div key={cat} style={{ marginBottom: 10 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: "#FF6F20",
                    marginBottom: 6, paddingRight: 2,
                  }}>
                    {cat === 'רעש' ? 'מומלץ לכבות' : cat}
                  </div>
                  {grouped[cat].map(item => {
                    const enabled = isEnabled(item.type, notifPrefs);
                    return (
                      <div key={item.type}
                        onClick={() => toggleNotifPref(item.type)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: 10, background: "#FFF9F0", borderRadius: 12,
                          marginBottom: 6, cursor: "pointer",
                          border: "0.5px solid #F0E4D0",
                        }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "#1a1a1a" }}>{item.label}</div>
                          <div style={{
                            fontSize: 10, marginTop: 2,
                            color: item.recommended ? "#16a34a" : "#dc2626",
                            fontWeight: 600,
                          }}>
                            {item.recommended ? "מומלץ: מופעל" : "מומלץ: כבוי"}
                          </div>
                        </div>
                        <div style={{
                          width: 40, height: 22, borderRadius: 11,
                          background: enabled ? "#16a34a" : "#E8E0D8",
                          position: "relative", transition: "background 0.2s",
                          flexShrink: 0,
                        }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: "50%",
                            background: "white", position: "absolute", top: 2,
                            right: enabled ? 2 : "unset",
                            left: enabled ? "unset" : 2,
                            transition: "right 0.2s, left 0.2s",
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              <button
                onClick={saveNotifPrefs}
                disabled={savingPrefs}
                style={{
                  width: "100%", padding: 12, borderRadius: 12,
                  border: "none", background: "#FF6F20", color: "white",
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                  marginTop: 6,
                  opacity: savingPrefs ? 0.6 : 1,
                  fontFamily: "'Barlow', system-ui, -apple-system, sans-serif",
                }}>
                {savingPrefs ? "שומר..." : "שמור העדפות"}
              </button>
            </div>
          );
        })()}

        {/* Logout */}
        <div style={{ margin: "0 12px 12px" }}>
          <button onClick={handleLogout} style={{
            width: "100%", padding: 14, borderRadius: 14,
            border: "1.5px solid #dc2626",
            background: "white", color: "#dc2626",
            fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}>🚪 יציאה מהחשבון</button>
        </div>

        {/* Footer */}
        <div style={{
          textAlign: "center", padding: "12px 12px 100px",
          fontSize: 11, color: "#888",
        }}>AthletiGo · גרסה 2.0</div>

        {/* ─── Password dialog (2 tabs) ─── */}
        {showPwDialog && (
          <div onClick={() => setShowPwDialog(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            zIndex: 11000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: "#FFF9F0", borderRadius: 20, padding: 20,
              width: "100%", maxWidth: 380, direction: "rtl",
              maxHeight: "85vh", overflowY: "auto",
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, textAlign: "center", marginBottom: 14 }}>🔒 שינוי סיסמה</div>

              <div style={{
                display: "flex", gap: 4, marginBottom: 12,
                background: "#FFF0E4", borderRadius: 10, padding: 3,
              }}>
                {[
                  { id: "self",    label: "הסיסמה שלי" },
                  { id: "trainee", label: "סיסמה למתאמן" },
                ].map(t => (
                  <div key={t.id} onClick={() => setPwTab(t.id)} style={{
                    flex: 1, padding: 8, borderRadius: 8,
                    textAlign: "center", fontSize: 13, fontWeight: 600,
                    cursor: "pointer",
                    background: pwTab === t.id ? "#FF6F20" : "transparent",
                    color: pwTab === t.id ? "white" : "#888",
                  }}>{t.label}</div>
                ))}
              </div>

              {pwTab === "self" && (
                <>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>סיסמה נוכחית</label>
                  <input type="password" value={selfCurrent} onChange={e => setSelfCurrent(e.target.value)} style={{
                    width: "100%", padding: 10, borderRadius: 12,
                    border: "0.5px solid #F0E4D0",
                    fontSize: 14, direction: "ltr", marginBottom: 10,
                    background: "white", outline: "none", boxSizing: "border-box",
                  }} />
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>סיסמה חדשה</label>
                  <input type="password" value={selfNew} onChange={e => setSelfNew(e.target.value)} style={{
                    width: "100%", padding: 10, borderRadius: 12,
                    border: "0.5px solid #F0E4D0",
                    fontSize: 14, direction: "ltr", marginBottom: 10,
                    background: "white", outline: "none", boxSizing: "border-box",
                  }} />
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>אימות</label>
                  <input type="password" value={selfConfirm} onChange={e => setSelfConfirm(e.target.value)} style={{
                    width: "100%", padding: 10, borderRadius: 12,
                    border: "0.5px solid #F0E4D0",
                    fontSize: 14, direction: "ltr", marginBottom: 6,
                    background: "white", outline: "none", boxSizing: "border-box",
                  }} />
                  {selfNew && selfConfirm && selfNew !== selfConfirm && (
                    <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>הסיסמאות לא תואמות</div>
                  )}
                  <button
                    onClick={handleSelfPassword}
                    disabled={pwLoading || !selfCurrent || !selfNew || selfNew !== selfConfirm || selfNew.length < 6}
                    style={{
                      width: "100%", padding: 14, borderRadius: 14, border: "none",
                      background: (selfCurrent && selfNew && selfNew === selfConfirm && selfNew.length >= 6) ? "#FF6F20" : "#ccc",
                      color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 6,
                    }}
                  >{pwLoading ? "שומר..." : "🔒 עדכן"}</button>
                </>
              )}

              {pwTab === "trainee" && (
                <>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>בחר מתאמן</label>
                  <select value={resetTraineeId} onChange={e => setResetTraineeId(e.target.value)} style={{
                    width: "100%", padding: 10, borderRadius: 12,
                    border: "0.5px solid #F0E4D0",
                    fontSize: 14, direction: "rtl", marginBottom: 10,
                    background: "white", outline: "none",
                  }}>
                    <option value="">בחר מתאמן...</option>
                    {allUsersForReset.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.full_name}{t.email ? ` — ${t.email}` : ""}
                      </option>
                    ))}
                  </select>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>סיסמה חדשה</label>
                  <input type="text" value={resetPwInput} onChange={e => setResetPwInput(e.target.value)} placeholder="לפחות 6 תווים" style={{
                    width: "100%", padding: 10, borderRadius: 12,
                    border: "0.5px solid #F0E4D0",
                    fontSize: 14, direction: "ltr", marginBottom: 10,
                    background: "white", outline: "none", boxSizing: "border-box",
                  }} />
                  <button
                    onClick={handleTraineePasswordReset}
                    disabled={pwLoading || !resetTraineeId || resetPwInput.length < 6}
                    style={{
                      width: "100%", padding: 14, borderRadius: 14, border: "none",
                      background: (resetTraineeId && resetPwInput.length >= 6) ? "#FF6F20" : "#ccc",
                      color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 6,
                    }}
                  >{pwLoading ? "מעדכן..." : "🔒 עדכן סיסמה למתאמן"}</button>
                </>
              )}

              <div onClick={() => setShowPwDialog(false)} style={{
                textAlign: "center", padding: 10, color: "#888", fontSize: 14, cursor: "pointer",
              }}>ביטול</div>
            </div>
          </div>
        )}

        {/* ─── Send notification dialog ─── */}
        {showSendNotif && (
          <div onClick={() => setShowSendNotif(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            zIndex: 11000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: "#FFF9F0", borderRadius: 20, padding: 20,
              width: "100%", maxWidth: 360, direction: "rtl",
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, textAlign: "center", marginBottom: 14 }}>📢 שלח התראה</div>
              <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>למי</label>
              <select value={notifTarget} onChange={e => setNotifTarget(e.target.value)} style={{
                width: "100%", padding: 10, borderRadius: 12,
                border: "0.5px solid #F0E4D0",
                fontSize: 14, direction: "rtl", marginBottom: 10,
                background: "white", outline: "none",
              }}>
                <option value="all">כל המתאמנים</option>
                {trainees.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
              <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>הודעה</label>
              <textarea value={notifMessage} onChange={e => setNotifMessage(e.target.value)} placeholder="כתוב הודעה..." style={{
                width: "100%", padding: 10, borderRadius: 12,
                border: "0.5px solid #F0E4D0",
                fontSize: 14, direction: "rtl",
                minHeight: 80, resize: "vertical",
                background: "white", outline: "none", boxSizing: "border-box", fontFamily: "inherit",
                marginBottom: 14,
              }} />
              <button onClick={sendNotification} disabled={sending || !notifMessage.trim()} style={{
                width: "100%", padding: 14, borderRadius: 14, border: "none",
                background: notifMessage.trim() ? "#FF6F20" : "#ccc",
                color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer",
              }}>{sending ? "שולח..." : "📢 שלח"}</button>
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
