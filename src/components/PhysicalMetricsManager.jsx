import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Edit2, Trash2, TrendingUp, TrendingDown, Activity, Plus, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { notifyMetricsUpdated, notifyTraineeMetricsUpdated } from "@/functions/notificationTriggers";
import { syncActions } from "@/functions/RealTimeSyncManager";
import { toast } from "sonner";

export default function PhysicalMetricsManager({ trainee, measurements, coach, currentUser }) {
  const [showMeasurementDialog, setShowMeasurementDialog] = useState(false);
  const [editingMeasurement, setEditingMeasurement] = useState(null);

  const [measurementForm, setMeasurementForm] = useState({
    date: new Date().toISOString().split('T')[0],
    height_cm: "",
    weight_kg: "",
    body_fat_percent: "",
    chest_circumference: "",
    waist_circumference: "",
    hips_circumference: "",
    notes: ""
  });

  const queryClient = useQueryClient();

  const createMeasurementMutation = useMutation({
    mutationFn: (data) => base44.entities.Measurement.create(data),
    onSuccess: () => {
      syncActions.measurementChanged(queryClient);
      queryClient.invalidateQueries({ queryKey: ['my-measurements'] });
      queryClient.invalidateQueries({ queryKey: ['my-measurements'] });
      setShowMeasurementDialog(false);
      setEditingMeasurement(null);
      resetMeasurementForm();
      toast.success("✅ מדידה נוספה");
    },
    onError: (err) => {
      console.error("[PhysicalMetrics] Create error:", err);
      toast.error("❌ שגיאה בשמירת מדידה: " + (err?.message || JSON.stringify(err) || "נסה שוב"));
    },
  });

  const updateMeasurementMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Measurement.update(id, data),
    onSuccess: () => {
      syncActions.measurementChanged(queryClient);
      queryClient.invalidateQueries({ queryKey: ['my-measurements'] });
      setShowMeasurementDialog(false);
      setEditingMeasurement(null);
      resetMeasurementForm();
      toast.success("✅ מדידה עודכנה");
    },
    onError: (err) => {
      console.error("[PhysicalMetrics] Update error:", err);
      toast.error("❌ שגיאה בעדכון מדידה: " + (err?.message || JSON.stringify(err) || "נסה שוב"));
    },
  });

  const deleteMeasurementMutation = useMutation({
    mutationFn: (id) => base44.entities.Measurement.delete(id),
    onSuccess: () => {
      syncActions.measurementChanged(queryClient);
      queryClient.invalidateQueries({ queryKey: ['my-measurements'] });
      toast.success("✅ מדידה נמחקה");
    },
    onError: (err) => {
      console.error("[PhysicalMetrics] Delete error:", err);
      toast.error("❌ שגיאה במחיקת מדידה: " + (err?.message || JSON.stringify(err) || "נסה שוב"));
    },
  });

  const resetMeasurementForm = () => {
    setMeasurementForm({
      date: new Date().toISOString().split('T')[0],
      height_cm: "",
      weight_kg: "",
      body_fat_percent: "",
      chest_circumference: "",
      waist_circumference: "",
      hips_circumference: "",
      notes: ""
    });
  };

  const handleSaveMeasurement = async () => {
    const creatorId = coach?.id || currentUser?.id || null;

    const data = {
      trainee_id: trainee.id,
      date: measurementForm.date,
      height: measurementForm.height_cm ? parseFloat(measurementForm.height_cm) : null,
      weight: measurementForm.weight_kg ? parseFloat(measurementForm.weight_kg) : null,
      body_fat: measurementForm.body_fat_percent ? parseFloat(measurementForm.body_fat_percent) : null,
      chest: measurementForm.chest_circumference ? parseFloat(measurementForm.chest_circumference) : null,
      waist: measurementForm.waist_circumference ? parseFloat(measurementForm.waist_circumference) : null,
      hips: measurementForm.hips_circumference ? parseFloat(measurementForm.hips_circumference) : null,
      notes: measurementForm.notes || "",
      created_by: creatorId,
    };

    try {
      if (editingMeasurement) {
        await updateMeasurementMutation.mutateAsync({ id: editingMeasurement.id, data });
      } else {
        await createMeasurementMutation.mutateAsync(data);
      }
    } catch {
      // error handled by onError
    }
  };

  const getWeightChange = () => {
    if (measurements.length < 2) return null;
    const latest = measurements[0]?.weight_kg;
    const first = measurements[measurements.length - 1]?.weight_kg;
    if (!latest || !first) return null;
    return latest - first;
  };

  const getBodyFatChange = () => {
    if (measurements.length < 2) return null;
    const latest = measurements[0]?.body_fat_percent;
    const first = measurements[measurements.length - 1]?.body_fat_percent;
    if (!latest || !first) return null;
    return latest - first;
  };

  const weightChange = getWeightChange();
  const bodyFatChange = getBodyFatChange();
  const latestMeasurement = measurements[0];

  return (
    <div className="space-y-6" dir="rtl" style={{ textAlign: 'right' }}>
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl" style={{ backgroundColor: '#FAFAFA', border: '1px solid #E0E0E0' }}>
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-5 h-5" style={{ color: '#FF6F20' }} />
            <p className="text-sm font-bold" style={{ color: '#7D7D7D' }}>שינוי במשקל מאז תחילת הדרך</p>
          </div>
          {weightChange !== null ? (
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold" style={{ color: '#000000' }}>
                {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)} ק״ג
              </p>
              {weightChange < 0 ? (
                <TrendingDown className="w-5 h-5" style={{ color: '#4CAF50' }} />
              ) : (
                <TrendingUp className="w-5 h-5" style={{ color: '#f44336' }} />
              )}
            </div>
          ) : (
            <p className="text-sm" style={{ color: '#7D7D7D' }}>אין מספיק נתונים</p>
          )}
        </div>

        <div className="p-4 rounded-xl" style={{ backgroundColor: '#FAFAFA', border: '1px solid #E0E0E0' }}>
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-5 h-5" style={{ color: '#FF6F20' }} />
            <p className="text-sm font-bold" style={{ color: '#7D7D7D' }}>שינוי באחוז שומן</p>
          </div>
          {bodyFatChange !== null ? (
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold" style={{ color: '#000000' }}>
                {bodyFatChange > 0 ? '+' : ''}{bodyFatChange.toFixed(1)}%
              </p>
              {bodyFatChange < 0 ? (
                <TrendingDown className="w-5 h-5" style={{ color: '#4CAF50' }} />
              ) : (
                <TrendingUp className="w-5 h-5" style={{ color: '#f44336' }} />
              )}
            </div>
          ) : (
            <p className="text-sm" style={{ color: '#7D7D7D' }}>אין מספיק נתונים</p>
          )}
        </div>

        <div className="p-4 rounded-xl" style={{ backgroundColor: '#FAFAFA', border: '1px solid #E0E0E0' }}>
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-5 h-5" style={{ color: '#FF6F20' }} />
            <p className="text-sm font-bold" style={{ color: '#7D7D7D' }}>גובה נוכחי</p>
          </div>
          {latestMeasurement?.height ? (
            <p className="text-2xl font-bold" style={{ color: '#000000' }}>
              {latestMeasurement.height} ס״מ
            </p>
          ) : (
            <p className="text-sm" style={{ color: '#7D7D7D' }}>לא נרשם</p>
          )}
        </div>
      </div>

      {/* Physical Measurements Table */}
      <div className="p-6 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold" style={{ color: '#000000' }}>
            📊 היסטוריית מדידות
          </h3>
          <Button
            onClick={() => {
              setEditingMeasurement(null);
              resetMeasurementForm();
              setShowMeasurementDialog(true);
            }}
            className="rounded-xl px-4 py-2 font-bold text-white text-sm"
            style={{ backgroundColor: '#FF6F20' }}
          >
            + הוסף מדידה
          </Button>
        </div>

        {measurements.length === 0 ? (
          <div className="p-8 text-center">
            <Activity className="w-12 h-12 mx-auto mb-3" style={{ color: '#E0E0E0' }} />
            <p className="text-lg" style={{ color: '#7D7D7D' }}>
              עדיין אין מדידות למתאמן זה
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '2px solid #E0E0E0' }}>
                  <th className="text-right p-3 text-sm font-bold" style={{ color: '#7D7D7D' }}>תאריך</th>
                  <th className="text-right p-3 text-sm font-bold" style={{ color: '#7D7D7D' }}>גובה</th>
                  <th className="text-right p-3 text-sm font-bold" style={{ color: '#7D7D7D' }}>משקל</th>
                  <th className="text-right p-3 text-sm font-bold" style={{ color: '#7D7D7D' }}>אחוז שומן</th>
                  <th className="text-right p-3 text-sm font-bold" style={{ color: '#7D7D7D' }}>הערות</th>
                  <th className="text-right p-3 text-sm font-bold" style={{ color: '#7D7D7D' }}>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {measurements.map((measurement) => (
                  <tr key={measurement.id} style={{ borderBottom: '1px solid #E0E0E0' }}>
                    <td className="p-3 text-sm" style={{ color: '#000000' }}>
                      {format(new Date(measurement.date), 'dd/MM/yyyy', { locale: he })}
                    </td>
                    <td className="p-3 text-sm" style={{ color: '#000000' }}>
                      {measurement.height ? `${measurement.height} ס״מ` : '-'}
                    </td>
                    <td className="p-3 text-sm font-bold" style={{ color: '#000000' }}>
                      {measurement.weight ? `${measurement.weight} ק״ג` : '-'}
                    </td>
                    <td className="p-3 text-sm" style={{ color: '#000000' }}>
                      {measurement.body_fat ? `${measurement.body_fat}%` : '-'}
                    </td>
                    <td className="p-3 text-sm" style={{ color: '#7D7D7D' }}>
                      {measurement.notes ? (
                        <span title={measurement.notes}>
                          {measurement.notes.substring(0, 30)}{measurement.notes.length > 30 ? '...' : ''}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setEditingMeasurement(measurement);
                            setMeasurementForm({
                              date: measurement.date,
                              height_cm: measurement.height?.toString() || "",
                              weight_kg: measurement.weight?.toString() || "",
                              body_fat_percent: measurement.body_fat?.toString() || "",
                              chest_circumference: measurement.chest?.toString() || "",
                              waist_circumference: measurement.waist?.toString() || "",
                              hips_circumference: measurement.hips?.toString() || "",
                              notes: measurement.notes || ""
                            });
                            setShowMeasurementDialog(true);
                          }}
                          className="rounded-lg p-2"
                          style={{ backgroundColor: '#2196F3', color: 'white' }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            if (confirm('למחוק מדידה זו?')) {
                              deleteMeasurementMutation.mutate(measurement.id);
                            }
                          }}
                          className="rounded-lg p-2"
                          style={{ backgroundColor: '#f44336', color: 'white' }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Measurement Dialog */}
      <Dialog open={showMeasurementDialog} onOpenChange={(open) => {
        setShowMeasurementDialog(open);
        if (!open) {
          setEditingMeasurement(null);
          resetMeasurementForm();
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold" style={{ color: '#000000' }}>
              {editingMeasurement ? 'ערוך מדידה' : 'הוסף מדידה חדשה'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                תאריך
              </Label>
              <Input
                type="date"
                value={measurementForm.date}
                onChange={(e) => setMeasurementForm({ ...measurementForm, date: e.target.value })}
                className="rounded-xl"
                style={{ border: '1px solid #E0E0E0' }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                  גובה (ס״מ)
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  value={measurementForm.height_cm}
                  onChange={(e) => setMeasurementForm({ ...measurementForm, height_cm: e.target.value })}
                  placeholder="175"
                  className="rounded-xl"
                  style={{ border: '1px solid #E0E0E0' }}
                />
              </div>

              <div>
                <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                  משקל (ק״ג)
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  value={measurementForm.weight_kg}
                  onChange={(e) => setMeasurementForm({ ...measurementForm, weight_kg: e.target.value })}
                  placeholder="75.5"
                  className="rounded-xl"
                  style={{ border: '1px solid #E0E0E0' }}
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                אחוז שומן (%)
              </Label>
              <Input
                type="number"
                step="0.1"
                value={measurementForm.body_fat_percent}
                onChange={(e) => setMeasurementForm({ ...measurementForm, body_fat_percent: e.target.value })}
                placeholder="18.5"
                className="rounded-xl"
                style={{ border: '1px solid #E0E0E0' }}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                  היקף חזה (ס״מ)
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  value={measurementForm.chest_circumference}
                  onChange={(e) => setMeasurementForm({ ...measurementForm, chest_circumference: e.target.value })}
                  placeholder="95"
                  className="rounded-xl"
                  style={{ border: '1px solid #E0E0E0' }}
                />
              </div>

              <div>
                <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                  היקף מותניים (ס״מ)
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  value={measurementForm.waist_circumference}
                  onChange={(e) => setMeasurementForm({ ...measurementForm, waist_circumference: e.target.value })}
                  placeholder="80"
                  className="rounded-xl"
                  style={{ border: '1px solid #E0E0E0' }}
                />
              </div>

              <div>
                <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                  היקף ירכיים (ס״מ)
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  value={measurementForm.hips_circumference}
                  onChange={(e) => setMeasurementForm({ ...measurementForm, hips_circumference: e.target.value })}
                  placeholder="100"
                  className="rounded-xl"
                  style={{ border: '1px solid #E0E0E0' }}
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                הערות כלליות
              </Label>
              <Textarea
                value={measurementForm.notes}
                onChange={(e) => setMeasurementForm({ ...measurementForm, notes: e.target.value })}
                placeholder="הערות נוספות..."
                className="rounded-xl min-h-[80px]"
                style={{ border: '1px solid #E0E0E0' }}
              />
            </div>

            <Button
              onClick={handleSaveMeasurement}
              disabled={createMeasurementMutation.isPending || updateMeasurementMutation.isPending}
              className="w-full rounded-xl py-6 font-bold text-white text-lg"
              style={{ backgroundColor: '#FF6F20' }}
            >
              {(createMeasurementMutation.isPending || updateMeasurementMutation.isPending) ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" />שומר...</>
              ) : (
                editingMeasurement ? 'עדכן מדידה' : 'שמור מדידה'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}