import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

// Default goal-bank seed — coach can edit/extend in the bank tab.
// Stored per-coach in localStorage (key: challenge_bank_<coachId>).
const DEFAULT_CHALLENGES = [
  // כוח
  { text: "50 סקוואטים",          category: "strength",    icon: "🦵" },
  { text: "30 שכיבות סמיכה",       category: "strength",    icon: "💪" },
  { text: "40 כפיפות בטן",         category: "strength",    icon: "🔥" },
  { text: "20 לאנג׳ים (כל רגל)",   category: "strength",    icon: "🦵" },
  { text: "15 ברפיז",              category: "strength",    icon: "💥" },
  { text: "3 סטים × 10 מתח",       category: "strength",    icon: "💪" },
  { text: "60 שניות וול סיט",     category: "strength",    icon: "🧱" },
  // סיבולת
  { text: "200 קפיצות חבל",       category: "cardio",      icon: "🏃" },
  { text: "3 דקות ריצה במקום",    category: "cardio",      icon: "🏃" },
  { text: "100 ג׳אמפינג ג׳ק",     category: "cardio",      icon: "⭐" },
  { text: "5 דקות הליכה מהירה",   category: "cardio",      icon: "🚶" },
  { text: "10 ספרינטים × 20 מטר", category: "cardio",      icon: "⚡" },
  // גמישות
  { text: "2 דקות פלאנק",         category: "flexibility", icon: "🧘" },
  { text: "10 דקות מתיחות",       category: "flexibility", icon: "🤸" },
  { text: "5 דקות יוגה בוקר",     category: "flexibility", icon: "🧘" },
  { text: "גלגול קצף 5 דקות",     category: "flexibility", icon: "🔄" },
  // מיומנות
  { text: "50 קפיצות חבל בלי עצירה", category: "skill",    icon: "🎯" },
  { text: "10 שניות עמידת ידיים",  category: "skill",      icon: "🤸" },
  { text: "5 מתח",                 category: "skill",      icon: "💪" },
  { text: "30 שניות L-sit",        category: "skill",      icon: "🏋️" },
  { text: "20 שניות תלייה על מתח", category: "skill",      icon: "🦾" },
  // אורח חיים
  { text: "שתה 8 כוסות מים",      category: "lifestyle",   icon: "💧" },
  { text: "7 שעות שינה",          category: "lifestyle",   icon: "😴" },
  { text: "ארוחה בריאה אחת",      category: "lifestyle",   icon: "🥗" },
  { text: "10 דקות מדיטציה",      category: "lifestyle",   icon: "🧠" },
  { text: "ללכת 10,000 צעדים",    category: "lifestyle",   icon: "👣" },
];

const CATEGORIES = [
  { id: "all",         label: "הכל",       icon: "📋" },
  { id: "strength",    label: "כוח",       icon: "💪" },
  { id: "cardio",      label: "סיבולת",   icon: "🏃" },
  { id: "flexibility", label: "גמישות",   icon: "🧘" },
  { id: "skill",       label: "מיומנות",  icon: "🎯" },
  { id: "lifestyle",   label: "אורח חיים", icon: "💧" },
];

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

// Streak from a list of daily_challenge notifications for a single trainee.
// Counts consecutive days backward starting today (or yesterday if today
// hasn't been completed yet — preserves a streak coach-side until day end).
function calculateStreak(challenges) {
  const completedDates = new Set();
  for (const c of challenges) {
    if (!c.is_read) continue;
    let parsed = c.data;
    if (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed); } catch { parsed = {}; }
    }
    if (!parsed || typeof parsed !== "object") parsed = {};
    if (parsed?.sent_date) completedDates.add(parsed.sent_date);
  }
  if (completedDates.size === 0) return 0;
  let streak = 0;
  const checkDate = new Date();
  if (!completedDates.has(todayStr())) checkDate.setDate(checkDate.getDate() - 1);
  // Cap loop so a corrupted dataset can't spin forever
  for (let i = 0; i < 3650; i++) {
    const d = checkDate.toISOString().split("T")[0];
    if (completedDates.has(d)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else break;
  }
  return streak;
}

export default function ChallengeBank({ isOpen, onClose, coach, trainees }) {
  const [tab, setTab] = useState("send");
  const [challengeMode, setChallengeMode] = useState("single"); // single | workout
  const [selectedTraineeId, setSelectedTraineeId] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [customChallenge, setCustomChallenge] = useState("");
  const [challenges, setChallenges] = useState(DEFAULT_CHALLENGES);
  const [sentChallenges, setSentChallenges] = useState([]);
  // Workout mode state
  const [workoutName, setWorkoutName] = useState("");
  const [workoutType, setWorkoutType] = useState("");
  const [workoutExercises, setWorkoutExercises] = useState([{ name: "", detail: "" }]);

  const BANK_KEY = coach?.id ? `challenge_bank_${coach.id}` : null;
  const today = todayStr();

  // Load coach's bank from localStorage
  useEffect(() => {
    if (!BANK_KEY) return;
    try {
      const saved = localStorage.getItem(BANK_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) setChallenges(parsed);
      }
    } catch {}
  }, [BANK_KEY]);

  // Persist bank changes
  useEffect(() => {
    if (!BANK_KEY) return;
    if (challenges.length === 0) return;
    try { localStorage.setItem(BANK_KEY, JSON.stringify(challenges)); } catch {}
  }, [BANK_KEY, challenges]);

  const fetchSentChallenges = useCallback(async () => {
    if (!coach?.id || !trainees?.length) return;
    const ids = trainees.map(t => t.id);
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, error } = await supabase
      .from("notifications")
      .select("id, user_id, type, message, is_read, data, created_at")
      .in("user_id", ids)
      .eq("type", "daily_challenge")
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[ChallengeBank] fetchSentChallenges error:", error);
      return;
    }
    setSentChallenges((data || []).map(c => {
      let parsed = c.data;
      if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed); } catch { parsed = {}; }
      }
      return { ...c, parsed };
    }));
  }, [coach?.id, trainees]);

  useEffect(() => { if (isOpen) fetchSentChallenges(); }, [isOpen, fetchSentChallenges]);

  const sendChallenge = async (challenge) => {
    console.log("[CHALLENGE] sendChallenge fired:", { challenge, selectedTraineeId, traineesCount: trainees?.length });
    if (!coach?.id) { toast.error("שגיאה: מאמן לא מזוהה"); return; }
    if (!trainees || trainees.length === 0) { toast.error("אין מתאמנים לשלוח אליהם"); return; }
    const targetIds = selectedTraineeId === "all"
      ? trainees.map(t => t.id)
      : [selectedTraineeId];
    if (targetIds.length === 0) { toast.error("יש לבחור מתאמן"); return; }

    // notifications.data is a JSONB column — insert raw object so it
    // stores as JSON. The earlier JSON.stringify wrapped it as a quoted
    // string literal which broke reads + may fail RLS validation.
    const inserts = targetIds.map(tid => ({
      user_id: tid,
      type: "daily_challenge",
      message: `🎯 האתגר היומי: ${challenge.text}`,
      is_read: false,
      data: {
        challenge_text: challenge.text,
        category: challenge.category || "custom",
        icon: challenge.icon || "🎯",
        coach_id: coach.id,
        sent_date: today,
        completed_at: null,
      },
    }));
    console.log("[CHALLENGE] inserting:", inserts);

    const { data, error } = await supabase.from("notifications").insert(inserts).select();
    console.log("[CHALLENGE] result:", data, error);
    if (error) {
      console.error("[ChallengeBank] sendChallenge error:", error);
      toast.error("שגיאה בשליחה: " + error.message);
      return;
    }
    const targetName = targetIds.length === 1
      ? (trainees.find(t => t.id === targetIds[0])?.full_name || "מתאמן")
      : `${targetIds.length} מתאמנים`;
    toast.success(`🎯 אתגר נשלח ל${targetName}`);
    fetchSentChallenges();
  };

  const sendWorkoutChallenge = async () => {
    const exercises = workoutExercises.filter(e => e.name.trim());
    if (!workoutName.trim() || exercises.length === 0) {
      toast.error("יש למלא שם ולפחות תרגיל אחד");
      return;
    }
    if (!coach?.id) { toast.error("שגיאה: מאמן לא מזוהה"); return; }
    if (!trainees || trainees.length === 0) { toast.error("אין מתאמנים"); return; }
    const targetIds = selectedTraineeId === "all"
      ? trainees.map(t => t.id)
      : [selectedTraineeId];
    if (targetIds.length === 0) { toast.error("יש לבחור מתאמן"); return; }

    const exerciseList = exercises
      .map((e, i) => `${i + 1}. ${e.name}${e.detail ? " (" + e.detail + ")" : ""}`)
      .join("\n");

    const inserts = targetIds.map(tid => ({
      user_id: tid,
      type: "daily_challenge",
      message: `💪 אתגר אימון: ${workoutName.trim()}\n${exerciseList}`,
      is_read: false,
      data: {
        challenge_text: workoutName.trim(),
        challenge_type: "workout",
        workout_type: workoutType || null,
        exercises,
        category: workoutType || "workout",
        icon: "💪",
        coach_id: coach.id,
        sent_date: today,
        completed_at: null,
      },
    }));
    console.log("[CHALLENGE] sending workout:", inserts);

    const { data, error } = await supabase.from("notifications").insert(inserts).select();
    console.log("[CHALLENGE] workout result:", data, error);
    if (error) {
      toast.error("שגיאה: " + error.message);
      return;
    }
    toast.success("💪 אתגר אימון נשלח!");
    setWorkoutName("");
    setWorkoutType("");
    setWorkoutExercises([{ name: "", detail: "" }]);
    fetchSentChallenges();
  };

  const updateWorkoutExercise = (i, field, value) => {
    setWorkoutExercises(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e));
  };
  const removeWorkoutExercise = (i) => {
    setWorkoutExercises(prev => prev.filter((_, idx) => idx !== i));
  };

  const updateChallenge = (i, text) => {
    setChallenges(prev => prev.map((c, idx) => idx === i ? { ...c, text } : c));
  };
  const removeChallenge = (i) => {
    setChallenges(prev => prev.filter((_, idx) => idx !== i));
  };
  const addNewChallenge = () => {
    setChallenges(prev => [...prev, { text: "אתגר חדש", category: "custom", icon: "🎯" }]);
  };

  // Streak per trainee — derived from the last 30 days of challenges
  const challengesByTrainee = useMemo(() => {
    const m = new Map();
    for (const c of sentChallenges) {
      if (!m.has(c.user_id)) m.set(c.user_id, []);
      m.get(c.user_id).push(c);
    }
    return m;
  }, [sentChallenges]);

  const getStreak = (traineeId) => calculateStreak(challengesByTrainee.get(traineeId) || []);

  if (!isOpen) return null;

  const filteredBank = challenges.filter(ch =>
    categoryFilter === "all" || ch.category === categoryFilter
  );

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.5)",
      zIndex: 11000,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#FFF9F0",
        borderRadius: "24px 24px 0 0",
        width: "100%", maxWidth: 500,
        maxHeight: "85vh", overflowY: "auto",
        padding: "20px 16px", direction: "rtl",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>🎯 אתגר יומי</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: "#888", cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {[
            { id: "send",   label: "📤 שלח אתגר" },
            { id: "bank",   label: "📋 בנק יעדים" },
            { id: "status", label: "📊 סטטוס" },
          ].map(t => (
            <div key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, textAlign: "center",
              padding: 8, borderRadius: 12,
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: tab === t.id ? "#FF6F20" : "white",
              color: tab === t.id ? "white" : "#888",
            }}>{t.label}</div>
          ))}
        </div>

        {/* SEND */}
        {tab === "send" && (
          <>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>👤 למי לשלוח?</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[{ id: "all", full_name: "כל המתאמנים" }, ...trainees].map(t => {
                  const active = selectedTraineeId === t.id;
                  return (
                    <div key={t.id} onClick={() => setSelectedTraineeId(t.id)} style={{
                      padding: "6px 12px", borderRadius: 20,
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                      background: active ? "#FF6F20" : "white",
                      color: active ? "white" : "#888",
                      border: active ? "none" : "1px solid #F0E4D0",
                    }}>{t.full_name}</div>
                  );
                })}
              </div>
            </div>

            {/* Single vs workout */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {[
                { id: "single",  label: "🎯 תרגיל בודד" },
                { id: "workout", label: "💪 אימון קצר" },
              ].map(m => (
                <div key={m.id} onClick={() => setChallengeMode(m.id)} style={{
                  flex: 1, padding: 8, borderRadius: 12,
                  textAlign: "center", fontSize: 13, fontWeight: 600,
                  cursor: "pointer",
                  background: challengeMode === m.id ? "#FF6F20" : "white",
                  color: challengeMode === m.id ? "white" : "#888",
                }}>{m.label}</div>
              ))}
            </div>

            {challengeMode === "workout" && (
              <div style={{
                background: "white", borderRadius: 14,
                padding: 14, marginBottom: 10,
                border: "1.5px solid #FF6F20",
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>💪 בנה אתגר אימון</div>
                <input
                  value={workoutName}
                  onChange={e => setWorkoutName(e.target.value)}
                  placeholder="שם האתגר (למשל: אתגר בוקר)"
                  style={{
                    width: "100%", padding: 10, borderRadius: 10,
                    border: "0.5px solid #F0E4D0",
                    fontSize: 14, direction: "rtl",
                    marginBottom: 8, outline: "none", boxSizing: "border-box",
                  }}
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                  {["חימום", "כוח", "סיבולת", "גמישות", "מיומנות", "תנועה"].map(t => (
                    <div key={t} onClick={() => setWorkoutType(workoutType === t ? "" : t)} style={{
                      padding: "4px 10px", borderRadius: 16,
                      fontSize: 11, fontWeight: 600, cursor: "pointer",
                      background: workoutType === t ? "#FF6F20" : "#F8F0E8",
                      color: workoutType === t ? "white" : "#888",
                    }}>{t}</div>
                  ))}
                </div>

                {workoutExercises.map((ex, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: "#FF6F20", color: "white",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700, flexShrink: 0,
                    }}>{i + 1}</div>
                    <input
                      value={ex.name}
                      onChange={e => updateWorkoutExercise(i, "name", e.target.value)}
                      placeholder={`תרגיל ${i + 1}...`}
                      style={{
                        flex: 1, padding: 8, borderRadius: 8,
                        border: "0.5px solid #F0E4D0",
                        fontSize: 13, direction: "rtl",
                        outline: "none", minWidth: 0, boxSizing: "border-box",
                      }}
                    />
                    <input
                      value={ex.detail}
                      onChange={e => updateWorkoutExercise(i, "detail", e.target.value)}
                      placeholder='12×3 / 30 שניות'
                      style={{
                        width: 90, padding: 8, borderRadius: 8,
                        border: "0.5px solid #F0E4D0",
                        fontSize: 12, textAlign: "center",
                        outline: "none", boxSizing: "border-box",
                      }}
                    />
                    {workoutExercises.length > 1 && (
                      <button onClick={() => removeWorkoutExercise(i)} style={{
                        background: "none", border: "none",
                        color: "#dc2626", cursor: "pointer", fontSize: 14,
                      }}>✕</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setWorkoutExercises(prev => [...prev, { name: "", detail: "" }])} style={{
                  width: "100%", padding: 6,
                  background: "#FFF9F0", borderRadius: 8,
                  border: "1px dashed #F0E4D0",
                  color: "#888", fontSize: 12, cursor: "pointer",
                  marginTop: 4, marginBottom: 10,
                }}>+ הוסף תרגיל</button>

                <button
                  onClick={sendWorkoutChallenge}
                  disabled={!workoutName.trim() || workoutExercises.every(e => !e.name.trim())}
                  style={{
                    width: "100%", padding: 12, borderRadius: 12, border: "none",
                    background: (workoutName.trim() && workoutExercises.some(e => e.name.trim())) ? "#FF6F20" : "#ccc",
                    color: "white", fontSize: 15, fontWeight: 700,
                    cursor: "pointer",
                  }}
                >📤 שלח אתגר אימון</button>
              </div>
            )}

            {challengeMode === "single" && (
            <>
            <div style={{ display: "flex", gap: 4, marginBottom: 10, overflowX: "auto" }}>
              {CATEGORIES.map(c => {
                const active = categoryFilter === c.id;
                return (
                  <div key={c.id} onClick={() => setCategoryFilter(c.id)} style={{
                    padding: "5px 10px", borderRadius: 16,
                    fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                    background: active ? "#1a1a1a" : "white",
                    color: active ? "white" : "#888",
                    flexShrink: 0,
                  }}>{c.icon} {c.label}</div>
                );
              })}
            </div>

            {filteredBank.length === 0 ? (
              <div style={{ textAlign: "center", color: "#888", padding: 12, fontSize: 12 }}>אין אתגרים בקטגוריה זו</div>
            ) : filteredBank.map((ch, i) => (
              <div key={i} onClick={() => sendChallenge(ch)} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: 10, background: "white", borderRadius: 12,
                marginBottom: 6, cursor: "pointer",
                border: "0.5px solid #F0E4D0",
              }}>
                <span style={{ fontSize: 20 }}>{ch.icon}</span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{ch.text}</span>
                <span style={{ fontSize: 12, color: "#FF6F20", fontWeight: 600 }}>שלח ►</span>
              </div>
            ))}

            <div style={{
              background: "white", borderRadius: 12,
              padding: 10, marginTop: 8,
              border: "1.5px dashed #FF6F20",
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "#FF6F20" }}>✏️ אתגר מותאם אישית</div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={customChallenge}
                  onChange={e => setCustomChallenge(e.target.value)}
                  placeholder="כתוב אתגר..."
                  style={{
                    flex: 1, padding: 8,
                    borderRadius: 10,
                    border: "0.5px solid #F0E4D0",
                    fontSize: 13, direction: "rtl",
                    outline: "none",
                  }}
                />
                <button
                  onClick={() => {
                    const t = customChallenge.trim();
                    if (!t) { toast.error("יש לכתוב אתגר"); return; }
                    sendChallenge({ text: t, category: "custom", icon: "🎯" });
                    setCustomChallenge("");
                  }}
                  style={{
                    padding: "8px 16px", borderRadius: 10, border: "none",
                    background: "#FF6F20", color: "white",
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >שלח</button>
              </div>
            </div>
            </>
            )}
          </>
        )}

        {/* BANK */}
        {tab === "bank" && (
          <>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>ערוך, מחק או הוסף אתגרים לבנק שלך</div>
            {challenges.map((ch, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: 8, background: "white", borderRadius: 10,
                marginBottom: 4, border: "0.5px solid #F0E4D0",
              }}>
                <span>{ch.icon}</span>
                <input
                  value={ch.text}
                  onChange={e => updateChallenge(i, e.target.value)}
                  style={{
                    flex: 1, border: "none", outline: "none",
                    fontSize: 13, direction: "rtl",
                    background: "transparent",
                  }}
                />
                <button onClick={() => removeChallenge(i)} style={{
                  background: "none", border: "none",
                  color: "#dc2626", cursor: "pointer", fontSize: 14,
                }}>✕</button>
              </div>
            ))}
            <button onClick={addNewChallenge} style={{
              width: "100%", padding: 10,
              background: "white", borderRadius: 10,
              border: "1.5px dashed #FF6F20",
              color: "#FF6F20", fontSize: 13, fontWeight: 600,
              cursor: "pointer", marginTop: 6,
            }}>+ הוסף אתגר לבנק</button>
          </>
        )}

        {/* STATUS */}
        {tab === "status" && (
          <>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>מי ביצע ומי לא — היום</div>
            {trainees.length === 0 ? (
              <div style={{ textAlign: "center", color: "#888", padding: 12, fontSize: 12 }}>אין מתאמנים</div>
            ) : trainees.map(t => {
              const todayCh = (challengesByTrainee.get(t.id) || []).find(c => c.parsed?.sent_date === today);
              const done = !!todayCh?.is_read;
              const streak = getStreak(t.id);
              return (
                <div key={t.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: 10, background: "white", borderRadius: 12,
                  marginBottom: 6,
                  border: done ? "1.5px solid #16a34a" : "0.5px solid #F0E4D0",
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: done ? "#E8F5E9" : "#F3F4F6",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14,
                  }}>{done ? "✅" : todayCh ? "⏳" : "—"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.full_name}</div>
                    <div style={{ fontSize: 11, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {todayCh ? todayCh.parsed?.challenge_text : "לא נשלח אתגר היום"}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#FF6F20" }}>🔥 {streak}</div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

export { calculateStreak };
