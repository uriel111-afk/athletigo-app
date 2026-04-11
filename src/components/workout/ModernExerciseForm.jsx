import React, { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Minus, Dumbbell, Clock, Repeat, Layers, Activity, Zap, Settings2,
  Trash2, Timer, RotateCcw, Weight, Hash, Info, Video,
  PauseCircle, MoveHorizontal, X, User, GripVertical,
  Footprints, Hand, Maximize2, ArrowLeftRight, ChevronDown, ChevronUp, GripHorizontal
} from "lucide-react";
import TimeInput from "@/components/ui/TimeInput";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AddCustomValueDialog from "../forms/AddCustomValueDialog";
import { toast } from "sonner";

// --- ICONS & CONFIGURATION ---
const ICONS = {
  reps: Repeat,
  sets: Hash,
  time: Clock,
  rest: Timer,
  weight: Weight,
  equipment: Dumbbell,
  notes: Info,
  video: Video,
  tempo: Activity,
  activity: Activity,
  rpe: Zap,
  list: Layers,
  pause: PauseCircle,
  move: MoveHorizontal,
  user: User,
  stop: PauseCircle
};

const EXERCISE_MODES = [
  { id: "חזרות", label: "חזרות", icon: Repeat },
  { id: "זמן", label: "זמן", icon: Clock },
  { id: "סופרסט", label: "סופרסט", icon: Layers },
  { id: "טבטה", label: "טבטה", icon: Zap },
  { id: "קומבו", label: "קומבו", icon: Activity },
  { id: "מותאם אישי", label: "מותאם", icon: Settings2 }
];

// Unified Parameters Grid — 22 canonical parameters
const ALL_PARAMETERS = [
  { id: "sets",                   label: "סטים",              icon: ICONS.sets,      defaultValue: "3" },
  { id: "reps",                   label: "חזרות",             icon: ICONS.reps,      defaultValue: "10" },
  { id: "work_time",              label: "זמן עבודה",         icon: ICONS.time,      defaultValue: "00:30" },
  { id: "rest_time",              label: "זמן מנוחה",         icon: ICONS.rest,      defaultValue: "00:30" },
  { id: "rounds",                 label: "סבבים",             icon: ICONS.sets,      defaultValue: "3" },
  { id: "rpe",                    label: "RPE (קושי)",        icon: ICONS.rpe,       defaultValue: "7" },
  { id: "load_type",              label: "סוג עומס",          icon: ICONS.weight,    defaultValue: "משקל גוף" },
  { id: "weight_kg",              label: "משקל (ק״ג)",        icon: ICONS.weight,    defaultValue: "0" },
  { id: "tempo",                  label: "טמפו",              icon: ICONS.tempo,     defaultValue: "3010" },
  { id: "rest_between_sets",      label: "מנ' בין סטים",      icon: ICONS.rest,      defaultValue: "00:60" },
  { id: "rest_between_exercises", label: "מנ' בין תרגילים",  icon: ICONS.pause,     defaultValue: "00:15" },
  { id: "exercise_list",          label: "רשימת תרגילים",    icon: ICONS.list,      defaultValue: [] },
  { id: "foot_position",          label: "מנח רגליים",        icon: Footprints,      defaultValue: "רוחב כתפיים" },
  { id: "body_position",          label: "מנח גוף",           icon: User,            defaultValue: "עמידה" },
  { id: "equipment",              label: "ציוד נדרש",         icon: ICONS.equipment, defaultValue: "" },
  { id: "static_hold",            label: "החזקה סטטית",       icon: ICONS.stop,      defaultValue: "00:10" },
  { id: "notes",                  label: "דגשים",             icon: ICONS.notes,     defaultValue: "" },
  { id: "side",                   label: "צד",                icon: ArrowLeftRight,  defaultValue: "דו־צדדי" },
  { id: "range_of_motion",        label: "טווח תנועה",        icon: Maximize2,       defaultValue: "מלא" },
  { id: "grip",                   label: "אחיזה",             icon: GripVertical,    defaultValue: "" },
  { id: "tabata",                 label: "Tabata",            icon: Zap,             defaultValue: {} },
  { id: "video_url",              label: "וידאו",             icon: ICONS.video,     defaultValue: "" },
];

// --- COMPACT COMPONENTS ---



const CompactNumberInput = ({ value, onChange, placeholder, label }) => {
  return (
    <div className="flex flex-col items-center justify-center w-full gap-1 py-1">
      <input 
        type="number" 
        value={value || ""} 
        onChange={(e) => onChange(e.target.value)} 
        placeholder={placeholder || "0"}
        className="w-full text-center bg-transparent border-none focus:ring-0 p-0 font-black text-gray-900 appearance-none"
        style={{ fontSize: '22px', lineHeight: '1.2', height: '32px' }}
      />
      
      {label && <span className="text-[10px] text-gray-400 font-bold -mt-1">{label}</span>}
      
      <div className="flex items-center justify-center gap-4 w-full mt-1">
        <button 
          type="button" 
          onClick={() => onChange(String((parseFloat(value) || 0) + 1))}
          className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-[#FF6F20] hover:border-[#FF6F20] hover:bg-orange-50 active:scale-95 transition-all"
        >
          <Plus size={14} strokeWidth={3} />
        </button>
        
        <button 
          type="button" 
          onClick={() => onChange(String(Math.max(0, (parseFloat(value) || 0) - 1)))}
          className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-[#FF6F20] hover:border-[#FF6F20] hover:bg-orange-50 active:scale-95 transition-all"
        >
          <Minus size={14} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
};

const CompactSelect = ({ value, onChange, options, onAdd }) => (
  <Select value={value} onValueChange={(val) => {
    if (val === "ADD_NEW") {
      if (onAdd) onAdd();
    } else {
      onChange(val);
    }
  }}>
    <SelectTrigger className="h-7 text-xs w-full bg-white border-gray-200 rounded-md focus:ring-[#FF6F20]/20"><SelectValue placeholder="בחר..." /></SelectTrigger>
    <SelectContent dir="rtl">
      {options.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
      {onAdd && (
        <SelectItem value="ADD_NEW" className="font-bold text-[#FF6F20] border-t mt-1">
          <span className="flex items-center gap-2">
            <Plus size={12} /> הוסף ערך חדש...
          </span>
        </SelectItem>
      )}
    </SelectContent>
  </Select>
);

const SelectionGrid = ({ options, value, onChange, multi = false, onAdd }) => {
  const isSelected = (opt) => {
    if (multi) {
      return (value || "").split(", ").includes(opt);
    }
    return value === opt;
  };

  const handleSelect = (opt) => {
    if (multi) {
      let current = (value || "").split(", ").filter(Boolean);
      if (current.includes(opt)) {
        current = current.filter(i => i !== opt);
      } else {
        current.push(opt);
      }
      onChange(current.join(", "));
    } else {
      onChange(opt === value ? "" : opt);
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => handleSelect(opt)}
          className={`
            px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-all
            ${isSelected(opt) 
              ? 'bg-[#FF6F20] text-white border-[#FF6F20] shadow-sm' 
              : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}
          `}
        >
          {opt}
        </button>
      ))}
      {onAdd && (
        <button
          onClick={onAdd}
          className="px-2 py-1.5 rounded-lg text-[11px] font-bold border border-dashed border-gray-300 text-gray-500 hover:text-[#FF6F20] hover:border-[#FF6F20] hover:bg-orange-50 flex items-center gap-1 transition-all"
        >
          <Plus size={10} /> הוסף...
        </button>
      )}
    </div>
  );
};

const CompactListBuilder = ({ items, onChange }) => {
  const add = () => onChange([...items, { name: "", value: "", weight: "", valueType: "reps" }]);
  
  const update = (i, f, v) => {
    const n = [...items];
    n[i] = { ...n[i], [f]: v };
    onChange(n);
  };
  
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));

  const toggleMeasurement = (i) => {
    const current = items[i].valueType || items[i].measurement || items[i].type || 'reps'; // Fallback for legacy data
    const next = current === 'reps' ? 'time' : 'reps';
    
    const n = [...items];
    n[i] = { 
        ...n[i], 
        valueType: next, 
        measurement: next // Keep both for compatibility if needed, or strictly use valueType as requested
    };
    
    // Clean up legacy keys
    if ('type' in n[i]) delete n[i].type;
    
    onChange(n);
  };

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const isTime = (item.valueType === 'time' || item.measurement === 'time' || item.type === 'time');
        
        return (
          <div key={i} className="bg-gray-50 p-1.5 rounded-lg border border-gray-100 flex flex-col sm:flex-row gap-2 sm:items-center">
            
            {/* Row 1 (Mobile): Index + Name + Delete (Mobile) */}
            <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-1">
                <div className="w-4 text-center text-[10px] font-bold text-gray-400">{i + 1}</div>
                
                <input 
                    value={item.name} 
                    onChange={(e) => update(i, 'name', e.target.value)} 
                    placeholder="שם תרגיל"
                    className="flex-1 h-8 text-xs bg-white border border-gray-200 rounded px-2 focus:border-[#FF6F20] focus:outline-none" 
                />

                {/* Delete on Mobile */}
                <button onClick={() => remove(i)} className="sm:hidden text-red-400 p-1.5 hover:bg-red-50 rounded">
                    <Trash2 size={14} />
                </button>
            </div>
            
            {/* Row 2 (Mobile): Controls */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                
                {/* Toggle Button */}
                <button 
                    onClick={() => toggleMeasurement(i)}
                    className={`
                        h-8 px-2 sm:px-3 rounded-md flex items-center gap-1.5 text-xs font-bold border transition-all shrink-0
                        ${isTime 
                            ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100' 
                            : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100'}
                    `}
                    title={isTime ? "שנה לחזרות" : "שנה לזמן"}
                >
                    {isTime ? <Clock size={14} /> : <Repeat size={14} />}
                    <span className="hidden sm:inline">{isTime ? "זמן" : "חזרות"}</span>
                </button>
    

    
                {/* Value Input */}
                <div className="w-20 sm:w-28 flex-shrink-0">
                  {isTime ? (
                    <TimeInput value={item.value} onChange={(v) => update(i, 'value', v)} />
                  ) : (
                    <div className="relative">
                      <Input 
                        type="number"
                        value={item.value || ""}
                        onChange={(e) => update(i, 'value', e.target.value)}
                        placeholder="0"
                        className="h-8 pr-2 pl-8 text-sm font-bold bg-white border-gray-200 focus:border-[#FF6F20] rounded-md"
                      />
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none font-medium">
                        חזרות
                      </span>
                    </div>
                  )}
                </div>
    
                {/* Delete on Desktop */}
                <button onClick={() => remove(i)} className="hidden sm:block text-red-400 p-1 hover:bg-red-50 rounded">
                    <Trash2 size={12} />
                </button>
            </div>

          </div>
        );
      })}
      
      <Button variant="ghost" size="sm" onClick={add} className="w-full h-7 text-xs text-[#FF6F20] border border-dashed border-[#FF6F20]/30 hover:bg-orange-50 hover:border-[#FF6F20]">
        + הוסף תרגיל
      </Button>
    </div>
  );
};

const CollapsibleExerciseCard = ({ item, index, total, onChange, onRemove, onMove, subtitle }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden transition-all hover:shadow-md">
      <div 
        className="flex items-center justify-between p-3 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <span className="w-6 h-6 rounded-full bg-orange-100 text-[#FF6F20] border border-orange-200 text-xs font-bold flex items-center justify-center">
            {index + 1}
          </span>
          <div>
            <div className="text-sm font-bold text-gray-900 leading-tight">
              {item.name || "תרגיל חדש"}
            </div>
            {subtitle && (
              <div className="text-[10px] font-medium text-gray-500 mt-1">
                {subtitle}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={(e) => { e.stopPropagation(); onMove(index, -1); }} 
            disabled={index === 0}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
          >
            <ChevronUp size={14} />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onMove(index, 1); }} 
            disabled={index === total - 1}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
          >
            <ChevronDown size={14} />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
          >
            <Trash2 size={14} />
          </button>
          <div className="ml-1 text-gray-400">
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </div>
      
      {isOpen && (
        <div className="p-3 space-y-3 bg-white border-t border-gray-100 animate-in slide-in-from-top-2 duration-200">
          <div>
            <Label className="text-[10px] text-gray-400 mb-1 block">שם התרגיל</Label>
            <Input 
              value={item.name || ""} 
              onChange={(e) => onChange(index, "name", e.target.value)}
              placeholder="לדוגמה: סקוואט"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-[10px] text-gray-400 mb-1 block">הערות (אופציונלי)</Label>
            <Textarea 
              value={item.notes || ""} 
              onChange={(e) => onChange(index, "notes", e.target.value)}
              placeholder="דגשים לביצוע..."
              className="min-h-[60px] text-xs resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
};

const TabataConfigurator = ({ exercise, onChange }) => {
  const tabataBlocks = exercise.tabata_blocks || [];
  
  const addTabataBlock = () => {
    const newBlock = { 
      id: Date.now().toString(),
      name: "", 
      work_time: "20", 
      rest_time: "10", 
      rounds: "8", 
      rest_between_rounds: "60", 
      sets: "1",
      block_exercises: [] 
    };
    onChange("tabata_blocks", [...tabataBlocks, newBlock]);
  };

  const updateBlock = (blockIndex, field, val) => {
    const newBlocks = [...tabataBlocks];
    newBlocks[blockIndex] = { ...newBlocks[blockIndex], [field]: val };
    onChange("tabata_blocks", newBlocks);
  };

  const removeBlock = (blockIndex) => {
    const newBlocks = tabataBlocks.filter((_, i) => i !== blockIndex);
    onChange("tabata_blocks", newBlocks);
  };

  // --- Sub Exercises Logic ---
  const addExerciseToBlock = (blockIndex) => {
    const newBlocks = [...tabataBlocks];
    const currentExercises = newBlocks[blockIndex].block_exercises || [];
    newBlocks[blockIndex].block_exercises = [
      ...currentExercises, 
      { id: Date.now().toString(), name: "" }
    ];
    onChange("tabata_blocks", newBlocks);
  };

  const updateBlockExercise = (blockIndex, exIndex, val) => {
    const newBlocks = [...tabataBlocks];
    const exercises = [...(newBlocks[blockIndex].block_exercises || [])];
    exercises[exIndex] = { ...exercises[exIndex], name: val };
    newBlocks[blockIndex].block_exercises = exercises;
    onChange("tabata_blocks", newBlocks);
  };

  const removeExerciseFromBlock = (blockIndex, exIndex) => {
    const newBlocks = [...tabataBlocks];
    const exercises = newBlocks[blockIndex].block_exercises.filter((_, i) => i !== exIndex);
    newBlocks[blockIndex].block_exercises = exercises;
    onChange("tabata_blocks", newBlocks);
  };

  const moveExerciseInBlock = (blockIndex, exIndex, direction) => {
    const newBlocks = [...tabataBlocks];
    const exercises = [...(newBlocks[blockIndex].block_exercises || [])];
    if ((direction === -1 && exIndex === 0) || (direction === 1 && exIndex === exercises.length - 1)) return;
    
    const temp = exercises[exIndex];
    exercises[exIndex] = exercises[exIndex + direction];
    exercises[exIndex + direction] = temp;
    
    newBlocks[blockIndex].block_exercises = exercises;
    onChange("tabata_blocks", newBlocks);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {tabataBlocks.map((block, bIndex) => (
        <div key={block.id || bIndex} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
           
           {/* Block Header */}
           <div className="bg-orange-50/50 p-3 border-b border-orange-100 flex justify-between items-start gap-3">
             <div className="flex-1">
                <Label className="text-[10px] text-[#FF6F20] font-black mb-1 block uppercase tracking-wide">שם הבלוק</Label>
                <Input 
                  value={block.name || ""} 
                  onChange={(e) => updateBlock(bIndex, "name", e.target.value)}
                  placeholder="לדוגמה: עליה לישיבה + טיפוס הרים"
                  className="h-9 font-bold bg-white border-orange-200 focus:border-[#FF6F20] text-gray-900"
                />
             </div>
             <button 
                onClick={() => removeBlock(bIndex)}
                className="mt-6 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="מחק בלוק"
             >
                <Trash2 size={16} />
             </button>
           </div>

           {/* Block Settings (Shared Timing) */}
           <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 bg-gray-50/30 border-b border-gray-100">
              <div>
                <Label className="text-[9px] text-gray-400 font-bold mb-1 block">זמן עבודה (שנ׳)</Label>
                <Input 
                  type="number"
                  min="1"
                  value={block.work_time || ""} 
                  onChange={(e) => updateBlock(bIndex, "work_time", e.target.value)}
                  placeholder="20"
                  className="h-8 text-xs font-bold text-center bg-white border-gray-200 invalid:border-red-300 invalid:bg-red-50"
                />
              </div>
              <div>
                <Label className="text-[9px] text-gray-400 font-bold mb-1 block">זמן מנוחה (שנ׳)</Label>
                <Input 
                  type="number"
                  min="0"
                  value={block.rest_time || ""} 
                  onChange={(e) => updateBlock(bIndex, "rest_time", e.target.value)}
                  placeholder="10"
                  className="h-8 text-xs font-bold text-center bg-white border-gray-200 invalid:border-red-300 invalid:bg-red-50"
                />
              </div>
              <div>
                <Label className="text-[9px] text-gray-400 font-bold mb-1 block">מספר סבבים</Label>
                <Input 
                  type="number"
                  min="1"
                  value={block.rounds || ""} 
                  onChange={(e) => updateBlock(bIndex, "rounds", e.target.value)}
                  placeholder="8"
                  className="h-8 text-xs font-bold text-center bg-white border-gray-200 invalid:border-red-300 invalid:bg-red-50"
                />
              </div>
              <div>
                <Label className="text-[9px] text-gray-400 font-bold mb-1 block">מנוחה בין סבבים</Label>
                <Input 
                  type="number"
                  min="0"
                  value={block.rest_between_rounds || ""} 
                  onChange={(e) => updateBlock(bIndex, "rest_between_rounds", e.target.value)}
                  placeholder="60"
                  className="h-8 text-xs font-bold text-center bg-white border-gray-200 invalid:border-red-300 invalid:bg-red-50"
                />
              </div>
              <div>
                <Label className="text-[9px] text-gray-400 font-bold mb-1 block">מספר סטים</Label>
                <Input 
                  type="number"
                  min="1"
                  value={block.sets || ""} 
                  onChange={(e) => updateBlock(bIndex, "sets", e.target.value)}
                  placeholder="1"
                  className="h-8 text-xs font-bold text-center bg-white border-gray-200 invalid:border-red-300 invalid:bg-red-50"
                />
              </div>
           </div>

           {/* Inner Exercises List */}
           <div className="p-3 bg-white space-y-3">
              <div>
                 <Label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-1">הערות לבלוק</Label>
                 <Textarea 
                    value={block.notes || ""} 
                    onChange={(e) => updateBlock(bIndex, "notes", e.target.value)}
                    placeholder="דגשים מיוחדים, הוראות ביצוע..."
                    className="min-h-[50px] text-xs resize-none bg-gray-50 border-gray-100 focus:border-[#FF6F20] focus:ring-0"
                 />
              </div>

              <div>
              <div className="flex justify-between items-center mb-2">
                 <Label className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">תרגילים בבלוק</Label>
                 <button 
                   onClick={() => addExerciseToBlock(bIndex)}
                   className="flex items-center gap-1 text-[10px] font-bold text-[#FF6F20] bg-orange-50 px-2 py-1 rounded hover:bg-orange-100 transition-colors"
                 >
                   <Plus size={10} /> הוסף תרגיל
                 </button>
              </div>

              <div className="space-y-2">
                 {(block.block_exercises || []).map((ex, exIndex) => (
                    <div key={ex.id || exIndex} className="flex items-center gap-2 group">
                       <span className="text-[10px] font-bold text-gray-300 w-4 text-center">{exIndex + 1}</span>
                       <Input 
                          value={ex.name || ""} 
                          onChange={(e) => updateBlockExercise(bIndex, exIndex, e.target.value)}
                          placeholder="שם התרגיל בבלוק..."
                          className="h-8 text-xs bg-gray-50 border-transparent focus:bg-white focus:border-[#FF6F20] transition-all"
                       />
                       <div className="flex items-center opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => moveExerciseInBlock(bIndex, exIndex, -1)} disabled={exIndex === 0} className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-20"><ChevronUp size={14}/></button>
                          <button onClick={() => moveExerciseInBlock(bIndex, exIndex, 1)} disabled={exIndex === (block.block_exercises || []).length - 1} className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-20"><ChevronDown size={14}/></button>
                          <button onClick={() => removeExerciseFromBlock(bIndex, exIndex)} className="p-1 text-red-300 hover:text-red-500"><Trash2 size={14}/></button>
                       </div>
                    </div>
                 ))}
                 {(block.block_exercises || []).length === 0 && (
                    <div className="text-center py-3 border border-dashed border-gray-100 rounded-lg text-[10px] text-gray-400">
                       אין תרגילים בבלוק זה
                    </div>
                 )}
              </div>
           </div>
        </div>
      </div>
      ))}

      <Button 
        onClick={addTabataBlock} 
        className="w-full h-12 bg-[#FF6F20] text-white hover:bg-[#E65F1D] font-bold text-sm shadow-md rounded-xl"
      >
        <Plus size={18} className="mr-2" /> הוסף בלוק טבטה חדש
      </Button>
    </div>
  );
};

// --- MAIN FORM ---
export default function ModernExerciseForm({ exercise, onChange }) {
  const [activeMode, setActiveMode] = useState(exercise.mode || "חזרות");
  const [openParams, setOpenParams] = useState([]);
  
  const [addValueDialog, setAddValueDialog] = useState({ isOpen: false, type: null, label: "" });
  const queryClient = useQueryClient();

  // --- FETCH CUSTOM PARAMETERS ---
  const { data: customParams = [] } = useQuery({
    queryKey: ['custom-parameters'],
    queryFn: async () => {
      try {
        const coach = await base44.auth.me();
        if (!coach || (!coach.isCoach && coach.role !== 'admin')) return [];
        return await base44.entities.CustomParameter.filter({ coach_id: coach.id });
      } catch (e) {
        return [];
      }
    },
    initialData: []
  });

  const createCustomParamMutation = useMutation({
    mutationFn: async ({ type, value }) => {
      const coach = await base44.auth.me();
      return await base44.entities.CustomParameter.create({
        coach_id: coach.id,
        parameter_type: type,
        value: value
      });
    },
    onSuccess: (newItem, variables) => {
      queryClient.invalidateQueries({ queryKey: ['custom-parameters'] });
      setAddValueDialog({ isOpen: false, type: null, label: "" });
      toast.success("✅ ערך חדש נוסף");
      
      // Auto-select the new value
      const dbField = getDbField(variables.type);
      if (['grip', 'equipment'].includes(variables.type)) {
        const current = exercise[dbField] || "";
        const newVal = current ? `${current}, ${variables.value}` : variables.value;
        updateEx(dbField, newVal);
      } else {
        updateEx(dbField, variables.value);
      }
    },
    onError: () => toast.error("שגיאה בשמירת הערך")
  });

  // --- MERGE DEFAULTS WITH CUSTOM ---
  const getOptionsForType = (type, defaultOptions) => {
    const custom = customParams
      .filter(p => p.parameter_type === type)
      .map(p => p.value);
    
    // Remove duplicates (case insensitive) just in case
    const uniqueDefaults = defaultOptions.filter(def => !custom.some(c => c.toLowerCase() === def.toLowerCase()));
    
    return [...uniqueDefaults, ...custom];
  };

  const handleAddCustomValue = (value) => {
    const type = addValueDialog.type;
    if (!type) return;

    // Check if already exists (in defaults or custom)
    let defaults = [];
    if (type === 'body_position') defaults = ["עמידה", "ישיבה", "שכיבה על גב", "שכיבה על בטן", "שכיבה על צד", "תלייה", "תמיכה", "טבעות", "מקבילים", "פראלטים"];
    else if (type === 'foot_position') defaults = ["צמוד", "רוחב כתפיים", "רחב", "רגל אחת (L/R)"];
    else if (type === 'grip') defaults = ["צרה", "בינונית", "רחבה", "פרונציה", "סופינציה", "ניטרלית"];
    else if (type === 'equipment') defaults = ["משקל גוף", "טבעות", "מתח", "מקבילים", "פראלטים", "Dream Machine", "משקולות יד"];
    else if (type === 'range_of_motion') defaults = ["מלא", "חצי", "חלקי", "אקצנטרי בלבד", "איזומטרי"];
    else if (type === 'load_type') defaults = ["משקל גוף", "משקל חיצוני", "גומיות", "טבעות"];
    else if (type === 'side') defaults = ["דו־צדדי", "ימין", "שמאל", "לסירוגין"];

    const allOptions = getOptionsForType(type, defaults);
    const exists = allOptions.find(opt => opt.toLowerCase() === value.toLowerCase());

    if (exists) {
      toast.info("💡 הערך כבר קיים ונבחר עבורך");
      setAddValueDialog({ isOpen: false, type: null, label: "" });
      
      const dbField = getDbField(type);
      if (['grip', 'equipment'].includes(type)) {
        const current = exercise[dbField] || "";
        if (!current.includes(exists)) {
           const newVal = current ? `${current}, ${exists}` : exists;
           updateEx(dbField, newVal);
        }
      } else {
        updateEx(dbField, exists);
      }
      return;
    }

    createCustomParamMutation.mutate({ type, value });
  };

  // Helper: Map spec param ID → actual DB field name
  const getDbField = (paramId) => {
    // Mode-specific overrides
    if (activeMode === 'טבטה') {
      if (paramId === 'sets') return 'tabata_sets';
      if (paramId === 'rest_time') return 'tabata_rest';
      if (paramId === 'rest_between_sets') return 'tabata_rest_between_sets';
      if (paramId === 'exercise_list') return 'tabata_exercises';
    }
    if (activeMode === 'סופרסט') {
      if (paramId === 'rounds') return 'superset_rounds';
      if (paramId === 'rest_between_sets') return 'superset_rest_between_rounds';
      if (paramId === 'exercise_list') return 'superset_exercises';
    }
    if (activeMode === 'קומבו') {
      if (paramId === 'sets') return 'combo_sets';
      if (paramId === 'rest_between_sets') return 'combo_rest_between_sets';
      if (paramId === 'rest_between_exercises') return 'rest_between_exercises';
      if (paramId === 'exercise_list') return 'combo_exercises';
    }
    // Spec ID → DB field mappings
    if (paramId === 'reps') return 'reps_or_time';
    if (paramId === 'weight_kg') return 'weight_kg';
    if (paramId === 'load_type') return 'weight_type';
    if (paramId === 'exercise_list') return 'exercise_list';
    if (paramId === 'foot_position') return 'leg_position';
    if (paramId === 'static_hold') return 'static_hold_time';
    if (paramId === 'notes') return 'notes';
    if (paramId === 'tabata') return 'tabata_blocks';
    return paramId;
  };

  // Initialize open params based on existing data
  useEffect(() => {
    const existingKeys = [];
    ALL_PARAMETERS.forEach(param => {
      const dbField = getDbField(param.id);
      const val = exercise[dbField];
      if (val !== null && val !== undefined && val !== "" && (Array.isArray(val) ? val.length > 0 : true)) {
        existingKeys.push(param.id);
      }
    });

    let initialParams = [];
    if (exercise.params_order && Array.isArray(exercise.params_order) && exercise.params_order.length > 0) {
      initialParams = exercise.params_order;
      // Add any missing keys that exist in data but not in order (legacy support)
      existingKeys.forEach(k => {
        if (!initialParams.includes(k)) initialParams.push(k);
      });
    } else if (openParams.length === 0 && existingKeys.length > 0) {
      initialParams = existingKeys;
    } else if (openParams.length === 0) {
      initialParams = getDefaultsForMode(activeMode);
    }

    // Only set if we have something valid to prevent overwrite
    if (initialParams.length > 0) {
        setOpenParams(initialParams);
    }
  }, [activeMode]);

  const getDefaultsForMode = (mode) => {
    switch(mode) {
      case "חזרות": return ["reps", "sets", "weight_kg", "rest_time"];
      case "זמן": return ["work_time", "rounds", "rest_time"];
      case "סופרסט": return ["exercise_list", "rounds", "rest_between_sets"];
      case "טבטה": return ["tabata"];
      case "קומבו": return ["exercise_list", "sets", "rest_between_sets"];
      default: return ["work_time"];
    }
  };

  const updateEx = (field, value) => onChange({ ...exercise, [field]: value });
  
  const handleModeChange = (id) => {
    setActiveMode(id);
    onChange({ ...exercise, mode: id });
    setOpenParams(getDefaultsForMode(id));
  };

  const toggleParam = (id) => {
    if (openParams.includes(id)) {
      setOpenParams(prev => prev.filter(p => p !== id));
      const dbField = getDbField(id);
      updateEx(dbField, null);
    } else {
      setOpenParams(prev => [...prev, id]);
    }
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    
    const newOrder = Array.from(openParams);
    const [reorderedItem] = newOrder.splice(result.source.index, 1);
    newOrder.splice(result.destination.index, 0, reorderedItem);
    
    setOpenParams(newOrder);
    updateEx('params_order', newOrder);
  };

  const renderInputBlock = (param) => {
    const dbField = getDbField(param.id);
    const value = exercise[dbField];

    // Exercise list (superset / combo / tabata inner exercises)
    if (param.id === 'exercise_list') {
      return <CompactListBuilder items={value || []} onChange={l => updateEx(dbField, l)} />;
    }

    // Tabata structured builder
    if (param.id === 'tabata') {
      return <TabataConfigurator exercise={exercise} onChange={updateEx} />;
    }

    // Time / rest inputs
    if (
      param.id.includes('time') ||
      param.id.includes('rest') ||
      param.id === 'static_hold'
    ) {
      return <TimeInput value={value} onChange={v => updateEx(dbField, v)} />;
    }

    // Numeric inputs
    if (['reps', 'sets', 'rounds', 'rpe', 'weight_kg'].includes(param.id)) {
      return <CompactNumberInput value={value} onChange={v => updateEx(dbField, v)} placeholder="0" />;
    }

    // Load type selector
    if (param.id === 'load_type') {
      const defaults = ["משקל גוף", "משקל חיצוני", "גומיות", "טבעות"];
      const options = getOptionsForType('load_type', defaults).map(o => ({ label: o, value: o }));
      return (
        <CompactSelect
          value={value}
          onChange={v => updateEx(dbField, v)}
          options={options}
          onAdd={() => setAddValueDialog({ isOpen: true, type: 'load_type', label: 'הוסף סוג עומס' })}
        />
      );
    }

    // Notes (free text)
    if (param.id === 'notes') {
      return (
        <Textarea
          className="text-xs min-h-[40px] p-2 resize-none focus:ring-[#FF6F20]/20 focus:border-[#FF6F20] rounded-md"
          value={value || ""}
          onChange={e => updateEx(dbField, e.target.value)}
          placeholder="דגשים, הוראות ביצוע..."
        />
      );
    }

    // Dropdown / chip-selection params
    if (['body_position', 'foot_position', 'grip', 'equipment', 'range_of_motion', 'side'].includes(param.id)) {
      let defaultOptions = [];
      let dialogTitle = "";
      let dbType = param.id; // used for custom-param lookup

      if (param.id === 'body_position') {
        defaultOptions = ["עמידה", "ישיבה", "שכיבה על גב", "שכיבה על בטן", "שכיבה על צד", "תלייה", "תמיכה", "טבעות", "מקבילים", "פראלטים"];
        dialogTitle = "הוסף מנח גוף";
      } else if (param.id === 'foot_position') {
        defaultOptions = ["צמוד", "רוחב כתפיים", "רחב", "רגל אחת (L/R)"];
        dialogTitle = "הוסף מנח רגליים";
        dbType = 'foot_position';
      } else if (param.id === 'grip') {
        defaultOptions = ["צרה", "בינונית", "רחבה", "פרונציה", "סופינציה", "ניטרלית"];
        dialogTitle = "הוסף סוג אחיזה";
      } else if (param.id === 'equipment') {
        defaultOptions = ["משקל גוף", "טבעות", "מתח", "מקבילים", "פראלטים", "Dream Machine", "משקולות יד"];
        dialogTitle = "הוסף ציוד";
      } else if (param.id === 'range_of_motion') {
        defaultOptions = ["מלא", "חצי", "חלקי", "אקצנטרי בלבד", "איזומטרי"];
        dialogTitle = "הוסף טווח תנועה";
      } else if (param.id === 'side') {
        defaultOptions = ["דו־צדדי", "ימין", "שמאל", "לסירוגין"];
        dialogTitle = "הוסף צד";
      }

      const mergedOptions = getOptionsForType(dbType, defaultOptions).map(o => ({ label: o, value: o }));
      return (
        <CompactSelect
          value={value}
          onChange={v => updateEx(dbField, v)}
          options={mergedOptions}
          onAdd={() => setAddValueDialog({ isOpen: true, type: dbType, label: dialogTitle })}
        />
      );
    }

    // Default: plain text input (tempo, video_url, etc.)
    return (
      <Input
        className="h-7 text-xs focus:ring-[#FF6F20]/20 focus:border-[#FF6F20] rounded-md"
        value={value || ""}
        onChange={e => updateEx(dbField, e.target.value)}
        placeholder={param.id === 'tempo' ? 'לדוגמה: 3010' : param.id === 'video_url' ? 'https://...' : ''}
      />
    );
  };

  return (
    <div className="w-full" dir="rtl">

      <div className="mb-4 px-1">
        <Label className="text-lg text-gray-900 mb-2 block font-black uppercase tracking-wider">שם התרגיל</Label>
        <input
          value={exercise.exercise_name || ""}
          onChange={(e) => updateEx('exercise_name', e.target.value)}
          placeholder="לדוגמה: סקוואט"
          className="w-full h-10 text-base font-black border-b-2 border-gray-100 bg-transparent focus:border-[#FF6F20] focus:outline-none px-1 transition-colors placeholder:text-gray-300" />
      </div>

      <div className="mb-3 px-1">
         <Label className="text-[10px] text-gray-400 mb-1.5 block font-bold uppercase tracking-wider">פרמטרים</Label>
         <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-1.5">
            {ALL_PARAMETERS.map((param) => {
               const isOpen = openParams.includes(param.id);
               const Icon = param.icon;
               return (
                 <button key={param.id} onClick={() => toggleParam(param.id)}
                   className={`
                     flex flex-col items-center justify-center gap-1 p-1 rounded-xl border transition-all duration-200 h-[60px] shadow-sm
                     ${isOpen 
                       ? 'bg-[#FF6F20] border-[#FF6F20] text-white shadow-md scale-[1.02]' 
                       : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300'}
                   `}
                 >
                   {Icon && <Icon size={16} strokeWidth={2} />}
                   <span className="text-[9px] md:text-[10px] font-bold leading-none text-center tracking-tight">{param.label}</span>
                 </button>
               );
            })}
         </div>
      </div>

      <AddCustomValueDialog 
        isOpen={addValueDialog.isOpen} 
        onClose={() => setAddValueDialog({ ...addValueDialog, isOpen: false })} 
        title={addValueDialog.label}
        onSave={handleAddCustomValue}
        isLoading={createCustomParamMutation.isPending}
      />

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="params-grid" direction="horizontal">
          {(provided) => (
            <div 
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="grid grid-cols-6 gap-2 px-1 pb-4"
            >
              {openParams.length === 0 && (
                  <div className="col-span-full text-center py-6 text-gray-300 text-xs bg-gray-50 rounded-lg border border-dashed border-gray-200">
                      לא נבחרו פרמטרים לעריכה
                  </div>
              )}
              
              {openParams.map((paramId, index) => {
                const param = ALL_PARAMETERS.find(p => p.id === paramId);
                if (!param) return null;

                const isLarge = ['exercise_list', 'equipment', 'notes', 'video_url', 'load_type', 'body_position', 'foot_position', 'grip', 'range_of_motion', 'side', 'tabata'].includes(param.id);
                const colSpan = isLarge ? 'col-span-6' : 'col-span-2';

                return (
                  <Draggable key={param.id} draggableId={param.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`${colSpan} ${snapshot.isDragging ? 'z-50 opacity-90' : ''}`}
                        style={{ ...provided.draggableProps.style }}
                      >
                         <div className={`bg-white rounded-lg border shadow-sm overflow-hidden h-full ${snapshot.isDragging ? 'border-[#FF6F20] shadow-lg' : 'border-[#FF6F20]/20'}`}>
                            <div className="bg-gray-50/50 px-2 py-1.5 border-b border-gray-100 flex items-center justify-between group cursor-move" {...provided.dragHandleProps}>
                                <div className="flex items-center gap-1.5 text-gray-700">
                                    <GripVertical size={12} className="text-gray-300 group-hover:text-gray-500" />
                                    {param.icon && <param.icon size={12} className="text-[#FF6F20]" />}
                                    <span className="text-[11px] font-bold">{param.label}</span>
                                </div>
                                <button onClick={() => toggleParam(param.id)} className="text-gray-300 hover:text-red-500 transition-colors p-0.5 hover:bg-red-50 rounded">
                                    <X size={12} />
                                </button>
                            </div>
                            <div className="p-2">
                                {renderInputBlock(param)}
                            </div>
                         </div>
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}