import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Activity, Award, TrendingUp, TrendingDown, Plus, Edit2, Trash2, Loader2, CheckCircle, Target } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Home, Dumbbell, FileText, User } from "lucide-react";
import GoalFormDialog from "../components/forms/GoalFormDialog";
import ResultFormDialog from "../components/forms/ResultFormDialog";
import BaselineSection from "../components/progress/BaselineSection";
import BaselineJumpRopeDialog from "../components/progress/BaselineJumpRopeDialog";

export default function Progress() {
  const [user, setUser] = useState(null);
  const [showAddMeasurement, setShowAddMeasurement] = useState(false);
  const [showAddResult, setShowAddResult] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [editingMeasurement, setEditingMeasurement] = useState(null);
  const [editingResult, setEditingResult] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingItem, setDeletingItem] = useState(null);
  const [showBaselineDialog, setShowBaselineDialog] = useState(false);

  const [measurementForm, setMeasurementForm] = useState({
    date: new Date().toISOString().split('T')[0],
    weight_kg: "",
    body_fat_percent: "",
    height_cm: "",
    chest_circumference: "",
    waist_circumference: "",
    hips_circumference: "",
    notes: ""
  });

  const [resultForm, setResultForm] = useState({
    date: new Date().toISOString().split('T')[0],
    title: "",
    description: ""
  });

  const [goalForm, setGoalForm] = useState({
    goal_name: "",
    description: "",
    target_value: "",
    current_value: "",
    unit: "",
    target_date: "",
    status: "בתהליך"
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    };
    loadUser();
  }, []);

  const { data: measurements = [] } = useQuery({
    queryKey: ['my-measurements'],
    queryFn: async () => {
      try {
        const user = await base44.auth.me();
        return await base44.entities.Measurement.filter({ trainee_id: user.id }, '-date');
      } catch (error) {
        console.error("[Progress] Error loading measurements:", error);
        return [];
      }
    },
    initialData: [],
    refetchInterval: 5000,
    refetchIntervalInBackground: true
  });

  const { data: results = [] } = useQuery({
    queryKey: ['my-results'],
    queryFn: async () => {
      try {
        const user = await base44.auth.me();
        return await base44.entities.ResultsLog.filter({ trainee_id: user.id }, '-date');
      } catch (error) {
        console.error("[Progress] Error loading results:", error);
        return [];
      }
    },
    initialData: [],
    refetchInterval: 5000,
    refetchIntervalInBackground: true
  });

  const { data: goals = [] } = useQuery({
    queryKey: ['my-goals'],
    queryFn: async () => {
      try {
        const user = await base44.auth.me();
        return await base44.entities.Goal.filter({ trainee_id: user.id }, '-created_at');
      } catch (error) {
        console.error("[Progress] Error loading goals:", error);
        return [];
      }
    },
    initialData: [],
    refetchInterval: 5000,
    refetchIntervalInBackground: true
  });

  const createMeasurementMutation = useMutation({
    mutationFn: (data) => base44.entities.Measurement.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-measurements'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-measurements'] });
      setShowAddMeasurement(false);
      setEditingMeasurement(null);
      setMeasurementForm({
        date: new Date().toISOString().split('T')[0],
        weight_kg: "",
        body_fat_percent: "",
        height_cm: "",
        chest_circumference: "",
        waist_circumference: "",
        hips_circumference: "",
        notes: ""
      });
      toast.success("✅ מדידה נוספה");
    },
    onError: (error) => toast.error("❌ שגיאה בשמירת מדידה: " + (error.message || "נסה שוב")),
  });

  const updateMeasurementMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Measurement.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-measurements'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-measurements'] });
      setShowAddMeasurement(false);
      setEditingMeasurement(null);
      setMeasurementForm({
        date: new Date().toISOString().split('T')[0],
        weight_kg: "",
        body_fat_percent: "",
        height_cm: "",
        chest_circumference: "",
        waist_circumference: "",
        hips_circumference: "",
        notes: ""
      });
      toast.success("✅ מדידה עודכנה");
    },
    onError: (error) => toast.error("❌ שגיאה בעדכון מדידה: " + (error.message || "נסה שוב")),
  });

  const deleteMeasurementMutation = useMutation({
    mutationFn: (id) => base44.entities.Measurement.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-measurements'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-measurements'] });
      setShowDeleteDialog(false);
      setDeletingItem(null);
      toast.success("✅ מדידה נמחקה");
    },
    onError: (error) => toast.error("❌ שגיאה במחיקת מדידה: " + (error.message || "נסה שוב")),
  });

  const createResultMutation = useMutation({
    mutationFn: (data) => base44.entities.ResultsLog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-results'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-results'] });
      setShowAddResult(false);
      setEditingResult(null);
      setResultForm({
        date: new Date().toISOString().split('T')[0],
        title: "",
        description: ""
      });
      toast.success("✅ הישג נוסף");
    },
    onError: (error) => toast.error("❌ שגיאה בשמירת הישג: " + (error.message || "נסה שוב")),
  });

  const updateResultMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ResultsLog.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-results'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-results'] });
      setShowAddResult(false);
      setEditingResult(null);
      setResultForm({
        date: new Date().toISOString().split('T')[0],
        title: "",
        description: ""
      });
      toast.success("✅ הישג עודכן");
    },
    onError: (error) => toast.error("❌ שגיאה בעדכון הישג: " + (error.message || "נסה שוב")),
  });

  const deleteResultMutation = useMutation({
    mutationFn: (id) => base44.entities.ResultsLog.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-results'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-results'] });
      setShowDeleteDialog(false);
      setDeletingItem(null);
      toast.success("✅ הישג נמחק");
    },
    onError: (error) => toast.error("❌ שגיאה במחיקת הישג: " + (error.message || "נסה שוב")),
  });

  const createGoalMutation = useMutation({
    mutationFn: (data) => base44.entities.Goal.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-goals'] });
      setShowAddGoal(false);
      setGoalForm({ goal_name: "", description: "", target_value: "", current_value: "", unit: "", target_date: "", status: "בתהליך" });
      toast.success("✅ יעד נוסף");
    },
    onError: (error) => toast.error("❌ שגיאה בהוספת יעד: " + (error.message || "נסה שוב")),
  });

  const handleSaveMeasurement = async () => {
    if (!measurementForm.date) {
      toast.error("נא לבחור תאריך");
      return;
    }

    const data = {
      trainee_id: user.id,
      trainee_name: user.full_name,
      date: measurementForm.date,
      weight_kg: measurementForm.weight_kg ? parseFloat(measurementForm.weight_kg) : null,
      body_fat_percent: measurementForm.body_fat_percent ? parseFloat(measurementForm.body_fat_percent) : null,
      height_cm: measurementForm.height_cm ? parseFloat(measurementForm.height_cm) : null,
      chest_circumference: measurementForm.chest_circumference ? parseFloat(measurementForm.chest_circumference) : null,
      waist_circumference: measurementForm.waist_circumference ? parseFloat(measurementForm.waist_circumference) : null,
      hips_circumference: measurementForm.hips_circumference ? parseFloat(measurementForm.hips_circumference) : null,
      notes: measurementForm.notes || "",
      recorded_by: user.id,
      recorded_by_name: user.full_name
    };

    try {
      if (editingMeasurement) {
        await updateMeasurementMutation.mutateAsync({ id: editingMeasurement.id, data });
      } else {
        await createMeasurementMutation.mutateAsync(data);
      }
    } catch (error) {
      console.error("handleSaveMeasurement error:", error);
    }
  };

  const handleSaveResult = async () => {
    if (!resultForm.title || !resultForm.date) {
      toast.error("נא למלא כותרת ותאריך");
      return;
    }

    const data = {
      trainee_id: user.id,
      trainee_name: user.full_name,
      date: resultForm.date,
      title: resultForm.title,
      description: resultForm.description || "",
      recorded_by_coach: user.id,
      recorded_by_coach_name: user.full_name
    };

    try {
      if (editingResult) {
        await updateResultMutation.mutateAsync({ id: editingResult.id, data });
      } else {
        await createResultMutation.mutateAsync(data);
      }
    } catch (error) {
      console.error("handleSaveResult error:", error);
    }
  };

  const handleAddGoal = async () => {
    if (!goalForm.goal_name || !goalForm.target_value) {
      toast.error("נא למלא שם יעד ויעד");
      return;
    }

    try {
      await createGoalMutation.mutateAsync({
        trainee_id: user.id,
        trainee_name: user.full_name,
        goal_name: goalForm.goal_name,
        description: goalForm.description || null,
        target_value: parseFloat(goalForm.target_value),
        current_value: goalForm.current_value ? parseFloat(goalForm.current_value) : null,
        unit: goalForm.unit || null,
        target_date: goalForm.target_date ? new Date(goalForm.target_date).toISOString() : null,
        start_date: new Date().toISOString(),
        status: goalForm.status,
        progress_percentage: goalForm.current_value && goalForm.target_value
          ? Math.min(100, Math.round((parseFloat(goalForm.current_value) / parseFloat(goalForm.target_value)) * 100))
          : 0
      });
    } catch (error) {
      console.error("handleAddGoal error:", error);
    }
  };

  const handleEditMeasurement = (measurement) => {
    setEditingMeasurement(measurement);
    setMeasurementForm({
      date: measurement.date,
      weight_kg: measurement.weight_kg?.toString() || "",
      body_fat_percent: measurement.body_fat_percent?.toString() || "",
      height_cm: measurement.height_cm?.toString() || "",
      chest_circumference: measurement.chest_circumference?.toString() || "",
      waist_circumference: measurement.waist_circumference?.toString() || "",
      hips_circumference: measurement.hips_circumference?.toString() || "",
      notes: measurement.notes || ""
    });
    setShowAddMeasurement(true);
  };

  const handleEditResult = (result) => {
    setEditingResult(result);
    setResultForm({
      date: result.date,
      title: result.title,
      description: result.description || ""
    });
    setShowAddResult(true);
  };

  const handleDeleteClick = (item, type) => {
    setDeletingItem({ ...item, type });
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    
    if (deletingItem.type === 'measurement') {
      await deleteMeasurementMutation.mutateAsync(deletingItem.id);
    } else if (deletingItem.type === 'result') {
      await deleteResultMutation.mutateAsync(deletingItem.id);
    }
  };

  const latestMeasurement = measurements[0];
  
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

  const weightChartData = measurements
    .slice(0, 10)
    .reverse()
    .map(m => ({
      date: format(new Date(m.date), 'dd/MM'),
      weight: m.weight_kg || 0
    }))
    .filter(d => d.weight > 0);

  const bodyFatChartData = measurements
    .slice(0, 10)
    .reverse()
    .map(m => ({
      date: format(new Date(m.date), 'dd/MM'),
      bodyFat: m.body_fat_percent || 0
    }))
    .filter(d => d.bodyFat > 0);

  const circumferenceChartData = measurements
    .slice(0, 10)
    .reverse()
    .map(m => ({
      date: format(new Date(m.date), 'dd/MM'),
      chest: m.chest_circumference || 0,
      waist: m.waist_circumference || 0,
      hips: m.hips_circumference || 0
    }));

  return (
    <div className="min-h-screen w-full overflow-x-hidden pb-24" dir="rtl" style={{ backgroundColor: '#FFFFFF' }}>
      <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-8 w-full">
        {/* Header */}
        <div className="mb-8 md:mb-10">
          <h1 className="text-3xl md:text-5xl font-black mb-2 md:mb-4" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
            התקדמות גופנית
          </h1>
          <p className="text-base md:text-2xl mb-2 md:mb-4 font-medium" style={{ color: '#7D7D7D' }}>
            מעקב אחר המדדים והישגים שלי
          </p>
          <div className="w-16 md:w-24 h-1 rounded-full" style={{ backgroundColor: '#FF6F20' }} />
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 w-full">
          <Button
            onClick={() => {
              setEditingMeasurement(null);
              setMeasurementForm({
                date: new Date().toISOString().split('T')[0],
                weight_kg: "",
                body_fat_percent: "",
                height_cm: "",
                chest_circumference: "",
                waist_circumference: "",
                hips_circumference: "",
                notes: ""
              });
              setShowAddMeasurement(true);
            }}
            className="rounded-xl px-4 md:px-6 py-4 md:py-5 font-bold text-white flex items-center justify-center gap-2 w-full"
            style={{ backgroundColor: '#FF6F20' }}
          >
            <Activity className="w-5 h-5" />
            <span>מדידה חדשה</span>
          </Button>

          <Button
            onClick={() => {
              setEditingResult(null);
              setShowAddResult(true);
            }}
            className="rounded-xl px-4 md:px-6 py-4 md:py-5 font-bold flex items-center justify-center gap-2 w-full"
            style={{ backgroundColor: '#FFD700', color: '#000' }}
          >
            <Award className="w-5 h-5" />
            <span>הוסף שיא חדש</span>
          </Button>

          <Button
            onClick={() => {
              setEditingGoal(null);
              setShowAddGoal(true);
            }}
            className="rounded-xl px-4 md:px-6 py-4 md:py-5 font-bold text-white flex items-center justify-center gap-2 w-full"
            style={{ backgroundColor: '#000000' }}
          >
            <Target className="w-5 h-5" />
            <span>הוסף יעד</span>
          </Button>

          <Button
            onClick={() => setShowBaselineDialog(true)}
            className="rounded-xl px-4 md:px-6 py-4 md:py-5 font-bold text-white flex items-center justify-center gap-2 w-full"
            style={{ backgroundColor: '#1a1a2e' }}
          >
            <Activity className="w-5 h-5" />
            <span>Baseline</span>
          </Button>
        </div>

        {/* Physical Measurements */}
        <div className="mb-10 w-full">
          <h2 className="text-2xl md:text-3xl font-black mb-6" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
            מדדים גופניים
          </h2>

          <div className="athletigo-card p-6 w-full">
            {/* Current Metrics - Large Cards */}
            {latestMeasurement && (
              <div className="mb-8 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {latestMeasurement.weight_kg && (
                  <div className="p-4 md:p-6 rounded-xl text-center relative overflow-hidden" style={{ backgroundColor: '#E3F2FD', border: '2px solid #2196F3' }}>
                    <div className="absolute top-0 right-0 left-0 h-1" style={{ backgroundColor: '#2196F3' }} />
                    <p className="text-xs md:text-sm mb-2 font-bold" style={{ color: '#7D7D7D' }}>משקל</p>
                    <p className="text-3xl md:text-5xl font-black mb-1" style={{ color: '#2196F3', fontFamily: 'Montserrat, sans-serif' }}>
                      {latestMeasurement.weight_kg}
                    </p>
                    <p className="text-xs md:text-sm mb-3" style={{ color: '#7D7D7D' }}>ק״ג</p>
                    {weightChange !== null && (
                      <div className="flex items-center justify-center gap-1 md:gap-2">
                        <TrendingUp className={`w-3 h-3 md:w-4 md:h-4 ${weightChange < 0 ? 'rotate-180' : ''}`} 
                          style={{ color: weightChange < 0 ? '#4CAF50' : '#f44336' }} />
                        <span className="text-xs md:text-sm font-bold" style={{ color: weightChange < 0 ? '#4CAF50' : '#f44336' }}>
                          {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {latestMeasurement.body_fat_percent && (
                  <div className="p-4 md:p-6 rounded-xl text-center relative overflow-hidden" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
                    <div className="absolute top-0 right-0 left-0 h-1" style={{ backgroundColor: '#FF6F20' }} />
                    <p className="text-xs md:text-sm mb-2 font-bold" style={{ color: '#7D7D7D' }}>שומן</p>
                    <p className="text-3xl md:text-5xl font-black mb-1" style={{ color: '#FF6F20', fontFamily: 'Montserrat, sans-serif' }}>
                      {latestMeasurement.body_fat_percent}
                    </p>
                    <p className="text-xs md:text-sm mb-3" style={{ color: '#7D7D7D' }}>%</p>
                    {bodyFatChange !== null && (
                      <div className="flex items-center justify-center gap-1 md:gap-2">
                        <TrendingUp className={`w-3 h-3 md:w-4 md:h-4 ${bodyFatChange < 0 ? 'rotate-180' : ''}`}
                          style={{ color: bodyFatChange < 0 ? '#4CAF50' : '#f44336' }} />
                        <span className="text-xs md:text-sm font-bold" style={{ color: bodyFatChange < 0 ? '#4CAF50' : '#f44336' }}>
                          {bodyFatChange > 0 ? '+' : ''}{bodyFatChange.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {latestMeasurement.height_cm && (
                  <div className="p-4 md:p-6 rounded-xl text-center relative overflow-hidden" style={{ backgroundColor: '#F3E5F5', border: '2px solid #9C27B0' }}>
                    <div className="absolute top-0 right-0 left-0 h-1" style={{ backgroundColor: '#9C27B0' }} />
                    <p className="text-xs md:text-sm mb-2 font-bold" style={{ color: '#7D7D7D' }}>גובה</p>
                    <p className="text-3xl md:text-5xl font-black mb-1" style={{ color: '#9C27B0', fontFamily: 'Montserrat, sans-serif' }}>
                      {latestMeasurement.height_cm}
                    </p>
                    <p className="text-xs md:text-sm" style={{ color: '#7D7D7D' }}>ס״מ</p>
                  </div>
                )}

                <div className="p-4 md:p-6 rounded-xl text-center relative overflow-hidden" style={{ backgroundColor: '#E8F5E9', border: '2px solid #4CAF50' }}>
                  <div className="absolute top-0 right-0 left-0 h-1" style={{ backgroundColor: '#4CAF50' }} />
                  <Activity className="w-6 h-6 md:w-8 md:h-8 mx-auto mb-2 md:mb-3" style={{ color: '#4CAF50' }} />
                  <p className="text-xs md:text-sm mb-2 font-bold" style={{ color: '#7D7D7D' }}>מדידות</p>
                  <p className="text-3xl md:text-5xl font-black mb-1" style={{ color: '#4CAF50', fontFamily: 'Montserrat, sans-serif' }}>
                    {measurements.length}
                  </p>
                  <p className="text-xs md:text-sm" style={{ color: '#7D7D7D' }}>סה״כ</p>
                </div>
              </div>
            )}

            {/* Weight Chart */}
            {weightChartData.length > 1 && (
              <div className="mb-8 p-4 md:p-6 rounded-xl w-full" style={{ backgroundColor: '#FAFAFA' }}>
                <h3 className="text-lg md:text-xl font-bold mb-4 flex items-center gap-2" style={{ color: '#000000' }}>
                  <TrendingUp className="w-5 h-5 md:w-6 md:h-6" style={{ color: '#2196F3' }} />
                  גרף משקל
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={weightChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
                    <XAxis dataKey="date" stroke="#7D7D7D" style={{ fontSize: '12px' }} />
                    <YAxis stroke="#7D7D7D" style={{ fontSize: '12px' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: '8px' }}
                      labelStyle={{ color: '#000000', fontWeight: 'bold' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="weight" 
                      stroke="#2196F3" 
                      strokeWidth={3} 
                      dot={{ fill: '#2196F3', r: 6 }}
                      name="משקל (ק״ג)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Body Fat Chart */}
            {bodyFatChartData.length > 1 && (
              <div className="mb-8 p-4 md:p-6 rounded-xl w-full" style={{ backgroundColor: '#FAFAFA' }}>
                <h3 className="text-lg md:text-xl font-bold mb-4 flex items-center gap-2" style={{ color: '#000000' }}>
                  <TrendingUp className="w-5 h-5 md:w-6 md:h-6" style={{ color: '#FF6F20' }} />
                  גרף אחוז שומן
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={bodyFatChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
                    <XAxis dataKey="date" stroke="#7D7D7D" style={{ fontSize: '12px' }} />
                    <YAxis stroke="#7D7D7D" style={{ fontSize: '12px' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: '8px' }}
                      labelStyle={{ color: '#000000', fontWeight: 'bold' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="bodyFat" 
                      stroke="#FF6F20" 
                      strokeWidth={3} 
                      dot={{ fill: '#FF6F20', r: 6 }}
                      name="אחוז שומן (%)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Circumferences Chart */}
            {circumferenceChartData.some(d => d.chest || d.waist || d.hips) && (
              <div className="mb-8 p-4 md:p-6 rounded-xl w-full" style={{ backgroundColor: '#FAFAFA' }}>
                <h3 className="text-lg md:text-xl font-bold mb-4 flex items-center gap-2" style={{ color: '#000000' }}>
                  <Activity className="w-5 h-5 md:w-6 md:h-6" style={{ color: '#9C27B0' }} />
                  היקפי גוף
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={circumferenceChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
                    <XAxis dataKey="date" stroke="#7D7D7D" style={{ fontSize: '12px' }} />
                    <YAxis stroke="#7D7D7D" style={{ fontSize: '12px' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: '8px' }}
                      labelStyle={{ color: '#000000', fontWeight: 'bold' }}
                    />
                    <Line type="monotone" dataKey="chest" stroke="#2196F3" strokeWidth={2} name="חזה (ס״מ)" />
                    <Line type="monotone" dataKey="waist" stroke="#FF6F20" strokeWidth={2} name="מותניים (ס״מ)" />
                    <Line type="monotone" dataKey="hips" stroke="#9C27B0" strokeWidth={2} name="ירכיים (ס״מ)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Measurements Table */}
            {measurements.length > 0 && (
              <div>
                <h3 className="text-lg md:text-xl font-bold mb-4" style={{ color: '#000000' }}>
                  היסטוריית מדידות
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: '2px solid #E0E0E0' }}>
                        <th className="text-right p-3 text-xs md:text-sm font-bold" style={{ color: '#7D7D7D' }}>תאריך</th>
                        <th className="text-center p-3 text-xs md:text-sm font-bold" style={{ color: '#7D7D7D' }}>משקל</th>
                        <th className="text-center p-3 text-xs md:text-sm font-bold" style={{ color: '#7D7D7D' }}>שומן</th>
                        <th className="text-center p-3 text-xs md:text-sm font-bold hidden md:table-cell" style={{ color: '#7D7D7D' }}>גובה</th>
                        <th className="text-center p-3 text-xs md:text-sm font-bold hidden lg:table-cell" style={{ color: '#7D7D7D' }}>חזה</th>
                        <th className="text-center p-3 text-xs md:text-sm font-bold hidden lg:table-cell" style={{ color: '#7D7D7D' }}>מותניים</th>
                        <th className="text-center p-3 text-xs md:text-sm font-bold hidden lg:table-cell" style={{ color: '#7D7D7D' }}>ירכיים</th>
                        <th className="text-center p-3 text-xs md:text-sm font-bold" style={{ color: '#7D7D7D' }}>פעולות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {measurements.map((measurement, idx) => (
                        <tr key={measurement.id} style={{ borderBottom: '1px solid #E0E0E0' }}>
                          <td className="p-3 text-xs md:text-sm text-right">
                            <p className="font-bold" style={{ color: '#000000' }}>
                              {format(new Date(measurement.date), 'dd/MM/yy', { locale: he })}
                            </p>
                          </td>
                          <td className="p-3 text-center font-bold text-xs md:text-base" style={{ color: '#2196F3' }}>
                            {measurement.weight_kg || '—'}
                          </td>
                          <td className="p-3 text-center font-bold text-xs md:text-base" style={{ color: '#FF6F20' }}>
                            {measurement.body_fat_percent ? `${measurement.body_fat_percent}%` : '—'}
                          </td>
                          <td className="p-3 text-center font-bold text-xs md:text-base hidden md:table-cell" style={{ color: '#9C27B0' }}>
                            {measurement.height_cm || '—'}
                          </td>
                          <td className="p-3 text-center text-xs md:text-sm hidden lg:table-cell" style={{ color: '#7D7D7D' }}>
                            {measurement.chest_circumference || '—'}
                          </td>
                          <td className="p-3 text-center text-xs md:text-sm hidden lg:table-cell" style={{ color: '#7D7D7D' }}>
                            {measurement.waist_circumference || '—'}
                          </td>
                          <td className="p-3 text-center text-xs md:text-sm hidden lg:table-cell" style={{ color: '#7D7D7D' }}>
                            {measurement.hips_circumference || '—'}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center justify-center gap-1 md:gap-2">
                              <Button
                                onClick={() => handleEditMeasurement(measurement)}
                                size="sm"
                                className="rounded-lg p-1.5 md:p-2"
                                style={{ backgroundColor: '#FF6F20', color: 'white' }}
                                title="ערוך"
                              >
                                <Edit2 className="w-3 h-3 md:w-4 md:h-4" />
                              </Button>
                              <Button
                                onClick={() => handleDeleteClick(measurement, 'measurement')}
                                size="sm"
                                className="rounded-lg p-1.5 md:p-2"
                                style={{ backgroundColor: '#f44336', color: 'white' }}
                                title="מחק"
                              >
                                <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {measurements.length === 0 && (
              <div className="p-8 md:p-12 text-center">
                <Activity className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-4" style={{ color: '#E0E0E0' }} />
                <h3 className="text-lg md:text-xl font-bold mb-2" style={{ color: '#000000' }}>
                  התחל לעקוב אחר ההתקדמות שלך
                </h3>
                <p className="text-sm md:text-base" style={{ color: '#7D7D7D' }}>
                  הוסף את המדידה הראשונה שלך
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Baseline Section */}
        <BaselineSection results={results} />

        {/* Achievements */}
        <div className="mb-10 w-full">
          <h2 className="text-2xl md:text-3xl font-black mb-6" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
            ההישגים שלי
          </h2>

          {results.length > 0 ? (
            <div className="space-y-4">
              {results.map((result, idx) => (
                <div 
                  key={result.id} 
                  className="athletigo-card p-4 md:p-6 relative overflow-hidden"
                  style={{
                    border: idx === 0 ? '2px solid #FFD700' : '1px solid #E0E0E0',
                    boxShadow: idx === 0 ? '0 4px 12px rgba(255,215,0,0.2)' : '0 2px 4px rgba(0,0,0,0.06)'
                  }}
                >
                  {idx === 0 && (
                    <div className="absolute top-0 right-0 left-0 h-1" style={{ backgroundColor: '#FFD700' }} />
                  )}
                  <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                    <div className="flex items-start gap-3 md:gap-4 flex-1">
                      <div 
                        className="w-12 h-12 md:w-16 md:h-16 rounded-xl flex items-center justify-center text-2xl md:text-3xl flex-shrink-0"
                        style={{ 
                          backgroundColor: idx === 0 ? '#FFFEF7' : '#FFF8F3',
                          border: `2px solid ${idx === 0 ? '#FFD700' : '#FF6F20'}`
                        }}
                      >
                        {idx === 0 ? '🏆' : '🎖️'}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-base md:text-xl mb-2" style={{ color: '#000000' }}>
                          {result.title}
                        </h4>
                        {result.description && (
                          <p className="text-sm md:text-base mb-3 leading-relaxed" style={{ color: '#7D7D7D' }}>
                            {result.description}
                          </p>
                        )}
                        <span className="text-xs md:text-sm" style={{ color: '#7D7D7D' }}>
                          {format(new Date(result.date), 'dd/MM/yyyy', { locale: he })}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                      <Button
                        onClick={() => {
                          setEditingResult(result);
                          setShowAddResult(true);
                        }}
                        size="sm"
                        className="rounded-lg p-2 flex-1 md:flex-initial"
                        style={{ backgroundColor: '#FF6F20', color: 'white' }}
                        title="ערוך"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => handleDeleteClick(result, 'result')}
                        size="sm"
                        className="rounded-lg p-2 flex-1 md:flex-initial"
                        style={{ backgroundColor: '#f44336', color: 'white' }}
                        title="מחק"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="athletigo-card p-8 md:p-12 text-center">
              <Award className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-4" style={{ color: '#E0E0E0' }} />
              <h3 className="text-lg md:text-xl font-bold mb-2" style={{ color: '#000000' }}>
                הישגים ממתינים לתיעוד!
              </h3>
              <p className="text-sm md:text-base" style={{ color: '#7D7D7D' }}>
                תעד את ההישגים שלך כדי לעקוב אחר ההתקדמות
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Measurement Dialog */}
      <Dialog open={showAddMeasurement} onOpenChange={setShowAddMeasurement}>
        <DialogContent className="w-[95vw] md:w-full max-w-3xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFFFFF' }}>
          <DialogHeader>
            <DialogTitle className="text-xl md:text-3xl font-black" style={{ color: '#000000', fontFamily: 'Montserrat, Heebo, sans-serif' }}>
              {editingMeasurement ? '✏️ ערוך מדידה' : '➕ הוסף מדידה חדשה'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div>
              <Label className="text-base font-bold mb-3 block" style={{ color: '#000000' }}>תאריך המדידה</Label>
              <Input
                type="date"
                value={measurementForm.date}
                onChange={(e) => setMeasurementForm({ ...measurementForm, date: e.target.value })}
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
                  value={measurementForm.weight_kg}
                  onChange={(e) => setMeasurementForm({ ...measurementForm, weight_kg: e.target.value })}
                  placeholder="75.5"
                  className="rounded-xl"
                  style={{ border: '1px solid #E0E0E0' }}
                />
              </div>
              <div>
                <Label className="text-base font-bold mb-3 block" style={{ color: '#000000' }}>אחוז שומן (%)</Label>
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
              <div>
                <Label className="text-base font-bold mb-3 block" style={{ color: '#000000' }}>גובה (ס״מ)</Label>
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
                    value={measurementForm.chest_circumference}
                    onChange={(e) => setMeasurementForm({ ...measurementForm, chest_circumference: e.target.value })}
                    placeholder="95"
                    className="rounded-xl"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>
                <div>
                  <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>מותניים (ס״מ)</Label>
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
                  <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>ירכיים (ס״מ)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={measurementForm.hips_circumference}
                    onChange={(e) => setMeasurementForm({ ...measurementForm, hips_circumference: e.target.value })}
                    placeholder="95"
                    className="rounded-xl"
                    style={{ border: '1px solid #E0E0E0' }}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label className="text-base font-bold mb-3 block" style={{ color: '#000000' }}>הערות</Label>
              <Textarea
                value={measurementForm.notes}
                onChange={(e) => setMeasurementForm({ ...measurementForm, notes: e.target.value })}
                placeholder="איך הרגשתי? שינויים שהבחנתי..."
                className="rounded-xl min-h-[80px]"
                style={{ border: '1px solid #E0E0E0' }}
              />
            </div>

            <div className="flex gap-4">
              <Button
                onClick={() => {
                  setShowAddMeasurement(false);
                  setEditingMeasurement(null);
                }}
                variant="outline"
                className="flex-1 rounded-xl py-6 font-bold"
                style={{ border: '1px solid #E0E0E0', color: '#000000' }}
              >
                ביטול
              </Button>
              <Button
                onClick={handleSaveMeasurement}
                disabled={createMeasurementMutation.isPending || updateMeasurementMutation.isPending}
                className="flex-1 rounded-xl py-6 font-bold text-white"
                style={{ backgroundColor: '#FF6F20' }}
              >
                {(createMeasurementMutation.isPending || updateMeasurementMutation.isPending) ? (
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

      {/* Result Form Dialog */}
      {user && (
        <ResultFormDialog
          isOpen={showAddResult}
          onClose={() => {
            setShowAddResult(false);
            setEditingResult(null);
          }}
          traineeId={user.id}
          traineeName={user.full_name}
          editingResult={editingResult}
        />
      )}

      {/* Goal Form Dialog */}
      {user && (
        <GoalFormDialog
          isOpen={showAddGoal}
          onClose={() => {
            setShowAddGoal(false);
            setEditingGoal(null);
          }}
          traineeId={user.id}
          traineeName={user.full_name}
          editingGoal={editingGoal}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="w-[95vw] md:w-full max-w-md" style={{ backgroundColor: '#FFFFFF' }}>
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold" style={{ color: '#000000' }}>
              ⚠️ אישור מחיקה
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="p-5 rounded-xl" style={{ backgroundColor: '#FFEBEE', border: '2px solid #f44336' }}>
              <p className="text-base leading-relaxed" style={{ color: '#000000' }}>
                האם אתה בטוח שברצונך למחוק {deletingItem?.type === 'measurement' ? 'מדידה' : 'הישג'} זה/זו?
              </p>
              <p className="text-sm font-bold mt-3" style={{ color: '#f44336' }}>
                פעולה זו אינה ניתנת לביטול!
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setShowDeleteDialog(false);
                  setDeletingItem(null);
                }}
                variant="outline"
                className="flex-1 rounded-xl py-6 font-bold"
                style={{ border: '1px solid #E0E0E0', color: '#000000' }}
              >
                ביטול
              </Button>
              <Button
                onClick={handleConfirmDelete}
                disabled={deleteMeasurementMutation.isPending || deleteResultMutation.isPending}
                className="flex-1 rounded-xl py-6 font-bold text-white"
                style={{ backgroundColor: '#f44336' }}
              >
                {(deleteMeasurementMutation.isPending || deleteResultMutation.isPending) ? (
                  <>
                    <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                    מוחק...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-5 h-5 ml-2" />
                    כן, מחק
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Baseline Jump Rope Dialog */}
      {user && (
        <BaselineJumpRopeDialog
          isOpen={showBaselineDialog}
          onClose={() => setShowBaselineDialog(false)}
          user={user}
        />
      )}

    </div>
  );
}