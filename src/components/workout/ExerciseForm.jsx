import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, GripVertical } from "lucide-react";

export default function ExerciseForm({ exercise, onChange }) {
  const [exerciseType, setExerciseType] = useState(exercise.exercise_type || "single");

  const modes = [
    { id: "single", label: "חזרות", icon: "🔁", desc: "סטים" },
    { id: "superset", label: "סופרסט", icon: "🔗", desc: "2+ תרגילים" },
    { id: "time", label: "זמן", icon: "⏱", desc: "זמן" },
    { id: "tabata", label: "טבטה", icon: "⚡", desc: "אינטרוולים" },
    { id: "combo", label: "קומבו", icon: "🌀", desc: "רצף" },
    { id: "custom", label: "מותאם", icon: "⚙️", desc: "בחר ערכים" }
  ];

  const handleTypeChange = (type) => {
    setExerciseType(type);
    onChange({ 
      ...exercise, 
      exercise_type: type,
      exercise_name: exercise.exercise_name || ""
    });
  };

  return (
    <div className="space-y-6 w-full" dir="rtl">
      {/* Mode Tabs */}
      <div className="w-full">
        <Label className="text-sm font-bold mb-3 block">בחר סוג תרגיל *</Label>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 w-full">
          {modes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => handleTypeChange(mode.id)}
              className="p-3 rounded-xl transition-all"
              style={{
                backgroundColor: exerciseType === mode.id ? '#FF6F20' : '#FFFFFF',
                color: exerciseType === mode.id ? '#FFFFFF' : '#000000',
                border: exerciseType === mode.id ? 'none' : '2px solid #E0E0E0',
                boxShadow: exerciseType === mode.id ? '0 4px 12px rgba(255, 111, 32, 0.2)' : 'none'
              }}
            >
              <div className="text-2xl mb-1">{mode.icon}</div>
              <div className="font-bold text-xs mb-0.5">{mode.label}</div>
              <div className="text-[10px] opacity-80">{mode.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* SINGLE EXERCISE */}
      {exerciseType === "single" && (
        <div className="space-y-4 p-4 rounded-xl w-full" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
          <div className="w-full">
            <Label className="text-sm font-bold mb-2 block">שם התרגיל *</Label>
            <Input
              value={exercise.exercise_name || ""}
              onChange={(e) => onChange({ ...exercise, exercise_name: e.target.value })}
              placeholder="למשל: שכיבות סמיכה"
              className="rounded-xl py-3 text-base w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 w-full">
            <div>
              <Label className="text-sm font-bold mb-2 block">סטים</Label>
              <Input
                type="number"
                value={exercise.sets || ""}
                onChange={(e) => onChange({ ...exercise, sets: e.target.value })}
                placeholder="3"
                className="rounded-xl py-3 text-base text-center w-full"
              />
            </div>
            <div>
              <Label className="text-sm font-bold mb-2 block">חזרות</Label>
              <Input
                type="number"
                value={exercise.reps || ""}
                onChange={(e) => onChange({ ...exercise, reps: e.target.value })}
                placeholder="10"
                className="rounded-xl py-3 text-base text-center w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full">
            <div>
              <Label className="text-sm font-bold mb-2 block">משקל (ק״ג)</Label>
              <Input
                type="number"
                value={exercise.weight || ""}
                onChange={(e) => onChange({ ...exercise, weight: e.target.value })}
                placeholder="20"
                className="rounded-xl py-3 text-base text-center w-full"
              />
            </div>
            <div>
              <Label className="text-sm font-bold mb-2 block">מנוחה (שניות)</Label>
              <Input
                type="number"
                value={exercise.rest_time || ""}
                onChange={(e) => onChange({ ...exercise, rest_time: e.target.value })}
                placeholder="60"
                className="rounded-xl py-3 text-base text-center w-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* TIME EXERCISE */}
      {exerciseType === "time" && (
        <div className="space-y-4 p-4 rounded-xl w-full" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
          <div className="w-full">
            <Label className="text-sm font-bold mb-2 block">שם התרגיל *</Label>
            <Input
              value={exercise.exercise_name || ""}
              onChange={(e) => onChange({ ...exercise, exercise_name: e.target.value })}
              placeholder="למשל: פלאנק"
              className="rounded-xl py-3 text-base w-full"
            />
          </div>

          <div className="grid grid-cols-3 gap-3 w-full">
            <div>
              <Label className="text-sm font-bold mb-2 block">דקות</Label>
              <Input
                type="number"
                value={exercise.time_minutes || ""}
                onChange={(e) => onChange({ ...exercise, time_minutes: e.target.value })}
                placeholder="1"
                className="rounded-xl py-3 text-base text-center w-full"
              />
            </div>
            <div>
              <Label className="text-sm font-bold mb-2 block">שניות</Label>
              <Input
                type="number"
                value={exercise.time_seconds || ""}
                onChange={(e) => onChange({ ...exercise, time_seconds: e.target.value })}
                placeholder="30"
                className="rounded-xl py-3 text-base text-center w-full"
              />
            </div>
            <div>
              <Label className="text-sm font-bold mb-2 block">סטים</Label>
              <Input
                type="number"
                value={exercise.time_sets || ""}
                onChange={(e) => onChange({ ...exercise, time_sets: e.target.value })}
                placeholder="3"
                className="rounded-xl py-3 text-base text-center w-full"
              />
            </div>
          </div>

          <div className="w-full">
            <Label className="text-sm font-bold mb-2 block">מנוחה (שניות)</Label>
            <Input
              type="number"
              value={exercise.time_rest || ""}
              onChange={(e) => onChange({ ...exercise, time_rest: e.target.value })}
              placeholder="60"
              className="rounded-xl py-3 text-base text-center w-full"
            />
          </div>
        </div>
      )}

      {/* SUPERSET EXERCISE */}
      {exerciseType === "superset" && (
        <div className="space-y-4 p-4 rounded-xl w-full" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
          <div className="w-full">
            <Label className="text-sm font-bold mb-2 block">תרגיל 1 *</Label>
            <Input
              value={exercise.exercise_name || ""}
              onChange={(e) => onChange({ ...exercise, exercise_name: e.target.value })}
              placeholder="תרגיל ראשון"
              className="rounded-xl py-3 text-base w-full"
            />
          </div>
          <div className="w-full">
            <Label className="text-sm font-bold mb-2 block">תרגיל 2 *</Label>
            <Input
              value={exercise.exercise_name_2 || ""}
              onChange={(e) => onChange({ ...exercise, exercise_name_2: e.target.value })}
              placeholder="תרגיל שני"
              className="rounded-xl py-3 text-base w-full"
            />
          </div>

          <div className="grid grid-cols-3 gap-3 w-full">
            <div>
              <Label className="text-sm font-bold mb-2 block">סטים</Label>
              <Input
                type="number"
                value={exercise.superset_sets || ""}
                onChange={(e) => onChange({ ...exercise, superset_sets: e.target.value })}
                placeholder="3"
                className="rounded-xl py-3 text-base text-center w-full"
              />
            </div>
            <div>
              <Label className="text-sm font-bold mb-2 block">מנוחה בין תרגילים</Label>
              <Input
                type="number"
                value={exercise.superset_rest_between_exercises || ""}
                onChange={(e) => onChange({ ...exercise, superset_rest_between_exercises: e.target.value })}
                placeholder="10"
                className="rounded-xl py-3 text-base text-center w-full"
              />
            </div>
            <div>
              <Label className="text-sm font-bold mb-2 block">מנוחה בין סטים</Label>
              <Input
                type="number"
                value={exercise.superset_rest_between_sets || ""}
                onChange={(e) => onChange({ ...exercise, superset_rest_between_sets: e.target.value })}
                placeholder="90"
                className="rounded-xl py-3 text-base text-center w-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* COMBO EXERCISE */}
      {exerciseType === "combo" && (
        <div className="space-y-4 p-4 rounded-xl w-full" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-base">🌀 תרגילי הקומבו</h3>
            <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: '#FF6F20', color: 'white' }}>
              {(exercise.combo_exercise_names || ['']).length}
            </span>
          </div>

          <div className="space-y-3 w-full">
            {(exercise.combo_exercise_names || ['']).map((name, idx) => (
              <div key={idx} className="space-y-2 p-3 rounded-lg w-full" style={{ backgroundColor: '#FFFFFF', border: '2px solid #E0E0E0' }}>
                <div className="flex gap-2 w-full">
                  <Input
                    value={name}
                    onChange={(e) => {
                      const newNames = [...(exercise.combo_exercise_names || [''])];
                      newNames[idx] = e.target.value;
                      onChange({ ...exercise, combo_exercise_names: newNames });
                    }}
                    placeholder={`תרגיל ${idx + 1}`}
                    className="rounded-lg flex-1 min-w-0"
                  />
                  {idx > 0 && (
                    <Button
                      type="button"
                      onClick={() => {
                        const newNames = (exercise.combo_exercise_names || ['']).filter((_, i) => i !== idx);
                        const newReps = (exercise.combo_reps_per_exercise || []).filter((_, i) => i !== idx);
                        const newTimes = (exercise.combo_time_per_exercise || []).filter((_, i) => i !== idx);
                        onChange({ 
                          ...exercise, 
                          combo_exercise_names: newNames, 
                          combo_reps_per_exercise: newReps,
                          combo_time_per_exercise: newTimes
                        });
                      }}
                      size="sm"
                      className="rounded-lg flex-shrink-0 w-8 h-8"
                      style={{ backgroundColor: '#f44336', color: 'white' }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 w-full">
                  <div>
                    <Label className="text-xs font-bold mb-1 block">חזרות</Label>
                    <Input
                      type="number"
                      value={(exercise.combo_reps_per_exercise || [])[idx] || ""}
                      onChange={(e) => {
                        const newReps = [...(exercise.combo_reps_per_exercise || [])];
                        newReps[idx] = e.target.value;
                        onChange({ ...exercise, combo_reps_per_exercise: newReps });
                      }}
                      placeholder="10"
                      className="rounded-lg text-center text-sm w-full"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold mb-1 block">זמן (שניות)</Label>
                    <Input
                      type="number"
                      value={(exercise.combo_time_per_exercise || [])[idx] || ""}
                      onChange={(e) => {
                        const newTimes = [...(exercise.combo_time_per_exercise || [])];
                        newTimes[idx] = e.target.value;
                        onChange({ ...exercise, combo_time_per_exercise: newTimes });
                      }}
                      placeholder="30"
                      className="rounded-lg text-center text-sm w-full"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button
            type="button"
            onClick={() => {
              const newNames = [...(exercise.combo_exercise_names || ['']), ''];
              const newReps = [...(exercise.combo_reps_per_exercise || []), ''];
              const newTimes = [...(exercise.combo_time_per_exercise || []), ''];
              onChange({ 
                ...exercise, 
                combo_exercise_names: newNames, 
                combo_reps_per_exercise: newReps,
                combo_time_per_exercise: newTimes
              });
            }}
            className="w-full rounded-xl py-3 font-bold text-sm"
            style={{ backgroundColor: '#E3F2FD', color: '#2196F3', border: '2px dashed #2196F3' }}
          >
            <Plus className="w-4 h-4 ml-2" />
            הוסף תרגיל
          </Button>

          <div className="grid grid-cols-2 gap-3 pt-4 w-full" style={{ borderTop: '2px solid #E0E0E0' }}>
            <div>
              <Label className="text-sm font-bold mb-2 block">סבבים</Label>
              <Input
                type="number"
                value={exercise.combo_rounds || ""}
                onChange={(e) => onChange({ ...exercise, combo_rounds: e.target.value })}
                placeholder="3"
                className="rounded-xl py-3 text-base text-center w-full"
              />
            </div>
            <div>
              <Label className="text-sm font-bold mb-2 block">מנוחה בין תרגילים</Label>
              <Input
                type="number"
                value={exercise.combo_rest_between_exercises || ""}
                onChange={(e) => onChange({ ...exercise, combo_rest_between_exercises: e.target.value })}
                placeholder="10"
                className="rounded-xl py-3 text-base text-center w-full"
              />
            </div>
          </div>

          <div className="w-full">
            <Label className="text-sm font-bold mb-2 block">מנוחה בין סבבים</Label>
            <Input
              type="number"
              value={exercise.combo_rest_between_rounds || ""}
              onChange={(e) => onChange({ ...exercise, combo_rest_between_rounds: e.target.value })}
              placeholder="90"
              className="rounded-xl py-3 text-base text-center w-full"
            />
          </div>
        </div>
      )}

      {/* CUSTOM EXERCISE */}
      {exerciseType === "custom" && (
        <div className="space-y-4 p-4 rounded-xl w-full" style={{ backgroundColor: '#F3E5F5', border: '2px solid #9C27B0' }}>
          <div className="w-full">
            <Label className="text-sm font-bold mb-2 block">שם התרגיל *</Label>
            <Input
              value={exercise.exercise_name || ""}
              onChange={(e) => onChange({ ...exercise, exercise_name: e.target.value })}
              placeholder="למשל: תרגיל מיוחד שלי"
              className="rounded-xl py-3 text-base w-full"
            />
          </div>

          <div className="space-y-3 w-full">
            <Label className="text-sm font-bold mb-2 block">ערכים מותאמים אישית</Label>
            {(exercise.custom_fields || [{ label: '', value: '' }]).map((field, idx) => (
              <div key={idx} className="flex gap-2 items-start w-full">
                <Input
                  value={field.label}
                  onChange={(e) => {
                    const newFields = [...(exercise.custom_fields || [{ label: '', value: '' }])];
                    newFields[idx] = { ...newFields[idx], label: e.target.value };
                    onChange({ ...exercise, custom_fields: newFields });
                  }}
                  placeholder="שם הערך"
                  className="rounded-xl flex-1 min-w-0"
                />
                <Input
                  value={field.value}
                  onChange={(e) => {
                    const newFields = [...(exercise.custom_fields || [{ label: '', value: '' }])];
                    newFields[idx] = { ...newFields[idx], value: e.target.value };
                    onChange({ ...exercise, custom_fields: newFields });
                  }}
                  placeholder="ערך"
                  className="rounded-xl flex-1 min-w-0"
                />
                {idx > 0 && (
                  <Button
                    type="button"
                    onClick={() => {
                      const newFields = (exercise.custom_fields || []).filter((_, i) => i !== idx);
                      onChange({ ...exercise, custom_fields: newFields });
                    }}
                    size="sm"
                    className="rounded-lg flex-shrink-0 w-8 h-8"
                    style={{ backgroundColor: '#f44336', color: 'white' }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Button
            type="button"
            onClick={() => {
              const newFields = [...(exercise.custom_fields || [{ label: '', value: '' }]), { label: '', value: '' }];
              onChange({ ...exercise, custom_fields: newFields });
            }}
            className="w-full rounded-xl py-3 font-bold text-sm"
            style={{ backgroundColor: '#E8F5E9', color: '#2E7D32', border: '2px dashed #4CAF50' }}
          >
            <Plus className="w-4 h-4 ml-2" />
            הוסף ערך
          </Button>
        </div>
      )}

      {/* TABATA EXERCISE */}
      {exerciseType === "tabata" && (
        <div className="space-y-4 p-4 rounded-xl w-full" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-base">⚡ תרגילי הטבטה</h3>
            <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: '#FF6F20', color: 'white' }}>
              {(exercise.tabata_exercise_names || ['']).length}
            </span>
          </div>

          <div className="space-y-2 w-full">
            {(exercise.tabata_exercise_names || ['']).map((name, idx) => (
              <div key={idx} className="flex gap-2 p-2 rounded-lg w-full" style={{ backgroundColor: '#FFFFFF', border: '2px solid #E0E0E0' }}>
                <Input
                  value={name}
                  onChange={(e) => {
                    const newNames = [...(exercise.tabata_exercise_names || [''])];
                    newNames[idx] = e.target.value;
                    onChange({ ...exercise, tabata_exercise_names: newNames });
                  }}
                  placeholder={`תרגיל ${idx + 1}`}
                  className="rounded-lg flex-1 text-sm min-w-0"
                />
                {idx > 0 && (
                  <Button
                    type="button"
                    onClick={() => {
                      const newNames = (exercise.tabata_exercise_names || ['']).filter((_, i) => i !== idx);
                      onChange({ ...exercise, tabata_exercise_names: newNames });
                    }}
                    size="sm"
                    className="rounded-lg flex-shrink-0 w-7 h-7"
                    style={{ backgroundColor: '#f44336', color: 'white' }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Button
            type="button"
            onClick={() => {
              const newNames = [...(exercise.tabata_exercise_names || ['']), ''];
              onChange({ ...exercise, tabata_exercise_names: newNames });
            }}
            className="w-full rounded-xl py-3 font-bold text-sm"
            style={{ backgroundColor: '#E3F2FD', color: '#2196F3', border: '2px dashed #2196F3' }}
          >
            <Plus className="w-4 h-4 ml-2" />
            הוסף תרגיל
          </Button>

          <div className="grid grid-cols-3 gap-3 w-full">
            <div>
              <Label className="text-sm font-bold mb-2 block">עבודה</Label>
              <Input
                type="number"
                value={exercise.work_time || ""}
                onChange={(e) => onChange({ ...exercise, work_time: e.target.value })}
                placeholder="20"
                className="rounded-xl py-3 text-base text-center w-full"
              />
            </div>
            <div>
              <Label className="text-sm font-bold mb-2 block">מנוחה</Label>
              <Input
                type="number"
                value={exercise.rest_time_tabata || ""}
                onChange={(e) => onChange({ ...exercise, rest_time_tabata: e.target.value })}
                placeholder="10"
                className="rounded-xl py-3 text-base text-center w-full"
              />
            </div>
            <div>
              <Label className="text-sm font-bold mb-2 block">סבבים</Label>
              <Input
                type="number"
                value={exercise.rounds || ""}
                onChange={(e) => onChange({ ...exercise, rounds: e.target.value })}
                placeholder="8"
                className="rounded-xl py-3 text-base text-center w-full"
              />
            </div>
          </div>

          <div className="w-full">
            <Label className="text-sm font-bold mb-2 block">מנוחה בין סבבים</Label>
            <Input
              type="number"
              value={exercise.tabata_rest_between_rounds || ""}
              onChange={(e) => onChange({ ...exercise, tabata_rest_between_rounds: e.target.value })}
              placeholder="60"
              className="rounded-xl py-3 text-base text-center w-full"
            />
          </div>
        </div>
      )}

      {/* COMMON FIELDS */}
      <div className="space-y-4 p-4 rounded-xl w-full" style={{ backgroundColor: '#FAFAFA', border: '1px solid #E0E0E0' }}>
        <h4 className="font-bold text-sm" style={{ color: '#7D7D7D' }}>פרטים נוספים</h4>
        
        <div className="w-full">
          <Label className="text-sm font-bold mb-2 block">דגשים</Label>
          <Textarea
            value={exercise.cues || ""}
            onChange={(e) => onChange({ ...exercise, cues: e.target.value })}
            placeholder="דגשים טכניים..."
            className="rounded-xl min-h-[60px] w-full"
          />
        </div>

        <div className="w-full">
          <Label className="text-sm font-bold mb-2 block">ציוד</Label>
          <Input
            value={exercise.equipment || ""}
            onChange={(e) => onChange({ ...exercise, equipment: e.target.value })}
            placeholder="משקולות, מתח..."
            className="rounded-xl w-full"
          />
        </div>

        <div className="w-full">
          <Label className="text-sm font-bold mb-2 block">הערות</Label>
          <Textarea
            value={exercise.notes || ""}
            onChange={(e) => onChange({ ...exercise, notes: e.target.value })}
            placeholder="הערות..."
            className="rounded-xl min-h-[60px] w-full"
          />
        </div>
      </div>
    </div>
  );
}