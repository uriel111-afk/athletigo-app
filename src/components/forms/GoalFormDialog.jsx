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
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useFormPersistence } from "../hooks/useFormPersistence";

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

export default function GoalFormDialog({ isOpen, onClose, traineeId, traineeName, editingGoal = null, onSuccess }) {
  const queryClient = useQueryClient();
  
  const defaultFormData = {
    goal_name: "",
    goal_type: "",
    current_value: "",
    target_value: "",
    unit: "",
    current_status_level: "",
    current_status_notes: "",
    progression_steps: "",
    main_blockers: [],
    target_date: "",
    extra_notes: ""
  };

  const currentDefaults = editingGoal ? {
    goal_name: editingGoal.goal_name || "",
    goal_type: editingGoal.goal_type || "",
    current_value: editingGoal.current_value || "",
    target_value: editingGoal.target_value || "",
    unit: editingGoal.unit || "",
    current_status_level: editingGoal.current_status_level || "",
    current_status_notes: editingGoal.current_status_notes || "",
    progression_steps: editingGoal.progression_steps || "",
    main_blockers: editingGoal.main_blockers || [],
    target_date: editingGoal.target_date ? new Date(editingGoal.target_date).toISOString().split('T')[0] : "",
    extra_notes: editingGoal.extra_notes || ""
  } : defaultFormData;

  const formKey = `goal_form_${editingGoal ? editingGoal.id : 'new'}_${traineeId}`;
  const [formData, setFormData, clearDraft, draftExists] = useFormPersistence(formKey, currentDefaults);

  const createGoalMutation = useMutation({
    mutationFn: (data) => base44.entities.Goal.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-goals'] });
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
      if (onSuccess) onSuccess();
      clearDraft(); // Clear draft on success
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
      if (onSuccess) onSuccess();
      clearDraft(); // Clear draft on success
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

    // Map form fields to actual DB columns in goals table
    const goalData = {
      trainee_id: traineeId,
      title: formData.goal_name || formData.title || "",
      description: formData.description || null,
      category: formData.goal_type || formData.category || null,
      current_value: formData.current_value ? parseFloat(formData.current_value) : null,
      target_value: formData.target_value ? parseFloat(formData.target_value) : null,
      target_unit: formData.unit || formData.target_unit || null,
      target_date: formData.target_date ? new Date(formData.target_date).toISOString() : null,
      deadline: formData.target_date ? new Date(formData.target_date).toISOString() : null,
      notes: [formData.extra_notes, formData.progression_steps, formData.main_blockers?.join(', ')].filter(Boolean).join(' | ') || null,
      status: editingGoal ? editingGoal.status : "בתהליך",
    };

    try {
      if (editingGoal) {
        await updateGoalMutation.mutateAsync({ id: editingGoal.id, data: goalData });
      } else {
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] md:w-full max-w-lg max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFF', WebkitOverflowScrolling: 'touch' }} dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Target className="w-6 h-6 text-[#FF6F20]" />
            {editingGoal ? 'עריכת יעד' : 'יעד חדש'}
          </DialogTitle>
          {draftExists && (
            <div className="text-sm text-gray-500 mt-1">
              טיוטה שמורה
            </div>
          )}
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* 1. Goal Name */}
          <div className="space-y-2">
            <Label className="font-bold text-base">שם היעד *</Label>
            <Input
              value={formData.goal_name}
              onChange={(e) => setFormData({ ...formData, goal_name: e.target.value })}
              placeholder="לדוגמה: 10 עליות כוח ברצף"
              className="rounded-xl border-gray-200 focus:border-[#FF6F20]"
            />
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
                  type="number" 
                  value={formData.current_value} 
                  onChange={(e) => setFormData({ ...formData, current_value: e.target.value })}
                  placeholder="הקלד מספר" 
                  className="rounded-lg h-9 text-center bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">יעד מספרי</Label>
                <Input 
                  type="number" 
                  value={formData.target_value} 
                  onChange={(e) => setFormData({ ...formData, target_value: e.target.value })}
                  placeholder="הקלד מספר" 
                  className="rounded-lg h-9 text-center bg-white"
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
                      ? 'bg-orange-50 border-[#FF6F20] text-[#FF6F20] font-bold' 
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
              className="flex-1 rounded-xl h-12 font-bold bg-[#FF6F20] hover:bg-[#e65b12] text-white"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'שמור יעד'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}