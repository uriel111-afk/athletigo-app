import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Check, Edit2, Trash2, Zap, Layers, Clock, Dumbbell, Activity,
  Repeat, Hash, Timer, Weight, ArrowLeftRight, GripVertical,
  Footprints, Maximize2, User, Info, Video, PauseCircle
} from "lucide-react";
import { notifyExerciseCompleted } from "@/functions/notificationTriggers";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";

// ── Helpers ─────────────────────────────────────────────────────────────

const PARAM_ICON = {
  sets: Hash, reps: Repeat, work_time: Clock, rest_time: Timer,
  rounds: Hash, rpe: Zap, weight_type: Weight, weight: Weight,
  tempo: Activity, rest_between_sets: Timer, rest_between_exercises: PauseCircle,
  leg_position: Footprints, body_position: User, equipment: Dumbbell,
  static_hold_time: PauseCircle, description: Info, side: ArrowLeftRight,
  range_of_motion: Maximize2, grip: GripVertical, video_url: Video,
};

const fmtTime = (v) => {
  if (!v && v !== 0) return null;
  if (typeof v === "string" && v.includes(":")) {
    const [m, s] = v.split(":").map(Number);
    const total = (m || 0) * 60 + (s || 0);
    if (total === 0) return null;
    if (total % 60 === 0) return `${total / 60} דק׳`;
    return total < 60 ? `${total} שנ׳` : `${m}:${String(s).padStart(2, "0")}`;
  }
  const n = parseInt(v);
  if (isNaN(n) || n === 0) return null;
  if (n % 60 === 0) return `${n / 60} דק׳`;
  return n < 60 ? `${n} שנ׳` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};

/**
 * Build display chips: { field, icon, label, value }
 */
const buildChips = (ex) => {
  const chips = [];
  const push = (field, label, value) => {
    if (value) chips.push({ field, icon: PARAM_ICON[field], label, value });
  };

  if (ex.sets && ex.sets !== "0") push("sets", "סטים", ex.sets);
  if (ex.reps && ex.reps !== "0") push("reps", "חזרות", ex.reps);
  if (ex.rounds && ex.rounds !== "0") push("rounds", "סבבים", ex.rounds);

  const wt = fmtTime(ex.work_time);
  if (wt) push("work_time", "עבודה", wt);
  const rt = fmtTime(ex.rest_time);
  if (rt) push("rest_time", "מנוחה", rt);
  const rbs = fmtTime(ex.rest_between_sets);
  if (rbs) push("rest_between_sets", "מנ׳ סטים", rbs);
  const rbe = fmtTime(ex.rest_between_exercises);
  if (rbe) push("rest_between_exercises", "מנ׳ תרגילים", rbe);
  const sh = fmtTime(ex.static_hold_time);
  if (sh) push("static_hold_time", "החזקה", sh);

  if (ex.weight && ex.weight !== "0") push("weight", "משקל", `${ex.weight} ק"ג`);
  if (ex.weight_type && ex.weight_type !== "bodyweight") push("weight_type", "עומס", ex.weight_type);
  if (ex.rpe && ex.rpe !== "0") push("rpe", "RPE", ex.rpe);
  if (ex.tempo) {
    // Same formatter as the trainee view — see formatTempo() defined
    // below. buildChips runs before formatTempo's declaration in
    // source order, but the function reference is hoisted so the call
    // here resolves correctly.
    const tempoDisplay = formatTempo(ex.tempo);
    if (tempoDisplay) push("tempo", "טמפו", tempoDisplay);
  }

  // Tabata-mode container surfaces the work/rest/rounds embedded in
  // tabata_data. Without this the trainee sees only the "טבטה" badge
  // and a sub-exercise list with no actual timing.
  if (ex.mode === 'טבטה' && ex.tabata_data) {
    let tabata = ex.tabata_data;
    if (typeof tabata === 'string') {
      try { tabata = JSON.parse(tabata); } catch { tabata = null; }
    }
    if (tabata && typeof tabata === 'object') {
      const work = tabata.work_time ?? tabata.work_sec;
      const rest = tabata.rest_time ?? tabata.rest_sec;
      const rounds = tabata.rounds;
      if (work) push("work_time", "טבטה: עבודה", `${work}"`);
      if (rest) push("rest_time", "טבטה: מנוחה", `${rest}"`);
      if (rounds) push("rounds", "טבטה: סבבים", rounds);
    }
  }

  if (ex.body_position) push("body_position", "מנח גוף", ex.body_position);
  if (ex.leg_position) push("leg_position", "רגליים", ex.leg_position);
  if (ex.side && ex.side !== "דו־צדדי") push("side", "צד", ex.side);
  if (ex.grip) push("grip", "אחיזה", ex.grip);
  if (ex.equipment) push("equipment", "ציוד", ex.equipment);
  if (ex.range_of_motion && ex.range_of_motion !== "מלא") push("range_of_motion", "טווח", ex.range_of_motion);

  return chips;
};

// Parse the sub-exercise list from any of the three column shapes
// the codebase uses interchangeably:
//   • ex.children      — canonical column per CLAUDE.md (PlanBuilder
//                         saves the "רשימת תרגילים" param here)
//   • ex.exercise_list — alternate alias some installs use
//   • ex.sub_exercises — legacy direct array column
//   • ex.tabata_data.sub_exercises / .blocks — embedded inside the
//                         tabata config blob (older format)
// Each shape may be a parsed array or a JSON string. Normalize.
const asArray = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
};
const getSubExercises = (ex) => {
  // ParamWidgets ListBuilder hands back items shaped { name, sets,
  // reps, time, weight }. Map onto a stable display shape so the
  // UI doesn't have to know which column it came from.
  const fromChildren     = asArray(ex.children);
  if (fromChildren.length)     return fromChildren;
  const fromList         = asArray(ex.exercise_list);
  if (fromList.length)         return fromList;
  const fromSubExercises = asArray(ex.sub_exercises);
  if (fromSubExercises.length) return fromSubExercises;
  if (!ex.tabata_data) return [];
  try {
    const parsed = typeof ex.tabata_data === "string" ? JSON.parse(ex.tabata_data) : ex.tabata_data;
    if (parsed.sub_exercises) return parsed.sub_exercises;
    if (parsed.blocks) {
      const subs = [];
      parsed.blocks.forEach((block) => {
        (block.block_exercises || []).forEach((be) => {
          subs.push({ exercise_name: be.name, ...block });
        });
      });
      return subs;
    }
  } catch {}
  return [];
};

const isContainerExercise = (ex) => {
  return ["טבטה", "סופרסט", "קומבו"].includes(ex.mode) && getSubExercises(ex).length > 0;
};

// Tempo display: expand both formats coaches actually use —
//   • dashed:  "3-1-2-0"  → split on '-'
//   • packed:  "3010"     → split per-character (PlanBuilder's
//                            default per PARAM_SCHEMA is "3010")
// Single-segment / non-numeric strings pass through unchanged.
function formatTempo(val) {
  if (val == null || val === '') return null;
  const str = String(val).trim();
  if (!str) return null;
  let parts = str.split('-').map(p => p.trim()).filter(Boolean);
  if (parts.length === 1 && /^\d{3,4}$/.test(parts[0])) {
    parts = parts[0].split('');
  }
  if (parts.length < 2) return str;
  const labels = ['שלילי', 'החזקה למטה', 'חיובי', 'החזקה למעלה'];
  return parts.map((p, i) => `${labels[i] || ''} ${p}"`).join(' · ');
}

// Trainee view: 4 logical groups so a busy plan reads as a structured
// recipe instead of a 20-chip blob. Each group renders its own header
// + chip row; empty groups are skipped.
const PARAM_GROUPS = [
  {
    title: 'עומס',
    params: [
      { key: 'sets', label: 'סטים' },
      { key: 'reps', label: 'חזרות' },
      { key: 'rounds', label: 'סבבים' },
      { key: 'weight', label: 'משקל', suffix: ' ק"ג' },
      { key: 'weight_type', label: 'סוג משקל' },
      { key: 'rpe', label: 'RPE' },
    ],
  },
  {
    title: 'זמנים',
    params: [
      { key: 'work_time', label: 'זמן עבודה', suffix: '"' },
      { key: 'rest_time', label: 'זמן מנוחה', suffix: '"' },
      { key: 'rest_between_sets', label: 'מנוחה בין סטים', suffix: '"' },
      { key: 'rest_between_exercises', label: 'מנוחה בין תרגילים', suffix: '"' },
      { key: 'static_hold_time', label: 'החזקה סטטית', suffix: '"' },
    ],
  },
  {
    title: 'טכניקה',
    params: [
      { key: 'tempo', label: 'טמפו', format: formatTempo },
      { key: 'body_position', label: 'מנח גוף' },
      { key: 'leg_position', label: 'מנח רגליים' },
      { key: 'side', label: 'צד' },
      { key: 'grip', label: 'אחיזה' },
      { key: 'range_of_motion', label: 'טווח תנועה' },
    ],
  },
  {
    title: 'ציוד ומדיה',
    params: [
      { key: 'equipment', label: 'ציוד' },
      { key: 'video_url', label: 'וידאו', isLink: true },
    ],
  },
];

const isParamFilled = (val) => {
  if (val == null || val === '' || val === 'לא רלוונטי') return false;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === 'string' && val.trim() === '') return false;
  return true;
};

const formatParamValue = (val) => {
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
};

// ── Shared display helpers — used by BOTH coach + trainee open views.
// The open card content is identical; only the action buttons differ.

function renderParamGroup(exercise, group) {
  const active = group.params.filter(p => {
    const val = exercise[p.key];
    if (val == null || val === '' || val === 'לא רלוונטי' || val === 'bodyweight') return false;
    if (typeof val === 'string' && val.trim() === '') return false;
    if (Array.isArray(val) && val.length === 0) return false;
    // Tempo lives in a dedicated cell row, not in the chip group.
    if (p.key === 'tempo') return false;
    return true;
  });
  if (active.length === 0) return null;
  return (
    <div key={group.title} style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>
        {group.title}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {active.map(p => {
          const raw = exercise[p.key];
          if (p.isLink) {
            return (
              <span key={p.key} onClick={() => window.open(raw, '_blank')}
                style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12,
                  background: '#EFF6FF', color: '#3B82F6', border: '1px solid #BFDBFE',
                  cursor: 'pointer', fontWeight: 500 }}>
                ▶ {p.label}
              </span>
            );
          }
          const display = Array.isArray(raw) ? raw.join(', ') : raw;
          return (
            <span key={p.key} style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12,
              background: '#FFF5EE', color: '#FF6F20', border: '1px solid #FFD9C2', fontWeight: 500 }}>
              {p.label}: {display}{p.suffix || ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function renderTempoCells(exercise) {
  if (!exercise.tempo) return null;
  const str = String(exercise.tempo).trim();
  let parts = str.split('-').map(p => p.trim()).filter(Boolean);
  if (parts.length === 1 && /^\d{3,4}$/.test(parts[0])) {
    parts = parts[0].split('');
  }
  const labels = ['שלילי', 'החזקה למטה', 'חיובי', 'החזקה למעלה'];
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 6, fontWeight: 600 }}>טמפו</div>
      <div style={{ display: 'flex', gap: 8, direction: 'rtl' }}>
        {labels.map((label, i) => (
          <div key={i} style={{
            flex: 1, textAlign: 'center', padding: '8px 4px',
            background: '#FFF5EE', borderRadius: 10, border: '1px solid #FFD9C2',
          }}>
            <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#FF6F20' }}>{parts[i] || '0'}"</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderNotes(exercise) {
  const note = exercise.description || exercise.notes || exercise.coach_notes;
  if (!note) return null;
  return (
    <div style={{
      marginTop: 10, padding: 12, background: '#FFF9F0',
      borderRadius: 10, fontSize: 13, color: '#555', lineHeight: 1.6,
    }}>
      💡 {note}
    </div>
  );
}

function renderSubExercises(subs) {
  if (!Array.isArray(subs) || subs.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 6, fontWeight: 600 }}>
        תרגילים ברשימה
      </div>
      {subs.map((sub, i) => (
        <div key={sub.id || i} style={{
          fontSize: 13, color: '#1a1a1a', padding: '6px 0',
          borderBottom: i < subs.length - 1 ? '1px solid #F5E8D5' : 'none',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            width: 22, height: 22, borderRadius: '50%', background: '#FFF5EE',
            border: '1px solid #FFD9C2', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 11, color: '#FF6F20', fontWeight: 600, flexShrink: 0,
          }}>{i + 1}</span>
          {typeof sub === 'string' ? sub : (sub.name || sub.exercise_name || '')}
        </div>
      ))}
    </div>
  );
}

function ExerciseCardHeader({ exercise, isOpen, onToggle, headerExtras }) {
  return (
    <div onClick={onToggle} style={{
      padding: '14px 16px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      cursor: 'pointer',
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {exercise.exercise_name || exercise.name}
        </div>
        {exercise.mode && (
          <span style={{ fontSize: 11, color: '#FF6F20', fontWeight: 500, marginTop: 2, display: 'block' }}>
            {exercise.mode}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {exercise.rpe && (
          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11,
            background: '#FEF3C7', color: '#92400E', fontWeight: 500 }}>
            RPE {exercise.rpe}
          </span>
        )}
        {exercise.completed && (
          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11,
            background: '#D1FAE5', color: '#16A34A', fontWeight: 500 }}>
            ✓ בוצע
          </span>
        )}
        {headerExtras}
        <span style={{ fontSize: 14, color: '#888', transition: 'transform 0.2s',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </div>
    </div>
  );
}

function ExerciseOpenContent({ exercise, subExercises }) {
  return (
    <div style={{ padding: '0 16px 16px' }}>
      {PARAM_GROUPS.map(group => renderParamGroup(exercise, group))}
      {renderTempoCells(exercise)}
      {renderNotes(exercise)}
      {renderSubExercises(subExercises)}
    </div>
  );
}

const getContainerLabel = (ex) => {
  if (ex.mode === "טבטה") return "טבטה";
  if (ex.mode === "סופרסט") return "רשימה";
  if (ex.mode === "קומבו") return "קומבו";
  return "מיכל";
};

// ── Component ────────────────────────────────────────────────────────

export default function ExerciseCard({
  exercise, index = 0, onToggleComplete, onRowClick, onEdit, onDelete,
  onMove, isFirst = false, isLast = false, onDuplicate,
  onOpenExecution, showEditButton = false, isCoach = false,
  sectionColor = "#FF6F20", plan,
}) {
  const queryClient = useQueryClient();
  if (!exercise) return null;

  const handleToggleComplete = async (e) => {
    e.stopPropagation();
    if (onToggleComplete) onToggleComplete(exercise);
    if (!isCoach && !exercise.completed && plan?.created_by) {
      try {
        const currentUser = await base44.auth.me();
        if (currentUser?.id) {
          await notifyExerciseCompleted({
            coachId: plan.created_by, traineeName: currentUser.full_name,
            traineeId: currentUser.id, exerciseName: exercise.exercise_name || exercise.name || "תרגיל",
          });
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
        }
      } catch {}
    }
  };

  const handleEdit = (e) => { e.stopPropagation(); onEdit ? onEdit() : onRowClick?.(); };
  const handleDelete = (e) => { e.stopPropagation(); onDelete?.(); };

  // Always run the 4-shape reader regardless of mode — both coach and
  // trainee views show the same open content, and legacy rows with
  // children but no mode still need to surface their sub-exercise list.
  const subExercises = getSubExercises(exercise);

  // ── COACH VIEW ──────────────────────────────────────────────────────
  // Same open-card content as the trainee view; only the action buttons
  // differ. Reorder/duplicate/delete icon buttons live in the header
  // next to the chevron so the section list still has the inline
  // controls coaches expect — primary "ערוך תרגיל" button at the
  // bottom of the open body lands them in the editor (layer 3).
  if (isCoach || showEditButton) {
    return (
      <CoachExerciseCard
        exercise={exercise}
        subExercises={subExercises}
        onEdit={handleEdit}
        onMove={onMove}
        isFirst={isFirst}
        isLast={isLast}
        onDuplicate={onDuplicate}
        onDelete={handleDelete}
      />
    );
  }

  // ── TRAINEE VIEW ────────────────────────────────────────────────────
  // Read-only mirror of the coach editor. Header collapses the body;
  // every populated field that the coach can fill in ModernExerciseForm
  // shows up here in matching groups (no inputs, no edit affordances).
  // Complete-toggle and 4-shape sub-exercise reading are delegated to
  // the parent helpers so the trainee card keeps full UX parity.
  return (
    <TraineeExerciseCard
      exercise={exercise}
      onToggleComplete={handleToggleComplete}
      subExercises={subExercises}
    />
  );
}

function CardWrapper({ completed, children }) {
  return (
    <motion.div
      layout
      style={{
        background: '#FFFEFC',
        border: '1px solid #F5E8D5',
        borderRadius: 14,
        marginBottom: 10,
        overflow: 'visible',
        // Green-when-completed indicator on the right edge (RTL).
        // Transparent fallback keeps the same width either way (no
        // layout shift when the green flips on/off).
        borderRight: completed ? '3px solid #4CAF50' : '3px solid transparent',
      }}
    >
      {children}
    </motion.div>
  );
}

function TraineeExerciseCard({ exercise, onToggleComplete, subExercises = [] }) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <CardWrapper completed={exercise.completed}>
      <ExerciseCardHeader
        exercise={exercise}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
      />
      {isOpen && (
        <>
          <ExerciseOpenContent exercise={exercise} subExercises={subExercises} />
          {onToggleComplete && !exercise.completed && (
            <div style={{ padding: '0 16px 16px' }}>
              <button onClick={onToggleComplete} style={{
                width: '100%', height: 44,
                borderRadius: 12, border: 'none',
                background: '#FF6F20', color: 'white',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>
                סמן כבוצע ✓
              </button>
            </div>
          )}
        </>
      )}
    </CardWrapper>
  );
}

// Coach card — same open content as the trainee card; the header
// carries reorder/duplicate/delete icons next to the chevron, and
// the open body's primary action is "ערוך תרגיל" which lands the
// coach in the editor (layer 3).
function CoachExerciseCard({
  exercise, subExercises, onEdit, onMove, isFirst, isLast, onDuplicate, onDelete,
}) {
  const [isOpen, setIsOpen] = useState(true);
  const stop = (e) => e.stopPropagation();
  const headerExtras = (
    <div onClick={stop} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {onMove && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onMove(-1); }}
            disabled={isFirst}
            title="העלה תרגיל"
            style={{
              width: 28, height: 28, borderRadius: 999, border: 'none',
              background: 'transparent', color: '#888', cursor: isFirst ? 'default' : 'pointer',
              opacity: isFirst ? 0.3 : 1, fontSize: 12,
            }}
          >↑</button>
          <button
            onClick={(e) => { e.stopPropagation(); onMove(1); }}
            disabled={isLast}
            title="הורד תרגיל"
            style={{
              width: 28, height: 28, borderRadius: 999, border: 'none',
              background: 'transparent', color: '#888', cursor: isLast ? 'default' : 'pointer',
              opacity: isLast ? 0.3 : 1, fontSize: 12,
            }}
          >↓</button>
        </>
      )}
      {onDuplicate && (
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          title="שכפל תרגיל"
          style={{
            width: 28, height: 28, borderRadius: 999, border: 'none',
            background: 'transparent', cursor: 'pointer', fontSize: 12,
          }}
        >📋</button>
      )}
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(e); }}
          title="מחק"
          style={{
            width: 28, height: 28, borderRadius: 999, border: 'none',
            background: 'transparent', color: '#DC2626', cursor: 'pointer', fontSize: 12,
          }}
        >🗑</button>
      )}
    </div>
  );
  return (
    <CardWrapper completed={exercise.completed}>
      <ExerciseCardHeader
        exercise={exercise}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        headerExtras={headerExtras}
      />
      {isOpen && (
        <>
          <ExerciseOpenContent exercise={exercise} subExercises={subExercises} />
          {onEdit && (
            <div style={{ padding: '0 16px 16px' }}>
              <button onClick={onEdit} style={{
                width: '100%', height: 44,
                borderRadius: 12, border: '1.5px solid #FF6F20',
                background: '#FFF5EE', color: '#FF6F20',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>
                ✏️ ערוך תרגיל
              </button>
            </div>
          )}
        </>
      )}
    </CardWrapper>
  );
}
