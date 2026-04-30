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
  { id: "tempo",                  label: "טמפו",             icon: ICONS.tempo,     defaultValue: "3010" },
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
const DB_MAP = {
  reps: "reps", weight_kg: "weight", load_type: "weight_type",
  foot_position: "leg_position", static_hold: "static_hold_time",
  notes: "description", tabata: "tabata_blocks",
};
const getDbField = (paramId) => DB_MAP[paramId] || paramId;

// ── Value Helpers ─────────────────────────────────────────────────────
const hasVal = (v) => {
  if (v === null || v === undefined || v === "" || v === "0") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
};

const fmtTime = (v) => {
  if (!v && v !== 0) return null;
  const n = parseInt(v);
  if (isNaN(n) || n === 0) return null;
  if (n % 60 === 0) return `${n / 60} דק׳`;
  return n < 60 ? `${n} שנ׳` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
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
    <div className="flex flex-col items-center w-14">
      <button type="button" onClick={inc} className="w-10 h-7 flex items-center justify-center text-gray-300 hover:text-[#FF6F20] active:scale-90 transition-all">
        <Plus size={14} strokeWidth={3} />
      </button>
      <input type="text" inputMode="numeric" value={pad(value)}
        onChange={(e) => { const n = parseInt(e.target.value) || 0; onChange(Math.min(max, Math.max(0, n))); }}
        className="w-14 h-11 text-center text-2xl font-black border-2 border-gray-200 rounded-xl bg-white focus:border-[#FF6F20] focus:outline-none select-all" />
      <button type="button" onClick={dec} className="w-10 h-7 flex items-center justify-center text-gray-300 hover:text-[#FF6F20] active:scale-90 transition-all">
        <Minus size={14} strokeWidth={3} />
      </button>
      <span className="text-[8px] text-gray-400 font-bold mt-0.5">{label}</span>
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

  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] text-gray-400 font-bold mb-1" dir="ltr">דקות : שניות</span>
      <div className="flex items-start justify-center gap-0.5" dir="ltr">
        <TimeWheel value={mins} max={59} onChange={(m) => set(m, remSecs)} label="min" />
        <span className="text-2xl font-black text-gray-300 mt-2.5 mx-0.5">:</span>
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

function ParamInputRenderer({ paramId, value, onChange, getOptions, onAddCustom }) {
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

  // Default text (tempo, video_url)
  return <Input className="h-9 text-sm rounded-lg border-gray-200 focus:border-[#FF6F20]"
    value={value || ""} onChange={(e) => onChange(e.target.value)}
    placeholder={paramId === "tempo" ? "לדוגמה: 3010" : paramId === "video_url" ? "https://..." : ""} />;
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

          {/* Mini param grid */}
          <div className="grid grid-cols-5 gap-1">
            {SUB_PARAMS.map((p) => {
              const isConf = confirmed.has(p.id);
              const isEdit = editingParam === p.id;
              const Icon = p.icon;
              const field = getDbField(p.id);
              return (
                <button key={p.id} type="button"
                  onClick={() => {
                    if (isEdit) return;
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
              <ParamInputRenderer paramId={editingParam} value={subEx[getDbField(editingParam)]}
                onChange={(v) => update(getDbField(editingParam), v)} getOptions={getOptions} onAddCustom={onAddCustom} />
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

export default function ModernExerciseForm({ exercise, onChange }) {
  const [editingParam, setEditingParam] = useState(null);
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Param handlers ──────────────────────────────────────────────────
  const handleParamClick = (paramId) => {
    // Double-click on currently editing param → remove it
    if (editingParam === paramId) {
      handleRemoveParam(paramId);
      return;
    }

    // Click on confirmed param → re-open for editing (existing behavior)
    // Click on unconfirmed param → start editing (existing behavior)

    // Container params: toggle & confirm immediately
    if (CONTAINER_PARAMS.has(paramId)) {
      if (confirmedParams.has(paramId)) {
        // Remove container
        setConfirmedParams((prev) => { const n = new Set(prev); n.delete(paramId); return n; });
        updateEx("sub_exercises", []);
      } else {
        // Remove the OTHER container first
        const other = paramId === "tabata" ? "exercise_list" : "tabata";
        setConfirmedParams((prev) => { const n = new Set(prev); n.delete(other); n.add(paramId); return n; });
        if (!subExercises.length) updateEx("sub_exercises", []);
      }
      setEditingParam(null);
      return;
    }

    setEditingParam(paramId);
    const field = getDbField(paramId);
    if (!confirmedParams.has(paramId) && !hasVal(exercise[field])) {
      const param = ALL_PARAMETERS.find((p) => p.id === paramId);
      if (param?.defaultValue && param.defaultValue !== "_container") {
        updateEx(field, String(param.defaultValue));
      }
    }
  };

  const handleConfirm = () => {
    if (!editingParam) return;
    const field = getDbField(editingParam);
    if (hasVal(exercise[field]) || ["notes", "equipment", "grip", "video_url"].includes(editingParam)) {
      setConfirmedParams((prev) => new Set([...prev, editingParam]));
      setEditingParam(null);
    } else {
      toast.error("נא למלא ערך לפני אישור");
    }
  };

  const handleRemoveParam = (paramId) => {
    // Toggle visibility only — the underlying value stays in the
    // exercise object so re-tapping the param restores what the
    // coach already typed. The save flow writes every populated
    // field; "hidden" params with values get persisted harmlessly.
    setConfirmedParams((prev) => { const n = new Set(prev); n.delete(paramId); return n; });
    if (editingParam === paramId) setEditingParam(null);
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

  const editDef = editingParam ? ALL_PARAMETERS.find((p) => p.id === editingParam) : null;

  // ── RENDER ──────────────────────────────────────────────────────────
  return (
    <div className="w-full" dir="rtl">

      {/* ── Name with autocomplete ───────────────────────────── */}
      <ExerciseNameInput value={exercise.exercise_name || ""} onChange={(name, libEx) => {
        updateEx("exercise_name", name);
        if (libEx?.defaultParams) {
          Object.entries(libEx.defaultParams).forEach(([k, v]) => updateEx(k, String(v)));
        }
      }} />

      {/* ── Parameters Grid — ALL params, always visible ──────── */}
      <div className="mb-3 px-1">
        <label className="text-[10px] font-black text-gray-400 mb-2 block uppercase tracking-wider">פרמטרים</label>
        <div className="grid grid-cols-4 gap-1.5">
          {ALL_PARAMETERS.map((p) => {
            const isCont = CONTAINER_PARAMS.has(p.id);
            const isConf = confirmedParams.has(p.id);
            const isEdit = editingParam === p.id;
            const Icon = p.icon;
            const field = getDbField(p.id);
            const val = exercise[field];

            return (
              <button key={p.id} type="button" onClick={() => handleParamClick(p.id)}
                className={`flex flex-col items-center justify-center gap-0.5 p-1.5 rounded-xl border h-[54px] transition-all active:scale-[0.97]
                  ${isConf && !isEdit
                    ? (isCont
                      ? "border-[#FF6F20] bg-[#FFF7ED] text-[#FF6F20] shadow-md ring-1 ring-[#FF6F20]/30"
                      : "border-[#FF6F20]/40 bg-[#FFF3E0] text-[#FF6F20]")
                    : isEdit
                    ? "border-[#FF6F20] bg-[#FFF7ED] text-[#FF6F20] shadow-md ring-2 ring-[#FF6F20]/20"
                    : "border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-600"}`}>
                {isConf && !isEdit && !isCont ? (
                  <>
                    <div className="flex items-center gap-0.5">
                      <Check size={10} strokeWidth={3} className="text-[#FF6F20]" />
                      <Icon size={11} />
                    </div>
                    <span className="text-[8px] font-bold leading-tight text-center truncate w-full">
                      {getDisplay(p.id, val) || p.label}
                    </span>
                  </>
                ) : (
                  <>
                    <Icon size={15} strokeWidth={2} />
                    <span className="text-[9px] font-bold leading-tight text-center">{p.label}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Active Param Editor Panel ─────────────────────────── */}
      {editDef && !CONTAINER_PARAMS.has(editingParam) && (
        <div className="mx-1 mb-3 bg-white border-2 border-[#FF6F20]/30 rounded-2xl overflow-hidden shadow-lg">
          <div className="bg-[#FFF7ED] px-3 py-2.5 flex items-center justify-between border-b border-[#FF6F20]/10">
            <div className="flex items-center gap-2">
              <editDef.icon size={16} className="text-[#FF6F20]" />
              <span className="text-sm font-black text-gray-800">{editDef.label}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => handleRemoveParam(editingParam)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50">
                <X size={14} />
              </button>
              <button type="button" onClick={handleConfirm}
                className="w-10 h-10 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-md active:scale-95 transition-all">
                <Check size={18} strokeWidth={3} />
              </button>
            </div>
          </div>
          <div className="p-3">
            <ParamInputRenderer
              paramId={editingParam}
              value={exercise[getDbField(editingParam)]}
              onChange={(v) => updateEx(getDbField(editingParam), v)}
              getOptions={getOptions}
              onAddCustom={handleAddCustom}
            />
          </div>
        </div>
      )}

      {/* ── Container: Sub-Exercises ──────────────────────────── */}
      {isContainer && (
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

      {/* Custom Value Dialog */}
      <AddCustomValueDialog
        isOpen={addValueDialog.isOpen}
        onClose={() => setAddValueDialog({ ...addValueDialog, isOpen: false })}
        title={addValueDialog.label}
        onSave={handleSaveCustomValue}
        isLoading={createCustomParamMutation.isPending}
      />
    </div>
  );
}
