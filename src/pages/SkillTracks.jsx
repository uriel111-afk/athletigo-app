import React, { useState, useEffect, useContext, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { AuthContext } from "@/lib/AuthContext";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import PageLoader from "@/components/PageLoader";
import { toast } from "sonner";

// One page, two modes:
//   /skilltracks            → list of all tracks across the coach's roster
//   /skilltracks?trackId=X  → detail view of a single track + its stages
// Detail dialog (stages → challenges) lives inline. We avoid manual route
// registration by using a query param, mirroring the TraineeProfile pattern.

const ICON_OPTIONS = ["🪢","⭕","🔱","📏","💪","🏋️","🤸","🏃","🎯","⚡","🧘","🦵"];
const COLOR_OPTIONS = [
  { c: "#FF6F20", l: "כתום" },
  { c: "#16a34a", l: "ירוק" },
  { c: "#3B82F6", l: "כחול" },
  { c: "#7F47B5", l: "סגול" },
  { c: "#dc2626", l: "אדום" },
  { c: "#EAB308", l: "צהוב" },
];

export default function SkillTracks() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const trackIdParam = params.get("trackId");

  const [loading, setLoading] = useState(true);
  const [tracks, setTracks] = useState([]);
  const [stagesByTrack, setStagesByTrack] = useState({});
  const [challengesByStage, setChallengesByStage] = useState({});
  const [trainees, setTrainees] = useState([]);
  const [selectedTrainee, setSelectedTrainee] = useState("all");

  const [showAddTrack, setShowAddTrack] = useState(false);
  const [newTrack, setNewTrack] = useState({ name: "", icon: "🎯", color: "#FF6F20", trainee_id: "" });

  const [showAddStage, setShowAddStage] = useState(false);
  const [newStage, setNewStage] = useState({ name: "", description: "", video_url: "" });

  const [activeStage, setActiveStage] = useState(null);
  const [showAddChallenge, setShowAddChallenge] = useState(false);
  const [newChallenge, setNewChallenge] = useState(emptyChallenge());

  function emptyChallenge() {
    return { name: "", description: "", sets: "", reps: "", rounds: "", weight: "", rest_time: "", work_time: "", tempo: "", rpe: "", equipment: "", video_url: "" };
  }

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    // Trainees roster — same pattern Reports.jsx uses (no role filter).
    const { data: traineeRows } = await supabase
      .from("users")
      .select("id, full_name")
      .eq("coach_id", user.id)
      .order("full_name");
    setTrainees(traineeRows || []);

    const { data: trackRows, error: tErr } = await supabase
      .from("skill_tracks")
      .select("*")
      .eq("coach_id", user.id)
      .order("created_at", { ascending: false });
    if (tErr) {
      console.error("[SkillTracks] tracks fetch error:", tErr);
      toast.error("שגיאה בטעינת מסלולים: " + tErr.message);
      setLoading(false);
      return;
    }
    setTracks(trackRows || []);
    console.log("[SkillTracks] loaded tracks:", trackRows?.length || 0);

    if ((trackRows || []).length > 0) {
      const ids = trackRows.map(t => t.id);
      const { data: stageRows, error: sErr } = await supabase
        .from("skill_stages")
        .select("*")
        .in("track_id", ids)
        .order("sort_order", { ascending: true });
      if (sErr) console.warn("[SkillTracks] stages fetch:", sErr);
      const sMap = {};
      for (const s of (stageRows || [])) {
        if (!sMap[s.track_id]) sMap[s.track_id] = [];
        sMap[s.track_id].push(s);
      }
      setStagesByTrack(sMap);

      const stageIds = (stageRows || []).map(s => s.id);
      if (stageIds.length > 0) {
        const { data: chRows, error: cErr } = await supabase
          .from("skill_challenges")
          .select("*")
          .in("stage_id", stageIds)
          .order("sort_order", { ascending: true });
        if (cErr) console.warn("[SkillTracks] challenges fetch:", cErr);
        const cMap = {};
        for (const c of (chRows || [])) {
          if (!cMap[c.stage_id]) cMap[c.stage_id] = [];
          cMap[c.stage_id].push(c);
        }
        setChallengesByStage(cMap);
      }
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const traineeNameById = useMemo(() => {
    const m = new Map();
    for (const t of trainees) m.set(t.id, t.full_name);
    return m;
  }, [trainees]);

  const filteredTracks = useMemo(() => (
    selectedTrainee === "all" ? tracks : tracks.filter(t => t.trainee_id === selectedTrainee)
  ), [tracks, selectedTrainee]);

  const currentTrack = trackIdParam ? tracks.find(t => t.id === trackIdParam) : null;
  const currentStages = currentTrack ? (stagesByTrack[currentTrack.id] || []) : [];

  // ── Save handlers ────────────────────────────────────────────────
  const saveTrack = async () => {
    if (!newTrack.name?.trim() || !newTrack.trainee_id) { toast.error("שם ומתאמן נדרשים"); return; }
    const payload = {
      coach_id: user.id,
      trainee_id: newTrack.trainee_id,
      name: newTrack.name.trim(),
      icon: newTrack.icon,
      color: newTrack.color,
    };
    console.log("[SkillTracks] insert track:", payload);
    const { data, error } = await supabase.from("skill_tracks").insert(payload).select().single();
    console.log("[SkillTracks] insert track result:", data, error);
    if (error) { toast.error("שגיאה: " + error.message); return; }
    toast.success("מסלול נוצר!");
    setShowAddTrack(false);
    setNewTrack({ name: "", icon: "🎯", color: "#FF6F20", trainee_id: "" });
    fetchAll();
  };

  const saveStage = async () => {
    if (!newStage.name?.trim() || !currentTrack?.id) { toast.error("שם נדרש"); return; }
    const payload = {
      track_id: currentTrack.id,
      name: newStage.name.trim(),
      description: newStage.description?.trim() || null,
      video_url: newStage.video_url?.trim() || null,
      sort_order: currentStages.length,
      status: currentStages.length === 0 ? "active" : "locked",
    };
    console.log("[SkillTracks] insert stage:", payload);
    const { data, error } = await supabase.from("skill_stages").insert(payload).select().single();
    console.log("[SkillTracks] insert stage result:", data, error);
    if (error) { toast.error("שגיאה: " + error.message); return; }
    toast.success("שלב נוסף!");
    setShowAddStage(false);
    setNewStage({ name: "", description: "", video_url: "" });
    fetchAll();
  };

  const saveChallenge = async () => {
    if (!newChallenge.name?.trim() || !activeStage?.id || !currentTrack?.id) { toast.error("שם נדרש"); return; }
    const existingCount = (challengesByStage[activeStage.id] || []).length;
    const num = (v) => v === "" || v == null ? null : Number(v);
    const payload = {
      stage_id: activeStage.id,
      track_id: currentTrack.id,
      trainee_id: currentTrack.trainee_id,
      name: newChallenge.name.trim(),
      description: newChallenge.description?.trim() || null,
      sets: num(newChallenge.sets),
      reps: num(newChallenge.reps),
      rounds: num(newChallenge.rounds),
      weight: num(newChallenge.weight),
      rest_time: num(newChallenge.rest_time),
      work_time: num(newChallenge.work_time),
      tempo: newChallenge.tempo?.trim() || null,
      rpe: num(newChallenge.rpe),
      equipment: newChallenge.equipment?.trim() || null,
      video_url: newChallenge.video_url?.trim() || null,
      sort_order: existingCount,
      status: "pending",
    };
    console.log("[SkillTracks] insert challenge:", payload);
    const { data, error } = await supabase.from("skill_challenges").insert(payload).select().single();
    console.log("[SkillTracks] insert challenge result:", data, error);
    if (error) { toast.error("שגיאה: " + error.message); return; }
    toast.success("אתגר נוסף!");
    setShowAddChallenge(false);
    setNewChallenge(emptyChallenge());
    fetchAll();
  };

  const goToList = () => navigate("/skilltracks", { replace: true });
  const goToTrack = (id) => navigate(`/skilltracks?trackId=${id}`);

  if (loading) return <ProtectedCoachPage><PageLoader /></ProtectedCoachPage>;

  // ── DETAIL VIEW ──────────────────────────────────────────────────
  if (currentTrack) {
    const completedCount = currentStages.filter(s => s.status === "completed").length;
    const pct = currentStages.length > 0 ? Math.round(completedCount / currentStages.length * 100) : 0;
    return (
      <ProtectedCoachPage>
        <div style={{ minHeight: "100vh", background: "#FFF9F0", paddingBottom: 100, direction: "rtl" }}>
          {/* Detail header */}
          <div style={{ padding: 16 }}>
            <button onClick={goToList} style={{
              background: "none", border: "none",
              color: "#888", fontSize: 14, cursor: "pointer",
              padding: 0, marginBottom: 12,
            }}>← חזרה למסלולים</button>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 36 }}>{currentTrack.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>{currentTrack.name}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                  {traineeNameById.get(currentTrack.trainee_id) || "מתאמן"} · {currentStages.length} שלבים · {completedCount} הושלמו
                </div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: currentTrack.color }}>{pct}%</div>
            </div>
            <div style={{ background: "#F0E4D0", borderRadius: 4, height: 6, marginTop: 12, overflow: "hidden" }}>
              <div style={{ background: currentTrack.color, height: "100%", width: `${pct}%`, borderRadius: 4 }} />
            </div>
          </div>

          {/* Stages timeline */}
          {currentStages.length === 0 ? (
            <div style={{ textAlign: "center", color: "#888", padding: "30px 16px", fontSize: 13 }}>אין שלבים עדיין — הוסף שלב ראשון</div>
          ) : currentStages.map((stage, i) => {
            const stageChallenges = challengesByStage[stage.id] || [];
            return (
              <div key={stage.id} style={{ display: "flex", gap: 12, padding: "0 16px" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 30 }}>
                  <div style={{
                    width: stage.status === "active" ? 20 : 14,
                    height: stage.status === "active" ? 20 : 14,
                    borderRadius: "50%",
                    background: stage.status === "completed" ? "#16a34a"
                      : stage.status === "active" ? currentTrack.color : "#E8E0D8",
                    border: stage.status === "active" ? "3px solid white" : "none",
                    boxShadow: stage.status === "active" ? `0 0 0 2px ${currentTrack.color}` : "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {stage.status === "completed" && <span style={{ color: "white", fontSize: 10 }}>✓</span>}
                  </div>
                  {i < currentStages.length - 1 && (
                    <div style={{
                      width: 2, flex: 1, minHeight: 40,
                      background: stage.status === "completed" ? "#16a34a" : "#E8E0D8",
                    }} />
                  )}
                </div>
                <div onClick={() => setActiveStage(stage)} style={{
                  flex: 1, background: "white",
                  borderRadius: 14, padding: 12, marginBottom: 8,
                  cursor: "pointer",
                  border: stage.status === "active"
                    ? `1.5px solid ${currentTrack.color}`
                    : "0.5px solid #F0E4D0",
                  opacity: stage.status === "locked" ? 0.6 : 1,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{stage.name}</div>
                  {stage.description && (
                    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{stage.description}</div>
                  )}
                  <div style={{ fontSize: 10, color: "#888", marginTop: 6 }}>
                    {stageChallenges.length} אתגרים{stage.status === "completed" ? " · הושלם ✓" : ""}
                  </div>
                </div>
              </div>
            );
          })}

          <button onClick={() => setShowAddStage(true)} style={{
            margin: "10px 16px",
            width: "calc(100% - 32px)",
            padding: 12, background: "white",
            borderRadius: 14, border: "1.5px dashed #FF6F20",
            color: "#FF6F20", fontSize: 14, fontWeight: 600,
            cursor: "pointer",
          }}>+ הוסף שלב</button>

          {/* Add stage dialog */}
          {showAddStage && (
            <div onClick={() => setShowAddStage(false)} style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
              zIndex: 11000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
            }}>
              <div onClick={e => e.stopPropagation()} style={{
                background: "#FFF9F0", borderRadius: 24, padding: 24,
                width: "100%", maxWidth: 380, direction: "rtl",
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, textAlign: "center", marginBottom: 16 }}>➕ שלב חדש</div>
                <input value={newStage.name} onChange={e => setNewStage(p => ({ ...p, name: e.target.value }))} placeholder="שם השלב (למשל: 10 קפיצות רצופות)"
                  style={{ width: "100%", padding: 12, borderRadius: 14, border: "1.5px solid #F0E4D0", fontSize: 15, fontWeight: 600, direction: "rtl", marginBottom: 10, background: "white", outline: "none", boxSizing: "border-box" }} />
                <textarea value={newStage.description} onChange={e => setNewStage(p => ({ ...p, description: e.target.value }))} placeholder="תיאור (אופציונלי)" rows={2}
                  style={{ width: "100%", padding: 10, borderRadius: 14, border: "1px solid #F0E4D0", fontSize: 13, direction: "rtl", marginBottom: 10, background: "white", outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                <input value={newStage.video_url} onChange={e => setNewStage(p => ({ ...p, video_url: e.target.value }))} placeholder="קישור לוידאו (אופציונלי)" type="url"
                  style={{ width: "100%", padding: 10, borderRadius: 14, border: "1px solid #F0E4D0", fontSize: 13, direction: "ltr", marginBottom: 16, background: "white", outline: "none", boxSizing: "border-box" }} />
                <button onClick={saveStage} disabled={!newStage.name?.trim()} style={{
                  width: "100%", padding: 14, borderRadius: 14, border: "none",
                  background: newStage.name?.trim() ? "#FF6F20" : "#ccc",
                  color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer",
                }}>➕ צור שלב</button>
                <div onClick={() => setShowAddStage(false)} style={{ textAlign: "center", padding: 10, color: "#888", fontSize: 14, cursor: "pointer" }}>ביטול</div>
              </div>
            </div>
          )}

          {/* Stage detail dialog */}
          {activeStage && !showAddChallenge && (
            <div onClick={() => setActiveStage(null)} style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
              zIndex: 11000, display: "flex", alignItems: "flex-end", justifyContent: "center",
            }}>
              <div onClick={e => e.stopPropagation()} style={{
                background: "#FFF9F0", borderRadius: "24px 24px 0 0",
                width: "100%", maxWidth: 500, maxHeight: "85vh",
                overflowY: "auto", padding: 20, direction: "rtl",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{activeStage.name}</div>
                  <button onClick={() => setActiveStage(null)} style={{ background: "none", border: "none", fontSize: 20, color: "#888", cursor: "pointer" }}>✕</button>
                </div>
                {activeStage.description && (
                  <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>{activeStage.description}</div>
                )}
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>אתגרי השלב</div>
                {(challengesByStage[activeStage.id] || []).length === 0 ? (
                  <div style={{ textAlign: "center", color: "#888", padding: 12, fontSize: 12 }}>אין אתגרים — הוסף ראשון</div>
                ) : (challengesByStage[activeStage.id] || []).map(ch => (
                  <div key={ch.id} style={{
                    background: "white", borderRadius: 12, padding: 10, marginBottom: 6,
                    border: "0.5px solid #F0E4D0",
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{ch.name}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                      {ch.sets && <span style={{ background: "#FFF0E4", color: "#FF6F20", fontSize: 11, padding: "2px 6px", borderRadius: 6, fontWeight: 600 }}>{ch.sets} סטים</span>}
                      {ch.reps && <span style={{ background: "#FFF0E4", color: "#FF6F20", fontSize: 11, padding: "2px 6px", borderRadius: 6, fontWeight: 600 }}>{ch.reps} חזרות</span>}
                      {ch.weight && <span style={{ background: "#F3E8FF", color: "#7F47B5", fontSize: 11, padding: "2px 6px", borderRadius: 6, fontWeight: 600 }}>{ch.weight} ק״ג</span>}
                      {ch.work_time && <span style={{ background: "#E8F5E9", color: "#16a34a", fontSize: 11, padding: "2px 6px", borderRadius: 6, fontWeight: 600 }}>{ch.work_time} שנ׳ עבודה</span>}
                      {ch.rest_time && <span style={{ background: "#E8F5E9", color: "#16a34a", fontSize: 11, padding: "2px 6px", borderRadius: 6, fontWeight: 600 }}>{ch.rest_time} שנ׳ מנוחה</span>}
                      {ch.rpe && <span style={{ background: "#FEF3C7", color: "#B45309", fontSize: 11, padding: "2px 6px", borderRadius: 6, fontWeight: 600 }}>RPE {ch.rpe}</span>}
                    </div>
                  </div>
                ))}
                <button onClick={() => { setShowAddChallenge(true); }} style={{
                  width: "100%", padding: 12, marginTop: 8,
                  background: "white", borderRadius: 12,
                  border: "1.5px dashed #FF6F20",
                  color: "#FF6F20", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}>+ הוסף אתגר לשלב</button>
              </div>
            </div>
          )}

          {/* Add challenge dialog — exercise-form-style params */}
          {showAddChallenge && activeStage && (
            <div onClick={() => setShowAddChallenge(false)} style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
              zIndex: 11001, display: "flex", alignItems: "flex-end", justifyContent: "center",
            }}>
              <div onClick={e => e.stopPropagation()} style={{
                background: "#FFF9F0", borderRadius: "24px 24px 0 0",
                width: "100%", maxWidth: 500, maxHeight: "85vh",
                overflowY: "auto", padding: 20, direction: "rtl",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>🎯 אתגר חדש לשלב</div>
                  <button onClick={() => setShowAddChallenge(false)} style={{ background: "none", border: "none", fontSize: 20, color: "#888", cursor: "pointer" }}>✕</button>
                </div>
                <input value={newChallenge.name} onChange={e => setNewChallenge(p => ({ ...p, name: e.target.value }))} placeholder="שם האתגר"
                  style={{ width: "100%", padding: 12, borderRadius: 14, border: "1.5px solid #F0E4D0", fontSize: 15, fontWeight: 600, direction: "rtl", marginBottom: 8, background: "white", outline: "none", boxSizing: "border-box" }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
                  {[
                    { k: "sets",      ph: "סטים" },
                    { k: "reps",      ph: "חזרות" },
                    { k: "rounds",    ph: "סבבים" },
                    { k: "weight",    ph: 'ק"ג' },
                    { k: "rest_time", ph: "מנוחה (שנ׳)" },
                    { k: "work_time", ph: "עבודה (שנ׳)" },
                    { k: "rpe",       ph: "RPE 1-10" },
                  ].map(({ k, ph }) => (
                    <input key={k} value={newChallenge[k]} onChange={e => setNewChallenge(p => ({ ...p, [k]: e.target.value.replace(/[^0-9.]/g, "") }))} placeholder={ph} inputMode="numeric"
                      style={{ padding: 10, borderRadius: 10, border: "1px solid #F0E4D0", fontSize: 13, direction: "rtl", background: "white", outline: "none", textAlign: "center", boxSizing: "border-box" }} />
                  ))}
                </div>
                <input value={newChallenge.tempo} onChange={e => setNewChallenge(p => ({ ...p, tempo: e.target.value }))} placeholder="טמפו (אופציונלי)"
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #F0E4D0", fontSize: 13, direction: "rtl", marginBottom: 6, background: "white", outline: "none", boxSizing: "border-box" }} />
                <input value={newChallenge.equipment} onChange={e => setNewChallenge(p => ({ ...p, equipment: e.target.value }))} placeholder="ציוד נדרש (אופציונלי)"
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #F0E4D0", fontSize: 13, direction: "rtl", marginBottom: 6, background: "white", outline: "none", boxSizing: "border-box" }} />
                <input value={newChallenge.video_url} onChange={e => setNewChallenge(p => ({ ...p, video_url: e.target.value }))} placeholder="וידאו (אופציונלי)" type="url"
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #F0E4D0", fontSize: 13, direction: "ltr", marginBottom: 6, background: "white", outline: "none", boxSizing: "border-box" }} />
                <textarea value={newChallenge.description} onChange={e => setNewChallenge(p => ({ ...p, description: e.target.value }))} placeholder="דגשים (אופציונלי)" rows={2}
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #F0E4D0", fontSize: 13, direction: "rtl", marginBottom: 12, background: "white", outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                <button onClick={saveChallenge} disabled={!newChallenge.name?.trim()} style={{
                  width: "100%", padding: 14, borderRadius: 14, border: "none",
                  background: newChallenge.name?.trim() ? "#FF6F20" : "#ccc",
                  color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer",
                }}>🎯 שמור אתגר</button>
              </div>
            </div>
          )}
        </div>
      </ProtectedCoachPage>
    );
  }

  // ── LIST VIEW ────────────────────────────────────────────────────
  return (
    <ProtectedCoachPage>
      <div style={{ minHeight: "100vh", background: "#FFF9F0", paddingBottom: 100, direction: "rtl" }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", padding: 16,
        }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>🛤️ מסלולי מיומנות</div>
          <button onClick={() => setShowAddTrack(true)} style={{
            background: "#FF6F20", color: "white", border: "none",
            borderRadius: 12, padding: "8px 16px",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>+ מסלול חדש</button>
        </div>

        <div style={{ display: "flex", gap: 6, padding: "0 16px 12px", overflowX: "auto" }}>
          {[{ id: "all", full_name: "כל המתאמנים" }, ...trainees].map(t => {
            const active = selectedTrainee === t.id;
            return (
              <div key={t.id} onClick={() => setSelectedTrainee(t.id)} style={{
                padding: "6px 14px", borderRadius: 20,
                fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                background: active ? "#FF6F20" : "white",
                color: active ? "white" : "#888",
                border: active ? "none" : "1px solid #F0E4D0",
                flexShrink: 0,
              }}>{t.full_name}</div>
            );
          })}
        </div>

        {filteredTracks.length === 0 ? (
          <div style={{ textAlign: "center", color: "#888", padding: "40px 20px", fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🛤️</div>
            <div>אין מסלולים עדיין — צור מסלול ראשון</div>
          </div>
        ) : filteredTracks.map(track => {
          const stages = stagesByTrack[track.id] || [];
          const completed = stages.filter(s => s.status === "completed").length;
          const pct = stages.length > 0 ? Math.round(completed / stages.length * 100) : 0;
          return (
            <div key={track.id} onClick={() => goToTrack(track.id)} style={{
              background: "white", borderRadius: 16,
              padding: 14, margin: "0 12px 10px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
              borderRight: `4px solid ${track.color}`,
              cursor: "pointer",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 24 }}>{track.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{track.name}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>
                    {traineeNameById.get(track.trainee_id) || "מתאמן"} · {stages.length} שלבים · {completed} הושלמו
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: track.color }}>{pct}%</div>
              </div>
              <div style={{ background: "#F0E4D0", borderRadius: 4, height: 6, overflow: "hidden" }}>
                <div style={{ background: track.color, height: "100%", width: `${pct}%`, borderRadius: 4 }} />
              </div>
              {stages.length > 0 && (
                <div style={{ display: "flex", gap: 4, marginTop: 8, justifyContent: "center" }}>
                  {stages.map(s => (
                    <div key={s.id} style={{
                      width: s.status === "active" ? 12 : 8,
                      height: s.status === "active" ? 12 : 8,
                      borderRadius: "50%",
                      background: s.status === "completed" ? "#16a34a"
                        : s.status === "active" ? track.color : "#E8E0D8",
                      border: s.status === "active" ? "2px solid white" : "none",
                      boxShadow: s.status === "active" ? `0 0 0 2px ${track.color}` : "none",
                    }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Add track dialog */}
        {showAddTrack && (
          <div onClick={() => setShowAddTrack(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            zIndex: 11000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: "#FFF9F0", borderRadius: 24, padding: 24,
              width: "100%", maxWidth: 380, direction: "rtl",
              maxHeight: "85vh", overflowY: "auto",
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, textAlign: "center", marginBottom: 16 }}>🛤️ מסלול חדש</div>
              <input value={newTrack.name} onChange={e => setNewTrack(p => ({ ...p, name: e.target.value }))} placeholder="שם המסלול (למשל: קפיצת חבל)"
                style={{ width: "100%", padding: 12, borderRadius: 14, border: "1.5px solid #F0E4D0", fontSize: 15, fontWeight: 600, direction: "rtl", marginBottom: 12, background: "white", outline: "none", boxSizing: "border-box" }} />

              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>אייקון</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {ICON_OPTIONS.map(ic => (
                  <div key={ic} onClick={() => setNewTrack(p => ({ ...p, icon: ic }))} style={{
                    width: 36, height: 36, borderRadius: 10, fontSize: 20,
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                    background: newTrack.icon === ic ? "#FFF0E4" : "white",
                    border: newTrack.icon === ic ? "2px solid #FF6F20" : "1px solid #F0E4D0",
                  }}>{ic}</div>
                ))}
              </div>

              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>צבע</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                {COLOR_OPTIONS.map(({ c }) => (
                  <div key={c} onClick={() => setNewTrack(p => ({ ...p, color: c }))} style={{
                    width: 32, height: 32, borderRadius: "50%", background: c, cursor: "pointer",
                    border: newTrack.color === c ? "3px solid #1a1a1a" : "2px solid white",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  }} />
                ))}
              </div>

              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>שייך למתאמן</div>
              <select value={newTrack.trainee_id || ""} onChange={e => setNewTrack(p => ({ ...p, trainee_id: e.target.value }))} style={{
                width: "100%", padding: 10, borderRadius: 12,
                border: "1px solid #F0E4D0", fontSize: 14, direction: "rtl",
                marginBottom: 16, background: "white", outline: "none",
              }}>
                <option value="">בחר מתאמן...</option>
                {trainees.map(t => (
                  <option key={t.id} value={t.id}>{t.full_name}</option>
                ))}
              </select>

              <button onClick={saveTrack} disabled={!newTrack.name?.trim() || !newTrack.trainee_id} style={{
                width: "100%", padding: 14, borderRadius: 14, border: "none",
                background: (newTrack.name?.trim() && newTrack.trainee_id) ? "#FF6F20" : "#ccc",
                color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer",
              }}>🛤️ צור מסלול</button>
              <div onClick={() => setShowAddTrack(false)} style={{
                textAlign: "center", padding: 10, color: "#888", fontSize: 14, cursor: "pointer",
              }}>ביטול</div>
            </div>
          </div>
        )}
      </div>
    </ProtectedCoachPage>
  );
}
