import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ClipboardList, UserPlus, Check, Calendar } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useFormPersistence } from "../hooks/useFormPersistence";

export default function PlanFormDialog({ 
  isOpen, 
  onClose, 
  onSubmit, 
  trainees = [], 
  editingPlan = null,
  isLoading = false,
  hideTraineeSelection = false
}) {
  const defaultPlanForm = {
    plan_name: "",
    description: "",
    goal_focus: [],
    weekly_days: [],
    assigned_to: "",
    series_id: ""
  };

  const currentDefaults = editingPlan ? {
    plan_name: editingPlan.plan_name || "",
    description: editingPlan.description || "",
    goal_focus: Array.isArray(editingPlan.goal_focus) ? editingPlan.goal_focus : 
                (typeof editingPlan.goal_focus === 'string' ? editingPlan.goal_focus.split(', ') : []),
    weekly_days: Array.isArray(editingPlan.weekly_days) ? editingPlan.weekly_days : [],
    assigned_to: editingPlan.assigned_to || "",
    series_id: editingPlan.series_id || ""
  } : defaultPlanForm;

  const formKey = `plan_form_${editingPlan ? editingPlan.id : 'new'}`;
  
  const [planForm, setPlanForm, clearDraft] = useFormPersistence(formKey, currentDefaults);
  
  // Separate persistence for selectedTrainees
  const [selectedTrainees, setSelectedTrainees, clearTraineesDraft] = useFormPersistence(
    `plan_trainees_${editingPlan ? editingPlan.id : 'new'}`, 
    editingPlan?.assigned_to ? [editingPlan.assigned_to] : []
  );

  const [availableSeries, setAvailableSeries] = useState([]);

  const WEEK_DAYS = [
    "ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"
  ];

  const allGoals = [
    { value: 'כוח', label: 'כוח', icon: '💪', color: '#000000' },
    { value: 'טכניקה', label: 'טכניקה', icon: '🎯', color: '#2196F3' },
    { value: 'גמישות', label: 'גמישות', icon: '🧘', color: '#4CAF50' },
    { value: 'סבולת', label: 'סבולת', icon: '🏃', color: '#FF6F20' },
    { value: 'שיקום', label: 'שיקום', icon: '❤️‍🩹', color: '#9C27B0' },
    { value: 'כושר כללי', label: 'כושר', icon: '⚡', color: '#607D8B' },
    { value: 'מיומנות', label: 'מיומנות', icon: '⚡', color: '#FFD700' },
    { value: 'כושר שיא', label: 'שיא', icon: '🏆', color: '#E91E63' }
  ];

  // Fetch Series
  useEffect(() => {
    if (isOpen) {
        base44.entities.ProgramSeries.list().then(res => {
            setAvailableSeries(res);
        });
    }
  }, [isOpen]);

  // Removed manual reset useEffect in favor of useFormPersistence with keys


  const toggleDay = (day) => {
    setPlanForm(prev => {
      const days = prev.weekly_days || [];
      if (days.includes(day)) {
        return { ...prev, weekly_days: days.filter(d => d !== day) };
      } else {
        return { ...prev, weekly_days: [...days, day] };
      }
    });
  };

  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!planForm.plan_name || planForm.plan_name.trim() === "") {
      toast.error("נא למלא שם תוכנית");
      return;
    }

    const finalPlanData = {
      plan_name: planForm.plan_name,
      description: planForm.description || "",
      goal_focus: Array.isArray(planForm.goal_focus) && planForm.goal_focus.length > 0 ? planForm.goal_focus : ['כוח'],
      series_id: planForm.series_id || null
    };

    setSaving(true);
    console.log("[PlanForm] Submitting:", finalPlanData, "trainees:", selectedTrainees);

    try {
      await onSubmit({ planData: finalPlanData, selectedTrainees });
      console.log("[PlanForm] Success — clearing draft");
      clearDraft();
      clearTraineesDraft();
      onClose();
    } catch (error) {
      console.error("[PlanForm] Error:", error);
      toast.error("שגיאה ביצירת תוכנית: " + (error?.message || "נסה שוב"));
    } finally {
      setSaving(false);
    }
  };

  // Filter series:
  // Show only series that match selected trainee OR are templates
  const filteredSeries = availableSeries.filter(s => {
      if (selectedTrainees.length === 1) {
          // If single trainee selected, show their series + templates
          return s.assigned_to === selectedTrainees[0] || !s.assigned_to || s.is_template;
      }
      // If multiple or none, show only templates (unassigned)
      return !s.assigned_to || s.is_template;
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] md:w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-2xl md:text-3xl font-black text-[#000000]">
            {editingPlan ? 'עריכת תוכנית אימון' : 'תוכנית חדשה'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-8 py-4">
          {/* 1. Trainee Selection (Coach Only) */}
          {!editingPlan && !hideTraineeSelection && trainees.length > 0 && (
            <div className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <div className="flex items-center justify-between">
                <Label className="text-base font-bold flex items-center gap-2 text-[#000000]">
                  <div className="w-6 h-6 rounded-full bg-[#FF6F20] flex items-center justify-center text-white text-xs">1</div>
                  בחירת מתאמנים
                </Label>
                <Button
                  type="button"
                  onClick={() => {
                    if (selectedTrainees.length === trainees.length) {
                      setSelectedTrainees([]);
                    } else {
                      setSelectedTrainees(trainees.map(t => t.id));
                    }
                  }}
                  variant="ghost"
                  className="text-xs font-bold text-[#FF6F20] hover:text-[#e65b12]"
                >
                  {selectedTrainees.length === trainees.length ? 'בטל הכל' : 'בחר הכל'}
                </Button>
              </div>
              
              <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                {trainees.map(trainee => (
                  <div key={trainee.id} 
                       className={`flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer border ${selectedTrainees.includes(trainee.id) ? 'bg-orange-50 border-[#FF6F20]' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                       onClick={() => {
                         if (selectedTrainees.includes(trainee.id)) {
                           setSelectedTrainees(selectedTrainees.filter(id => id !== trainee.id));
                         } else {
                           setSelectedTrainees([...selectedTrainees, trainee.id]);
                         }
                       }}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedTrainees.includes(trainee.id) ? 'border-[#FF6F20] bg-[#FF6F20]' : 'border-gray-300'}`}>
                      {selectedTrainees.includes(trainee.id) && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-xs text-gray-700">
                      {trainee.full_name?.[0]}
                    </div>
                    <span className="font-bold text-sm text-[#000000]">{trainee.full_name}</span>
                  </div>
                ))}
              </div>
              {selectedTrainees.length > 0 && (
                <div className="text-xs font-bold text-[#FF6F20] text-center bg-white p-2 rounded-lg border border-orange-100">
                  נבחרו {selectedTrainees.length} מתאמנים לתוכנית
                </div>
              )}
            </div>
          )}

          {/* Series Selection */}
          <div className="space-y-2">
            <Label className="text-lg font-bold flex items-center gap-2 text-[#000000]">
              שיוך לסדרה (אופציונלי)
            </Label>
            <Select 
                value={planForm.series_id || "none"} 
                onValueChange={(val) => setPlanForm({...planForm, series_id: val === "none" ? "" : val})}
            >
              <SelectTrigger className="h-14 rounded-xl border-2 border-gray-200 w-full text-right" dir="rtl">
                <SelectValue placeholder="בחר סדרה..." />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="none">-- ללא סדרה --</SelectItem>
                {filteredSeries.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 2. Plan Name */}
          <div className="space-y-2">
            <Label className="text-lg font-bold flex items-center gap-2 text-[#000000]">
              {!editingPlan && !hideTraineeSelection && <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs">2</div>}
              שם התוכנית
            </Label>
            <Input
              value={planForm.plan_name}
              onChange={(e) => setPlanForm({ ...planForm, plan_name: e.target.value })}
              placeholder="לדוגמה: כוח מתפרץ - שלב א'"
              className="h-14 text-lg font-bold rounded-xl border-2 border-gray-200 focus:border-[#FF6F20] focus:ring-0 bg-white focus:bg-gray-50 transition-all"
            />
          </div>

          {/* 3. Training Focus (Original Grid Layout) */}
          <div className="space-y-3">
            <Label className="text-base font-bold flex items-center gap-2 text-[#000000]">
              {!editingPlan && !hideTraineeSelection && <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs">3</div>}
              מוקדי האימון
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {allGoals.map(goal => {
                const isSelected = Array.isArray(planForm.goal_focus) && planForm.goal_focus.includes(goal.value);
                return (
                  <button
                    key={goal.value}
                    type="button"
                    onClick={() => {
                      const currentGoals = Array.isArray(planForm.goal_focus) ? planForm.goal_focus : [];
                      if (isSelected) {
                        setPlanForm({ ...planForm, goal_focus: currentGoals.filter(g => g !== goal.value) });
                      } else {
                        setPlanForm({ ...planForm, goal_focus: [...currentGoals, goal.value] });
                      }
                    }}
                    className="p-2 md:p-3 rounded-lg font-bold text-center transition-all hover:scale-105"
                    style={{
                      backgroundColor: isSelected ? goal.color : '#FFFFFF',
                      color: isSelected ? 'white' : '#000000',
                      border: isSelected ? 'none' : '2px solid #E0E0E0'
                    }}
                  >
                    <div className="text-xl md:text-2xl mb-0.5">{goal.icon}</div>
                    <div className="text-[10px] md:text-xs">{goal.label}</div>
                  </button>
                );
              })}
            </div>
            {Array.isArray(planForm.goal_focus) && planForm.goal_focus.length > 0 && (
              <div className="mt-2 p-3 rounded-lg" style={{ backgroundColor: '#E8F5E9', border: '2px solid #4CAF50' }}>
                <p className="text-xs font-bold text-center" style={{ color: '#000000' }}>
                  ✓ נבחרו {planForm.goal_focus.length} מוקדים: {planForm.goal_focus.join(', ')}
                </p>
              </div>
            )}
          </div>

          {/* 4. Weekly Days */}
          <div className="space-y-3">
            <Label className="text-base font-bold flex items-center gap-2 text-[#000000]">
              {!editingPlan && !hideTraineeSelection && <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs">4</div>}
              ימי אימון בשבוע
            </Label>
            <div className="grid grid-cols-7 gap-1 md:gap-2 bg-gray-50 p-2 rounded-xl border border-gray-100">
              {WEEK_DAYS.map((day, idx) => {
                const isSelected = planForm.weekly_days?.includes(day);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`
                      aspect-square md:aspect-auto md:h-12 rounded-lg md:rounded-xl flex items-center justify-center text-xs md:text-sm font-bold transition-all
                      ${isSelected 
                        ? 'bg-[#FF6F20] text-white shadow-md transform scale-105' 
                        : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'}
                    `}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mr-1">ניתן לבחור מספר ימים קבועים לאימון</p>
          </div>

          {/* 5. Description */}
          <div className="space-y-2">
            <Label className="text-base font-bold flex items-center gap-2 text-[#000000]">
              {!editingPlan && !hideTraineeSelection && <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs">5</div>}
              תיאור והנחיות
            </Label>
            <Textarea
              value={planForm.description}
              onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
              placeholder="פרט כאן את מטרות התוכנית, דגשים חשובים והנחיות כלליות..."
              className="min-h-[120px] rounded-xl border border-gray-200 bg-gray-50 focus:border-[#FF6F20] focus:ring-0 focus:bg-white resize-none p-4 text-base transition-all"
            />
          </div>

          {/* 6. Actions */}
          <div className="pt-4 border-t border-gray-100 flex gap-3">
            <Button
              onClick={() => {
                clearDraft();
                clearTraineesDraft();
                onClose();
              }}
              variant="outline"
              className="flex-1 h-14 rounded-xl font-bold text-gray-600 border-2 border-gray-100 hover:bg-gray-50 hover:border-gray-200"
            >
              ביטול
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isLoading || saving || !planForm.plan_name}
              className="flex-[2] h-14 rounded-xl font-bold text-white text-lg shadow-lg transition-all bg-black hover:bg-[#FF6F20]"
            >
              {(isLoading || saving) ? (
                <><Loader2 className="w-5 h-5 ml-2 animate-spin" />שומר...</>
              ) : (
                "שמור תוכנית"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}