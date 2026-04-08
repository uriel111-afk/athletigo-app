import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle, Activity } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useFormPersistence } from "../hooks/useFormPersistence";

export default function MeasurementFormDialog({ isOpen, onClose, traineeId, traineeName, editingMeasurement = null }) {
  const queryClient = useQueryClient();
  
  const defaultFormData = {
    date: new Date().toISOString().split('T')[0],
    weight_kg: "",
    body_fat_percent: "",
    height_cm: "",
    chest_circumference: "",
    waist_circumference: "",
    hips_circumference: "",
    notes: ""
  };

  const currentDefaults = editingMeasurement ? {
    date: editingMeasurement.date,
    weight_kg: editingMeasurement.weight_kg?.toString() || "",
    body_fat_percent: editingMeasurement.body_fat_percent?.toString() || "",
    height_cm: editingMeasurement.height_cm?.toString() || "",
    chest_circumference: editingMeasurement.chest_circumference?.toString() || "",
    waist_circumference: editingMeasurement.waist_circumference?.toString() || "",
    hips_circumference: editingMeasurement.hips_circumference?.toString() || "",
    notes: editingMeasurement.notes || ""
  } : defaultFormData;

  const formKey = `measurement_form_${editingMeasurement ? editingMeasurement.id : 'new'}_${traineeId}`;
  const [formData, setFormData, clearDraft, draftExists] = useFormPersistence(formKey, currentDefaults);

  const createMeasurementMutation = useMutation({
    mutationFn: (data) => base44.entities.Measurement.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-measurements'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-measurements'] });
      clearDraft(); // Clear draft on success
      toast.success("✅ מדידה נוספה");
      onClose();
    },
  });

  const updateMeasurementMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Measurement.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-measurements'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-measurements'] });
      clearDraft(); // Clear draft on success
      toast.success("✅ מדידה עודכנה");
      onClose();
    },
  });

  const isLoading = createMeasurementMutation.isPending || updateMeasurementMutation.isPending;

  const handleSubmit = async () => {
    if (!formData.date) {
      toast.error("נא לבחור תאריך");
      return;
    }

    // Assuming we have the current user (coach) context or we just use the provided traineeId
    // The backend usually fills 'recorded_by' if not provided, but let's try to be safe.
    // Ideally we'd pass currentUserId prop, but let's skip 'recorded_by' for now or let backend handle it.
    
    const data = {
      trainee_id: traineeId,
      trainee_name: traineeName,
      date: formData.date,
      weight_kg: formData.weight_kg ? parseFloat(formData.weight_kg) : null,
      body_fat_percent: formData.body_fat_percent ? parseFloat(formData.body_fat_percent) : null,
      height_cm: formData.height_cm ? parseFloat(formData.height_cm) : null,
      chest_circumference: formData.chest_circumference ? parseFloat(formData.chest_circumference) : null,
      waist_circumference: formData.waist_circumference ? parseFloat(formData.waist_circumference) : null,
      hips_circumference: formData.hips_circumference ? parseFloat(formData.hips_circumference) : null,
      notes: formData.notes || ""
    };

    if (editingMeasurement) {
      await updateMeasurementMutation.mutateAsync({ id: editingMeasurement.id, data });
    } else {
      await createMeasurementMutation.mutateAsync(data);
    }
  };

  const handleCancel = () => {
    clearDraft();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] md:w-full max-w-3xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFFFFF' }} dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl md:text-3xl font-black" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
            {editingMeasurement ? '✏️ ערוך מדידה' : '➕ הוסף מדידה חדשה'}
          </DialogTitle>
          {draftExists && (
            <div className="text-sm text-gray-500 mt-1">
              טיוטה שמורה
            </div>
          )}
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <Label className="text-base font-bold mb-3 block" style={{ color: '#000000' }}>תאריך המדידה</Label>
            <Input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              max={new Date().toISOString().split('T')[0]}
              className="rounded-xl"
              style={{ border: '1px solid #E0E0E0' }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-base font-bold mb-3 block" style={{ color: '#000000' }}>משקל (ק״ג)</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.weight_kg}
                onChange={(e) => setFormData({ ...formData, weight_kg: e.target.value })}
                placeholder="הקלד משקל בק״ג"
                className="rounded-xl"
                style={{ border: '1px solid #E0E0E0' }}
              />
            </div>
            <div>
              <Label className="text-base font-bold mb-3 block" style={{ color: '#000000' }}>אחוז שומן (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.body_fat_percent}
                onChange={(e) => setFormData({ ...formData, body_fat_percent: e.target.value })}
                placeholder="הקלד BMI"
                className="rounded-xl"
                style={{ border: '1px solid #E0E0E0' }}
              />
            </div>
            <div>
              <Label className="text-base font-bold mb-3 block" style={{ color: '#000000' }}>גובה (ס״מ)</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.height_cm}
                onChange={(e) => setFormData({ ...formData, height_cm: e.target.value })}
                placeholder="הקלד גובה בסנ״מ"
                className="rounded-xl"
                style={{ border: '1px solid #E0E0E0' }}
              />
            </div>
          </div>

          <div className="p-5 rounded-xl" style={{ backgroundColor: '#FFF8F3', border: '1px solid #FF6F20' }}>
            <p className="text-sm font-bold mb-4" style={{ color: '#FF6F20' }}>
              📏 היקפי גוף (אופציונלי)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>חזה (ס״מ)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.chest_circumference}
                  onChange={(e) => setFormData({ ...formData, chest_circumference: e.target.value })}
                  placeholder="הקלד מדידה בסנ״מ"
                  className="rounded-xl"
                  style={{ border: '1px solid #E0E0E0' }}
                />
              </div>
              <div>
                <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>מותניים (ס״מ)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.waist_circumference}
                  onChange={(e) => setFormData({ ...formData, waist_circumference: e.target.value })}
                  placeholder="הקלד מדידה בסנ״מ"
                  className="rounded-xl"
                  style={{ border: '1px solid #E0E0E0' }}
                />
              </div>
              <div>
                <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>ירכיים (ס״מ)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.hips_circumference}
                  onChange={(e) => setFormData({ ...formData, hips_circumference: e.target.value })}
                  placeholder="הקלד מדידה בסנ״מ"
                  className="rounded-xl"
                  style={{ border: '1px solid #E0E0E0' }}
                />
              </div>
            </div>
          </div>

          <div>
            <Label className="text-base font-bold mb-3 block" style={{ color: '#000000' }}>הערות</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="איך הרגשתי? שינויים שהבחנתי..."
              className="rounded-xl min-h-[80px]"
              style={{ border: '1px solid #E0E0E0' }}
            />
          </div>

          <div className="flex gap-4">
            <Button
              onClick={handleCancel}
              variant="outline"
              className="flex-1 rounded-xl py-6 font-bold"
              style={{ border: '1px solid #E0E0E0', color: '#000000' }}
            >
              ביטול
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isLoading}
              className="flex-1 rounded-xl py-6 font-bold text-white"
              style={{ backgroundColor: '#FF6F20' }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                  שומר...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 ml-2" />
                  {editingMeasurement ? 'עדכן מדידה' : 'הוסף מדידה'}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}