import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { User, Package, Calendar, Target, TrendingUp, FileText, X, Edit2, Award, Activity, CheckCircle, Clock, MapPin, Phone, Mail, Home, Heart, Trash2, AlertTriangle, Loader2, Camera, Plus, MessageSquare, Dumbbell } from "lucide-react";
import PhysicalMetricsManager from "./PhysicalMetricsManager";
import PlanFormDialog from "./training/PlanFormDialog";
import MessageCenter from "./MessageCenter";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";

export default function UnifiedClientCard({ 
  client, 
  services = [], 
  sessions = [],
  goals = [],
  measurements = [],
  results = [],
  trainingPlans = [],
  coach,
  onClose,
  initialTab = "overview"
}) {
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [currentClient, setCurrentClient] = useState(client);
  
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showAddResult, setShowAddResult] = useState(false);
  const [showAddAttendance, setShowAddAttendance] = useState(false);
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [showAddService, setShowAddService] = useState(false);
  const [showEditService, setShowEditService] = useState(false);
  
  const [editingGoal, setEditingGoal] = useState(null);
  const [editingResult, setEditingResult] = useState(null);
  const [editingService, setEditingService] = useState(null);
  
  // Quick edit dialogs
  const [showEditName, setShowEditName] = useState(false);
  const [showEditPhone, setShowEditPhone] = useState(false);
  const [showEditBirthDate, setShowEditBirthDate] = useState(false);
  const [showEditClientType, setShowEditClientType] = useState(false);
  
  const [editName, setEditName] = useState(client.full_name || "");
  const [editPhone, setEditPhone] = useState(client.phone || "");
  const [editBirthDate, setEditBirthDate] = useState(client.birth_date ? format(new Date(client.birth_date), 'yyyy-MM-dd') : "");
  const [editClientType, setEditClientType] = useState(client.client_type || "מתאמן מזדמן");
  
  const [goalForm, setGoalForm] = useState({
    goal_name: "",
    description: "",
    target_value: "",
    current_value: "",
    unit: "",
    target_date: "",
    status: "בתהליך"
  });
  
  const [resultForm, setResultForm] = useState({
    date: new Date().toISOString().split('T')[0],
    title: "",
    description: "",
    related_goal_id: ""
  });

  const [attendanceForm, setAttendanceForm] = useState({
    date: new Date().toISOString().split('T')[0],
    time: "09:00",
    session_type: "אישי",
    location: "",
    attendance_status: "הגיע",
    coach_notes: ""
  });

  const [noteForm, setNoteForm] = useState({
    note_text: ""
  });

  const [serviceForm, setServiceForm] = useState({
    service_type: "אימונים אישיים",
    package_name: "",
    start_date: new Date().toISOString().split('T')[0],
    end_date: "",
    total_sessions: "",
    used_sessions: "0",
    status: "פעיל",
    price: "",
    payment_status: "ממתין לתשלום",
    payment_date: "",
    notes: ""
  });
  
  const [editFormOverview, setEditFormOverview] = useState({
    email: client.email || "",
    address: client.address || "",
    city: client.city || "",
    main_goal: client.main_goal || "",
    current_status: client.current_status || "",
    future_vision: client.future_vision || "",
    health_issues: client.health_issues || "",
    emergency_contact_name: client.emergency_contact_name || "",
    emergency_contact_phone: client.emergency_contact_phone || ""
  });

  const [showEditOverview, setShowEditOverview] = useState(false);

  useEffect(() => {
    setCurrentClient(client);
    setEditName(client.full_name || "");
    setEditPhone(client.phone || "");
    setEditBirthDate(client.birth_date ? format(new Date(client.birth_date), 'yyyy-MM-dd') : "");
    setEditClientType(client.client_type || "מתאמן מזדמן");
    setEditFormOverview({
      email: client.email || "",
      address: client.address || "",
      city: client.city || "",
      main_goal: client.main_goal || "",
      current_status: client.current_status || "",
      future_vision: client.future_vision || "",
      health_issues: client.health_issues || "",
      emergency_contact_name: client.emergency_contact_name || "",
      emergency_contact_phone: client.emergency_contact_phone || ""
    });
  }, [client]);

  const queryClient = useQueryClient();

  const updateClientMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.User.update(currentClient.id, data);
    },
    onSuccess: (updatedUser) => {
      setCurrentClient(updatedUser);
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['users-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
      queryClient.invalidateQueries({ queryKey: ['trainees-list'] });
      queryClient.invalidateQueries({ queryKey: ['current-user'] });
      queryClient.invalidateQueries({ queryKey: ['current-user-myplan'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-profile'] });
      toast.success("✅ עודכן");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (clientId) => {
      const clientServices = await base44.entities.ClientService.filter({ trainee_id: clientId });
      for (const service of clientServices) {
        await base44.entities.ClientService.delete(service.id);
      }

      const allSessions = await base44.entities.Session.list();
      for (const session of allSessions) {
        if (session.participants?.some(p => p.trainee_id === clientId)) {
          const updatedParticipants = session.participants.filter(p => p.trainee_id !== clientId);
          if (updatedParticipants.length > 0) {
            await base44.entities.Session.update(session.id, { participants: updatedParticipants });
          } else {
            await base44.entities.Session.delete(session.id);
          }
        }
      }

      const plans = await base44.entities.TrainingPlan.filter({ assigned_to: clientId });
      for (const plan of plans) {
        const sections = await base44.entities.TrainingSection.filter({ training_plan_id: plan.id });
        for (const section of sections) {
          const exercises = await base44.entities.Exercise.filter({ training_section_id: section.id });
          for (const exercise of exercises) {
            await base44.entities.Exercise.delete(exercise.id);
          }
          await base44.entities.TrainingSection.delete(section.id);
        }
        await base44.entities.TrainingPlan.delete(plan.id);
      }

      const clientMeasurements = await base44.entities.Measurement.filter({ trainee_id: clientId });
      for (const measurement of clientMeasurements) {
        await base44.entities.Measurement.delete(measurement.id);
      }

      const clientResults = await base44.entities.ResultsLog.filter({ trainee_id: clientId });
      for (const result of clientResults) {
        await base44.entities.ResultsLog.delete(result.id);
      }

      const clientGoals = await base44.entities.Goal.filter({ trainee_id: clientId });
      for (const goal of clientGoals) {
        await base44.entities.Goal.delete(goal.id);
      }

      const workoutLogs = await base44.entities.WorkoutLog.filter({ trainee_id: clientId });
      for (const log of workoutLogs) {
        await base44.entities.WorkoutLog.delete(log.id);
      }

      const reflections = await base44.entities.Reflection.filter({ trainee_id: clientId });
      for (const reflection of reflections) {
        await base44.entities.Reflection.delete(reflection.id);
      }

      await base44.entities.User.update(clientId, {
        account_deleted: true,
        deleted_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['users-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['all-services'] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['all-sessions-clients'] });
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
      queryClient.invalidateQueries({ queryKey: ['trainees-list'] });
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['all-goals'] });
      queryClient.invalidateQueries({ queryKey: ['all-measurements'] });
      queryClient.invalidateQueries({ queryKey: ['all-results'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.refetchQueries();
      setShowDeleteDialog(false);
      setDeleteConfirmText("");
      onClose();
      toast.success("✅ המשתמש נמחק מהמערכת לצמיתות");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("נא להעלות תמונה");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("גודל מקסימלי: 5MB");
      return;
    }

    setUploadingImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await updateClientMutation.mutateAsync({ profile_image: file_url });
    } catch (error) {
      toast.error("❌ שגיאה בהעלאת תמונה");
    } finally {
      setUploadingImage(false);
    }
  };

  const createGoalMutation = useMutation({
    mutationFn: (data) => base44.entities.Goal.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['all-goals'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-goals'] });
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
      setShowAddGoal(false);
      setEditingGoal(null);
      setGoalForm({ goal_name: "", description: "", target_value: "", current_value: "", unit: "", target_date: "", status: "בתהליך" });
      toast.success("✅ יעד נוסף");
    },
    onError: (error) => {
      toast.error("❌ שגיאה בהוספת יעד: " + (error.message || "נסה שוב"));
    }
  });

  const updateGoalMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Goal.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['all-goals'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-goals'] });
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
      setShowAddGoal(false);
      setEditingGoal(null);
      toast.success("✅ יעד עודכן");
    },
    onError: (error) => {
      toast.error("❌ שגיאה בעדכון יעד: " + (error.message || "נסה שוב"));
    }
  });

  const deleteGoalMutation = useMutation({
    mutationFn: (id) => base44.entities.Goal.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['all-goals'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-goals'] });
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
      toast.success("✅ יעד נמחק");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const createResultMutation = useMutation({
    mutationFn: (data) => base44.entities.ResultsLog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['results'] });
      queryClient.invalidateQueries({ queryKey: ['all-results'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-results'] });
      queryClient.invalidateQueries({ queryKey: ['my-results'] });
      setShowAddResult(false);
      setEditingResult(null);
      setResultForm({ date: new Date().toISOString().split('T')[0], title: "", description: "", related_goal_id: "" });
      toast.success("✅ הישג נוסף");
    },
    onError: (error) => {
      toast.error("❌ שגיאה בהוספת הישג: " + (error.message || "נסה שוב"));
    }
  });

  const updateResultMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ResultsLog.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['results'] });
      queryClient.invalidateQueries({ queryKey: ['all-results'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-results'] });
      queryClient.invalidateQueries({ queryKey: ['my-results'] });
      setShowAddResult(false);
      setEditingResult(null);
      toast.success("✅ הישג עודכן");
    },
    onError: (error) => {
      toast.error("❌ שגיאה בעדכון הישג: " + (error.message || "נסה שוב"));
    }
  });

  const deleteResultMutation = useMutation({
    mutationFn: (id) => base44.entities.ResultsLog.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['results'] });
      queryClient.invalidateQueries({ queryKey: ['all-results'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-results'] });
      queryClient.invalidateQueries({ queryKey: ['my-results'] });
      toast.success("✅ הישג נמחק");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const createServiceMutation = useMutation({
    mutationFn: (data) => base44.entities.ClientService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['all-services'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
      queryClient.invalidateQueries({ queryKey: ['my-services'] });
      setShowAddService(false);
      setEditingService(null);
      setServiceForm({
        service_type: "אימונים אישיים",
        package_name: "",
        start_date: new Date().toISOString().split('T')[0],
        end_date: "",
        total_sessions: "",
        used_sessions: "0",
        status: "פעיל",
        price: "",
        payment_status: "ממתין לתשלום",
        payment_date: "",
        notes: ""
      });
      toast.success("✅ שירות נוסף");
    },
    onError: (error) => {
      toast.error("❌ שגיאה בהוספת שירות: " + (error.message || "נסה שוב"));
    }
  });

  const updateServiceMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ClientService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['all-services'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
      queryClient.invalidateQueries({ queryKey: ['my-services'] });
      setShowEditService(false);
      setEditingService(null);
      toast.success("✅ שירות עודכן");
    },
    onError: (error) => {
      toast.error("❌ שגיאה בעדכון שירות: " + (error.message || "נסה שוב"));
    }
  });

  const deleteServiceMutation = useMutation({
    mutationFn: (id) => base44.entities.ClientService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['all-services'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
      queryClient.invalidateQueries({ queryKey: ['my-services'] });
      toast.success("✅ שירות נמחק");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const createSessionMutation = useMutation({
    mutationFn: (data) => base44.entities.Session.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['all-sessions-clients'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
      setShowAddAttendance(false);
      setAttendanceForm({ date: new Date().toISOString().split('T')[0], time: "09:00", session_type: "אישי", location: "", attendance_status: "הגיע", coach_notes: "" });
      toast.success("✅ נוכחות נוספה");
    },
    onError: (error) => {
      toast.error("❌ שגיאה בהוספת נוכחות: " + (error.message || "נסה שוב"));
    }
  });

  const createPlanMutation = useMutation({
    mutationFn: async ({ planData }) => {
      const goalFocusArray = Array.isArray(planData.goal_focus) && planData.goal_focus.length > 0
        ? planData.goal_focus
        : ['כוח'];

      const result = await base44.entities.TrainingPlan.create({
        title: planData.plan_name,
        plan_name: planData.plan_name,
        assigned_to: currentClient.id,
        assigned_to_name: currentClient.full_name,
        created_by: coach?.id,
        created_by_name: coach?.full_name,
        goal_focus: goalFocusArray,
        description: planData.description || "",
        start_date: new Date().toISOString().split('T')[0],
        status: "פעילה",
        is_template: false
      });
      return result;
    },
    onSuccess: (createdPlan) => {
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-plans'] });
      queryClient.invalidateQueries({ queryKey: ['my-plans'] });
      setShowAddPlan(false);
      toast.success("✅ תוכנית נוצרה");
      window.location.href = createPageUrl("TrainingPlans") + "?planId=" + createdPlan.id;
    },
    onError: (error) => {
      toast.error("❌ שגיאה ביצירת תוכנית: " + (error.message || "נסה שוב"));
    }
  });

  const handleQuickUpdate = async (field, value) => {
    let updateData = { [field]: value };
    
    if (field === 'birth_date' && value) {
      try {
        const birthDate = new Date(value);
        const today = new Date();
        const calculatedAge = Math.floor((today.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        updateData.age = calculatedAge;
        updateData.birth_date = new Date(value).toISOString();
      } catch (error) {
        updateData.birth_date = null;
      }
    }
    
    await updateClientMutation.mutateAsync(updateData);
  };

  const handleDeleteClient = async () => {
    if (deleteConfirmText !== currentClient.full_name) {
      toast.error(`נא להקליד "${currentClient.full_name}" בדיוק`);
      return;
    }
    await deleteClientMutation.mutateAsync(currentClient.id);
  };

  const handleAddGoal = async () => {
    if (!goalForm.goal_name || !goalForm.target_value) {
      toast.error("מלא שם יעד ויעד");
      return;
    }
    
    const goalData = {
      trainee_id: currentClient.id,
      trainee_name: currentClient.full_name,
      goal_name: goalForm.goal_name,
      description: goalForm.description || null,
      target_value: parseFloat(goalForm.target_value),
      current_value: goalForm.current_value ? parseFloat(goalForm.current_value) : null,
      unit: goalForm.unit || null,
      target_date: goalForm.target_date ? new Date(goalForm.target_date).toISOString() : null,
      start_date: editingGoal?.start_date || new Date().toISOString(),
      status: goalForm.status,
      progress_percentage: goalForm.current_value && goalForm.target_value ? Math.min(100, Math.round((parseFloat(goalForm.current_value) / parseFloat(goalForm.target_value)) * 100)) : 0
    };

    if (editingGoal) {
      await updateGoalMutation.mutateAsync({ id: editingGoal.id, data: goalData });
    } else {
      await createGoalMutation.mutateAsync(goalData);
    }
  };

  const handleAddResult = async () => {
    if (!resultForm.title) {
      toast.error("מלא כותרת");
      return;
    }
    
    const resultData = {
      trainee_id: currentClient.id,
      trainee_name: currentClient.full_name,
      date: new Date(resultForm.date).toISOString(),
      title: resultForm.title,
      description: resultForm.description || null,
      related_goal_id: resultForm.related_goal_id || null,
      recorded_by_coach: coach?.id || null,
      recorded_by_coach_name: coach?.full_name || null
    };

    if (editingResult) {
      await updateResultMutation.mutateAsync({ id: editingResult.id, data: resultData });
    } else {
      await createResultMutation.mutateAsync(resultData);
    }
  };

  const handleAddAttendance = async () => {
    if (!attendanceForm.date || !attendanceForm.time) {
      toast.error("מלא תאריך ושעה");
      return;
    }
    
    const sessionDate = new Date(`${attendanceForm.date}T${attendanceForm.time}:00`);

    await createSessionMutation.mutateAsync({
      date: sessionDate.toISOString(),
      time: attendanceForm.time,
      session_type: attendanceForm.session_type,
      location: attendanceForm.location || null,
      coach_id: coach?.id || null,
      participants: [{
        trainee_id: currentClient.id,
        trainee_name: currentClient.full_name,
        attendance_status: attendanceForm.attendance_status
      }],
      coach_notes: attendanceForm.coach_notes || null,
      status: "התקיים",
      duration: 60
    });
  };

  const handleAddService = async () => {
    if (!serviceForm.service_type) {
      toast.error("בחר סוג שירות");
      return;
    }

    const serviceData = {
      trainee_id: currentClient.id,
      trainee_name: currentClient.full_name,
      service_type: serviceForm.service_type,
      package_name: serviceForm.package_name || null,
      start_date: new Date(serviceForm.start_date).toISOString(),
      end_date: serviceForm.end_date ? new Date(serviceForm.end_date).toISOString() : null,
      total_sessions: serviceForm.total_sessions ? parseInt(serviceForm.total_sessions) : null,
      used_sessions: serviceForm.used_sessions ? parseInt(serviceForm.used_sessions) : 0,
      status: serviceForm.status,
      price: serviceForm.price ? parseFloat(serviceForm.price) : null,
      payment_status: serviceForm.payment_status,
      payment_date: serviceForm.payment_date ? new Date(serviceForm.payment_date).toISOString() : null,
      notes: serviceForm.notes || null,
      created_by_coach: coach?.id || null
    };

    if (editingService) {
      await updateServiceMutation.mutateAsync({ id: editingService.id, data: serviceData });
    } else {
      await createServiceMutation.mutateAsync(serviceData);
    }
  };

  const handleSaveOverview = async () => {
    await updateClientMutation.mutateAsync(editFormOverview);
    setShowEditOverview(false);
  };

  const activeServices = services.filter(s => s.status === 'פעיל');
  const upcomingSessions = sessions.filter(s => {
    if (!s.date) return false;
    try {
      const sessionDate = new Date(s.date);
      return sessionDate >= new Date() && s.status === 'מתוכנן';
    } catch {
      return false;
    }
  });

  const pastSessions = sessions.filter(s => {
    if (!s.date) return false;
    try {
      const sessionDate = new Date(s.date);
      return sessionDate < new Date() || s.status === 'התקיים';
    } catch {
      return false;
    }
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  const activeGoals = goals.filter(g => g.status === 'בתהליך');
  const completedGoals = goals.filter(g => g.status === 'הושג');

  const attendedSessions = pastSessions.filter(s => {
    const participant = s.participants?.find(p => p.trainee_id === currentClient.id);
    return participant?.attendance_status === 'הגיע';
  }).length;

  const attendanceRate = pastSessions.length > 0 
    ? Math.round((attendedSessions / pastSessions.length) * 100) 
    : 0;

  const totalSessionsRemaining = activeServices.reduce((sum, s) => {
    if (s.service_type === 'אימונים אישיים' && s.total_sessions) {
      return sum + (s.total_sessions - (s.used_sessions || 0));
    }
    return sum;
  }, 0);

  const getClientStatus = () => {
    if (activeServices.length === 0) return { text: 'ללא שירות', color: '#999' };
    if (totalSessionsRemaining <= 3 && totalSessionsRemaining > 0) return { text: 'עומד להסתיים', color: '#FF9800' };
    return { text: 'פעיל', color: '#4CAF50' };
  };

  const clientStatus = getClientStatus();

  return (
    <>
      <div className="w-full flex flex-col" style={{ backgroundColor: '#FFFFFF', maxWidth: '100%', overflowX: 'hidden' }} dir="rtl">
        {/* Header - Always Visible */}
        <div className="p-3 md:p-6 mb-3 md:mb-4 text-center" style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E0E0E0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          borderRadius: '8px'
        }}>
          <div className="flex justify-end mb-1 md:mb-2">
            <Button onClick={onClose} variant="ghost" size="sm" style={{ color: '#7D7D7D' }}>
              <X className="w-4 h-4 md:w-5 md:h-5" />
            </Button>
          </div>

          {/* Profile Image */}
          <div className="relative inline-block mb-2 md:mb-3">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center font-bold text-2xl md:text-3xl border-2 mx-auto"
              style={{ backgroundColor: '#FFFFFF', color: '#FF6F20', borderColor: '#FF6F20', boxShadow: '0 2px 8px rgba(255, 111, 32, 0.12)' }}>
              {currentClient.profile_image ? (
                <img src={currentClient.profile_image} alt={currentClient.full_name} className="w-full h-full rounded-full object-cover" />
              ) : (
                currentClient.full_name?.[0] || 'U'
              )}
            </div>
            <div className="absolute -bottom-1 -left-1">
              <input type="file" id="profile-img" accept="image/*" onChange={handleImageUpload} className="hidden" />
              <label htmlFor="profile-img">
                <div className="w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center cursor-pointer"
                  style={{ backgroundColor: '#FF6F20', border: '2px solid white', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}>
                  {uploadingImage ? <Loader2 className="w-3 h-3 md:w-4 md:h-4 text-white animate-spin" /> : <Camera className="w-3 h-3 md:w-4 md:h-4 text-white" />}
                </div>
              </label>
            </div>
          </div>

          {/* Editable Header Fields */}
          <div className="space-y-1 md:space-y-2 mb-2 md:mb-3">
            {/* Name */}
            <div onClick={() => setShowEditName(true)} className="cursor-pointer p-1.5 md:p-2 rounded-lg hover:bg-gray-50 transition-all active:bg-gray-100">
              <h2 className="text-lg md:text-2xl font-bold flex items-center justify-center gap-1 md:gap-2" style={{ color: '#000000' }}>
                <span className="truncate max-w-[250px]">{currentClient.full_name}</span>
                <Edit2 className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" style={{ color: '#FF6F20' }} />
              </h2>
            </div>

            {/* Phone */}
            <div onClick={() => setShowEditPhone(true)} className="cursor-pointer p-1.5 md:p-2 rounded-lg hover:bg-gray-50 transition-all active:bg-gray-100">
              <p className="text-xs md:text-sm flex items-center justify-center gap-1 md:gap-2" style={{ color: '#7D7D7D' }}>
                <Phone className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                <span className="truncate">{currentClient.phone || 'הוסף טלפון'}</span>
                <Edit2 className="w-2.5 h-2.5 md:w-3 md:h-3 flex-shrink-0" style={{ color: '#FF6F20' }} />
              </p>
            </div>

            {/* Birth Date */}
            <div onClick={() => setShowEditBirthDate(true)} className="cursor-pointer p-1.5 md:p-2 rounded-lg hover:bg-gray-50 transition-all active:bg-gray-100">
              <p className="text-xs md:text-sm flex items-center justify-center gap-1 md:gap-2 flex-wrap" style={{ color: '#7D7D7D' }}>
                <Calendar className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
                <span>{currentClient.birth_date ? format(new Date(currentClient.birth_date), 'dd/MM/yyyy') : 'הוסף תאריך לידה'}</span>
                {currentClient.age && <span>({currentClient.age})</span>}
                <Edit2 className="w-2.5 h-2.5 md:w-3 md:h-3 flex-shrink-0" style={{ color: '#FF6F20' }} />
              </p>
            </div>

            {/* Client Type & Status */}
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <div onClick={() => setShowEditClientType(true)} className="cursor-pointer">
                <span className="px-2 md:px-3 py-0.5 md:py-1 rounded-md text-[10px] md:text-xs font-medium inline-flex items-center gap-1"
                  style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}>
                  {currentClient.client_type}
                  <Edit2 className="w-2.5 h-2.5 md:w-3 md:h-3" />
                </span>
              </div>
              <span className="px-2 md:px-3 py-0.5 md:py-1 rounded-md text-[10px] md:text-xs font-medium"
                style={{ border: `1px solid ${clientStatus.color}`, color: clientStatus.color }}>
                {clientStatus.text}
              </span>
            </div>
          </div>

          <Button onClick={() => setShowDeleteDialog(true)} variant="ghost" size="sm" className="text-[10px] md:text-xs mt-2" style={{ color: '#f44336' }}>
            <Trash2 className="w-3 h-3 ml-1" />
            מחק לקוח
          </Button>
        </div>

        {/* Tabs */}
        <div className="mb-3 md:mb-4 px-2 md:px-4" style={{ maxWidth: '100%' }}>
          <div className="grid grid-cols-4 md:flex md:flex-wrap gap-1 md:gap-2">
            <button onClick={() => setActiveTab("overview")} className="flex flex-col md:flex-row items-center gap-0.5 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 rounded-lg font-medium text-[10px] md:text-sm whitespace-nowrap transition-all"
              style={{ backgroundColor: activeTab === 'overview' ? '#FF6F20' : '#FFFFFF', color: activeTab === 'overview' ? 'white' : '#7D7D7D', border: `1px solid ${activeTab === 'overview' ? '#FF6F20' : '#E0E0E0'}` }}>
              <User className="w-3 h-3" />
              <span className="hidden md:inline">פרטים אישיים</span>
              <span className="md:hidden leading-tight">פרטים</span>
            </button>
            
            <button onClick={() => setActiveTab("services")} className="flex flex-col md:flex-row items-center gap-0.5 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 rounded-lg font-medium text-[10px] md:text-sm whitespace-nowrap transition-all"
              style={{ backgroundColor: activeTab === 'services' ? '#FF6F20' : '#FFFFFF', color: activeTab === 'services' ? 'white' : '#7D7D7D', border: `1px solid ${activeTab === 'services' ? '#FF6F20' : '#E0E0E0'}` }}>
              <Package className="w-3 h-3" />
              <span className="leading-tight">שירותים</span>
            </button>
            
            <button onClick={() => setActiveTab("metrics")} className="flex flex-col md:flex-row items-center gap-0.5 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 rounded-lg font-medium text-[10px] md:text-sm whitespace-nowrap transition-all"
              style={{ backgroundColor: activeTab === 'metrics' ? '#FF6F20' : '#FFFFFF', color: activeTab === 'metrics' ? 'white' : '#7D7D7D', border: `1px solid ${activeTab === 'metrics' ? '#FF6F20' : '#E0E0E0'}` }}>
              <TrendingUp className="w-3 h-3" />
              <span className="leading-tight">מדדים</span>
            </button>
            
            <button onClick={() => setActiveTab("achievements")} className="flex flex-col md:flex-row items-center gap-0.5 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 rounded-lg font-medium text-[10px] md:text-sm whitespace-nowrap transition-all"
              style={{ backgroundColor: activeTab === 'achievements' ? '#FF6F20' : '#FFFFFF', color: activeTab === 'achievements' ? 'white' : '#7D7D7D', border: `1px solid ${activeTab === 'achievements' ? '#FF6F20' : '#E0E0E0'}` }}>
              <Award className="w-3 h-3" />
              <span className="leading-tight">הישגים</span>
            </button>

            <button onClick={() => setActiveTab("notes")} className="flex flex-col md:flex-row items-center gap-0.5 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 rounded-lg font-medium text-[10px] md:text-sm whitespace-nowrap transition-all"
              style={{ backgroundColor: activeTab === 'notes' ? '#FF6F20' : '#FFFFFF', color: activeTab === 'notes' ? 'white' : '#7D7D7D', border: `1px solid ${activeTab === 'notes' ? '#FF6F20' : '#E0E0E0'}` }}>
              <MessageSquare className="w-3 h-3" />
              <span className="leading-tight">הערות</span>
            </button>
            
            <button onClick={() => setActiveTab("attendance")} className="flex flex-col md:flex-row items-center gap-0.5 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 rounded-lg font-medium text-[10px] md:text-sm whitespace-nowrap transition-all"
              style={{ backgroundColor: activeTab === 'attendance' ? '#FF6F20' : '#FFFFFF', color: activeTab === 'attendance' ? 'white' : '#7D7D7D', border: `1px solid ${activeTab === 'attendance' ? '#FF6F20' : '#E0E0E0'}` }}>
              <Dumbbell className="w-3 h-3" />
              <span className="leading-tight">יומן</span>
            </button>
            
            <button onClick={() => setActiveTab("programs")} className="flex flex-col md:flex-row items-center gap-0.5 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 rounded-lg font-medium text-[10px] md:text-sm whitespace-nowrap transition-all"
              style={{ backgroundColor: activeTab === 'programs' ? '#FF6F20' : '#FFFFFF', color: activeTab === 'programs' ? 'white' : '#7D7D7D', border: `1px solid ${activeTab === 'programs' ? '#FF6F20' : '#E0E0E0'}` }}>
              <FileText className="w-3 h-3" />
              <span className="leading-tight">תוכניות</span>
            </button>

            <button onClick={() => setActiveTab("messages")} className="flex flex-col md:flex-row items-center gap-0.5 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 rounded-lg font-medium text-[10px] md:text-sm whitespace-nowrap transition-all"
              style={{ backgroundColor: activeTab === 'messages' ? '#FF6F20' : '#FFFFFF', color: activeTab === 'messages' ? 'white' : '#7D7D7D', border: `1px solid ${activeTab === 'messages' ? '#FF6F20' : '#E0E0E0'}` }}>
              <MessageSquare className="w-3 h-3" />
              <span className="leading-tight">הודעות</span>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="px-3 md:px-6 pb-4 md:pb-6" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="space-y-3 md:space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-base md:text-lg font-bold flex items-center gap-2" style={{ color: '#000000' }}>
                  <User className="w-4 h-4 md:w-5 md:h-5" style={{ color: '#FF6F20' }} />
                  פרטים אישיים
                </h2>
                <Button onClick={() => setShowEditOverview(true)} variant="ghost" className="rounded-lg px-2 md:px-3 py-1.5 md:py-2 font-medium text-[10px] md:text-xs"
                  style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}>
                  <Edit2 className="w-3 h-3 ml-1" />
                  ערוך
                </Button>
              </div>

              <div className="p-3 md:p-4 rounded-lg space-y-2 md:space-y-3" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
                <div className="flex items-start gap-2 md:gap-3 p-2 md:p-3 rounded-lg" style={{ backgroundColor: '#FAFAFA' }}>
                  <Mail className="w-3 h-3 md:w-4 md:h-4 mt-0.5 flex-shrink-0" style={{ color: '#2196F3' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] md:text-xs font-bold mb-0.5" style={{ color: '#7D7D7D' }}>אימייל</p>
                    <p className="font-medium text-xs md:text-sm break-all" style={{ color: '#000000' }}>{currentClient.email}</p>
                  </div>
                </div>
                
                {(currentClient.city || currentClient.address) && (
                  <div className="flex items-start gap-2 md:gap-3 p-2 md:p-3 rounded-lg" style={{ backgroundColor: '#FAFAFA' }}>
                    <MapPin className="w-3 h-3 md:w-4 md:h-4 mt-0.5 flex-shrink-0" style={{ color: '#FF6F20' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] md:text-xs font-bold mb-0.5" style={{ color: '#7D7D7D' }}>מיקום</p>
                      <p className="font-medium text-xs md:text-sm break-words" style={{ color: '#000000' }}>
                        {currentClient.city}{currentClient.address && `, ${currentClient.address}`}
                      </p>
                    </div>
                  </div>
                )}

                {currentClient.created_date && (
                  <div className="flex items-start gap-2 md:gap-3 p-2 md:p-3 rounded-lg" style={{ backgroundColor: '#FAFAFA' }}>
                    <Calendar className="w-3 h-3 md:w-4 md:h-4 mt-0.5 flex-shrink-0" style={{ color: '#FF6F20' }} />
                    <div className="flex-1">
                      <p className="text-[10px] md:text-xs font-bold mb-0.5" style={{ color: '#7D7D7D' }}>תאריך הצטרפות</p>
                      <p className="font-medium text-xs md:text-sm" style={{ color: '#000000' }}>
                        {format(new Date(currentClient.created_date), 'dd MMMM yyyy', { locale: he })}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {(currentClient.main_goal || currentClient.current_status || currentClient.future_vision) && (
                <div className="p-3 md:p-4 rounded-lg" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
                  <h3 className="text-sm md:text-base font-bold mb-2 md:mb-3 pb-2 flex items-center gap-2" style={{ color: '#000000', borderBottom: '1px solid #F0F0F0' }}>
                    <Target className="w-4 h-4" style={{ color: '#FF6F20' }} />
                    מטרות וחזון
                  </h3>
                  <div className="space-y-2 md:space-y-3">
                    {currentClient.main_goal && (
                      <div className="p-3 md:p-4 rounded-lg" style={{ backgroundColor: '#FFF8F3', borderRight: '3px solid #FF6F20' }}>
                        <p className="text-[10px] md:text-xs font-bold mb-1 md:mb-1.5" style={{ color: '#FF6F20' }}>מטרה מרכזית</p>
                        <p className="text-xs md:text-sm leading-relaxed" style={{ color: '#000000' }}>{currentClient.main_goal}</p>
                      </div>
                    )}
                    {currentClient.current_status && (
                      <div className="p-2 md:p-3 rounded-lg" style={{ backgroundColor: '#FAFAFA' }}>
                        <p className="text-[10px] md:text-xs font-bold mb-1" style={{ color: '#7D7D7D' }}>נקודת מוצא</p>
                        <p className="text-xs md:text-sm leading-relaxed" style={{ color: '#000000' }}>{currentClient.current_status}</p>
                      </div>
                    )}
                    {currentClient.future_vision && (
                      <div className="p-2 md:p-3 rounded-lg" style={{ backgroundColor: '#FAFAFA' }}>
                        <p className="text-[10px] md:text-xs font-bold mb-1" style={{ color: '#7D7D7D' }}>חזון עתידי</p>
                        <p className="text-xs md:text-sm leading-relaxed" style={{ color: '#000000' }}>{currentClient.future_vision}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {currentClient.health_issues && (
                <div className="p-3 md:p-4 rounded-lg" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
                  <h3 className="text-sm md:text-base font-bold mb-2 md:mb-3 pb-2 flex items-center gap-2" style={{ color: '#000000', borderBottom: '1px solid #F0F0F0' }}>
                    <Heart className="w-4 h-4" style={{ color: '#f44336' }} />
                    מידע רפואי
                  </h3>
                  <div className="space-y-2 md:space-y-3">
                    {currentClient.health_declaration_accepted && (
                      <div className="p-2 md:p-3 rounded-lg flex items-center gap-2" style={{ backgroundColor: '#E8F5E9', border: '1px solid #4CAF50' }}>
                        <CheckCircle className="w-3 h-3 md:w-4 md:h-4" style={{ color: '#4CAF50' }} />
                        <p className="text-[10px] md:text-xs font-medium" style={{ color: '#2E7D32' }}>הצהרת בריאות אושרה</p>
                      </div>
                    )}
                    <div className="p-2 md:p-3 rounded-lg" style={{ backgroundColor: '#FFEBEE', border: '1px solid #f44336' }}>
                      <p className="text-[10px] md:text-xs font-bold mb-1" style={{ color: '#f44336' }}>מצב רפואי</p>
                      <p className="text-xs md:text-sm leading-relaxed" style={{ color: '#000000' }}>{currentClient.health_issues}</p>
                    </div>
                    {(currentClient.emergency_contact_name || currentClient.emergency_contact_phone) && (
                      <div className="p-2 md:p-3 rounded-lg" style={{ backgroundColor: '#FFF3E0', border: '1px solid #FF9800' }}>
                        <p className="text-[10px] md:text-xs font-bold mb-1 md:mb-2 flex items-center gap-1" style={{ color: '#FF9800' }}>
                          <Phone className="w-3 h-3" />
                          איש קשר לחירום
                        </p>
                        {currentClient.emergency_contact_name && <p className="text-xs md:text-sm mb-1" style={{ color: '#000000' }}><span className="font-bold">שם:</span> {currentClient.emergency_contact_name}</p>}
                        {currentClient.emergency_contact_phone && <p className="text-xs md:text-sm" style={{ color: '#000000' }}><span className="font-bold">טלפון:</span> {currentClient.emergency_contact_phone}</p>}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Services Tab */}
          {activeTab === "services" && (
            <div className="space-y-3 md:space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-base md:text-lg font-bold flex items-center gap-2" style={{ color: '#000000' }}>
                  <Package className="w-4 h-4 md:w-5 md:h-5" style={{ color: '#FF6F20' }} />
                  שירותים ורכישות
                </h2>
                <Button onClick={() => { 
                  setEditingService(null); 
                  setServiceForm({
                    service_type: "אימונים אישיים",
                    package_name: "",
                    start_date: new Date().toISOString().split('T')[0],
                    end_date: "",
                    total_sessions: "",
                    used_sessions: "0",
                    status: "פעיל",
                    price: "",
                    payment_status: "ממתין לתשלום",
                    payment_date: "",
                    notes: ""
                  }); 
                  setShowAddService(true); 
                }}
                  variant="ghost" className="rounded-lg px-2 md:px-3 py-1.5 md:py-2 font-medium text-[10px] md:text-xs" style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}>
                  <Plus className="w-3 h-3 ml-1" />
                  הוסף
                </Button>
              </div>
              
              {services.length === 0 ? (
                <div className="text-center py-6 md:py-8 p-4 md:p-5 rounded-lg" style={{ backgroundColor: '#FAFAFA' }}>
                  <Package className="w-8 h-8 md:w-10 md:h-10 mx-auto mb-2 md:mb-3" style={{ color: '#E0E0E0' }} />
                  <p className="text-sm md:text-base" style={{ color: '#7D7D7D' }}>אין שירותים</p>
                </div>
              ) : (
                <div className="space-y-2 md:space-y-3">
                  {services.map(service => (
                    <div key={service.id} className="p-4 md:p-6 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: service.status === 'פעיל' ? '2px solid #FF6F20' : '2px solid #E0E0E0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                      <div className="flex justify-between items-start mb-2 md:mb-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-sm md:text-base mb-1" style={{ color: '#000' }}>{service.service_type}</h4>
                          {service.package_name && <p className="text-[10px] md:text-xs mb-1" style={{ color: '#7D7D7D' }}>{service.package_name}</p>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {service.status === 'פעיל' && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] md:text-xs font-medium" style={{ border: '1px solid #4CAF50', color: '#4CAF50' }}>פעיל</span>
                          )}
                          <Button onClick={() => { 
                            setEditingService(service); 
                            setServiceForm({
                              service_type: service.service_type,
                              package_name: service.package_name || "",
                              start_date: service.start_date ? service.start_date.split('T')[0] : "",
                              end_date: service.end_date ? service.end_date.split('T')[0] : "",
                              total_sessions: service.total_sessions?.toString() || "",
                              used_sessions: service.used_sessions?.toString() || "0",
                              status: service.status,
                              price: service.price?.toString() || "",
                              payment_status: service.payment_status || "ממתין לתשלום",
                              payment_date: service.payment_date ? service.payment_date.split('T')[0] : "",
                              notes: service.notes || ""
                            });
                            setShowEditService(true); 
                          }}
                            size="icon" variant="ghost" className="w-7 h-7 md:w-8 md:h-8 rounded-lg" style={{ color: '#FF6F20' }}>
                            <Edit2 className="w-3 h-3 md:w-4 md:h-4" />
                          </Button>
                          <Button onClick={() => { if (window.confirm(`למחוק שירות "${service.service_type}"?`)) deleteServiceMutation.mutate(service.id); }}
                            size="icon" variant="ghost" className="w-7 h-7 md:w-8 md:h-8 rounded-lg" style={{ color: '#f44336' }}>
                            <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                          </Button>
                        </div>
                      </div>
                      {service.total_sessions && (
                        <div className="mb-2 md:mb-3">
                          <div className="flex justify-between text-[10px] md:text-xs mb-2">
                            <span style={{ color: '#7D7D7D' }}>אימונים</span>
                            <span className="font-bold" style={{ color: '#FF6F20' }}>{service.used_sessions || 0} / {service.total_sessions}</span>
                          </div>
                          <div className="h-2 md:h-3 rounded-full" style={{ backgroundColor: '#E0E0E0' }}>
                            <div className="h-full rounded-full" style={{ width: `${((service.used_sessions || 0) / service.total_sessions) * 100}%`, backgroundColor: '#FF6F20' }} />
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[10px] md:text-xs flex-wrap gap-2">
                        {service.start_date && (
                          <p className="flex items-center gap-1" style={{ color: '#7D7D7D' }}>
                            <Calendar className="w-3 h-3" />
                            התחלה: {format(new Date(service.start_date), 'dd/MM/yy')}
                          </p>
                        )}
                        {service.end_date && (
                          <p className="flex items-center gap-1" style={{ color: '#7D7D7D' }}>
                            <Calendar className="w-3 h-3" />
                            סיום: {format(new Date(service.end_date), 'dd/MM/yy')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Metrics Tab */}
          {activeTab === "metrics" && (
            <div className="space-y-3 md:space-y-4">
              <h2 className="text-base md:text-lg font-bold flex items-center gap-2" style={{ color: '#000000' }}>
                <TrendingUp className="w-4 h-4 md:w-5 md:h-5" style={{ color: '#FF6F20' }} />
                מדדים פיזיים
              </h2>
              <PhysicalMetricsManager
                trainee={currentClient}
                measurements={measurements}
                results={results}
                coach={coach}
                goals={goals}
              />
            </div>
          )}

          {/* Achievements Tab */}
          {activeTab === "achievements" && (
            <div className="space-y-3 md:space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-base md:text-lg font-bold flex items-center gap-2" style={{ color: '#000000' }}>
                  <Award className="w-4 h-4 md:w-5 md:h-5" style={{ color: '#FFD700' }} />
                  הישגים ותוצאות
                </h2>
                <Button onClick={() => { setEditingResult(null); setResultForm({ date: new Date().toISOString().split('T')[0], title: "", description: "", related_goal_id: "" }); setShowAddResult(true); }}
                  variant="ghost" className="rounded-lg px-2 md:px-3 py-1.5 md:py-2 font-medium text-[10px] md:text-xs" style={{ border: '1px solid #FFD700', color: '#000000' }}>
                  <Plus className="w-3 h-3 ml-1" />
                  הוסף
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-2 md:gap-3">
                <div className="p-2 md:p-3 rounded-lg text-center" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
                  <Award className="w-4 h-4 md:w-5 md:h-5 mx-auto mb-1" style={{ color: '#FFD700' }} />
                  <p className="text-base md:text-xl font-bold mb-0.5" style={{ color: '#000000' }}>{results.length}</p>
                  <p className="text-[9px] md:text-xs" style={{ color: '#7D7D7D' }}>סה״כ</p>
                </div>
                <div className="p-2 md:p-3 rounded-lg text-center" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
                  <Target className="w-4 h-4 md:w-5 md:h-5 mx-auto mb-1" style={{ color: '#FF6F20' }} />
                  <p className="text-base md:text-xl font-bold mb-0.5" style={{ color: '#000000' }}>{activeGoals.length}</p>
                  <p className="text-[9px] md:text-xs" style={{ color: '#7D7D7D' }}>יעדים</p>
                </div>
                <div className="p-2 md:p-3 rounded-lg text-center" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
                  <CheckCircle className="w-4 h-4 md:w-5 md:h-5 mx-auto mb-1" style={{ color: '#4CAF50' }} />
                  <p className="text-base md:text-xl font-bold mb-0.5" style={{ color: '#000000' }}>{completedGoals.length}</p>
                  <p className="text-[9px] md:text-xs" style={{ color: '#7D7D7D' }}>הושגו</p>
                </div>
              </div>

              {results.length === 0 ? (
                <div className="text-center py-6 md:py-8 p-4 md:p-5 rounded-lg" style={{ backgroundColor: '#FAFAFA' }}>
                  <Award className="w-8 h-8 md:w-10 md:h-10 mx-auto mb-2 md:mb-3" style={{ color: '#E0E0E0' }} />
                  <p className="text-sm md:text-base" style={{ color: '#7D7D7D' }}>אין הישגים</p>
                </div>
              ) : (
                <div className="space-y-2 md:space-y-3">
                  {results.map(result => {
                    const relatedGoal = goals.find(g => g.id === result.related_goal_id);
                    return (
                      <div key={result.id} className="p-3 md:p-4 rounded-lg" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        <div className="flex justify-between items-start mb-2 md:mb-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-base md:text-lg flex items-center gap-2 mb-1 md:mb-2" style={{ color: '#000' }}>
                              <Award className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0" style={{ color: '#FFD700' }} />
                              <span className="truncate">{result.title}</span>
                            </h4>
                            <p className="text-[10px] md:text-xs flex items-center gap-1" style={{ color: '#7D7D7D' }}>
                              <Calendar className="w-3 h-3" />
                              {format(new Date(result.date), 'dd/MM/yyyy')}
                            </p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button onClick={() => { setEditingResult(result); setResultForm({ date: result.date.split('T')[0], title: result.title, description: result.description || "", related_goal_id: result.related_goal_id || "" }); setShowAddResult(true); }}
                              size="icon" variant="ghost" className="w-7 h-7 md:w-8 md:h-8 rounded-lg" style={{ color: '#FF6F20' }}>
                              <Edit2 className="w-3 h-3 md:w-4 md:h-4" />
                            </Button>
                            <Button onClick={() => { if (window.confirm(`למחוק "${result.title}"?`)) deleteResultMutation.mutate(result.id); }}
                              size="icon" variant="ghost" className="w-7 h-7 md:w-8 md:h-8 rounded-lg" style={{ color: '#f44336' }}>
                              <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                            </Button>
                          </div>
                        </div>
                        {result.description && (
                          <>
                            <div className="w-full h-px my-2 md:my-3" style={{ backgroundColor: '#FFE082' }} />
                            <p className="text-xs md:text-sm leading-relaxed" style={{ color: '#000' }}>{result.description}</p>
                          </>
                        )}
                        {relatedGoal && (
                          <>
                            <div className="w-full h-px my-2 md:my-3" style={{ backgroundColor: '#FFE082' }} />
                            <span className="text-[10px] md:text-xs font-bold px-2 md:px-3 py-1 md:py-1.5 rounded-full" style={{ backgroundColor: '#E8F5E9', color: '#2E7D32' }}>
                              🎯 יעד: {relatedGoal.goal_name}
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Goals Section */}
              <div className="mt-6 md:mt-8">
                <div className="flex justify-between items-center mb-3 md:mb-4">
                  <h3 className="text-sm md:text-base font-bold flex items-center gap-2" style={{ color: '#000000' }}>
                    <Target className="w-4 h-4" style={{ color: '#FF6F20' }} />
                    יעדים
                  </h3>
                  <Button onClick={() => { setEditingGoal(null); setGoalForm({ goal_name: "", description: "", target_value: "", current_value: "", unit: "", target_date: "", status: "בתהליך" }); setShowAddGoal(true); }}
                    variant="ghost" className="rounded-lg px-2 md:px-3 py-1.5 md:py-2 font-medium text-[10px] md:text-xs" style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}>
                    <Plus className="w-3 h-3 ml-1" />
                    הוסף
                  </Button>
                </div>

                {goals.length === 0 ? (
                  <div className="text-center py-6 md:py-8 p-4 md:p-5 rounded-lg" style={{ backgroundColor: '#FAFAFA' }}>
                    <Target className="w-8 h-8 md:w-10 md:h-10 mx-auto mb-2 md:mb-3" style={{ color: '#E0E0E0' }} />
                    <p className="text-sm md:text-base" style={{ color: '#7D7D7D' }}>אין יעדים</p>
                  </div>
                ) : (
                  <div className="space-y-2 md:space-y-3">
                    {goals.map(goal => (
                      <div key={goal.id} className="p-3 md:p-4 rounded-lg" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        <div className="flex justify-between items-start mb-2 md:mb-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-base md:text-lg mb-1 md:mb-2 truncate" style={{ color: '#000' }}>{goal.goal_name}</h4>
                            {goal.description && <p className="text-xs md:text-sm mb-2" style={{ color: '#7D7D7D' }}>{goal.description}</p>}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button onClick={() => { setEditingGoal(goal); setGoalForm({ goal_name: goal.goal_name, description: goal.description || "", target_value: goal.target_value?.toString() || "", current_value: goal.current_value?.toString() || "", unit: goal.unit || "", target_date: goal.target_date?.split('T')[0] || "", status: goal.status }); setShowAddGoal(true); }}
                              size="icon" variant="ghost" className="w-7 h-7 md:w-8 md:h-8 rounded-lg" style={{ color: '#FF6F20' }}>
                              <Edit2 className="w-3 h-3 md:w-4 md:h-4" />
                            </Button>
                            <Button onClick={() => { if (window.confirm(`למחוק "${goal.goal_name}"?`)) deleteGoalMutation.mutate(goal.id); }}
                              size="icon" variant="ghost" className="w-7 h-7 md:w-8 md:h-8 rounded-lg" style={{ color: '#f44336' }}>
                              <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="mb-2 md:mb-3">
                          <div className="flex justify-between text-[10px] md:text-xs mb-2">
                            <span style={{ color: '#7D7D7D' }}>התקדמות</span>
                            <span className="font-bold" style={{ color: '#FF6F20' }}>
                              {goal.current_value || 0} / {goal.target_value} {goal.unit}
                            </span>
                          </div>
                          <div className="h-2 md:h-3 rounded-full overflow-hidden" style={{ backgroundColor: '#E0E0E0' }}>
                            <div className="h-full transition-all" style={{ width: `${goal.progress_percentage || 0}%`, backgroundColor: '#FF6F20' }} />
                          </div>
                          <p className="text-[10px] md:text-xs mt-2 text-center font-bold" style={{ color: '#FF6F20' }}>{goal.progress_percentage || 0}% הושלם</p>
                        </div>
                        {goal.target_date && (
                          <p className="text-[10px] md:text-xs flex items-center gap-1" style={{ color: '#7D7D7D' }}>
                            <Calendar className="w-3 h-3" />
                            יעד: {format(new Date(goal.target_date), 'dd/MM/yy')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes Tab */}
          {activeTab === "notes" && (
            <div className="space-y-3 md:space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-base md:text-lg font-bold flex items-center gap-2" style={{ color: '#000000' }}>
                  <MessageSquare className="w-4 h-4 md:w-5 md:h-5" style={{ color: '#FF6F20' }} />
                  הערות המאמן
                </h2>
                <Button onClick={() => { setNoteForm({ note_text: "" }); setShowAddNote(true); }}
                  variant="ghost" className="rounded-lg px-2 md:px-3 py-1.5 md:py-2 font-medium text-[10px] md:text-xs" style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}>
                  <Plus className="w-3 h-3 ml-1" />
                  הוסף
                </Button>
              </div>

              <div className="text-center py-6 md:py-8 p-4 md:p-5 rounded-lg" style={{ backgroundColor: '#FAFAFA' }}>
                <MessageSquare className="w-8 h-8 md:w-10 md:h-10 mx-auto mb-2 md:mb-3" style={{ color: '#E0E0E0' }} />
                <p className="text-sm md:text-base" style={{ color: '#7D7D7D' }}>ניתן להוסיף הערות כאן</p>
              </div>
            </div>
          )}

          {/* Attendance Tab */}
          {activeTab === "attendance" && (
            <div className="space-y-3 md:space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-base md:text-lg font-bold flex items-center gap-2" style={{ color: '#000000' }}>
                  <Dumbbell className="w-4 h-4 md:w-5 md:h-5" style={{ color: '#FF6F20' }} />
                  יומן אימונים
                </h2>
                <Button onClick={() => setShowAddAttendance(true)} variant="ghost" className="rounded-lg px-2 md:px-3 py-1.5 md:py-2 font-medium text-[10px] md:text-xs"
                  style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}>
                  <Plus className="w-3 h-3 ml-1" />
                  הוסף
                </Button>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                <div className="p-2 md:p-3 rounded-lg text-center" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
                  <Calendar className="w-4 h-4 md:w-5 md:h-5 mx-auto mb-1" style={{ color: '#2196F3' }} />
                  <p className="text-base md:text-xl font-bold mb-0.5" style={{ color: '#000000' }}>{sessions.length}</p>
                  <p className="text-[9px] md:text-xs" style={{ color: '#7D7D7D' }}>סה״כ</p>
                </div>
                <div className="p-2 md:p-3 rounded-lg text-center" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
                  <Clock className="w-4 h-4 md:w-5 md:h-5 mx-auto mb-1" style={{ color: '#FF6F20' }} />
                  <p className="text-base md:text-xl font-bold mb-0.5" style={{ color: '#000000' }}>{upcomingSessions.length}</p>
                  <p className="text-[9px] md:text-xs" style={{ color: '#7D7D7D' }}>עתידיים</p>
                </div>
                <div className="p-2 md:p-3 rounded-lg text-center" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
                  <CheckCircle className="w-4 h-4 md:w-5 md:h-5 mx-auto mb-1" style={{ color: '#4CAF50' }} />
                  <p className="text-base md:text-xl font-bold mb-0.5" style={{ color: '#000000' }}>{attendedSessions}</p>
                  <p className="text-[9px] md:text-xs" style={{ color: '#7D7D7D' }}>הגיעו</p>
                </div>
                <div className="p-2 md:p-3 rounded-lg text-center" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
                  <TrendingUp className="w-4 h-4 md:w-5 md:h-5 mx-auto mb-1" style={{ color: '#FF6F20' }} />
                  <p className="text-base md:text-xl font-bold mb-0.5" style={{ color: '#000000' }}>{attendanceRate}%</p>
                  <p className="text-[9px] md:text-xs" style={{ color: '#7D7D7D' }}>נוכחות</p>
                </div>
              </div>

              {sessions.length === 0 ? (
                <div className="text-center py-6 md:py-8 p-4 md:p-5 rounded-lg" style={{ backgroundColor: '#FAFAFA' }}>
                  <Calendar className="w-8 h-8 md:w-10 md:h-10 mx-auto mb-2 md:mb-3" style={{ color: '#E0E0E0' }} />
                  <p className="text-sm md:text-base" style={{ color: '#7D7D7D' }}>אין מפגשים</p>
                </div>
              ) : (
                <div className="space-y-2 md:space-y-3">
                  {pastSessions.slice(0, 10).map(session => {
                    const participant = session.participants?.find(p => p.trainee_id === currentClient.id);
                    const attended = participant?.attendance_status === 'הגיע';
                    const cancelled = participant?.attendance_status === 'ביטל';
                    
                    return (
                      <div key={session.id} className="p-3 md:p-4 rounded-lg" style={{ 
                        backgroundColor: attended ? '#F0F9F0' : cancelled ? '#FFEBEE' : '#FAFAFA',
                        border: attended ? '2px solid #4CAF50' : cancelled ? '2px solid #f44336' : '1px solid #E0E0E0'
                      }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                            <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: attended ? '#4CAF50' : cancelled ? '#f44336' : '#7D7D7D' }} />
                            <div className="min-w-0">
                              <p className="font-bold text-sm md:text-base truncate" style={{ color: '#000000' }}>
                                {session.date && format(new Date(session.date), 'dd/MM/yyyy')}
                              </p>
                              <p className="text-[10px] md:text-xs" style={{ color: '#7D7D7D' }}>
                                {session.time} • {session.session_type}
                              </p>
                            </div>
                          </div>
                          <span className="px-2 md:px-3 py-0.5 md:py-1 rounded-lg text-[10px] md:text-xs font-bold flex-shrink-0"
                            style={{ backgroundColor: attended ? '#C8E6C9' : cancelled ? '#FFCDD2' : '#E0E0E0', color: attended ? '#2E7D32' : cancelled ? '#c62828' : '#7D7D7D' }}>
                            {attended && '✅'}
                            {cancelled && '❌'}
                            {!attended && !cancelled && '⏳'}
                          </span>
                        </div>
                        {session.coach_notes && (
                          <div className="mt-2 md:mt-3 p-2 md:p-3 rounded-lg" style={{ backgroundColor: '#FFFBF0', border: '1px solid #FFE082' }}>
                            <p className="text-[10px] md:text-xs font-bold mb-1" style={{ color: '#F57C00' }}>📝 הערות:</p>
                            <p className="text-xs md:text-sm" style={{ color: '#000000' }}>{session.coach_notes}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Programs Tab */}
          {activeTab === "programs" && (
            <div className="space-y-6">
              {/* Programs by Coach */}
              <div className="space-y-3 md:space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-base md:text-lg font-bold flex items-center gap-2" style={{ color: '#000000' }}>
                    <FileText className="w-4 h-4 md:w-5 md:h-5" style={{ color: '#FF6F20' }} />
                    תוכניות שנוצרו ע״י מאמן
                  </h2>
                  <Button onClick={() => setShowAddPlan(true)} variant="ghost" className="rounded-lg px-2 md:px-3 py-1.5 md:py-2 font-medium text-[10px] md:text-xs"
                    style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}>
                    <Plus className="w-3 h-3 ml-1" />
                    צור למתאמן
                  </Button>
                </div>
                
                {trainingPlans.filter(p => p.created_by !== client.id).length === 0 ? (
                  <div className="text-center py-6 md:py-8 p-4 md:p-5 rounded-lg" style={{ backgroundColor: '#FAFAFA' }}>
                    <p className="text-sm md:text-base" style={{ color: '#7D7D7D' }}>אין תוכניות מהמאמן</p>
                  </div>
                ) : (
                  <div className="space-y-2 md:space-y-3">
                    {trainingPlans.filter(p => p.created_by !== client.id).map(plan => (
                      <div key={plan.id} className="p-3 md:p-4 rounded-lg" style={{ backgroundColor: '#FFFFFF', border: '1px solid #FF6F20', boxShadow: '0 1px 3px rgba(255, 111, 32, 0.08)' }}>
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-bold text-sm md:text-base flex-1 min-w-0 truncate" style={{ color: '#000000' }}>{plan.plan_name}</h4>
                          {plan.status === 'פעילה' && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] md:text-xs font-medium flex-shrink-0" style={{ border: '1px solid #4CAF50', color: '#4CAF50' }}>פעיל</span>
                          )}
                        </div>
                        <p className="text-[10px] md:text-xs mb-2" style={{ color: '#9E9E9E' }}>
                          📅 {plan.created_date ? new Date(plan.created_date).toLocaleDateString('he-IL') : 'לא ידוע'}
                        </p>
                        {plan.description && (
                          <p className="text-xs mb-2 line-clamp-2" style={{ color: '#7D7D7D' }}>{plan.description}</p>
                        )}
                        <div className="flex items-center gap-2 text-[10px] md:text-xs" style={{ color: '#000000' }}>
                          <Target className="w-3 h-3" style={{ color: '#FF6F20' }} />
                          <span className="font-medium">{Array.isArray(plan.goal_focus) ? plan.goal_focus.join(', ') : plan.goal_focus}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Programs by Trainee */}
              <div className="space-y-3 md:space-y-4 pt-4 border-t border-gray-100">
                <h2 className="text-base md:text-lg font-bold flex items-center gap-2" style={{ color: '#000000' }}>
                  <User className="w-4 h-4 md:w-5 md:h-5" style={{ color: '#2196F3' }} />
                  Programs Created by Trainee
                </h2>
                
                {trainingPlans.filter(p => p.created_by === client.id).length === 0 ? (
                  <div className="text-center py-6 md:py-8 p-4 md:p-5 rounded-lg" style={{ backgroundColor: '#F8FAFC' }}>
                    <p className="text-sm md:text-base" style={{ color: '#7D7D7D' }}>המתאמן לא יצר תוכניות</p>
                  </div>
                ) : (
                  <div className="space-y-2 md:space-y-3">
                    {trainingPlans.filter(p => p.created_by === client.id).map(plan => (
                      <div key={plan.id} className="p-3 md:p-4 rounded-lg" style={{ backgroundColor: '#FFFFFF', border: '1px solid #2196F3', boxShadow: '0 1px 3px rgba(33, 150, 243, 0.08)' }}>
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-bold text-sm md:text-base flex-1 min-w-0 truncate" style={{ color: '#000000' }}>{plan.plan_name}</h4>
                          {plan.status === 'פעילה' && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] md:text-xs font-medium flex-shrink-0" style={{ border: '1px solid #4CAF50', color: '#4CAF50' }}>פעיל</span>
                          )}
                        </div>
                        <p className="text-[10px] md:text-xs mb-2" style={{ color: '#9E9E9E' }}>
                          📅 {plan.created_date ? new Date(plan.created_date).toLocaleDateString('he-IL') : 'לא ידוע'}
                        </p>
                        {plan.description && (
                          <p className="text-xs mb-2 line-clamp-2" style={{ color: '#7D7D7D' }}>{plan.description}</p>
                        )}
                        <div className="flex items-center gap-2 text-[10px] md:text-xs" style={{ color: '#000000' }}>
                          <Target className="w-3 h-3" style={{ color: '#2196F3' }} />
                          <span className="font-medium">{Array.isArray(plan.goal_focus) ? plan.goal_focus.join(', ') : plan.goal_focus}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Messages Tab */}
          {activeTab === "messages" && coach && currentClient && (
            <div className="space-y-3 md:space-y-4">
              <h2 className="text-base md:text-lg font-bold flex items-center gap-2" style={{ color: '#000000' }}>
                <MessageSquare className="w-4 h-4 md:w-5 md:h-5" style={{ color: '#9C27B0' }} />
                שיחה עם {currentClient.full_name}
              </h2>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E0E0E0', backgroundColor: '#FFFFFF' }}>
                <MessageCenter
                  currentUserId={coach.id}
                  currentUserName={coach.full_name}
                  otherUserId={currentClient.id}
                  otherUserName={currentClient.full_name}
                  relatedUserId={currentClient.id}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Edit Dialogs */}
      <Dialog open={showEditName} onOpenChange={setShowEditName}>
        <DialogContent className="w-[90vw] max-w-sm" style={{ backgroundColor: '#FFFFFF' }}>
          <DialogHeader><DialogTitle className="text-base md:text-lg">שם מלא</DialogTitle></DialogHeader>
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded-xl text-sm md:text-base" />
          <Button onClick={async () => { await handleQuickUpdate('full_name', editName); setShowEditName(false); }} 
            disabled={updateClientMutation.isPending}
            className="w-full rounded-xl py-3 md:py-4 text-white text-sm md:text-base" style={{ backgroundColor: '#FF6F20' }}>
            {updateClientMutation.isPending ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : null}
            שמור
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditPhone} onOpenChange={setShowEditPhone}>
        <DialogContent className="w-[90vw] max-w-sm" style={{ backgroundColor: '#FFFFFF' }}>
          <DialogHeader><DialogTitle className="text-base md:text-lg">טלפון</DialogTitle></DialogHeader>
          <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="050-1234567" className="rounded-xl text-sm md:text-base" />
          <Button onClick={async () => { await handleQuickUpdate('phone', editPhone); setShowEditPhone(false); }} 
            disabled={updateClientMutation.isPending}
            className="w-full rounded-xl py-3 md:py-4 text-white text-sm md:text-base" style={{ backgroundColor: '#FF6F20' }}>
            {updateClientMutation.isPending ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : null}
            שמור
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditBirthDate} onOpenChange={setShowEditBirthDate}>
        <DialogContent className="w-[90vw] max-w-sm" style={{ backgroundColor: '#FFFFFF' }}>
          <DialogHeader><DialogTitle className="text-base md:text-lg">תאריך לידה</DialogTitle></DialogHeader>
          <Input type="date" value={editBirthDate} onChange={(e) => setEditBirthDate(e.target.value)} max={new Date().toISOString().split('T')[0]} className="rounded-xl text-sm md:text-base" />
          <Button onClick={async () => { await handleQuickUpdate('birth_date', editBirthDate); setShowEditBirthDate(false); }} 
            disabled={updateClientMutation.isPending}
            className="w-full rounded-xl py-3 md:py-4 text-white text-sm md:text-base" style={{ backgroundColor: '#FF6F20' }}>
            {updateClientMutation.isPending ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : null}
            שמור
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditClientType} onOpenChange={setShowEditClientType}>
        <DialogContent className="w-[90vw] max-w-sm" style={{ backgroundColor: '#FFFFFF' }}>
          <DialogHeader><DialogTitle className="text-base md:text-lg">סוג לקוח</DialogTitle></DialogHeader>
          <Select value={editClientType} onValueChange={setEditClientType}>
            <SelectTrigger className="rounded-xl text-sm md:text-base"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="לקוח משלם">💰 לקוח משלם</SelectItem>
              <SelectItem value="מתאמן מזדמן">👤 מתאמן מזדמן</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={async () => { await handleQuickUpdate('client_type', editClientType); setShowEditClientType(false); }} 
            disabled={updateClientMutation.isPending}
            className="w-full rounded-xl py-3 md:py-4 text-white text-sm md:text-base" style={{ backgroundColor: '#FF6F20' }}>
            {updateClientMutation.isPending ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : null}
            שמור
          </Button>
        </DialogContent>
      </Dialog>

      {/* Edit Overview Dialog */}
      <Dialog open={showEditOverview} onOpenChange={setShowEditOverview}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFFFFF', WebkitOverflowScrolling: 'touch' }}>
          <DialogHeader><DialogTitle className="text-base md:text-lg">ערוך פרטים אישיים</DialogTitle></DialogHeader>
          <div className="space-y-3 md:space-y-4">
            <div><Label className="text-xs md:text-sm">כתובת</Label><Input value={editFormOverview.address} onChange={(e) => setEditFormOverview({...editFormOverview, address: e.target.value})} className="rounded-xl text-sm md:text-base" /></div>
            <div><Label className="text-xs md:text-sm">עיר</Label><Input value={editFormOverview.city} onChange={(e) => setEditFormOverview({...editFormOverview, city: e.target.value})} className="rounded-xl text-sm md:text-base" /></div>
            <div><Label className="text-xs md:text-sm">מטרה מרכזית</Label><Textarea value={editFormOverview.main_goal} onChange={(e) => setEditFormOverview({...editFormOverview, main_goal: e.target.value})} className="rounded-xl min-h-[60px] md:min-h-[80px] text-sm md:text-base" /></div>
            <div><Label className="text-xs md:text-sm">נקודת מוצא</Label><Textarea value={editFormOverview.current_status} onChange={(e) => setEditFormOverview({...editFormOverview, current_status: e.target.value})} className="rounded-xl min-h-[60px] md:min-h-[80px] text-sm md:text-base" /></div>
            <div><Label className="text-xs md:text-sm">חזון עתידי</Label><Textarea value={editFormOverview.future_vision} onChange={(e) => setEditFormOverview({...editFormOverview, future_vision: e.target.value})} className="rounded-xl min-h-[60px] md:min-h-[80px] text-sm md:text-base" /></div>
            <div><Label className="text-xs md:text-sm">מצב רפואי</Label><Textarea value={editFormOverview.health_issues} onChange={(e) => setEditFormOverview({...editFormOverview, health_issues: e.target.value})} className="rounded-xl min-h-[60px] md:min-h-[80px] text-sm md:text-base" /></div>
            <div><Label className="text-xs md:text-sm">איש קשר לחירום</Label><Input value={editFormOverview.emergency_contact_name} onChange={(e) => setEditFormOverview({...editFormOverview, emergency_contact_name: e.target.value})} className="rounded-xl text-sm md:text-base" /></div>
            <div><Label className="text-xs md:text-sm">טלפון איש קשר</Label><Input value={editFormOverview.emergency_contact_phone} onChange={(e) => setEditFormOverview({...editFormOverview, emergency_contact_phone: e.target.value})} className="rounded-xl text-sm md:text-base" /></div>
            <Button onClick={handleSaveOverview} disabled={updateClientMutation.isPending} className="w-full rounded-xl py-3 md:py-4 text-white text-sm md:text-base" style={{ backgroundColor: '#FF6F20' }}>
              {updateClientMutation.isPending ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : null}
              שמור
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFFFFF', WebkitOverflowScrolling: 'touch' }}>
          <DialogHeader>
            <DialogTitle className="text-base md:text-xl font-black flex items-center gap-2" style={{ color: '#000000' }}>
              <AlertTriangle className="w-5 h-5 md:w-6 md:h-6" style={{ color: '#f44336' }} />
              מחיקת לקוח
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 md:space-y-4">
            <div className="p-3 md:p-4 rounded-xl" style={{ backgroundColor: '#FFEBEE', border: '2px solid #f44336' }}>
              <p className="text-xs md:text-sm font-bold mb-2" style={{ color: '#000000' }}>⚠️ פעולה בלתי הפיכה!</p>
              <p className="text-[10px] md:text-xs" style={{ color: '#7D7D7D' }}>כל הנתונים יימחקו לצמיתות</p>
            </div>

            <div>
              <Label className="text-xs md:text-sm font-bold mb-2 block">הקלד: <span style={{ color: '#f44336' }}>{currentClient.full_name}</span></Label>
              <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder={currentClient.full_name}
                className="rounded-xl text-center font-bold text-sm md:text-base" style={{ border: '2px solid #f44336' }} />
            </div>

            <div className="flex gap-2">
              <Button onClick={() => { setShowDeleteDialog(false); setDeleteConfirmText(""); }} variant="outline" className="flex-1 rounded-xl py-3 text-xs md:text-sm">
                ביטול
              </Button>
              <Button onClick={handleDeleteClient} disabled={deleteConfirmText !== currentClient.full_name || deleteClientMutation.isPending}
                className="flex-1 rounded-xl py-3 text-white text-xs md:text-sm" style={{ backgroundColor: '#f44336' }}>
                {deleteClientMutation.isPending ? <Loader2 className="w-3 h-3 md:w-4 md:h-4 ml-2 animate-spin" /> : <Trash2 className="w-3 h-3 md:w-4 md:h-4 ml-2" />}
                מחק
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Goal Dialog */}
      <Dialog open={showAddGoal} onOpenChange={setShowAddGoal}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFF', WebkitOverflowScrolling: 'touch' }}>
          <DialogHeader><DialogTitle className="text-base md:text-lg">{editingGoal ? 'ערוך יעד' : 'הוסף יעד'}</DialogTitle></DialogHeader>
          <div className="space-y-3 md:space-y-4">
            <div><Label className="text-xs md:text-sm">שם יעד *</Label><Input value={goalForm.goal_name} onChange={(e) => setGoalForm({...goalForm, goal_name: e.target.value})} className="rounded-xl text-sm md:text-base" /></div>
            <div><Label className="text-xs md:text-sm">תיאור</Label><Textarea value={goalForm.description} onChange={(e) => setGoalForm({...goalForm, description: e.target.value})} className="rounded-xl min-h-[50px] md:min-h-[60px] text-sm md:text-base" /></div>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <div><Label className="text-xs md:text-sm">נוכחי</Label><Input type="number" step="0.1" value={goalForm.current_value} onChange={(e) => setGoalForm({...goalForm, current_value: e.target.value})} className="rounded-xl text-sm md:text-base" /></div>
              <div><Label className="text-xs md:text-sm">יעד *</Label><Input type="number" step="0.1" value={goalForm.target_value} onChange={(e) => setGoalForm({...goalForm, target_value: e.target.value})} className="rounded-xl text-sm md:text-base" /></div>
              <div><Label className="text-xs md:text-sm">יחידה</Label><Input value={goalForm.unit} onChange={(e) => setGoalForm({...goalForm, unit: e.target.value})} className="rounded-xl text-sm md:text-base" /></div>
            </div>
            <div><Label className="text-xs md:text-sm">תאריך יעד</Label><Input type="date" value={goalForm.target_date} onChange={(e) => setGoalForm({...goalForm, target_date: e.target.value})} className="rounded-xl text-sm md:text-base" /></div>
            {editingGoal && (
              <div><Label className="text-xs md:text-sm">סטטוס</Label>
                <Select value={goalForm.status} onValueChange={(value) => setGoalForm({...goalForm, status: value})}>
                  <SelectTrigger className="rounded-xl text-sm md:text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="בתהליך">בתהליך</SelectItem>
                    <SelectItem value="הושג">הושג</SelectItem>
                    <SelectItem value="נכשל">נכשל</SelectItem>
                    <SelectItem value="מושהה">מושהה</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={handleAddGoal} disabled={createGoalMutation.isPending || updateGoalMutation.isPending} className="w-full rounded-xl py-3 md:py-4 text-white text-sm md:text-base" style={{ backgroundColor: '#FF6F20' }}>
              {(createGoalMutation.isPending || updateGoalMutation.isPending) ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : null}
              {editingGoal ? 'עדכן' : 'הוסף'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Result Dialog */}
      <Dialog open={showAddResult} onOpenChange={setShowAddResult}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFF', WebkitOverflowScrolling: 'touch' }}>
          <DialogHeader><DialogTitle className="text-base md:text-lg">{editingResult ? 'ערוך הישג' : 'הוסף הישג'}</DialogTitle></DialogHeader>
          <div className="space-y-3 md:space-y-4">
            <div><Label className="text-xs md:text-sm">כותרת *</Label><Input value={resultForm.title} onChange={(e) => setResultForm({...resultForm, title: e.target.value})} className="rounded-xl text-sm md:text-base" /></div>
            <div><Label className="text-xs md:text-sm">תיאור</Label><Textarea value={resultForm.description} onChange={(e) => setResultForm({...resultForm, description: e.target.value})} className="rounded-xl min-h-[50px] md:min-h-[60px] text-sm md:text-base" /></div>
            <div><Label className="text-xs md:text-sm">תאריך</Label><Input type="date" value={resultForm.date} onChange={(e) => setResultForm({...resultForm, date: e.target.value})} className="rounded-xl text-sm md:text-base" /></div>
            <div><Label className="text-xs md:text-sm">יעד קשור</Label>
              <Select value={resultForm.related_goal_id} onValueChange={(value) => setResultForm({...resultForm, related_goal_id: value})}>
                <SelectTrigger className="rounded-xl text-sm md:text-base"><SelectValue placeholder="בחר יעד" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>ללא</SelectItem>
                  {goals.map(goal => <SelectItem key={goal.id} value={goal.id}>{goal.goal_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddResult} disabled={createResultMutation.isPending || updateResultMutation.isPending} className="w-full rounded-xl py-3 md:py-4 text-sm md:text-base" style={{ backgroundColor: '#FFD700', color: '#000' }}>
              {(createResultMutation.isPending || updateResultMutation.isPending) ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : null}
              {editingResult ? 'עדכן' : 'הוסף'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Attendance Dialog */}
      <Dialog open={showAddAttendance} onOpenChange={setShowAddAttendance}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFF', WebkitOverflowScrolling: 'touch' }}>
          <DialogHeader><DialogTitle className="text-base md:text-lg">הוסף נוכחות</DialogTitle></DialogHeader>
          <div className="space-y-3 md:space-y-4">
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              <div><Label className="text-xs md:text-sm">תאריך *</Label><Input type="date" value={attendanceForm.date} onChange={(e) => setAttendanceForm({...attendanceForm, date: e.target.value})} className="rounded-xl text-sm md:text-base" /></div>
              <div><Label className="text-xs md:text-sm">שעה *</Label><Input type="time" value={attendanceForm.time} onChange={(e) => setAttendanceForm({...attendanceForm, time: e.target.value})} className="rounded-xl text-sm md:text-base" /></div>
            </div>
            <div><Label className="text-xs md:text-sm">סוג</Label>
              <Select value={attendanceForm.session_type} onValueChange={(value) => setAttendanceForm({...attendanceForm, session_type: value})}>
                <SelectTrigger className="rounded-xl text-sm md:text-base"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="אישי">אישי</SelectItem>
                  <SelectItem value="קבוצתי">קבוצתי</SelectItem>
                  <SelectItem value="אונליין">אונליין</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs md:text-sm">מיקום</Label><Input value={attendanceForm.location} onChange={(e) => setAttendanceForm({...attendanceForm, location: e.target.value})} className="rounded-xl text-sm md:text-base" /></div>
            <div><Label className="text-xs md:text-sm">סטטוס</Label>
              <Select value={attendanceForm.attendance_status} onValueChange={(value) => setAttendanceForm({...attendanceForm, attendance_status: value})}>
                <SelectTrigger className="rounded-xl text-sm md:text-base"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="הגיע">✅ הגיע</SelectItem>
                  <SelectItem value="נעדר">❌ נעדר</SelectItem>
                  <SelectItem value="ביטל">🚫 ביטל</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs md:text-sm">הערות</Label><Textarea value={attendanceForm.coach_notes} onChange={(e) => setAttendanceForm({...attendanceForm, coach_notes: e.target.value})} className="rounded-xl min-h-[50px] md:min-h-[60px] text-sm md:text-base" /></div>
            <Button onClick={handleAddAttendance} disabled={createSessionMutation.isPending} className="w-full rounded-xl py-3 md:py-4 text-white text-sm md:text-base" style={{ backgroundColor: '#FF6F20' }}>
              {createSessionMutation.isPending ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : null}
              הוסף
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Plan Dialog */}
      <PlanFormDialog
        isOpen={showAddPlan}
        onClose={() => setShowAddPlan(false)}
        onSubmit={(data) => createPlanMutation.mutate(data)}
        trainees={[currentClient]}
        isLoading={createPlanMutation.isPending}
      />

      {/* Add Note Dialog */}
      <Dialog open={showAddNote} onOpenChange={setShowAddNote}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFF', WebkitOverflowScrolling: 'touch' }}>
          <DialogHeader><DialogTitle className="text-base md:text-lg">הוסף הערה</DialogTitle></DialogHeader>
          <div className="space-y-3 md:space-y-4">
            <div><Label className="text-xs md:text-sm">הערת מאמן</Label><Textarea value={noteForm.note_text} onChange={(e) => setNoteForm({...noteForm, note_text: e.target.value})} className="rounded-xl min-h-[100px] md:min-h-[120px] text-sm md:text-base" placeholder="הקלד הערה..." /></div>
            <Button onClick={() => { toast.success("✅ הערה נשמרה"); setShowAddNote(false); }} className="w-full rounded-xl py-3 md:py-4 text-white text-sm md:text-base" style={{ backgroundColor: '#FF6F20' }}>
              שמור הערה
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Service Dialog */}
      <Dialog open={showAddService || showEditService} onOpenChange={(open) => { if (!open) { setShowAddService(false); setShowEditService(false); setEditingService(null); } }}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFF', WebkitOverflowScrolling: 'touch' }}>
          <DialogHeader><DialogTitle className="text-base md:text-lg">{editingService ? 'ערוך שירות' : 'הוסף שירות'}</DialogTitle></DialogHeader>
          <div className="space-y-3 md:space-y-4">
            <div>
              <Label className="text-xs md:text-sm">סוג שירות *</Label>
              <Select value={serviceForm.service_type} onValueChange={(value) => setServiceForm({...serviceForm, service_type: value})}>
                <SelectTrigger className="rounded-xl text-sm md:text-base"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="אימונים אישיים">אימונים אישיים</SelectItem>
                  <SelectItem value="פעילות קבוצתית">פעילות קבוצתית</SelectItem>
                  <SelectItem value="ליווי אונליין">ליווי אונליין</SelectItem>
                  <SelectItem value="תוכנית חד פעמית">תוכנית חד פעמית</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs md:text-sm">שם חבילה</Label><Input value={serviceForm.package_name} onChange={(e) => setServiceForm({...serviceForm, package_name: e.target.value})} className="rounded-xl text-sm md:text-base" placeholder="לדוגמה: חבילת 12 אימונים" /></div>
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              <div><Label className="text-xs md:text-sm">תאריך התחלה *</Label><Input type="date" value={serviceForm.start_date} onChange={(e) => setServiceForm({...serviceForm, start_date: e.target.value})} className="rounded-xl text-sm md:text-base" /></div>
              <div><Label className="text-xs md:text-sm">תאריך סיום</Label><Input type="date" value={serviceForm.end_date} onChange={(e) => setServiceForm({...serviceForm, end_date: e.target.value})} className="rounded-xl text-sm md:text-base" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              <div><Label className="text-xs md:text-sm">סה״כ אימונים</Label><Input type="number" value={serviceForm.total_sessions} onChange={(e) => setServiceForm({...serviceForm, total_sessions: e.target.value})} className="rounded-xl text-sm md:text-base" placeholder="12" /></div>
              <div><Label className="text-xs md:text-sm">אימונים שנוצלו</Label><Input type="number" value={serviceForm.used_sessions} onChange={(e) => setServiceForm({...serviceForm, used_sessions: e.target.value})} className="rounded-xl text-sm md:text-base" placeholder="0" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              <div>
                <Label className="text-xs md:text-sm">סטטוס שירות</Label>
                <Select value={serviceForm.status} onValueChange={(value) => setServiceForm({...serviceForm, status: value})}>
                  <SelectTrigger className="rounded-xl text-sm md:text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="פעיל">פעיל</SelectItem>
                    <SelectItem value="הסתיים">הסתיים</SelectItem>
                    <SelectItem value="מושהה">מושהה</SelectItem>
                    <SelectItem value="פג תוקף">פג תוקף</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs md:text-sm">מחיר (₪)</Label><Input type="number" value={serviceForm.price} onChange={(e) => setServiceForm({...serviceForm, price: e.target.value})} className="rounded-xl text-sm md:text-base" placeholder="1200" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              <div>
                <Label className="text-xs md:text-sm">סטטוס תשלום</Label>
                <Select value={serviceForm.payment_status} onValueChange={(value) => setServiceForm({...serviceForm, payment_status: value})}>
                  <SelectTrigger className="rounded-xl text-sm md:text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="שולם">שולם</SelectItem>
                    <SelectItem value="ממתין לתשלום">ממתין לתשלום</SelectItem>
                    <SelectItem value="תשלום חלקי">תשלום חלקי</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs md:text-sm">תאריך תשלום</Label><Input type="date" value={serviceForm.payment_date} onChange={(e) => setServiceForm({...serviceForm, payment_date: e.target.value})} className="rounded-xl text-sm md:text-base" /></div>
            </div>
            <div><Label className="text-xs md:text-sm">הערות</Label><Textarea value={serviceForm.notes} onChange={(e) => setServiceForm({...serviceForm, notes: e.target.value})} className="rounded-xl min-h-[60px] md:min-h-[80px] text-sm md:text-base" placeholder="הערות נוספות..." /></div>
            <Button onClick={handleAddService} disabled={createServiceMutation.isPending || updateServiceMutation.isPending} className="w-full rounded-xl py-3 md:py-4 text-white text-sm md:text-base" style={{ backgroundColor: '#FF6F20' }}>
              {(createServiceMutation.isPending || updateServiceMutation.isPending) ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : null}
              {editingService ? 'עדכן שירות' : 'הוסף שירות'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}