import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Target } from "lucide-react";
import { toast } from "sonner";
import { invalidateDashboard } from "@/components/utils/queryKeys";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useFormPersistence } from "../hooks/useFormPersistence";
import { useFormDraft } from "@/hooks/useFormDraft";
import { useCloseConfirm } from "../hooks/useCloseConfirm";
import DraftPrompt from "@/components/DraftPrompt";
import { getCurrentPB, cancelActiveGoals, GOAL_STATUS } from "@/lib/goalsApi";

const GOAL_TYPES = [
  "חבל",
  "מקל",
  "תרגילי משקל גוף",
  "גמישות",
  "כוח / סיבולת",
  "מיומנות אחרת"
];

const STATUS_LEVELS = [
  "לא ניסיתי עדיין",
  "ניסיתי כמה פעמים – לא מצליח",
  "מצליח חלקית / שליטה נמוכה",
  "בינוני – יש התקדמות",
  "כמעט מצליח",
  "שולט חלקית",
  "שולט ברמה גבוהה ורוצה לשפר"
];

const BLOCKERS = [
  "כוח",
  "טכניקה",
  "גמישות ונוקשות",
  "פחד / מחסום מנטלי",
  "יציבות ודיוק",
  "קואורדינציה / קצב",
  "חוסר התמדה",
  "אחר"
];

// Visual goal-category picker shown on step 1 — same 8 categories
// the GoalsTab v2 NewGoalSheet uses, kept in sync intentionally.
// Picking a preset writes formData.goal_preset → goal_type DB column
// and pre-fills formData.unit. Hebrew exercise-equipment buckets
// (חבל / מקל / …) live in the GOAL_TYPES Select on step 2 and write
// to the 'category' column — they're orthogonal axes, not duplicates.
const GOAL_PRESETS = [
  { type: 'distance',     icon: '🏃', label: 'ריצה / מרחק',  unit: 'ק"מ' },
  { type: 'reps',         icon: '💪', label: 'כוח / חזרות',   unit: 'חזרות' },
  { type: 'weight_loss',  icon: '⚖️', label: 'ירידה במשקל',  unit: 'ק"ג' },
  { type: 'weight_gain',  icon: '📈', label: 'עלייה במסה',   unit: 'ק"ג' },
  { type: 'skill',        icon: '🎯', label: 'מיומנות',      unit: 'שלב' },
  { type: 'time',         icon: '⏱',  label: 'שיפור זמן',    unit: 'שניות' },
  { type: 'body',         icon: '📏', label: 'מדדי גוף',     unit: 'ס"מ' },
  { type: 'custom',       icon: '✨', label: 'יעד אחר',      unit: '' },
];

export default function GoalFormDialog({ isOpen, onClose, traineeId, traineeName, editingGoal = null, onSuccess, prefill = null }) {
  const queryClient = useQueryClient();

  // Prefill is set by the goal-achieved popup or any caller that
  // wants to skip ahead with a known exercise + starting value.
  // We treat it as a hint applied only on the create path.
  const defaultFormData = {
    goal_name: prefill?.exerciseName ? `${prefill.exerciseName} – יעד חדש` : "",
    goal_type: "",
    goal_preset: "",
    exercise_name: prefill?.exerciseName || "",
    current_value: prefill?.startingValue != null ? String(prefill.startingValue) : "",
    target_value: "",
    unit: "",
    current_status_level: "",
    current_status_notes: "",
    progression_steps: "",
    main_blockers: [],
    target_date: "",
    extra_notes: ""
  };

  // editingGoal can come from either form lineage — the v2 NewGoalSheet
  // writes the English preset key to goals.goal_type, so we read that
  // back into goal_preset when editing.
  const currentDefaults = editingGoal ? {
    goal_name: editingGoal.goal_name || editingGoal.title || "",
    goal_type: editingGoal.category || "",
    goal_preset: editingGoal.goal_type || "",
    exercise_name: editingGoal.exercise_name || "",
    current_value: editingGoal.current_value || "",
    target_value: editingGoal.target_value || "",
    unit: editingGoal.unit || editingGoal.target_unit || "",
    current_status_level: editingGoal.current_status_level || "",
    current_status_notes: editingGoal.current_status_notes || "",
    progression_steps: editingGoal.progression_steps || "",
    main_blockers: editingGoal.main_blockers || [],
    target_date: editingGoal.target_date ? new Date(editingGoal.target_date).toISOString().split('T')[0] : "",
    extra_notes: editingGoal.extra_notes || ""
  } : defaultFormData;

  const scopeKey = `${traineeId ?? 'no-trainee'}_${editingGoal ? editingGoal.id : 'new'}`;
  const draftCtx = traineeId ? { traineeId, traineeName } : null;
  const {
    data: formData, setData: setFormData, clearDraft,
    hasDraft, keepDraft, discardDraft,
    draftContext: savedCtx,
  } = useFormDraft('GoalForm', scopeKey, isOpen, currentDefaults, draftCtx);

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(currentDefaults);
  const { confirmClose, ConfirmDialog } = useCloseConfirm(hasChanges, () => { clearDraft(); onClose(); });

  // Two-step flow:
  //   1 = visual GOAL_PRESETS picker (only for fresh "new goal")
  //   2 = full form (existing fields, unchanged)
  // Edit mode and any draft-restored / preset-already-chosen state
  // skip directly to step 2 so the trainee never has to re-pick.
  const [step, setStep] = useState(editingGoal || formData?.goal_preset ? 2 : 1);
  // Reset step every time the dialog reopens so a fresh "+ יעד חדש"
  // tap always lands on the picker, but reopening to edit lands on
  // the form.
  useEffect(() => {
    if (isOpen) setStep(editingGoal || formData?.goal_preset ? 2 : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingGoal?.id]);

  const selectedPreset = GOAL_PRESETS.find((p) => p.type === formData?.goal_preset) || null;

  const createGoalMutation = useMutation({
    mutationFn: (data) => base44.entities.Goal.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-goals'] });
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['goal-progress'] });
      invalidateDashboard(queryClient);
      if (onSuccess) onSuccess();
      clearDraft();
      toast.success("היעד נשמר בהצלחה");
      onClose();
    },
    onError: (error) => {
      console.error("Error creating goal:", error);
      toast.error("שגיאה בשמירת היעד");
    }
  });

  const updateGoalMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Goal.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-goals'] });
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['goal-progress'] });
      invalidateDashboard(queryClient);
      if (onSuccess) onSuccess();
      clearDraft();
      toast.success("היעד עודכן בהצלחה");
      onClose();
    },
    onError: (error) => {
      console.error("Error updating goal:", error);
      toast.error("שגיאה בעדכון היעד");
    }
  });

  const isLoading = createGoalMutation.isPending || updateGoalMutation.isPending;

  const handleSubmit = async () => {
    if (!formData.goal_name) {
      toast.error("נא למלא שם היעד");
      return;
    }

    // exercise_name links the goal to personal_records.name so the
    // chart can overlay the projection line + achievement dots.
    // When the user didn't fill it in, we fall back to the goal_name
    // so legacy entries still get *some* anchor.
    const exerciseName = (formData.exercise_name || formData.goal_name || '').trim();

    // starting_value is the PB at the moment the goal was set. On
    // create we look it up from personal_records — anchors the
    // progress bar in the goals tab + the projection line on the chart.
    let startingValue = null;
    if (!editingGoal && traineeId && exerciseName) {
      try {
        const pb = await getCurrentPB(traineeId, exerciseName);
        if (Number.isFinite(pb)) startingValue = pb;
      } catch (e) {
        console.warn("[GoalForm] getCurrentPB failed:", e?.message);
      }
    }

    // Map form fields to actual DB columns in goals table.
    // status defaults to the Hebrew 'פעיל' so the new active-goal
    // queries pick this row up immediately. The migration adds
    // exercise_name / starting_value / exercise_type — base44 silently
    // drops them if the migration hasn't run yet.
    const goalData = {
      trainee_id: traineeId,
      title: formData.goal_name || formData.title || "",
      description: formData.description || null,
      category: formData.goal_type || formData.category || null,
      goal_type: formData.goal_preset || (editingGoal && !formData.goal_preset ? editingGoal.goal_type : null) || null,
      exercise_name: exerciseName || null,
      starting_value: startingValue,
      current_value: formData.current_value ? parseFloat(formData.current_value) : null,
      target_value: formData.target_value ? parseFloat(formData.target_value) : null,
      target_unit: formData.unit || formData.target_unit || null,
      target_date: formData.target_date ? new Date(formData.target_date).toISOString() : null,
      deadline: formData.target_date ? new Date(formData.target_date).toISOString() : null,
      notes: [formData.extra_notes, formData.progression_steps, formData.main_blockers?.join(', ')].filter(Boolean).join(' | ') || null,
      status: editingGoal ? editingGoal.status : GOAL_STATUS.ACTIVE,
    };

    try {
      if (editingGoal) {
        await updateGoalMutation.mutateAsync({ id: editingGoal.id, data: goalData });
      } else {
        // Only one active goal per trainee+exercise — cancel any
        // prior active row before inserting the new one.
        if (traineeId && exerciseName) {
          await cancelActiveGoals(traineeId, exerciseName);
        }
        await createGoalMutation.mutateAsync(goalData);
      }
    } catch (error) {
      console.error("[GoalForm] Save error:", error);
      toast.error("שגיאה בשמירת היעד: " + (error?.message || "נסה שוב"));
    }
  };

  const toggleBlocker = (blocker) => {
    setFormData(prev => {
      const blockers = prev.main_blockers || [];
      if (blockers.includes(blocker)) {
        return { ...prev, main_blockers: blockers.filter(b => b !== blocker) };
      } else {
        return { ...prev, main_blockers: [...blockers, blocker] };
      }
    });
  };

  const handleCancel = () => {
    clearDraft();
    onClose();
  };

  return (
    <>
      {isOpen && hasDraft && (
        <DraftPrompt
          traineeName={savedCtx?.traineeName || traineeName}
          formLabel="טופס יעד"
          onResume={keepDraft}
          onNew={discardDraft}
          onDiscard={discardDraft}
        />
      )}
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) confirmClose(); }}>
        <DialogContent className="max-w-lg">
          {ConfirmDialog}
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Target className="w-6 h-6 text-[var(--ag-accent)]" />
              {editingGoal ? 'עריכת יעד' : 'יעד חדש'}
            </DialogTitle>
          </DialogHeader>

        {/* Step 1 — visual GOAL_PRESETS picker. Picking a preset
            stores the English category key + pre-fills the unit, then
            advances to step 2 so the trainee never sees a blank form. */}
        {step === 1 && (
          <div className="py-2" dir="rtl">
            <div className="text-base font-bold mb-3 text-gray-800">איזה סוג יעד?</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {GOAL_PRESETS.map((preset) => {
                const isSelected = formData.goal_preset === preset.type;
                return (
                  <button
                    key={preset.type}
                    type="button"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        goal_preset: preset.type,
                        unit: formData.unit || preset.unit,
                      });
                      setStep(2);
                    }}
                    style={{
                      padding: '20px 16px', borderRadius: 16, cursor: 'pointer',
                      background: isSelected ? '#FFF5EE' : 'white',
                      border: isSelected ? '2px solid var(--ag-accent)' : '1.5px solid var(--ag-border)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    }}
                  >
                    <span style={{ fontSize: 36 }}>{preset.icon}</span>
                    <span style={{
                      fontSize: 14, fontWeight: 700,
                      color: isSelected ? 'var(--ag-accent)' : 'var(--ag-text)',
                    }}>
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex pt-5">
              <Button
                variant="outline"
                onClick={handleCancel}
                className="flex-1 rounded-xl h-12 font-bold border-gray-300"
              >
                ביטול
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
        <div className="space-y-5 py-2">
          {/* Selected-preset chip + back arrow — visible only when the
              user actually came through step 1 (i.e. picked a preset).
              On edit mode without a preset on the row, no chip shows. */}
          {(selectedPreset || !editingGoal) && (
            <div className="flex items-center gap-3 -mb-1" dir="rtl">
              {!editingGoal && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  aria-label="חזרה לבחירת סוג יעד"
                  className="text-gray-500 hover:text-[var(--ag-accent)] text-xl leading-none px-1"
                >→</button>
              )}
              {selectedPreset && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FFF5EE] border border-[#FFD9C0]">
                  <span style={{ fontSize: 18 }}>{selectedPreset.icon}</span>
                  <span className="text-sm font-bold text-[var(--ag-accent)]">{selectedPreset.label}</span>
                </div>
              )}
            </div>
          )}

          {/* 1. Goal Name */}
          <div className="space-y-2">
            <Label className="font-bold text-base">שם היעד *</Label>
            <Input
              value={formData.goal_name}
              onChange={(e) => setFormData({ ...formData, goal_name: e.target.value })}
              placeholder="לדוגמה: 10 עליות כוח ברצף"
              className="rounded-xl border-gray-200 focus:border-[var(--ag-accent)]"
            />
          </div>

          {/* 1b. Exercise name — links the goal to personal_records
                so the chart can overlay the projection + milestones. */}
          <div className="space-y-2">
            <Label className="font-bold text-base">שם התרגיל בשיאים</Label>
            <Input
              value={formData.exercise_name || ""}
              onChange={(e) => setFormData({ ...formData, exercise_name: e.target.value })}
              placeholder="לדוגמה: עליות מתח / Pull Ups"
              className="rounded-xl border-gray-200 focus:border-[var(--ag-accent)]"
            />
            <div className="text-xs text-gray-500">השם המדויק של התרגיל בטאב השיאים — מאפשר לקשר את היעד לשיא ולהציג קו תחזית.</div>
          </div>

          {/* 2. Goal Type */}
          <div className="space-y-2">
            <Label className="font-bold text-base">סוג היעד</Label>
            <Select 
              value={formData.goal_type} 
              onValueChange={(value) => setFormData({ ...formData, goal_type: value })}
            >
              <SelectTrigger className="rounded-xl border-gray-200 text-right">
                <SelectValue placeholder="בחר סוג יעד" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {GOAL_TYPES.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 3. Quantitative Block */}
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <Label className="font-bold text-sm mb-3 block text-gray-700">מדדים מספריים (אופציונלי)</Label>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">מצב נוכחי</Label>
                <Input
                  type="text"
                  value={formData.current_value}
                  onChange={(e) => setFormData({ ...formData, current_value: e.target.value })}
                  placeholder='לדוגמה: "5 ק״מ"'
                  className="rounded-lg h-9 text-center text-sm placeholder:text-xs bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">יעד מספרי</Label>
                <Input
                  type="text"
                  value={formData.target_value}
                  onChange={(e) => setFormData({ ...formData, target_value: e.target.value })}
                  placeholder='לדוגמה: "10 ק״מ"'
                  className="rounded-lg h-9 text-center text-sm placeholder:text-xs bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">יחידה</Label>
                <Input 
                  value={formData.unit} 
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  placeholder='חזרות' 
                  className="rounded-lg h-9 text-center bg-white"
                />
              </div>
            </div>
          </div>

          {/* 4. Current Status Level */}
          <div className="space-y-2">
            <Label className="font-bold text-base">איך היית מתאר את המצב הנוכחי?</Label>
            <Select 
              value={formData.current_status_level} 
              onValueChange={(value) => setFormData({ ...formData, current_status_level: value })}
            >
              <SelectTrigger className="rounded-xl border-gray-200 text-right h-auto py-3">
                <SelectValue placeholder="בחר תיאור מצב" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                {STATUS_LEVELS.map(level => (
                  <SelectItem key={level} value={level}>{level}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 5. Current Status Notes */}
          <div className="space-y-2">
            <Label className="font-bold text-base">תיאור מצב נוכחי</Label>
            <Textarea 
              value={formData.current_status_notes} 
              onChange={(e) => setFormData({ ...formData, current_status_notes: e.target.value })}
              placeholder="ספר בקצרה מה אתה מצליח לבצע כרגע, איפה קשה לך, ואיך זה מרגיש…"
              className="rounded-xl border-gray-200 min-h-[80px] resize-none"
            />
          </div>

          {/* 6. Progression Steps */}
          <div className="space-y-2">
            <Label className="font-bold text-base">שלבי ביניים (אופציונלי)</Label>
            <Textarea 
              value={formData.progression_steps} 
              onChange={(e) => setFormData({ ...formData, progression_steps: e.target.value })}
              placeholder="לדוגמה: 20 שניות הולו, 10 שניות Tuck, 5 שניות Advanced Tuck…"
              className="rounded-xl border-gray-200 min-h-[60px] resize-none"
            />
          </div>

          {/* 7. Main Blockers */}
          <div className="space-y-3">
            <Label className="font-bold text-base">מה החסם העיקרי כרגע?</Label>
            <div className="flex flex-wrap gap-2">
              {BLOCKERS.map(blocker => (
                <div 
                  key={blocker}
                  onClick={() => toggleBlocker(blocker)}
                  className={`
                    px-3 py-1.5 rounded-full text-sm border cursor-pointer transition-all select-none
                    ${formData.main_blockers.includes(blocker) 
                      ? 'bg-orange-50 border-[var(--ag-accent)] text-[var(--ag-accent)] font-bold' 
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}
                  `}
                >
                  {blocker}
                </div>
              ))}
            </div>
          </div>

          {/* 8. Target Date */}
          <div className="space-y-2">
            <Label className="font-bold text-base">תאריך יעד *</Label>
            <Input
              type="date"
              value={formData.target_date}
              onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
              min={new Date().toISOString().split('T')[0]}
              className="rounded-xl border-gray-200"
            />
          </div>

          {/* 9. Extra Notes */}
          <div className="space-y-2">
            <Label className="font-bold text-base">הערות נוספות</Label>
            <Textarea 
              value={formData.extra_notes} 
              onChange={(e) => setFormData({ ...formData, extra_notes: e.target.value })}
              placeholder="כל דבר נוסף שחשוב למאמן לדעת…"
              className="rounded-xl border-gray-200 min-h-[60px] resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-100 mt-4">
            <Button 
              variant="outline" 
              onClick={handleCancel} 
              className="flex-1 rounded-xl h-12 font-bold border-gray-300"
            >
              ביטול
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isLoading}
              className="flex-1 rounded-xl h-12 font-bold bg-[var(--ag-accent)] hover:bg-[#e65b12] text-white"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'שמור יעד'}
            </Button>
          </div>
        </div>
        )}
        </DialogContent>
      </Dialog>
    </>
  );
}