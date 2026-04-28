import React, { useState, useEffect, useContext, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { AuthContext } from "@/lib/AuthContext";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import PageLoader from "@/components/PageLoader";
import { toast } from "sonner";

// Goal-bank presets — used by the "📋 מהבנק" send mode.
const CATEGORIES = [
  { id: "all",         label: "הכל",      icon: "📋" },
  { id: "strength",    label: "כוח",      icon: "💪" },
  { id: "cardio",      label: "סיבולת",   icon: "🏃" },
  { id: "flexibility", label: "גמישות",   icon: "🧘" },
  { id: "skill",       label: "מיומנות",  icon: "🎯" },
  { id: "lifestyle",   label: "אורח חיים", icon: "💧" },
];

const DEFAULT_BANK = [
  { text: "50 סקוואטים",          category: "strength",    icon: "🦵" },
  { text: "30 שכיבות סמיכה",       category: "strength",    icon: "💪" },
  { text: "5 מתח",                 category: "strength",    icon: "💪" },
  { text: "15 ברפיז",              category: "strength",    icon: "💥" },
  { text: "200 קפיצות חבל",       category: "cardio",      icon: "🏃" },
  { text: "100 ג׳אמפינג ג׳ק",     category: "cardio",      icon: "⭐" },
  { text: "2 דקות פלאנק",         category: "flexibility", icon: "🧘" },
  { text: "10 דקות מתיחות",       category: "flexibility", icon: "🤸" },
  { text: "50 קפיצות חבל רצופות", category: "skill",       icon: "🪢" },
  { text: "שתה 8 כוסות מים",      category: "lifestyle",   icon: "💧" },
];

const ICON_OPTIONS = ["🪢","⭕","🔱","📏","💪","🏋️","🤸","🏃","🎯","⚡"];
const COLOR_OPTIONS = ["#FF6F20","#16a34a","#3B82F6","#7F47B5","#dc2626","#EAB308"];
const UNITS = ["חזרות","שניות","דקות",'ק"ג',"מטר"];

const todayISO = () => new Date().toISOString().split("T")[0];

export default function Challenges() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const [trainees, setTrainees] = useState([]);
  const [allTracks, setAllTracks] = useState([]);
  const [trackMilestones, setTrackMilestones] = useState({});
  const [trackChallenges, setTrackChallenges] = useState({}); // by track_id
  const [todayChallenges, setTodayChallenges] = useState([]);

  // Send-options dialog
  const [showSendOptions, setShowSendOptions] = useState(false);
  const [selectedTraineeId, setSelectedTraineeId] = useState(null);
  const [sendMode, setSendMode] = useState("track");
  const [catFilter, setCatFilter] = useState("all");
  const [customText, setCustomText] = useState("");

  // New-track dialog
  const [showNewTrack, setShowNewTrack] = useState(false);
  const emptyTrack = { name: "", trainee_id: "", icon: "🎯", color: "#FF6F20", goal: "", goal_value: "", goal_unit: "חזרות", start_value: "" };
  const [newTrack, setNewTrack] = useState(emptyTrack);

  // Extend-goal dialog (after a goal is reached)
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [extendTrack, setExtendTrack] = useState(null);
  const [newGoalValue, setNewGoalValue] = useState("");
  const [newGoalLabel, setNewGoalLabel] = useState("");

  // Fetch everything in one shot
  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data: traineeRows } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("coach_id", user.id)
        .order("full_name");
      setTrainees(traineeRows || []);

      const { data: tracks, error: trackErr } = await supabase
        .from("skill_tracks")
        .select("*")
        .eq("coach_id", user.id)
        .order("created_at", { ascending: false });
      if (trackErr) console.warn("[Challenges] tracks:", trackErr);
      setAllTracks(tracks || []);

      const trackIds = (tracks || []).map(t => t.id);
      if (trackIds.length > 0) {
        const { data: ms } = await supabase
          .from("goal_milestones")
          .select("*")
          .in("track_id", trackIds)
          .order("value", { ascending: true });
        const grouped = {};
        for (const m of (ms || [])) {
          if (!grouped[m.track_id]) grouped[m.track_id] = [];
          grouped[m.track_id].push(m);
        }
        setTrackMilestones(grouped);

        const { data: stages } = await supabase
          .from("skill_stages")
          .select("id, track_id")
          .in("track_id", trackIds);
        const stageIds = (stages || []).map(s => s.id);
        const stageToTrack = {};
        for (const s of (stages || [])) stageToTrack[s.id] = s.track_id;
        if (stageIds.length > 0) {
          const { data: ch } = await supabase
            .from("skill_challenges")
            .select("*")
            .in("stage_id", stageIds)
            .order("sort_order", { ascending: true });
          const byTrack = {};
          for (const c of (ch || [])) {
            const tid = stageToTrack[c.stage_id];
            if (!tid) continue;
            if (!byTrack[tid]) byTrack[tid] = [];
            byTrack[tid].push(c);
          }
          setTrackChallenges(byTrack);
        }
      }

      const today = todayISO();
      const { data: tc } = await supabase
        .from("notifications")
        .select("id, user_id, type, message, is_read")
        .eq("type", "daily_challenge")
        .gte("created_at", today + "T00:00:00");
      setTodayChallenges(tc || []);
      console.log("[Challenges] loaded —", { tracks: tracks?.length || 0, today: tc?.length || 0 });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const traineeNameById = useMemo(() => {
    const m = new Map();
    for (const t of trainees) m.set(t.id, t.full_name);
    return m;
  }, [trainees]);

  const traineeTracks = useMemo(() => (
    selectedTraineeId ? allTracks.filter(t => t.trainee_id === selectedTraineeId) : []
  ), [allTracks, selectedTraineeId]);

  const filteredBank = useMemo(() => (
    catFilter === "all" ? DEFAULT_BANK : DEFAULT_BANK.filter(c => c.category === catFilter)
  ), [catFilter]);

  const parseData = (raw) => {
    if (!raw) return {};
    if (typeof raw === "object") return raw;
    try { return JSON.parse(raw); } catch { return {}; }
  };

  const getNextChallenge = (trackId) => {
    const list = trackChallenges[trackId] || [];
    return list.find(c => c.status !== "completed") || null;
  };

  const openSendFor = (traineeId) => {
    setSelectedTraineeId(traineeId);
    setSendMode("track");
    setShowSendOptions(true);
  };

  const sendFreeChallenge = async (challenge) => {
    if (!selectedTraineeId) return;
    const today = todayISO();
    const { error } = await supabase.from("notifications").insert({
      user_id: selectedTraineeId,
      type: "daily_challenge",
      message: `🎯 ${challenge.text}`,
      is_read: false,
      data: {
        challenge_text: challenge.text,
        category: challenge.category || "custom",
        icon: challenge.icon || "🎯",
        coach_id: user.id,
        sent_date: today,
        track_id: null,
      },
    });
    if (error) { toast.error("שגיאה: " + error.message); return; }
    toast.success("אתגר נשלח!");
    setShowSendOptions(false);
    fetchAll();
  };

  const sendChallengeFromTrack = async (challenge, track) => {
    if (!selectedTraineeId) return;
    const today = todayISO();
    const { error } = await supabase.from("notifications").insert({
      user_id: selectedTraineeId,
      type: "daily_challenge",
      message: `🎯 ${challenge.name}`,
      is_read: false,
      data: {
        challenge_text: challenge.name,
        track_id: track.id,
        track_name: track.name,
        track_icon: track.icon,
        stage_id: challenge.stage_id,
        challenge_id: challenge.id,
        coach_id: user.id,
        sent_date: today,
      },
    });
    if (error) { toast.error("שגיאה: " + error.message); return; }
    toast.success(`אתגר נשלח מ"${track.name}"!`);
    setShowSendOptions(false);
    fetchAll();
  };

  const saveNewTrack = async () => {
    if (!newTrack.name?.trim() || !newTrack.trainee_id) {
      toast.error("שם ומתאמן נדרשים");
      return;
    }
    const startVal = Number(newTrack.start_value) || 0;
    const goalVal = newTrack.goal_value ? Number(newTrack.goal_value) : null;
    const payload = {
      coach_id: user.id,
      trainee_id: newTrack.trainee_id,
      name: newTrack.name.trim(),
      icon: newTrack.icon || "🎯",
      color: newTrack.color || "#FF6F20",
      goal: newTrack.goal?.trim() || null,
      goal_value: goalVal,
      goal_unit: newTrack.goal_unit || "חזרות",
      start_value: startVal,
      current_value: startVal,
    };
    console.log("[Challenges] insert track:", payload);
    const { data, error } = await supabase.from("skill_tracks").insert(payload).select().single();
    if (error) { toast.error("שגיאה: " + error.message); return; }

    if (startVal > 0 && data?.id) {
      try {
        await supabase.from("goal_milestones").insert({
          track_id: data.id,
          value: startVal,
          label: "נקודת מוצא",
          reached_at: new Date().toISOString(),
        });
      } catch (e) { console.warn("[Challenges] start milestone:", e); }
    }

    toast.success("מסלול נוצר!");
    setShowNewTrack(false);
    setNewTrack(emptyTrack);
    fetchAll();
  };

  const updateTrackProgress = async (track, newValueRaw) => {
    const newValue = Number(newValueRaw);
    if (Number.isNaN(newValue)) { toast.error("הערך חייב להיות מספר"); return; }
    const { error } = await supabase
      .from("skill_tracks")
      .update({ current_value: newValue })
      .eq("id", track.id);
    if (error) { toast.error("שגיאה: " + error.message); return; }
    if (track.goal_value && newValue >= track.goal_value) {
      try {
        await supabase.from("goal_milestones").insert({
          track_id: track.id,
          value: track.goal_value,
          label: track.goal || "יעד הושג",
          reached_at: new Date().toISOString(),
        });
      } catch {}
      toast.success("🏆 יעד הושג! כל הכבוד!");
      setExtendTrack(track);
      setNewGoalValue("");
      setNewGoalLabel("");
      setShowExtendDialog(true);
    } else {
      toast.success("התקדמות עודכנה");
    }
    fetchAll();
  };

  const extendGoal = async () => {
    if (!extendTrack || !newGoalValue) return;
    const v = Number(newGoalValue);
    if (Number.isNaN(v)) { toast.error("הערך חייב להיות מספר"); return; }
    const { error } = await supabase
      .from("skill_tracks")
      .update({ goal_value: v, goal: newGoalLabel || extendTrack.goal })
      .eq("id", extendTrack.id);
    if (error) { toast.error("שגיאה: " + error.message); return; }
    toast.success("יעד חדש הוגדר!");
    setShowExtendDialog(false);
    setNewGoalValue("");
    setNewGoalLabel("");
    setExtendTrack(null);
    fetchAll();
  };

  if (loading) return <ProtectedCoachPage><PageLoader /></ProtectedCoachPage>;

  return (
    <ProtectedCoachPage>
      <div style={{ minHeight: "100vh", background: "#FFF9F0", paddingBottom: 100, direction: "rtl" }}>
        {/* 1. Header */}
        <div style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>🔥 אתגרי אימון</div>
          <button onClick={() => setShowNewTrack(true)} style={{
            background: "#FF6F20", color: "white", border: "none",
            borderRadius: 12, padding: "8px 14px",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>+ מסלול חדש</button>
        </div>

        {/* 2. Today status */}
        <div style={{
          background: "white", borderRadius: 16,
          padding: 12, margin: "0 12px 10px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>📊 סטטוס היום</div>
          {trainees.length === 0 ? (
            <div style={{ textAlign: "center", color: "#888", padding: 12, fontSize: 12 }}>אין מתאמנים</div>
          ) : trainees.map(t => {
            const ch = todayChallenges.find(c => c.user_id === t.id);
            const st = !ch ? "none" : ch.is_read ? "done" : "pending";
            const parsed = parseData(ch?.data);
            return (
              <div key={t.id} onClick={() => { if (st === "none") openSendFor(t.id); }} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: 8,
                background: st === "done" ? "#E8F5E9" : st === "pending" ? "#FFF9F0" : "#F8F8F8",
                borderRadius: 10, marginBottom: 4,
                cursor: st === "none" ? "pointer" : "default",
                border: st === "none" ? "1px dashed #F0E4D0" : "0.5px solid #F0E4D0",
              }}>
                <span style={{ fontSize: 14 }}>{st === "done" ? "✅" : st === "pending" ? "⏳" : "➕"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{t.full_name}</span>
                  {parsed.challenge_text && (
                    <span style={{ fontSize: 10, color: "#888", marginRight: 6 }}>{parsed.challenge_text}</span>
                  )}
                </div>
                {st === "none" && (
                  <span style={{ fontSize: 10, color: "#FF6F20", fontWeight: 600 }}>שלח אתגר →</span>
                )}
              </div>
            );
          })}
        </div>

        {/* 4. Tracks list with expanding bar */}
        <div style={{
          background: "white", borderRadius: 16,
          padding: 12, margin: "0 12px 10px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>🛤️ מסלולים</div>
          {allTracks.length === 0 ? (
            <div style={{ textAlign: "center", color: "#888", padding: 20, fontSize: 13 }}>אין מסלולים — צור את הראשון</div>
          ) : allTracks.map(track => {
            const milestones = trackMilestones[track.id] || [];
            const goalVal = Number(track.goal_value) || 0;
            const curVal = Number(track.current_value) || 0;
            const startVal = Number(track.start_value) || 0;
            const pct = goalVal > 0 ? Math.min(100, Math.round(curVal / goalVal * 100)) : 0;
            const trainee = trainees.find(t => t.id === track.trainee_id);
            return (
              <div key={track.id} style={{
                background: "#FFF9F0", borderRadius: 14,
                padding: 12, marginBottom: 8,
                borderRight: `4px solid ${track.color}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>{track.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{track.name}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>
                      {trainee?.full_name || "מתאמן"} · יעד: {track.goal || "—"}
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: track.color }}>{pct}%</div>
                </div>

                {/* Expanding bar with milestone dots */}
                <div style={{ position: "relative", marginBottom: 4, padding: "6px 8px 6px 14px" }}>
                  <div style={{
                    background: "#F0E4D0", borderRadius: 6,
                    height: 10, overflow: "hidden",
                    position: "relative",
                  }}>
                    <div style={{
                      background: track.color,
                      height: "100%",
                      width: `${pct}%`,
                      borderRadius: 6,
                      transition: "width 0.5s ease",
                    }} />
                  </div>
                  {milestones.map(m => {
                    const mPct = goalVal > 0 ? Math.min(100, (m.value / goalVal) * 100) : 0;
                    const isReached = m.reached_at != null;
                    return (
                      <div key={m.id} style={{
                        position: "absolute",
                        left: `${mPct}%`,
                        top: 4,
                        transform: "translateX(-50%)",
                        width: isReached ? 14 : 10,
                        height: isReached ? 14 : 10,
                        borderRadius: "50%",
                        background: isReached ? "#16a34a" : "white",
                        border: isReached ? "2px solid white" : `2px solid ${track.color}`,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                        zIndex: 2,
                      }} title={m.label || ""} />
                    );
                  })}
                  <div style={{ position: "absolute", left: 0, top: 1, fontSize: 16, zIndex: 2 }}>⭐</div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#888", marginTop: 2 }}>
                  <span>{startVal} {track.goal_unit || ""}</span>
                  <span>{curVal} {track.goal_unit || ""} (עכשיו)</span>
                  <span>⭐ {goalVal || "?"} {track.goal_unit || ""}</span>
                </div>

                {/* Quick progress update */}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input
                    type="number"
                    placeholder={`${curVal}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        updateTrackProgress(track, e.currentTarget.value);
                        e.currentTarget.value = "";
                      }
                    }}
                    style={{
                      flex: 1, padding: "8px 10px",
                      borderRadius: 10, border: "0.5px solid #F0E4D0",
                      fontSize: 13, background: "white", direction: "ltr", textAlign: "center",
                    }}
                  />
                  <span style={{ fontSize: 11, color: "#888", alignSelf: "center" }}>עדכן ערך + Enter</span>
                </div>

                {/* Link to the existing track detail page (stages + challenges) */}
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center", marginTop: 6,
                }}>
                  <span style={{ fontSize: 10, color: "#888" }}>
                    {curVal} / {goalVal || "?"} {track.goal_unit || ""}
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate("/skilltracks?trackId=" + track.id);
                    }}
                    style={{
                      fontSize: 11, color: "#FF6F20",
                      fontWeight: 600, cursor: "pointer",
                    }}
                  >שלבים ואתגרים →</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* SEND OPTIONS DIALOG */}
        {showSendOptions && (
          <div onClick={() => setShowSendOptions(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            zIndex: 11000, display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: "#FFF9F0", borderRadius: "24px 24px 0 0",
              width: "100%", maxWidth: 500, maxHeight: "80vh",
              overflowY: "auto", padding: "20px 16px", direction: "rtl",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  📤 שלח אתגר ל{traineeNameById.get(selectedTraineeId) || "מתאמן"}
                </div>
                <button onClick={() => setShowSendOptions(false)} style={{
                  background: "none", border: "none", fontSize: 18, color: "#888", cursor: "pointer",
                }}>✕</button>
              </div>

              <div style={{
                display: "flex", gap: 4, marginBottom: 10,
                background: "#FFF0E4", borderRadius: 10, padding: 3,
              }}>
                {[
                  { id: "track",  label: "🛤️ מהמסלול" },
                  { id: "bank",   label: "📋 מהבנק" },
                  { id: "custom", label: "✏️ חופשי" },
                ].map(m => (
                  <div key={m.id} onClick={() => setSendMode(m.id)} style={{
                    flex: 1, padding: 8, borderRadius: 8,
                    textAlign: "center", fontSize: 12, fontWeight: 600,
                    cursor: "pointer",
                    background: sendMode === m.id ? "#FF6F20" : "transparent",
                    color: sendMode === m.id ? "white" : "#888",
                  }}>{m.label}</div>
                ))}
              </div>

              {sendMode === "track" && (
                <div>
                  {traineeTracks.length === 0 ? (
                    <div style={{ textAlign: "center", color: "#888", padding: 16, fontSize: 13 }}>
                      אין מסלולים למתאמן הזה — צור מסלול חדש
                    </div>
                  ) : traineeTracks.map(tr => {
                    const next = getNextChallenge(tr.id);
                    return (
                      <div key={tr.id} onClick={() => { if (next) sendChallengeFromTrack(next, tr); }} style={{
                        background: "white", borderRadius: 12, padding: 10,
                        marginBottom: 6, borderRight: `3px solid ${tr.color}`,
                        cursor: next ? "pointer" : "default",
                        border: "0.5px solid #F0E4D0",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 18 }}>{tr.icon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{tr.name}</div>
                            <div style={{ fontSize: 10, color: "#888" }}>
                              יעד: {tr.goal || "—"} · {tr.current_value || 0}/{tr.goal_value || "?"} {tr.goal_unit || ""}
                            </div>
                          </div>
                          {next ? (
                            <span style={{ fontSize: 11, color: "#FF6F20", fontWeight: 600 }}>שלח →</span>
                          ) : (
                            <span style={{ fontSize: 10, color: "#888" }}>אין אתגר</span>
                          )}
                        </div>
                        {next && (
                          <div style={{
                            fontSize: 11, color: "#555", marginTop: 6,
                            background: "#FFF9F0", padding: 6, borderRadius: 8,
                          }}>אתגר הבא: {next.name}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {sendMode === "bank" && (
                <div>
                  <div style={{ display: "flex", gap: 4, marginBottom: 8, overflowX: "auto" }}>
                    {CATEGORIES.map(c => (
                      <div key={c.id} onClick={() => setCatFilter(c.id)} style={{
                        padding: "4px 10px", borderRadius: 14,
                        fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                        background: catFilter === c.id ? "#1a1a1a" : "white",
                        color: catFilter === c.id ? "white" : "#888",
                        flexShrink: 0,
                      }}>{c.icon} {c.label}</div>
                    ))}
                  </div>
                  {filteredBank.map((ch, i) => (
                    <div key={i} onClick={() => sendFreeChallenge(ch)} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: 8, background: "white", borderRadius: 10,
                      marginBottom: 4, cursor: "pointer",
                      border: "0.5px solid #F0E4D0",
                    }}>
                      <span>{ch.icon}</span>
                      <span style={{ flex: 1, fontSize: 13 }}>{ch.text}</span>
                      <span style={{ fontSize: 11, color: "#FF6F20", fontWeight: 600 }}>שלח →</span>
                    </div>
                  ))}
                </div>
              )}

              {sendMode === "custom" && (
                <div style={{ display: "flex", gap: 6 }}>
                  <input value={customText} onChange={e => setCustomText(e.target.value)}
                    placeholder="כתוב אתגר חופשי..."
                    style={{
                      flex: 1, padding: 10, borderRadius: 10,
                      border: "0.5px solid #F0E4D0",
                      fontSize: 13, direction: "rtl",
                      background: "white", outline: "none",
                    }} />
                  <button onClick={() => {
                    const t = customText.trim();
                    if (!t) { toast.error("יש לכתוב אתגר"); return; }
                    sendFreeChallenge({ text: t, icon: "🎯", category: "custom" });
                    setCustomText("");
                  }} style={{
                    padding: "10px 16px", borderRadius: 10, border: "none",
                    background: "#FF6F20", color: "white", fontWeight: 600, cursor: "pointer",
                  }}>שלח</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* NEW TRACK DIALOG */}
        {showNewTrack && (
          <div onClick={() => setShowNewTrack(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            zIndex: 11000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: "#FFF9F0", borderRadius: 20, padding: 20,
              width: "100%", maxWidth: 380, direction: "rtl",
              maxHeight: "85vh", overflowY: "auto",
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, textAlign: "center", marginBottom: 14 }}>🛤️ מסלול חדש</div>

              <input value={newTrack.name} onChange={e => setNewTrack(p => ({ ...p, name: e.target.value }))}
                placeholder="שם המסלול (למשל: קפיצת חבל)"
                style={{
                  width: "100%", padding: 12, borderRadius: 12,
                  border: "1.5px solid #F0E4D0", fontSize: 15, fontWeight: 600,
                  direction: "rtl", marginBottom: 10,
                  background: "white", outline: "none", boxSizing: "border-box",
                }} />

              <select value={newTrack.trainee_id || ""} onChange={e => setNewTrack(p => ({ ...p, trainee_id: e.target.value }))}
                style={{
                  width: "100%", padding: 10, borderRadius: 12,
                  border: "0.5px solid #F0E4D0", fontSize: 14, direction: "rtl",
                  marginBottom: 10, background: "white", outline: "none",
                }}>
                <option value="">בחר מתאמן...</option>
                {trainees.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>

              <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>אייקון</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {ICON_OPTIONS.map(ic => (
                      <div key={ic} onClick={() => setNewTrack(p => ({ ...p, icon: ic }))} style={{
                        width: 32, height: 32, borderRadius: 8, fontSize: 18,
                        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                        background: newTrack.icon === ic ? "#FFF0E4" : "white",
                        border: newTrack.icon === ic ? "2px solid #FF6F20" : "1px solid #F0E4D0",
                      }}>{ic}</div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>צבע</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {COLOR_OPTIONS.map(c => (
                      <div key={c} onClick={() => setNewTrack(p => ({ ...p, color: c }))} style={{
                        width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer",
                        border: newTrack.color === c ? "3px solid #1a1a1a" : "2px solid white",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                      }} />
                    ))}
                  </div>
                </div>
              </div>

              <div style={{
                background: "white", borderRadius: 12, padding: 12,
                marginBottom: 10, border: "1.5px solid #FF6F20",
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#FF6F20", marginBottom: 8 }}>🎯 הגדרת יעד</div>
                <input value={newTrack.goal} onChange={e => setNewTrack(p => ({ ...p, goal: e.target.value }))}
                  placeholder="תיאור היעד (למשל: מאסל-אפ)"
                  style={{
                    width: "100%", padding: 10, borderRadius: 10,
                    border: "0.5px solid #F0E4D0", fontSize: 14, direction: "rtl",
                    marginBottom: 8, background: "#FFF9F0", outline: "none", boxSizing: "border-box",
                  }} />
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ flex: 2 }}>
                    <label style={{ fontSize: 11, color: "#888" }}>ערך יעד</label>
                    <input value={newTrack.goal_value} onChange={e => setNewTrack(p => ({ ...p, goal_value: e.target.value }))}
                      placeholder="10" inputMode="decimal"
                      style={{
                        width: "100%", padding: 8, borderRadius: 8,
                        border: "0.5px solid #F0E4D0", fontSize: 14,
                        background: "#FFF9F0", outline: "none", boxSizing: "border-box",
                      }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: "#888" }}>יחידה</label>
                    <select value={newTrack.goal_unit || ""} onChange={e => setNewTrack(p => ({ ...p, goal_unit: e.target.value }))}
                      style={{
                        width: "100%", padding: 8, borderRadius: 8,
                        border: "0.5px solid #F0E4D0", fontSize: 13,
                        background: "#FFF9F0", outline: "none",
                      }}>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={{ fontSize: 11, color: "#888" }}>מצב נוכחי</label>
                    <input value={newTrack.start_value} onChange={e => setNewTrack(p => ({ ...p, start_value: e.target.value }))}
                      placeholder="0" inputMode="decimal"
                      style={{
                        width: "100%", padding: 8, borderRadius: 8,
                        border: "0.5px solid #F0E4D0", fontSize: 14,
                        background: "#FFF9F0", outline: "none", boxSizing: "border-box",
                      }} />
                  </div>
                </div>
              </div>

              <button onClick={saveNewTrack} disabled={!newTrack.name?.trim() || !newTrack.trainee_id} style={{
                width: "100%", padding: 14, borderRadius: 14, border: "none",
                background: (newTrack.name?.trim() && newTrack.trainee_id) ? "#FF6F20" : "#ccc",
                color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer",
              }}>🛤️ צור מסלול</button>

              <div onClick={() => setShowNewTrack(false)} style={{
                textAlign: "center", padding: 10, color: "#888", fontSize: 14, cursor: "pointer",
              }}>ביטול</div>
            </div>
          </div>
        )}

        {/* EXTEND GOAL DIALOG */}
        {showExtendDialog && extendTrack && (
          <div onClick={() => setShowExtendDialog(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            zIndex: 12000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: "#FFF9F0", borderRadius: 20, padding: 24,
              width: "100%", maxWidth: 340, direction: "rtl", textAlign: "center",
            }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>יעד הושג!</div>
              <div style={{ fontSize: 14, color: "#888", marginBottom: 16 }}>
                {extendTrack.goal} — {extendTrack.goal_value} {extendTrack.goal_unit}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>🎯 הגדר יעד חדש</div>
              <input value={newGoalValue} onChange={e => setNewGoalValue(e.target.value)}
                placeholder={`יעד חדש (למשל: ${(Number(extendTrack.goal_value) || 0) * 2})`}
                inputMode="decimal"
                style={{
                  width: "100%", padding: 12, borderRadius: 12,
                  border: "1.5px solid #FF6F20", fontSize: 16, textAlign: "center",
                  marginBottom: 10, background: "white", outline: "none", boxSizing: "border-box",
                }} />
              <input value={newGoalLabel} onChange={e => setNewGoalLabel(e.target.value)}
                placeholder="תיאור היעד החדש"
                style={{
                  width: "100%", padding: 10, borderRadius: 12,
                  border: "0.5px solid #F0E4D0", fontSize: 14, direction: "rtl",
                  marginBottom: 14, background: "white", outline: "none", boxSizing: "border-box",
                }} />
              <button onClick={extendGoal} disabled={!newGoalValue} style={{
                width: "100%", padding: 14, borderRadius: 14, border: "none",
                background: newGoalValue ? "#FF6F20" : "#ccc",
                color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer",
              }}>🚀 הגדר יעד חדש</button>
              <div onClick={() => setShowExtendDialog(false)} style={{
                padding: 10, color: "#888", fontSize: 14, cursor: "pointer",
              }}>אחר כך</div>
            </div>
          </div>
        )}
      </div>
    </ProtectedCoachPage>
  );
}
