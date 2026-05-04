import React, { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Minus, Dumbbell, Clock, Repeat, Layers, Activity, Zap,
  Trash2, Timer, Weight, Hash, Info, Video, Check, X,
  PauseCircle, User, GripVertical,
  Footprints, Maximize2, ArrowLeftRight, ChevronDown
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AddCustomValueDialog from "../forms/AddCustomValueDialog";
import { toast } from "sonner";
import { searchExercises } from "@/data/exercises";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Drag-handle wrapper for one sub-exercise row. Renders the ⠿ handle
// to the right of the editor (RTL = visual right). Uses the sub.id so
// onDragEnd resolves to the array index even when items are reordered.
function SortableSubExerciseRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
      }}
    >
      <div
        {...attributes}
        {...listeners}
        style={{
          cursor: 'grab',
          color: '#888',
          fontSize: 18,
          padding: '8px 4px',
          touchAction: 'none',
          userSelect: 'none',
          flexShrink: 0,
          lineHeight: 1,
        }}
        title="גרור לסידור מחדש"
      >
        ⠿
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────
const ICONS = {
  reps: Repeat, sets: Hash, time: Clock, rest: Timer,
  weight: Weight, equipment: Dumbbell, notes: Info, video: Video,
  tempo: Activity, rpe: Zap, list: Layers, pause: PauseCircle,
  user: User, stop: PauseCircle,
};

// ── All Parameters ────────────────────────────────────────────────────
const ALL_PARAMETERS = [
  { id: "sets",                   label: "סטים",             icon: ICONS.sets,      defaultValue: "3" },
  { id: "reps",                   label: "חזרות",            icon: ICONS.reps,      defaultValue: "10" },
  { id: "work_time",              label: "זמן עבודה",        icon: ICONS.time,      defaultValue: "30" },
  { id: "rest_time",              label: "זמן מנוחה",        icon: ICONS.rest,      defaultValue: "30" },
  { id: "rounds",                 label: "סבבים",            icon: ICONS.sets,      defaultValue: "3" },
  { id: "rpe",                    label: "RPE",              icon: ICONS.rpe,       defaultValue: "7" },
  { id: "load_type",              label: "סוג עומס",         icon: ICONS.weight,    defaultValue: "משקל גוף" },
  { id: "weight_kg",              label: "משקל",             icon: ICONS.weight,    defaultValue: "0" },
  { id: "tempo",                  label: "טמפו",             icon: ICONS.tempo,     defaultValue: "" },
  { id: "rest_between_sets",      label: "מנ׳ בין סטים",     icon: ICONS.rest,      defaultValue: "60" },
  { id: "rest_between_exercises", label: "מנ׳ בין תרגילים", icon: ICONS.pause,     defaultValue: "15" },
  { id: "exercise_list",          label: "רשימת תרגילים",   icon: ICONS.list,      defaultValue: "_container" },
  { id: "foot_position",          label: "מנח רגליים",       icon: Footprints,      defaultValue: "רוחב כתפיים" },
  { id: "body_position",          label: "מנח גוף",          icon: User,            defaultValue: "עמידה" },
  { id: "equipment",              label: "ציוד",             icon: ICONS.equipment, defaultValue: "" },
  { id: "static_hold",            label: "החזקה סטטית",      icon: ICONS.stop,      defaultValue: "10" },
  { id: "notes",                  label: "דגשים",            icon: ICONS.notes,     defaultValue: "" },
  { id: "side",                   label: "צד",               icon: ArrowLeftRight,  defaultValue: "דו־צדדי" },
  { id: "range_of_motion",        label: "טווח תנועה",       icon: Maximize2,       defaultValue: "מלא" },
  { id: "grip",                   label: "אחיזה",            icon: GripVertical,    defaultValue: "" },
  { id: "tabata",                 label: "טבטה",             icon: Zap,             defaultValue: "_container" },
  { id: "video_url",              label: "וידאו",            icon: ICONS.video,     defaultValue: "" },
];

const CONTAINER_PARAMS = new Set(["exercise_list", "tabata"]);
const SUB_PARAMS = ALL_PARAMETERS.filter(p => !CONTAINER_PARAMS.has(p.id) && p.id !== "video_url");

// ── DB Field Mapping ──────────────────────────────────────────────────
// UI param id → DB column. Anything not listed maps identity. Keep
// each entry on its own line so adding a new param doesn't get lost
// in a multi-key one-liner. Verified against the live exercises
// schema 2026-04-30 — INSPECTION_REPORT_V2.md §5.
const DB_MAP = {
  reps: "reps",
  weight_kg: "weight",
  load_type: "weight_type",
  foot_position: "leg_position",
  static_hold: "static_hold_time",
  notes: "description",
  tabata: "tabata_data",
};
const getDbField = (paramId) => DB_MAP[paramId] || paramId;

// ── Value Helpers ─────────────────────────────────────────────────────
const hasVal = (v) => {
  if (v === null || v === undefined || v === "" || v === "0") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
};

// Always m:ss — values are stored as total seconds; "1:30" reads
// naturally for both short rest gaps and long work intervals.
// Returns null for empty/zero so the caller can decide to omit
// the param entirely.
const fmtTime = (v) => {
  if (!v && v !== 0) return null;
  const n = typeof v === 'string' && v.includes(':')
    ? (() => {
        const [m, s] = v.split(':').map(Number);
        return (m || 0) * 60 + (s || 0);
      })()
    : parseInt(v, 10);
  if (Number.isNaN(n) || n <= 0) return null;
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const getDisplay = (pid, val) => {
  if (!hasVal(val)) return "";
  const v = String(val);
  switch (pid) {
    case "sets": return `${v} סטים`;
    case "reps": return `${v} חזרות`;
    case "rounds": return `${v} סבבים`;
    case "work_time": case "rest_time": case "rest_between_sets":
    case "rest_between_exercises": case "static_hold":
      return fmtTime(v) || `${v} שנ׳`;
    case "weight_kg": return `${v} ק"ג`;
    case "rpe": return `RPE ${v}`;
    case "tempo": return v;
    case "notes": return "יש דגשים";
    case "video_url": return "וידאו";
    case "exercise_list": return "רשימה";
    case "tabata": return "טבטה";
    default: return v;
  }
};

// Stacked-summary formatter — used by the row list under the chip
// grid. Each row renders [label][value]; this returns the value side
// with units. Accepts both internal ids (weight_kg, work_time) and
// the DB-side aliases (weight) so callers don't have to care.
const formatParamValue = (key, value) => {
  if (!hasVal(value)) return "";
  switch (key) {
    case "sets":          return `${value} סטים`;
    case "reps":          return `${value} חזרות`;
    case "rounds":        return `${value} סבבים`;
    case "work_time":              return fmtTime(value) || String(value);
    case "rest_time":              return `מנוחה ${fmtTime(value) || value}`;
    case "rest_between_sets":      return `מנ׳ סטים ${fmtTime(value) || value}`;
    case "rest_between_exercises": return `מנ׳ תרגילים ${fmtTime(value) || value}`;
    case "static_hold":            return `${fmtTime(value) || value} החזקה`;
    case "weight":
    case "weight_kg":     return `${value} ק"ג`;
    case "rpe":           return `RPE ${value}`;
    case "tempo":         return `טמפו ${value}`;
    case "body_position": return String(value);
    case "equipment":     return Array.isArray(value) ? value.join(", ") : String(value);
    case "side":          return String(value);
    case "grip":          return String(value);
    case "range_of_motion": return String(value);
    case "notes":         return "יש דגשים";
    case "video_url":     return "וידאו";
    default:              return String(value);
  }
};

// ── Default options for selection params ──────────────────────────────
const DEFAULTS = {
  body_position: ["עמידה", "ישיבה", "שכיבה על גב", "שכיבה על בטן", "שכיבה על צד", "תלייה", "תמיכה", "טבעות", "מקבילים", "פראלטים"],
  foot_position: ["צמוד", "רוחב כתפיים", "רחב", "רגל אחת (L/R)"],
  grip: ["צרה", "בינונית", "רחבה", "פרונציה", "סופינציה", "ניטרלית"],
  equipment: ["משקל גוף", "טבעות", "מתח", "מקבילים", "פראלטים", "Dream Machine", "משקולות יד"],
  range_of_motion: ["מלא", "חצי", "חלקי", "אקצנטרי בלבד", "איזומטרי"],
  side: ["דו־צדדי", "ימין", "שמאל", "לסירוגין"],
  load_type: ["משקל גוף", "משקל חיצוני", "גומיות", "טבעות"],
};

const DIALOG_TITLES = {
  body_position: "הוסף מנח גוף", foot_position: "הוסף מנח רגליים",
  grip: "הוסף סוג אחיזה", equipment: "הוסף ציוד",
  range_of_motion: "הוסף טווח תנועה", side: "הוסף צד", load_type: "הוסף סוג עומס",
};

// ══════════════════════════════════════════════════════════════════════
// INPUT COMPONENTS
// ══════════════════════════════════════════════════════════════════════

const TimeWheel = ({ value, max, onChange, label }) => {
  const pad = (n) => String(n).padStart(2, '0');
  const inc = () => onChange(value >= max ? 0 : value + 1);
  const dec = () => onChange(value <= 0 ? max : value - 1);

  return (
    <div className="flex flex-col items-center"
         style={{ minWidth: 56, textAlign: 'center', overflow: 'visible' }}>
      <button type="button" onClick={inc}
              className="flex items-center justify-center text-gray-300 hover:text-[#FF6F20] active:scale-90 transition-all"
              style={{ width: 36, height: 36 }}>
        <Plus size={14} strokeWidth={3} />
      </button>
      <input type="text" inputMode="numeric" value={pad(value)}
        onChange={(e) => { const n = parseInt(e.target.value) || 0; onChange(Math.min(max, Math.max(0, n))); }}
        className="text-center font-black border-2 border-gray-200 rounded-xl bg-white focus:border-[#FF6F20] focus:outline-none select-all"
        style={{ width: 56, height: 50, fontSize: 32, lineHeight: 1 }} />
      <button type="button" onClick={dec}
              className="flex items-center justify-center text-gray-300 hover:text-[#FF6F20] active:scale-90 transition-all"
              style={{ width: 36, height: 36 }}>
        <Minus size={14} strokeWidth={3} />
      </button>
      <span className="text-[9px] text-gray-400 font-bold mt-0.5">{label}</span>
    </div>
  );
};

const TimeUnitInput = ({ value, onChange }) => {
  const toSecs = (v) => {
    if (!v && v !== 0) return 0;
    if (typeof v === "string" && v.includes(":")) {
      const [m, s] = v.split(":").map(Number);
      return (m || 0) * 60 + (s || 0);
    }
    return parseInt(v) || 0;
  };
  const secs = toSecs(value);
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;

  const set = (m, s) => onChange(String(m * 60 + s));

  // Wrapper minWidth 160 so digits never get squeezed by the editor
  // panel chrome; overflow:visible so neither column gets clipped.
  return (
    <div className="flex flex-col items-center"
         style={{ minWidth: 160, padding: '16px 20px', overflow: 'visible' }}>
      <span className="text-[10px] text-gray-400 font-bold mb-1" dir="ltr">דקות : שניות</span>
      <div className="flex items-start justify-center gap-1" dir="ltr"
           style={{ overflow: 'visible' }}>
        <TimeWheel value={mins} max={59} onChange={(m) => set(m, remSecs)} label="min" />
        <span className="font-black text-gray-300"
              style={{ fontSize: 32, lineHeight: 1, marginTop: 38 }}>:</span>
        <TimeWheel value={remSecs} max={59} onChange={(s) => set(mins, s)} label="sec" />
      </div>
    </div>
  );
};

const WeightInput = ({ value, onChange }) => {
  const [unit, setUnit] = React.useState("kg");
  const kg = parseFloat(value) || 0;
  const display = unit === "lb" ? parseFloat((kg * 2.2046).toFixed(1)) : kg;
  const handleChange = (n) => onChange(String(unit === "lb" ? parseFloat(((parseFloat(n) || 0) / 2.2046).toFixed(2)) : parseFloat(n) || 0));

  return (
    <div className="flex items-center gap-1.5">
      <input type="number" min="0" step="0.5" value={display || ""} onChange={(e) => handleChange(e.target.value)}
        className="w-20 h-9 text-center text-sm font-bold border border-gray-200 rounded-lg bg-white focus:border-[#FF6F20] focus:outline-none" />
      <div className="flex rounded-lg overflow-hidden border border-gray-200">
        <button type="button" onClick={() => setUnit("kg")}
          className={`px-2.5 h-9 text-[11px] font-bold transition-colors ${unit === "kg" ? "bg-[#FF6F20] text-white" : "bg-white text-gray-500"}`}>ק"ג</button>
        <button type="button" onClick={() => setUnit("lb")}
          className={`px-2.5 h-9 text-[11px] font-bold transition-colors ${unit === "lb" ? "bg-[#FF6F20] text-white" : "bg-white text-gray-500"}`}>lb</button>
      </div>
    </div>
  );
};

const NumberStepper = ({ value, onChange }) => {
  const num = parseInt(value) || 0;
  return (
    <div className="flex items-center justify-center gap-3">
      <button type="button" onClick={() => onChange(String(Math.max(0, num - 1)))}
        className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-[#FF6F20] hover:border-[#FF6F20] active:scale-95 transition-all">
        <Minus size={16} strokeWidth={3} />
      </button>
      <input type="number" value={num || ""} onChange={(e) => onChange(e.target.value)} placeholder="0"
        className="w-16 h-10 text-center text-xl font-black border-none bg-transparent focus:outline-none text-gray-900" />
      <button type="button" onClick={() => onChange(String(num + 1))}
        className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-[#FF6F20] hover:border-[#FF6F20] active:scale-95 transition-all">
        <Plus size={16} strokeWidth={3} />
      </button>
    </div>
  );
};

const SelectionGrid = ({ options, value, onChange, onAdd }) => (
  <div className="flex flex-wrap gap-1.5">
    {options.map((opt) => (
      <button key={opt} type="button" onClick={() => onChange(opt === value ? "" : opt)}
        className={`px-2.5 py-2 rounded-lg text-[11px] font-bold border transition-all min-h-[36px]
          ${value === opt ? "bg-[#FF6F20] text-white border-[#FF6F20] shadow-sm" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"}`}>
        {opt}
      </button>
    ))}
    {onAdd && (
      <button type="button" onClick={onAdd}
        className="px-2.5 py-2 rounded-lg text-[11px] font-bold border border-dashed border-gray-300 text-gray-400 hover:text-[#FF6F20] hover:border-[#FF6F20] flex items-center gap-1 min-h-[36px]">
        <Plus size={10} /> חדש
      </button>
    )}
  </div>
);

const CompactSelect = ({ value, onChange, options, onAdd }) => (
  <Select value={value} onValueChange={(v) => v === "__ADD__" ? onAdd?.() : onChange(v)}>
    <SelectTrigger className="h-9 text-xs w-full bg-white border-gray-200 rounded-lg"><SelectValue placeholder="בחר..." /></SelectTrigger>
    <SelectContent dir="rtl">
      {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      {onAdd && <SelectItem value="__ADD__" className="font-bold text-[#FF6F20] border-t mt-1"><Plus size={12} className="inline mr-1" />הוסף...</SelectItem>}
    </SelectContent>
  </Select>
);

// ══════════════════════════════════════════════════════════════════════
// PARAM INPUT RENDERER
// ══════════════════════════════════════════════════════════════════════

function TempoInput({ value, onChange }) {
  // Parse the stored value into 4 cells. Supports both formats coaches
  // use: dashed "3-1-2-0" splits on '-', packed "3010" splits per
  // character. Anything else falls back to empty cells.
  const parts = (() => {
    if (!value) return ['', '', '', ''];
    const str = String(value).trim();
    let p = str.split('-').map(s => s.trim());
    if (p.length === 1 && /^\d{3,4}$/.test(p[0])) p = p[0].split('');
    return [p[0] || '', p[1] || '', p[2] || '', p[3] || ''];
  })();
  const labels = ['שלילי', 'החזקה למטה', 'חיובי', 'החזקה למעלה'];
  return (
    <div style={{ display: 'flex', gap: 8, direction: 'rtl' }}>
      {labels.map((label, i) => (
        <div key={i} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>{label}</div>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={parts[i]}
            onChange={(e) => {
              const next = [...parts];
              next[i] = e.target.value;
              // Drop trailing empties so "3-0--" doesn't get saved.
              while (next.length > 0 && (next[next.length - 1] === '' || next[next.length - 1] == null)) next.pop();
              onChange(next.length === 0 ? '' : next.join('-'));
            }}
            placeholder="0"
            style={{
              width: '100%', height: 40,
              border: '1px solid #F5E8D5', borderRadius: 10,
              textAlign: 'center', fontSize: 16, fontWeight: 500,
              background: '#FFFEFC', outline: 'none',
            }}
          />
        </div>
      ))}
    </div>
  );
}

// Spec-aligned defaults for the two chip-pickers introduced earlier.
// These are the FALLBACK lists when the user's localStorage doesn't
// have a custom set yet.
const BODY_POSITION_OPTIONS = [
  'עמידה', 'ישיבה', 'שכיבה על הגב', 'שכיבה על הבטן',
  'תלייה', 'ברכיים', 'צד ימין', 'צד שמאל', 'אחר',
];
const EQUIPMENT_OPTIONS = [
  'ללא ציוד', 'משקולות', 'מוט', 'קטלבל', 'גומיות', 'טבעות',
  'מקבילים', 'TRX', 'תיבה', 'כדור', 'מכונה', 'אחר',
];

// Params that get the full editable chip experience (chips +
// "ערוך רשימה" pencil that flips into per-row edit/delete + an
// "+ הוסף" inline at the bottom). Each entry maps to (defaults, multi).
const EDITABLE_PARAMS = {
  body_position:   { defaults: BODY_POSITION_OPTIONS, multi: false },
  equipment:       { defaults: EQUIPMENT_OPTIONS,     multi: true  },
  side:            { defaults: DEFAULTS.side,         multi: false },
  grip:            { defaults: DEFAULTS.grip,         multi: false },
  range_of_motion: { defaults: DEFAULTS.range_of_motion, multi: false },
};

const OPTIONS_STORAGE_PREFIX = 'athletigo_options_';

// localStorage-backed option list per paramId. Falls back to defaults
// when storage is empty, corrupt, or unavailable. Persisting writes the
// JSON immediately so a coach's edits survive a refresh.
function useOptionsList(paramId, defaults) {
  const [options, setOptionsState] = React.useState(() => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return defaults;
      const saved = window.localStorage.getItem(OPTIONS_STORAGE_PREFIX + paramId);
      const parsed = saved ? JSON.parse(saved) : null;
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaults;
    } catch {
      return defaults;
    }
  });
  const setOptions = React.useCallback((next) => {
    setOptionsState(next);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(OPTIONS_STORAGE_PREFIX + paramId, JSON.stringify(next));
      }
    } catch { /* quota exceeded etc. */ }
  }, [paramId]);
  return [options, setOptions];
}

// Display-mode chip pill — used by both the chip renderer and the
// non-edit view of EditableOptionSelector.
function ChipGrid({ options, selected, onToggle }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((opt) => {
        const isSel = Array.isArray(selected) ? selected.includes(opt) : selected === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            style={{
              padding: '8px 14px',
              borderRadius: 20,
              border: isSel ? 'none' : '1px solid #E5E7EB',
              background: isSel ? '#FF6F20' : 'white',
              color: isSel ? 'white' : '#374151',
              fontSize: 13,
              fontWeight: isSel ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// Reusable selector with persistent CRUD over its option list.
// `multi=true` stores the value as a comma-joined string so existing
// readers (ExerciseCard.buildMetaSegments) keep working unchanged.
function EditableOptionSelector({ paramId, value, onChange, defaults, multi = false }) {
  const [options, setOptions] = useOptionsList(paramId, defaults);
  const [editMode, setEditMode] = React.useState(false);
  const [newOption, setNewOption] = React.useState('');

  const selectedArr = multi
    ? String(value || '').split(',').map((s) => s.trim()).filter(Boolean)
    : (value ? [value] : []);

  const toggle = (opt) => {
    if (multi) {
      const next = selectedArr.includes(opt)
        ? selectedArr.filter((s) => s !== opt)
        : [...selectedArr, opt];
      onChange(next.join(', '));
    } else {
      onChange(value === opt ? '' : opt);
    }
  };

  const updateOption = (i, val) => {
    const next = options.slice();
    next[i] = val;
    setOptions(next);
  };

  const deleteOption = (i) => {
    if (options.length <= 1) return; // spec: min 1 must remain
    const removed = options[i];
    const next = options.filter((_, idx) => idx !== i);
    setOptions(next);
    // Spec: clear selection if the removed option was selected
    if (multi) {
      if (selectedArr.includes(removed)) {
        onChange(selectedArr.filter((s) => s !== removed).join(', '));
      }
    } else if (value === removed) {
      onChange('');
    }
  };

  const addOption = () => {
    const trimmed = newOption.trim();
    if (!trimmed || options.includes(trimmed)) {
      setNewOption('');
      return;
    }
    setOptions([...options, trimmed]);
    setNewOption('');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          style={{
            padding: '4px 10px',
            background: editMode ? '#FF6F20' : 'white',
            border: '1px solid ' + (editMode ? '#FF6F20' : '#E5E7EB'),
            borderRadius: 8,
            color: editMode ? 'white' : '#6B7280',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {editMode ? '✓ סיום עריכה' : '✏️ ערוך רשימה'}
        </button>
      </div>

      {!editMode ? (
        <ChipGrid
          options={options}
          selected={multi ? selectedArr : (value || '')}
          onToggle={toggle}
        />
      ) : (
        <div>
          {options.map((opt, i) => {
            const canDelete = options.length > 1;
            return (
              <div
                key={`${i}-${opt}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 0', borderBottom: '1px solid #F0E4D0',
                }}
              >
                <input
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    border: '1px solid #E5E7EB',
                    borderRadius: 8,
                    fontSize: 13,
                    direction: 'rtl',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  type="button"
                  onClick={() => deleteOption(i)}
                  disabled={!canDelete}
                  title={canDelete ? 'מחק' : 'לפחות אפשרות אחת חייבת להישאר'}
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    border: 'none',
                    background: canDelete ? '#FEE2E2' : '#F3F4F6',
                    color: canDelete ? '#DC2626' : '#9CA3AF',
                    fontSize: 16,
                    cursor: canDelete ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
              placeholder="הוסף אפשרות חדשה..."
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '2px solid #FF6F20',
                borderRadius: 8,
                fontSize: 13,
                direction: 'rtl',
                fontFamily: 'inherit',
                background: '#FFF9F0',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={addOption}
              style={{
                padding: '8px 16px',
                background: '#FF6F20',
                border: 'none',
                borderRadius: 8,
                color: 'white',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              + הוסף
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ParamInputRenderer({ paramId, value, onChange, getOptions, onAddCustom }) {
  // Editable chip-list params (body_position, equipment, side, grip,
  // range_of_motion). Each is backed by localStorage so the coach's
  // tweaks persist between sessions; defaults serve as the fallback.
  if (EDITABLE_PARAMS[paramId]) {
    const cfg = EDITABLE_PARAMS[paramId];
    return (
      <EditableOptionSelector
        paramId={paramId}
        value={value}
        onChange={onChange}
        defaults={cfg.defaults}
        multi={cfg.multi}
      />
    );
  }

  // Time params
  if (["work_time", "rest_time", "rest_between_sets", "rest_between_exercises", "static_hold"].includes(paramId))
    return <TimeUnitInput value={value} onChange={onChange} />;

  // Weight
  if (paramId === "weight_kg") return <WeightInput value={value} onChange={onChange} />;

  // RPE slider
  if (paramId === "rpe") {
    const rpeVal = Math.min(10, Math.max(1, parseInt(value) || 7));
    return (
      <div className="space-y-2 px-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">1 (קל)</span>
          <span className="text-xl font-black text-[#FF6F20]">{rpeVal}</span>
          <span className="text-xs text-gray-400">10 (מקס)</span>
        </div>
        <input type="range" min="1" max="10" step="1" value={rpeVal}
          onChange={(e) => onChange(e.target.value)}
          className="w-full accent-[#FF6F20] h-2.5 cursor-pointer" />
      </div>
    );
  }

  // Numeric (sets, reps, rounds)
  if (["sets", "reps", "rounds"].includes(paramId))
    return <NumberStepper value={value} onChange={onChange} />;

  // Tempo — 4 boxed number inputs (eccentric/bottom hold/concentric/top hold).
  // Stored as "X-Y-Z-W" so the reader (formatTempo in ExerciseCard)
  // splits cleanly. Empty cells trim from the end on save.
  if (paramId === "tempo") return <TempoInput value={value} onChange={onChange} />;

  // Selection params
  if (DEFAULTS[paramId]) {
    const opts = getOptions ? getOptions(paramId, DEFAULTS[paramId]) : DEFAULTS[paramId];
    if (opts.length <= 6) {
      return <SelectionGrid options={opts} value={value} onChange={onChange}
        onAdd={onAddCustom ? () => onAddCustom(paramId) : null} />;
    }
    return <CompactSelect value={value} onChange={onChange}
      options={opts.map((o) => ({ label: o, value: o }))}
      onAdd={onAddCustom ? () => onAddCustom(paramId) : null} />;
  }

  // Notes
  if (paramId === "notes")
    return <Textarea className="text-sm min-h-[60px] p-3 resize-none rounded-lg border-gray-200 focus:border-[#FF6F20]"
      value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="דגשים, הוראות ביצוע..." />;

  // Default text (video_url)
  return <Input className="h-9 text-sm rounded-lg border-gray-200 focus:border-[#FF6F20]"
    value={value || ""} onChange={(e) => onChange(e.target.value)}
    placeholder={paramId === "video_url" ? "https://..." : ""} />;
}

// ══════════════════════════════════════════════════════════════════════
// SUB-EXERCISE EDITOR
// ══════════════════════════════════════════════════════════════════════

function SubExerciseEditor({ subEx, index, onChange, onRemove, onDuplicate, getOptions, onAddCustom }) {
  const [editingParam, setEditingParam] = useState(null);
  const [confirmed, setConfirmed] = useState(() => {
    if (!subEx) return new Set();
    const s = new Set();
    SUB_PARAMS.forEach((p) => { if (hasVal(subEx[getDbField(p.id)])) s.add(p.id); });
    return s;
  });
  const [expanded, setExpanded] = useState(!subEx?.exercise_name);

  const update = (field, val) => onChange(index, { ...subEx, [field]: val });

  const handleConfirm = () => {
    if (!editingParam) return;
    const field = getDbField(editingParam);
    if (hasVal(subEx[field])) {
      setConfirmed((prev) => new Set([...prev, editingParam]));
    }
    setEditingParam(null);
  };

  const handleRemoveParam = (pid) => {
    setConfirmed((prev) => { const n = new Set(prev); n.delete(pid); return n; });
    update(getDbField(pid), null);
    if (editingParam === pid) setEditingParam(null);
  };

  const confirmedChips = [...confirmed]
    .map((pid) => getDisplay(pid, subEx[getDbField(pid)]))
    .filter(Boolean);

  const editDef = editingParam ? SUB_PARAMS.find((p) => p.id === editingParam) : null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50/50" onClick={() => setExpanded(!expanded)}>
        <span className="w-7 h-7 rounded-full bg-[#FF6F20] text-white text-[11px] font-black flex items-center justify-center flex-shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-gray-900 truncate">{subEx.exercise_name || "תת-תרגיל חדש"}</div>
          {!expanded && confirmedChips.length > 0 && (
            <div className="text-[10px] text-gray-400 truncate mt-0.5">{confirmedChips.join(" · ")}</div>
          )}
        </div>
        {onDuplicate && (
          <button onClick={(e) => { e.stopPropagation(); onDuplicate(index); }}
            title="שכפל"
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 flex-shrink-0 text-sm leading-none">
            📋
          </button>
        )}
        <button onClick={(e) => { e.stopPropagation(); onRemove(index); }}
          className="p-1.5 text-red-300 hover:text-red-500 rounded-lg hover:bg-red-50 flex-shrink-0">
          <Trash2 size={14} />
        </button>
        <ChevronDown size={14} className={`text-gray-300 transition-transform flex-shrink-0 ${expanded ? "rotate-180" : ""}`} />
      </div>

      {/* Body */}
      {expanded && (
        <div className="border-t border-gray-100 px-3 py-3 space-y-3">
          <input value={subEx.exercise_name || ""} onChange={(e) => update("exercise_name", e.target.value)}
            placeholder="שם תת-התרגיל" autoFocus={!subEx.exercise_name}
            className="w-full h-9 text-sm font-bold border-b-2 border-gray-100 bg-transparent focus:border-[#FF6F20] focus:outline-none px-1" />

          {/* Sub-exercise param grid — same 4-col layout as the main
              params row above so the form looks the same regardless of
              whether the user is editing a top-level exercise or a
              nested sub-exercise inside a container (tabata /
              exercise_list). marginBottom matches the main grid (16)
              so the rhythm is uniform across every entry point. */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
            marginBottom: 16,
          }}>
            {SUB_PARAMS.map((p) => {
              const isConf = confirmed.has(p.id);
              const isEdit = editingParam === p.id;
              const Icon = p.icon;
              const field = getDbField(p.id);
              return (
                <button key={p.id} type="button"
                  onClick={() => {
                    // Toggle: tapping the open tab closes it; tapping
                    // a closed tab opens it (and seeds a default when
                    // the field is unset). No "first tap is a no-op"
                    // path — every tap flips visibility.
                    if (isEdit) {
                      setEditingParam(null);
                      return;
                    }
                    setEditingParam(p.id);
                    if (!isConf && !hasVal(subEx[field]) && p.defaultValue && p.defaultValue !== "_container") {
                      update(field, String(p.defaultValue));
                    }
                  }}
                  className={`flex flex-col items-center gap-0.5 p-1 rounded-lg border h-[36px] transition-all text-[8px] font-bold leading-tight
                    ${isConf ? "border-green-200 bg-green-50 text-green-700" :
                      isEdit ? "border-[#FF6F20] bg-orange-50 text-[#FF6F20]" :
                      "border-gray-100 bg-gray-50/50 text-gray-400"}`}>
                  {isConf ? <Check size={8} strokeWidth={3} className="text-green-500" /> : <Icon size={8} />}
                  <span className="truncate w-full text-center">{isConf ? getDisplay(p.id, subEx[field]).slice(0, 8) : p.label}</span>
                </button>
              );
            })}
          </div>

          {/* Active input */}
          {editDef && (
            <div className="bg-orange-50/50 border border-[#FF6F20]/20 rounded-xl p-2.5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <editDef.icon size={12} className="text-[#FF6F20]" />
                  <span className="text-[11px] font-bold text-gray-700">{editDef.label}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => handleRemoveParam(editingParam)} className="p-1 text-red-400 hover:text-red-600 rounded"><X size={12} /></button>
                  <button type="button" onClick={handleConfirm}
                    className="w-7 h-7 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-sm active:scale-95">
                    <Check size={12} strokeWidth={3} />
                  </button>
                </div>
              </div>
              <div style={{ overflow: 'visible' }}>
                <ParamInputRenderer paramId={editingParam} value={subEx[getDbField(editingParam)]}
                  onChange={(v) => update(getDbField(editingParam), v)} getOptions={getOptions} onAddCustom={onAddCustom} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN FORM
// ══════════════════════════════════════════════════════════════════════

function ExerciseNameInput({ value, onChange }) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => { setQuery(value); }, [value]);

  const handleChange = (e) => {
    const v = e.target.value;
    setQuery(v);
    onChange(v, null);
    const results = searchExercises(v);
    setSuggestions(results);
    setShowSuggestions(results.length > 0);
  };

  const selectSuggestion = (ex) => {
    setQuery(ex.name);
    onChange(ex.name, ex);
    setShowSuggestions(false);
  };

  return (
    <div className="mb-4 px-1 relative">
      <label className="text-[10px] font-black text-gray-400 mb-1 block uppercase tracking-wider">שם התרגיל</label>
      <input value={query} onChange={handleChange} onFocus={() => { if (suggestions.length) setShowSuggestions(true); }}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder="הקלד שם תרגיל..." autoFocus
        className="w-full h-11 text-base font-black border-b-2 border-gray-200 bg-transparent focus:border-[#FF6F20] focus:outline-none px-1 transition-colors placeholder:text-gray-300" />
      {showSuggestions && (
        <div className="absolute left-0 right-0 top-full z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto" dir="rtl">
          {suggestions.map(ex => (
            <div key={ex.id} onMouseDown={() => selectSuggestion(ex)}
              className="px-3 py-2 hover:bg-orange-50 cursor-pointer border-b border-gray-50 last:border-0">
              <div className="font-bold text-sm text-gray-900">{ex.name}</div>
              <div className="text-[10px] text-gray-400">{ex.category}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ModernExerciseForm({ exercise, onChange, readOnly = false }) {
  // Set of currently-open param panels. Tapping a tab toggles its
  // entry in this set; multiple panels can be open simultaneously.
  // Closing a panel auto-confirms the value if one is set, so the
  // chip flips to its orange "saved" state without an extra click.
  const [editingParams, setEditingParams] = useState(() => new Set());
  const [confirmedParams, setConfirmedParams] = useState(new Set());
  const [addValueDialog, setAddValueDialog] = useState({ isOpen: false, type: null, label: "" });

  const queryClient = useQueryClient();

  // ── Draft persistence ─────────────────────────────────────────────────
  // Save in-progress edits to localStorage on every change so an
  // accidental refresh, swipe-back, or tab close doesn't wipe a long
  // exercise edit. Keyed by exercise.id (or 'new') + plan id. TTL 7
  // days. Hydrated once on mount when a fresher draft exists.
  const draftKey = `exercise_draft_${exercise?.id || 'new'}_${exercise?.training_plan_id || 'unknown'}`;

  useEffect(() => {
    if (!exercise || (!exercise.id && !exercise.training_plan_id)) return;
    try {
      const payload = { ...exercise, _savedAt: Date.now() };
      localStorage.setItem(draftKey, JSON.stringify(payload));
    } catch {}
  }, [exercise, draftKey]);

  useEffect(() => {
    if (!exercise) return;
    try {
      const saved = localStorage.getItem(draftKey);
      if (!saved) return;
      const draft = JSON.parse(saved);
      const age = Date.now() - (draft._savedAt || 0);
      if (age > 7 * 24 * 3600000) {
        localStorage.removeItem(draftKey);
        return;
      }
      // If the DB row is newer than the draft, the parent already
      // saved successfully; drop the draft so we don't resurrect
      // stale edits.
      const dbStamp = exercise.updated_at ? new Date(exercise.updated_at).getTime() : 0;
      if (dbStamp > (draft._savedAt || 0)) {
        localStorage.removeItem(draftKey);
        return;
      }
      delete draft._savedAt;
      onChange({ ...exercise, ...draft });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateEx = useCallback((field, value) => {
    onChange({ ...exercise, [field]: value });
  }, [exercise, onChange]);

  // ── Custom Parameters ───────────────────────────────────────────────
  const { data: customParams = [] } = useQuery({
    queryKey: ["custom-parameters"],
    queryFn: async () => {
      try {
        const coach = await base44.auth.me();
        if (!coach || (!coach.isCoach && coach.role !== "admin")) return [];
        return await base44.entities.CustomParameter.filter({ created_by: coach.id });
      } catch { return []; }
    },
    initialData: [],
  });

  const createCustomParamMutation = useMutation({
    mutationFn: async ({ type, value }) => {
      const coach = await base44.auth.me();
      return await base44.entities.CustomParameter.create({ created_by: coach.id, category: type, name: type, value });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["custom-parameters"] });
      setAddValueDialog({ isOpen: false, type: null, label: "" });
      toast.success("ערך חדש נוסף");
      const field = getDbField(variables.type);
      updateEx(field, variables.value);
    },
    onError: () => toast.error("שגיאה בשמירת הערך"),
  });

  const getOptions = useCallback((type, defaults) => {
    const custom = customParams.filter((p) => (p.category || p.parameter_type) === type).map((p) => p.value);
    const unique = defaults.filter((d) => !custom.some((c) => c.toLowerCase() === d.toLowerCase()));
    return [...unique, ...custom];
  }, [customParams]);

  const handleAddCustom = (paramId) => {
    setAddValueDialog({ isOpen: true, type: paramId, label: DIALOG_TITLES[paramId] || "הוסף ערך" });
  };

  const handleSaveCustomValue = (value) => {
    const type = addValueDialog.type;
    if (!type) return;
    const allOpts = getOptions(type, DEFAULTS[type] || []);
    const exists = allOpts.find((o) => o.toLowerCase() === value.toLowerCase());
    if (exists) {
      toast.info("הערך כבר קיים");
      setAddValueDialog({ isOpen: false, type: null, label: "" });
      updateEx(getDbField(type), exists);
      return;
    }
    createCustomParamMutation.mutate({ type, value });
  };

  // ── Initialize confirmed params from existing exercise ─────────────
  useEffect(() => {
    const conf = new Set();
    ALL_PARAMETERS.forEach((p) => {
      if (CONTAINER_PARAMS.has(p.id)) return;
      const field = getDbField(p.id);
      if (hasVal(exercise[field])) conf.add(p.id);
    });
    // Detect container from existing data. The DB column for children
    // exercises is `children` (canonical) but legacy/migration data
    // may live under `sub_exercises` or `exercise_list` — check all
    // shapes so the edit form hydrates regardless of where the row's
    // children are stored.
    const existingChildren =
      exercise.sub_exercises ||
      exercise.children ||
      exercise.exercise_list ||
      null;
    if (Array.isArray(existingChildren) && existingChildren.length > 0) {
      // Mirror onto sub_exercises so the rest of the form can read a
      // single canonical key without further branching.
      if (existingChildren !== exercise.sub_exercises) {
        onChange({ ...exercise, sub_exercises: existingChildren });
      }
      if (exercise.mode === "טבטה") conf.add("tabata");
      else conf.add("exercise_list");
    } else if (exercise.tabata_data) {
      try {
        const parsed = typeof exercise.tabata_data === "string" ? JSON.parse(exercise.tabata_data) : exercise.tabata_data;
        if (parsed.sub_exercises) {
          onChange({ ...exercise, sub_exercises: parsed.sub_exercises });
          conf.add(parsed.container_type === "tabata" ? "tabata" : "exercise_list");
        } else if (parsed.blocks) {
          const subs = [];
          (parsed.blocks || []).forEach((block) => {
            (block.block_exercises || []).forEach((ex) => {
              subs.push({ id: ex.id || String(Date.now() + Math.random()), exercise_name: ex.name });
            });
          });
          if (subs.length > 0) {
            onChange({ ...exercise, sub_exercises: subs });
            conf.add("tabata");
          }
        }
      } catch {}
    }
    // Legacy superset/combo exercises
    if (!conf.has("exercise_list") && !conf.has("tabata")) {
      const legacy = exercise.superset_exercises || exercise.combo_exercises;
      if (Array.isArray(legacy) && legacy.length > 0) {
        const subs = legacy.map((e) => ({
          id: String(Date.now() + Math.random()),
          exercise_name: e.name || "",
          reps: e.valueType === "reps" ? e.value : null,
          work_time: e.valueType === "time" ? e.value : null,
        }));
        onChange({ ...exercise, sub_exercises: subs });
        conf.add("exercise_list");
      }
    }
    setConfirmedParams(conf);
    // Re-hydrate when the parent swaps in a different exercise. Without
    // this, opening exercise B after editing A would keep A's chip set
    // (the [] deps version only fired once per mount). Container fields
    // are still hydrated above; this keeps the cycle stable per id.
  }, [exercise?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isContainer = confirmedParams.has("exercise_list") || confirmedParams.has("tabata");
  const containerType = confirmedParams.has("tabata") ? "tabata" : confirmedParams.has("exercise_list") ? "list" : null;
  // Read through every legacy shape so the editor never lands on []
  // when the row was saved with `children` (current DB column) or
  // `exercise_list` (older). The hydration effect above also mirrors
  // these onto sub_exercises so writes go through one canonical path.
  const subExercises =
    exercise.sub_exercises ||
    exercise.children ||
    exercise.exercise_list ||
    [];

  // Auto-set mode based on container
  useEffect(() => {
    let mode = "חזרות";
    if (confirmedParams.has("tabata")) mode = "טבטה";
    else if (confirmedParams.has("exercise_list")) mode = "סופרסט";
    if (exercise.mode !== mode) updateEx("mode", mode);
  }, [confirmedParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill defaults for any confirmed param that's still empty.
  // Triggers on every confirmedParams change. Container params and
  // params with empty/sentinel default ('', '_container') are skipped.
  // All updates batched into a single onChange to avoid the
  // updateEx-from-stale-closure overwrite race.
  useEffect(() => {
    const updates = {};
    let needsUpdate = false;
    ALL_PARAMETERS.forEach(param => {
      if (!confirmedParams.has(param.id)) return;
      const dbField = getDbField(param.id);
      const cur = exercise[dbField];
      if (cur != null && cur !== '') return;
      if (param.defaultValue == null || param.defaultValue === '' || param.defaultValue === '_container') return;
      updates[dbField] = String(param.defaultValue);
      needsUpdate = true;
    });
    if (needsUpdate) {
      onChange({ ...exercise, ...updates });
    }
  }, [confirmedParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Param handlers ──────────────────────────────────────────────────
  const handleParamClick = (paramId) => {
    // Container params (tabata / exercise_list) keep their existing
    // confirm-on-click behavior — they don't expose an inline editor
    // panel so they shouldn't enter the editingParams set.
    if (CONTAINER_PARAMS.has(paramId)) {
      if (confirmedParams.has(paramId)) {
        setConfirmedParams((prev) => { const n = new Set(prev); n.delete(paramId); return n; });
        updateEx("sub_exercises", []);
      } else {
        const other = paramId === "tabata" ? "exercise_list" : "tabata";
        setConfirmedParams((prev) => {
          const n = new Set(prev); n.delete(other); n.add(paramId); return n;
        });
        if (!subExercises.length) updateEx("sub_exercises", []);
      }
      setEditingParams((prev) => { const n = new Set(prev); n.delete(paramId); return n; });
      return;
    }

    setEditingParams((prev) => {
      const n = new Set(prev);
      if (n.has(paramId)) {
        // Tab is open → close + auto-confirm if a value is present.
        n.delete(paramId);
        const field = getDbField(paramId);
        if (
          hasVal(exercise[field])
          || ["notes", "equipment", "grip", "video_url"].includes(paramId)
        ) {
          setConfirmedParams((c) => new Set([...c, paramId]));
        }
      } else {
        // Tab is closed → open it + seed default if no value yet.
        n.add(paramId);
        const field = getDbField(paramId);
        if (!confirmedParams.has(paramId) && !hasVal(exercise[field])) {
          const param = ALL_PARAMETERS.find((p) => p.id === paramId);
          if (param?.defaultValue && param.defaultValue !== "_container") {
            updateEx(field, String(param.defaultValue));
          }
        }
      }
      return n;
    });
  };

  // X button inside an open panel — closes only that panel, auto-
  // confirming whatever value is in the exercise object so the chip
  // flips to its saved state.
  const handleClosePanel = (paramId) => {
    setEditingParams((prev) => { const n = new Set(prev); n.delete(paramId); return n; });
    const field = getDbField(paramId);
    if (
      hasVal(exercise[field])
      || ["notes", "equipment", "grip", "video_url"].includes(paramId)
    ) {
      setConfirmedParams((prev) => new Set([...prev, paramId]));
    }
  };

  const handleRemoveParam = (paramId) => {
    // Explicit "clear" — null the underlying field value so the chip
    // returns to its empty state (no orange tint, no dot indicator,
    // no row in the summary list). Closes the panel and drops the
    // confirmed badge. Triggered by the red X in the panel header
    // and by the "✕ נקה" button in the panel footer.
    if (!CONTAINER_PARAMS.has(paramId)) {
      const field = getDbField(paramId);
      updateEx(field, null);
    }
    setConfirmedParams((prev) => { const n = new Set(prev); n.delete(paramId); return n; });
    setEditingParams((prev) => { const n = new Set(prev); n.delete(paramId); return n; });
  };

  // ── Sub-exercise handlers ───────────────────────────────────────────
  const addSubExercise = () => {
    const subs = [...subExercises, { id: String(Date.now()), exercise_name: "" }];
    updateEx("sub_exercises", subs);
  };

  const updateSubExercise = (i, data) => {
    const subs = [...subExercises];
    subs[i] = data;
    updateEx("sub_exercises", subs);
  };

  const removeSubExercise = (i) => {
    updateEx("sub_exercises", subExercises.filter((_, idx) => idx !== i));
  };

  // dnd-kit setup for the sub-exercise list. Same PointerSensor +
  // 5px activation distance as PlanBuilder's section reorder, so a
  // tap on duplicate/delete buttons inside the row never accidentally
  // initiates a drag.
  const subSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleSubDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = subExercises.findIndex(s => s.id === active.id);
    const newIdx = subExercises.findIndex(s => s.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    updateEx("sub_exercises", arrayMove(subExercises, oldIdx, newIdx));
  };

  const duplicateSubExercise = (i) => {
    const original = subExercises[i];
    if (!original) return;
    const clone = {
      ...original,
      id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
      exercise_name: (original.exercise_name || "") + " (עותק)",
    };
    updateEx("sub_exercises", [
      ...subExercises.slice(0, i + 1),
      clone,
      ...subExercises.slice(i + 1),
    ]);
  };

  // Open-panel descriptors (skipping container params, which don't
  // render an inline editor). Order follows ALL_PARAMETERS so the
  // panels stack in the same visual order as the chip grid.
  const openParamDefs = ALL_PARAMETERS.filter(
    (p) => editingParams.has(p.id) && !CONTAINER_PARAMS.has(p.id)
  );

  // Stacked summary rows — one row per populated parameter, drawn
  // under the chip grid. Default order follows ALL_PARAMETERS, but
  // the coach can drag any row to reorder; the resulting param-id
  // list is persisted to exercises.param_order so the trainee's
  // ExerciseCard meta line renders the same way.
  const buildRow = (paramId) => {
    const def = ALL_PARAMETERS.find((p) => p.id === paramId);
    if (!def || CONTAINER_PARAMS.has(paramId)) return null;
    const val = exercise[getDbField(paramId)];
    if (!hasVal(val)) return null;
    const formatted = formatParamValue(paramId, val);
    if (!formatted) return null;
    return { id: paramId, label: def.label, value: formatted };
  };

  const filledIds = ALL_PARAMETERS
    .filter((p) => !CONTAINER_PARAMS.has(p.id) && hasVal(exercise[getDbField(p.id)]))
    .map((p) => p.id);

  const savedOrder = Array.isArray(exercise.param_order)
    ? exercise.param_order.filter((id) => filledIds.includes(id))
    : [];
  const orderedIds = [
    ...savedOrder,
    ...filledIds.filter((id) => !savedOrder.includes(id)),
  ];
  const summaryRows = orderedIds.map(buildRow).filter(Boolean);

  // HTML5 drag handlers — refs (not state) so cross-row hover events
  // don't trigger renders during the drag. Touch-screen drag-and-drop
  // is best-effort; HTML5 DnD has known mobile gaps but we avoid the
  // dnd-kit dependency the spec asked us to skip.
  const dragItemRef = useRef(null);
  const dragOverRef = useRef(null);

  const handleParamDragStart = (paramId) => { dragItemRef.current = paramId; };
  const handleParamDragEnter = (paramId) => { dragOverRef.current = paramId; };
  const handleParamDragEnd = () => {
    const from = dragItemRef.current;
    const to = dragOverRef.current;
    dragItemRef.current = null;
    dragOverRef.current = null;
    if (!from || !to || from === to) return;
    const next = [...orderedIds];
    const fromIdx = next.indexOf(from);
    const toIdx = next.indexOf(to);
    if (fromIdx === -1 || toIdx === -1) return;
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, from);
    updateEx('param_order', next);
  };

  // ── RENDER ──────────────────────────────────────────────────────────
  return (
    <div className="w-full" dir="rtl">

      {/* ── Name with autocomplete (read-only renders static text) ─ */}
      {readOnly ? (
        <div style={{ padding: '0 4px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#9CA3AF', marginBottom: 4, letterSpacing: 1 }}>
            שם התרגיל
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>
            {exercise.exercise_name || exercise.name || ''}
          </div>
        </div>
      ) : (
        <ExerciseNameInput value={exercise.exercise_name || ""} onChange={(name, libEx) => {
          updateEx("exercise_name", name);
          if (libEx?.defaultParams) {
            Object.entries(libEx.defaultParams).forEach(([k, v]) => updateEx(k, String(v)));
          }
        }} />
      )}

      {/* ── Parameters Grid — 4-col wrap so every param is visible ── */}
      <div className="mb-3 px-1">
        <label className="text-[10px] font-black text-gray-400 mb-2 block uppercase tracking-wider">פרמטרים</label>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          marginBottom: 16,
        }}>
          {ALL_PARAMETERS.map((p) => {
            const isCont = CONTAINER_PARAMS.has(p.id);
            const isConf = confirmedParams.has(p.id);
            const isEdit = editingParams.has(p.id);
            const Icon = p.icon;
            const field = getDbField(p.id);
            const val = exercise[field];

            // Three visual states preserved from the previous design:
            // idle (gray), confirmed-but-not-editing (orange tint), and
            // currently editing (solid orange selected). Confirmed shows
            // the saved value instead of the label.
            let bg = 'white';
            let color = '#6B7280';
            let border = '1px solid #E5E7EB';
            if (isEdit) {
              bg = '#FF6F20'; color = 'white'; border = 'none';
            } else if (isConf) {
              bg = '#FFF7ED'; color = '#FF6F20'; border = '1px solid #FF6F20';
            }

            return (
              <button key={p.id} type="button"
                onClick={readOnly ? undefined : () => handleParamClick(p.id)}
                disabled={readOnly}
                style={{
                  position: 'relative',
                  padding: '8px 4px',
                  borderRadius: 8,
                  border,
                  background: bg,
                  color,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: readOnly ? 'default' : 'pointer',
                  textAlign: 'center',
                  minHeight: 56,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                }}
                className={readOnly ? '' : 'active:scale-[0.97] transition-all'}
              >
                {/* Saved-but-closed indicator dot — drawn on top-left
                    so it's visible regardless of the chip's two-row
                    inner layout. Hidden while the panel is open
                    (the solid orange chip already conveys focus). */}
                {isConf && !isEdit && !isCont && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute', top: 3, left: 3,
                      width: 5, height: 5, borderRadius: '50%',
                      background: '#FF6F20',
                    }}
                  />
                )}
                {isConf && !isEdit && !isCont ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Check size={12} strokeWidth={3} />
                      <Icon size={13} />
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, lineHeight: 1.1,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}>
                      {getDisplay(p.id, val) || p.label}
                    </span>
                  </>
                ) : (
                  <>
                    <Icon size={17} strokeWidth={2} />
                    <span style={{
                      fontSize: 12, fontWeight: 700, lineHeight: 1.1,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}>
                      {p.label}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Stacked summary rows — one row per populated parameter,
            drawn under the chip grid. Each row shows the param label
            (orange) and its formatted value (dark) so the coach can
            scan the prescription at a glance regardless of how many
            panels are open. Same order as the chip grid. ───── */}
      {!readOnly && summaryRows.length > 0 && (
        <div style={{
          marginTop: 0,
          marginBottom: 12,
          padding: '0 4px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          direction: 'rtl',
        }}>
          {summaryRows.map((row) => (
            <div
              key={row.id}
              draggable
              onDragStart={() => handleParamDragStart(row.id)}
              onDragEnter={() => handleParamDragEnter(row.id)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={handleParamDragEnd}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                background: '#FFF5EE',
                borderRadius: 8,
                border: '1px solid #FFE5D0',
                cursor: 'grab',
                userSelect: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span aria-hidden style={{ color: '#ccc', fontSize: 16, cursor: 'grab' }}>⠿</span>
                <span style={{ fontSize: 14, color: '#FF6F20', fontWeight: 600 }}>
                  {row.label}
                </span>
              </div>
              <span style={{ fontSize: 14, color: '#1a1a1a', fontWeight: 700 }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Open Param Panels — one per entry in editingParams,
            stacked in ALL_PARAMETERS order. The X button closes a
            single panel without clearing its value (handleClosePanel
            auto-confirms). The trash button clears the saved value
            and closes the panel. ───── */}
      {!readOnly && openParamDefs.map((def) => (
        <div
          key={def.id}
          className="mx-1 mb-3 bg-white border-2 border-[#FF6F20]/30 rounded-2xl overflow-hidden shadow-lg"
        >
          <div className="bg-[#FFF7ED] px-3 py-2.5 flex items-center justify-between border-b border-[#FF6F20]/10">
            <div className="flex items-center gap-2">
              <def.icon size={16} className="text-[#FF6F20]" />
              <span className="text-sm font-black text-gray-800">{def.label}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleRemoveParam(def.id)}
                aria-label="הסר פרמטר"
                title="הסר פרמטר"
                className="w-8 h-8 rounded-full flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50"
              >
                <X size={14} />
              </button>
              <button
                type="button"
                onClick={() => handleClosePanel(def.id)}
                aria-label="סגור פאנל"
                title="סגור פאנל"
                className="w-10 h-10 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-md active:scale-95 transition-all"
              >
                <Check size={18} strokeWidth={3} />
              </button>
            </div>
          </div>
          <div className="p-3" style={{ overflow: 'visible' }}>
            <ParamInputRenderer
              paramId={def.id}
              value={exercise[getDbField(def.id)]}
              onChange={(v) => updateEx(getDbField(def.id), v)}
              getOptions={getOptions}
              onAddCustom={handleAddCustom}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 8 }}>
              <button
                type="button"
                onClick={() => handleRemoveParam(def.id)}
                style={{
                  padding: '4px 10px',
                  background: 'none',
                  border: '1px solid #E5E7EB',
                  borderRadius: 6,
                  fontSize: 11,
                  color: '#9CA3AF',
                  cursor: 'pointer',
                }}
              >
                ✕ נקה
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* ── Container: Sub-Exercises (read-only collapses to a
            numbered list; edit mode keeps DnD + add button) ──── */}
      {isContainer && readOnly && subExercises.length > 0 && (
        <div style={{ margin: '0 4px 16px' }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 8, fontWeight: 600, letterSpacing: 0.5 }}>
            {containerType === "tabata" ? "תרגילי טבטה" : "תרגילים ברשימה"}
          </div>
          {subExercises.map((sub, i) => (
            <div key={sub.id || i} style={{
              fontSize: 14, color: '#1a1a1a', padding: '8px 0',
              borderBottom: i < subExercises.length - 1 ? '1px solid #F5E8D5' : 'none',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{
                width: 26, height: 26, borderRadius: '50%', background: '#FFF5EE',
                border: '1px solid #FFD9C2', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 12, color: '#FF6F20', fontWeight: 700, flexShrink: 0,
              }}>{i + 1}</span>
              {typeof sub === 'string' ? sub : (sub.name || sub.exercise_name || '')}
            </div>
          ))}
        </div>
      )}
      {isContainer && !readOnly && (
        <div className="mx-1 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-[2px] flex-1 bg-[#FF6F20]/30 rounded-full" />
            <span className="text-xs font-black text-gray-700">
              {containerType === "tabata" ? "תרגילי טבטה" : "תתי-תרגילים"}
            </span>
            <div className="h-[2px] flex-1 bg-[#FF6F20]/30 rounded-full" />
          </div>

          <div className="space-y-2 mb-3">
            {subExercises.length > 0 && (
              <DndContext
                sensors={subSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleSubDragEnd}
              >
                <SortableContext
                  items={subExercises.map(s => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {subExercises.map((sub, i) => (
                    <SortableSubExerciseRow key={sub.id} id={sub.id}>
                      <SubExerciseEditor
                        subEx={sub} index={i}
                        onChange={updateSubExercise} onRemove={removeSubExercise}
                        onDuplicate={duplicateSubExercise}
                        getOptions={getOptions} onAddCustom={handleAddCustom}
                      />
                    </SortableSubExerciseRow>
                  ))}
                </SortableContext>
              </DndContext>
            )}
            {subExercises.length === 0 && (
              <div className="text-center py-6 text-gray-300 text-xs bg-gray-50 rounded-xl border border-dashed border-gray-200">
                אין תתי-תרגילים עדיין
              </div>
            )}
          </div>

          <button type="button" onClick={addSubExercise}
            className="w-full h-12 rounded-xl border-2 border-dashed border-[#FF6F20]/40 text-[#FF6F20] font-bold text-sm flex items-center justify-center gap-2 hover:bg-orange-50 hover:border-[#FF6F20] transition-all active:scale-[0.98]">
            <Plus size={16} /> הוסף תת-תרגיל
          </button>
        </div>
      )}

      {/* Custom Value Dialog — only relevant when editing */}
      {!readOnly && (
        <AddCustomValueDialog
          isOpen={addValueDialog.isOpen}
          onClose={() => setAddValueDialog({ ...addValueDialog, isOpen: false })}
          title={addValueDialog.label}
          onSave={handleSaveCustomValue}
          isLoading={createCustomParamMutation.isPending}
        />
      )}
    </div>
  );
}
