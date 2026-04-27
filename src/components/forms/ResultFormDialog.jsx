import React, { useState, useEffect, useMemo, useContext } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Award } from "lucide-react";
import { useCloseConfirm } from "../hooks/useCloseConfirm";
import { useFormDraft } from "@/hooks/useFormDraft";
import DraftPrompt from "@/components/DraftPrompt";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AuthContext } from "@/lib/AuthContext";
import { notifyNewRecord } from "@/functions/notificationTriggers";
import { invalidateDashboard } from "@/components/utils/queryKeys";

const RECORD_TYPES = [
  "חבל",
  "מקל",
  "תרגילי משקל גוף",
  "כוח",
  "סיבולת",
  "גמישות",
  "מיומנות אחרת"
];

const RECORD_UNITS = [
  "חזרות",
  "שניות",
  "דקות",
  "ק״ג",
  "מטרים",
  "ס״מ",
  "אחוז",
  "אחר"
];

const CONTEXTS = [
  "אימון אישי",
  "אימון קבוצה",
  "אימון אונליין",
  "אימוני לבד",
  "מבחן שיא",
  "תחרות / אירוע",
  "אחר"
];

export default function ResultFormDialog({ isOpen, onClose, traineeId, traineeName, editingResult = null, onSuccess }) {
  const queryClient = useQueryClient();
  const { user: authUser } = useContext(AuthContext);
  const isTraineeAdding = authUser && !authUser.is_coach && authUser.role !== 'coach' && authUser.role !== 'admin';

  const initialFormData = useMemo(() => editingResult ? {
    title: editingResult.title || "",
    record_type: editingResult.record_type || "",
    skill_or_exercise: editingResult.skill_or_exercise || "",
    record_value: editingResult.record_value || "",
    record_unit: editingResult.record_unit || "",
    date: editingResult.date ? new Date(editingResult.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    context: editingResult.context || "",
    assistance: editingResult.assistance || "",
    effort_level: editingResult.effort_level?.toString() || "",
    description: editingResult.description || ""
  } : {
    title: "",
    record_type: "",
    skill_or_exercise: "",
    record_value: "",
    record_unit: "",
    date: new Date().toISOString().split('T')[0],
    context: "",
    assistance: "",
    effort_level: "",
    description: ""
  }, [editingResult]);

  // Draft persistence — survives refresh / accidental close. Editing existing
  // records doesn't share a draft slot with the "new record" flow.
  const draftScope = editingResult ? `edit_${editingResult.id}` : `new_${traineeId || 'me'}`;
  const draftCtx = traineeId ? { traineeId, traineeName } : null;
  const {
    data: formData, setData: setFormData, clearDraft,
    hasDraft, keepDraft, discardDraft,
    draftContext: savedCtx,
  } = useFormDraft('record_form', draftScope, isOpen, initialFormData, draftCtx);

  const hasChanges = !!(formData.title || formData.record_value || formData.description);
  const { confirmClose, ConfirmDialog } = useCloseConfirm(hasChanges, onClose);

  const createResultMutation = useMutation({
    mutationFn: (data) => base44.entities.ResultsLog.create(data),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['my-results'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-goals'] });
      invalidateDashboard(queryClient);
      if (onSuccess) onSuccess();
      toast.success("השיא נשמר בהצלחה");
      // Notify coach when trainee adds a record
      if (isTraineeAdding && formData.title) {
        try {
          const coaches = await base44.entities.User.list('-created_at', 100);
          const coach = coaches.find(u => u.is_coach === true || u.role === 'coach');
          if (coach) {
            await notifyNewRecord({ coachId: coach.id, traineeId, traineeName: traineeName || authUser?.full_name, recordName: formData.title });
          }
        } catch {}
      }
      clearDraft();
      onClose();
    },
    onError: (error) => {
      console.error("Error creating result:", error);
      toast.error("שגיאה בשמירת השיא");
    }
  });

  const updateResultMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ResultsLog.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-results'] });
      invalidateDashboard(queryClient);
      if (onSuccess) onSuccess();
      toast.success("השיא עודכן בהצלחה");
      clearDraft();
      onClose();
    },
    onError: (error) => {
      console.error("Error updating result:", error);
      toast.error("שגיאה בעדכון השיא");
    }
  });

  const handleSubmit = async () => {
    if (!formData.title || !formData.date) {
      toast.error("נא למלא את שדות החובה (שם השיא ותאריך)");
      return;
    }

    // Validation for value+unit
    if ((formData.record_value && !formData.record_unit) || (!formData.record_value && formData.record_unit)) {
        toast.error("נא למלא גם תוצאה וגם יחידה");
        return;
    }

    // Map to actual DB columns — results_log has NO trainee_name or type columns
    const resultData = {
      trainee_id: traineeId,
      title: formData.title,
      date: new Date(formData.date).toISOString(),
      skill_or_exercise: formData.skill_or_exercise || null,
      record_value: formData.record_value ? String(formData.record_value) : null,
      record_unit: formData.record_unit || null,
      effort_level: formData.effort_level ? String(formData.effort_level) : null,
      context: formData.context || null,
      assistance: formData.assistance || null,
      description: formData.description || null,
    };

    try {
      if (editingResult) {
        await updateResultMutation.mutateAsync({ id: editingResult.id, data: resultData });
      } else {
        await createResultMutation.mutateAsync(resultData);
      }
    } catch (error) {
      console.error("[ResultForm] Save error:", error);
      toast.error("שגיאה בשמירת השיא: " + (error?.message || "נסה שוב"));
    }
  };

  const isLoading = createResultMutation.isPending || updateResultMutation.isPending;

  return (
    <>
      {isOpen && hasDraft && (
        <DraftPrompt
          traineeName={savedCtx?.traineeName || traineeName}
          formLabel="טופס שיא"
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
            <Award className="w-6 h-6 text-[#FFD700]" />
            {editingResult ? 'עריכת שיא' : 'שיא חדש'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          
          {/* Section 1: Record Details */}
          <div className="space-y-4">
            {/* 1. Record Name */}
            <div className="space-y-2">
              <Label className="font-bold text-base">שם השיא *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="לדוגמה: מקסימום מתח"
                className="rounded-xl border-gray-200 focus:border-[#FF6F20]"
              />
            </div>

            {/* Record Date */}
            <div className="space-y-2">
              <Label className="font-bold text-base">תאריך השיא *</Label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                max={new Date().toISOString().split('T')[0]}
                className="rounded-xl border-gray-200"
              />
            </div>

            {/* 2. Record Type */}
            <div className="space-y-2">
              <Label className="font-bold text-base">סוג השיא</Label>
              <Select 
                value={formData.record_type} 
                onValueChange={(value) => setFormData({ ...formData, record_type: value })}
              >
                <SelectTrigger className="rounded-xl border-gray-200 text-right">
                  <SelectValue placeholder="בחר סוג שיא" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {RECORD_TYPES.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 3. Skill or Exercise - Removed */}
          </div>

          {/* Section 2: Result */}
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-4">
            <Label className="font-bold text-sm block text-gray-700">תוצאה</Label>
            
            {/* 4. Value + Unit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">תוצאה *</Label>
                <Input 
                  type="number" 
                  step="0.1"
                  value={formData.record_value} 
                  onChange={(e) => setFormData({ ...formData, record_value: e.target.value })}
                  placeholder="30" 
                  className="rounded-lg h-10 text-center bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">יחידה *</Label>
                <Select 
                  value={formData.record_unit} 
                  onValueChange={(value) => setFormData({ ...formData, record_unit: value })}
                >
                  <SelectTrigger className="rounded-lg h-10 text-right bg-white border-gray-200">
                    <SelectValue placeholder="בחר" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {RECORD_UNITS.map(unit => (
                      <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>


          </div>

          {/* Section 3: Context & Details */}
          <div className="space-y-4">
            {/* 6. Context */}
            <div className="space-y-2">
              <Label className="font-bold text-base">הקשר השיא</Label>
              <Select 
                value={formData.context} 
                onValueChange={(value) => setFormData({ ...formData, context: value })}
              >
                <SelectTrigger className="rounded-xl border-gray-200 text-right">
                  <SelectValue placeholder="בחר הקשר" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {CONTEXTS.map(ctx => (
                    <SelectItem key={ctx} value={ctx}>{ctx}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 7. Assistance */}
            <div className="space-y-2">
              <Label className="font-bold text-base">עזרה / ציוד</Label>
              <Input
                value={formData.assistance}
                onChange={(e) => setFormData({ ...formData, assistance: e.target.value })}
                placeholder="לדוגמה: גומייה, קיר, ספוטר..."
                className="rounded-xl border-gray-200"
              />
            </div>

            {/* 8. Effort Level */}
            <div className="space-y-2">
              <Label className="font-bold text-base">רמת מאמץ (1–10)</Label>
              <Select 
                value={formData.effort_level} 
                onValueChange={(value) => setFormData({ ...formData, effort_level: value })}
              >
                <SelectTrigger className="rounded-xl border-gray-200 text-right">
                  <SelectValue placeholder="בחר רמת מאמץ" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(level => (
                    <SelectItem key={level} value={level.toString()}>{level}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 9. Notes */}
            <div className="space-y-2">
              <Label className="font-bold text-base">הערות נוספות</Label>
              <Textarea 
                value={formData.description} 
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="איך הרגיש השיא? מה תרצה לשפר בפעם הבאה?"
                className="rounded-xl border-gray-200 min-h-[80px] resize-none"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-100 mt-4">
            <Button 
              variant="outline" 
              onClick={onClose} 
              className="flex-1 rounded-xl h-12 font-bold border-gray-300"
            >
              ביטול
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={isLoading} 
              className="flex-1 rounded-xl h-12 font-bold bg-[#FFD700] hover:bg-[#e6c200] text-black"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'שמור שיא'}
            </Button>
          </div>
        </div>
        </DialogContent>
      </Dialog>
    </>
  );
}