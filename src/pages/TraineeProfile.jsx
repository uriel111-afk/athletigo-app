import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Edit2, User, Mail, Phone, MapPin, Heart, Award, TrendingUp, Package, Plus, Loader2, Camera, Target, CheckCircle, Calendar, Shield, Trash2, FileText, MessageSquare, ArrowRight, Activity, ChevronDown, ChevronUp, ChevronLeft, Folder, FolderOpen, DollarSign, Lock, LogOut } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { QUERY_KEYS } from "@/components/utils/queryKeys";
import PhysicalMetricsManager from "../components/PhysicalMetricsManager";
import MessageCenter from "../components/MessageCenter";
import GoalFormDialog from "../components/forms/GoalFormDialog";
import ResultFormDialog from "../components/forms/ResultFormDialog";
import VisionFormDialog from "../components/forms/VisionFormDialog";
import { Checkbox } from "@/components/ui/checkbox";
import ErrorBoundary from "@/components/ErrorBoundary";

const AchievementItem = ({ result, relatedGoal, onEdit, onDelete }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm transition-all hover:shadow-md">
      {/* Collapsed Header - Click to toggle */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="p-4 flex items-center justify-between cursor-pointer bg-white hover:bg-gray-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-bold text-base text-gray-900 truncate">{result.title}</h4>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {format(new Date(result.date), 'dd/MM/yy')}
            </span>
            {result.record_value && (
              <span className="font-bold text-[#FF6F20] bg-orange-50 px-2 py-0.5 rounded-full text-[10px] md:text-xs">
                {result.record_value} {result.record_unit}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
           {isOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </div>
      </div>

      {/* Expanded Content */}
      {isOpen && (
        <div className="px-4 pb-4 pt-0 bg-gray-50 border-t border-gray-100">
           <div className="pt-3 space-y-3">
              {/* Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                 {result.skill_or_exercise && (
                    <div>
                      <span className="text-gray-500 text-xs block mb-0.5">תרגיל / מיומנות</span>
                      <span className="font-medium text-gray-800">{result.skill_or_exercise}</span>
                    </div>
                 )}
                 {result.context && (
                    <div>
                      <span className="text-gray-500 text-xs block mb-0.5">הקשר</span>
                      <span className="font-medium text-gray-800">{result.context}</span>
                    </div>
                 )}
                 {result.effort_level && (
                    <div>
                      <span className="text-gray-500 text-xs block mb-0.5">רמת מאמץ</span>
                      <span className="font-medium text-gray-800">{result.effort_level}/10</span>
                    </div>
                 )}
                 {result.assistance && (
                    <div>
                      <span className="text-gray-500 text-xs block mb-0.5">עזרה / ציוד</span>
                      <span className="font-medium text-gray-800">{result.assistance}</span>
                    </div>
                 )}
              </div>

              {/* Description / Notes */}
              {result.description && (
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <span className="text-gray-500 text-xs block mb-1">הערות / תיאור</span>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{result.description}</p>
                </div>
              )}

              {/* Related Goal */}
              {relatedGoal && (
                <div className="flex items-center gap-2 mt-2">
                   <span className="text-xs font-bold px-2 py-1 rounded-full bg-[#E8F5E9] text-[#2E7D32] border border-[#C8E6C9] flex items-center gap-1">
                      <Target className="w-3 h-3" />
                      יעד מקושר: {relatedGoal.goal_name}
                   </span>
                </div>
              )}

              {/* Actions Toolbar - Moved to bottom of expanded view for mobile access */}
              <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-gray-200">
                <Button onClick={(e) => { e.stopPropagation(); onEdit(result); }} size="sm" variant="ghost" className="h-8 px-3 text-[#FF6F20] hover:bg-orange-50 rounded-lg flex items-center gap-1 text-xs">
                  <Edit2 className="w-3 h-3" /> ערוך
                </Button>
                <Button onClick={(e) => { e.stopPropagation(); if (window.confirm(`למחוק "${result.title}"?`)) onDelete(result.id); }} size="sm" variant="ghost" className="h-8 px-3 text-red-500 hover:bg-red-50 rounded-lg flex items-center gap-1 text-xs">
                  <Trash2 className="w-3 h-3" /> מחק
                </Button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

const AchievementGroup = ({ type, results, goals, onEdit, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const count = results.length;

  return (
    <div className="mb-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
       {/* Group Header */}
       <button 
         onClick={() => setIsExpanded(!isExpanded)}
         className="w-full flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:bg-gray-50 transition-all group"
       >
         <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isExpanded ? 'bg-orange-100 text-[#FF6F20]' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'}`}>
               {isExpanded ? <FolderOpen className="w-5 h-5" /> : <Folder className="w-5 h-5" />}
            </div>
            <div className="text-right">
               <h3 className="font-bold text-sm md:text-base text-gray-900">{type || 'כללי / אחר'}</h3>
               <p className="text-xs text-gray-500">{count} הישגים</p>
            </div>
         </div>
         <div className="text-gray-400 group-hover:text-gray-600">
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
         </div>
       </button>

       {/* Group Content */}
       {isExpanded && (
         <div className="mt-3 space-y-2 px-1 md:px-2">
            {results.map(result => (
               <AchievementItem 
                 key={result.id} 
                 result={result} 
                 relatedGoal={goals.find(g => g.id === result.related_goal_id)}
                 onEdit={onEdit}
                 onDelete={onDelete}
               />
            ))}
         </div>
       )}
    </div>
  );
};

export default function TraineeProfile() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("personal");
  const [showEdit, setShowEdit] = useState(false);
  const [showHealthUpdate, setShowHealthUpdate] = useState(false);
  const [showVisionDialog, setShowVisionDialog] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showEditGoal, setShowEditGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [showAddResult, setShowAddResult] = useState(false);
  const [showEditResult, setShowEditResult] = useState(false);
  const [editingResult, setEditingResult] = useState(null);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ newPass: "", confirm: "" });
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [showAddService, setShowAddService] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [showManualAttendance, setShowManualAttendance] = useState(false);
  const [editingUsage, setEditingUsage] = useState(null); // service ID being edited
  const [usageValue, setUsageValue] = useState(""); 

  const [manualAttendanceForm, setManualAttendanceForm] = useState({
    date: new Date().toISOString().split('T')[0],
    time: "10:00",
    session_type: "אישי",
    location: "ידני",
    notes: ""
  });

  const [serviceForm, setServiceForm] = useState({
    service_type: "personal", // personal | group | online
    group_name: "",
    billing_model: "punch_card", // subscription | punch_card | single
    sessions_per_week: "",
    package_name: "",
    base_price: "",
    discount_type: "none",
    discount_value: 0,
    final_price: "",
    payment_method: "credit",
    start_date: new Date().toISOString().split('T')[0],
    end_date: "",
    next_billing_date: "",
    total_sessions: "",
    payment_status: "שולם",
    notes_internal: "",
    status: "active"
  });

  const [formData, setFormData] = useState({
    full_name: "", email: "", phone: "", birth_date: "", age: "", gender: "",
    address: "", city: "", main_goal: "", current_status: "", future_vision: "",
    health_issues: "", medical_history: "", emergency_contact_name: "",
    emergency_contact_phone: "", profile_image: "", sport_background: "",
    fitness_level: "", training_goals: "", training_frequency: "",
    preferred_training_style: "", notes: "", coach_notes: "", bio: "",
    status: "",
  });

  const [healthForm, setHealthForm] = useState({
    has_limitations: false,
    health_issues: "",
    approved: false
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

  const [resultForm, setResultForm] = useState({
    date: new Date().toISOString().split('T')[0],
    title: "",
    description: "",
    related_goal_id: ""
  });

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userIdParam = searchParams.get("userId");

  const { data: currentUser, refetch, isLoading: currentUserLoading, isError: currentUserError } = useQuery({
    queryKey: ['current-user-trainee-profile'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch (error) {
        console.error('[TraineeProfile] Error fetching current user:', error);
        throw error;
      }
    },
    refetchInterval: 5000,
    retry: false
  });

  const isCoach = currentUser?.isCoach || currentUser?.role === 'admin';

  const { data: targetUser, isLoading: targetUserLoading, isError: targetUserError } = useQuery({
    queryKey: ['target-user-profile', userIdParam],
    queryFn: async () => {
      try {
        if (!userIdParam) return null;
        const res = await base44.entities.User.filter({ id: userIdParam });
        return res?.[0] || null;
      } catch (error) {
        console.error('[TraineeProfile] Error fetching target user:', error);
        throw error;
      }
    },
    enabled: !!userIdParam && !!isCoach,
    refetchInterval: 5000,
    retry: false
  });

  const effectiveUser = (userIdParam && isCoach) ? targetUser : currentUser;
  const profileLoading = currentUserLoading || targetUserLoading;
  const profileError = currentUserError || targetUserError;
  const noUserFound = !profileLoading && !effectiveUser;

  useEffect(() => {
    if (effectiveUser) {
      setUser(effectiveUser);
      setFormData({
        full_name: effectiveUser.full_name || "",
        email: effectiveUser.email || "",
        phone: effectiveUser.phone || "",
        birth_date: effectiveUser.birth_date ? format(new Date(effectiveUser.birth_date), 'yyyy-MM-dd') : "",
        age: effectiveUser.age || "",
        gender: effectiveUser.gender || "",
        address: effectiveUser.address || "",
        city: effectiveUser.city || "",
        main_goal: effectiveUser.main_goal || "",
        current_status: effectiveUser.current_status || "",
        future_vision: effectiveUser.future_vision || "",
        health_issues: effectiveUser.health_issues || "",
        medical_history: effectiveUser.medical_history || "",
        emergency_contact_name: effectiveUser.emergency_contact_name || "",
        emergency_contact_phone: effectiveUser.emergency_contact_phone || "",
        profile_image: effectiveUser.profile_image || "",
        sport_background: effectiveUser.sport_background || "",
        fitness_level: effectiveUser.fitness_level || "",
        training_goals: effectiveUser.training_goals || "",
        training_frequency: effectiveUser.training_frequency || "",
        preferred_training_style: effectiveUser.preferred_training_style || "",
        notes: effectiveUser.notes || "",
        coach_notes: effectiveUser.coach_notes || "",
        bio: effectiveUser.bio || "",
        status: effectiveUser.status || "",
      });
      
      // Init health form
      const hasLimits = effectiveUser.health_issues && effectiveUser.health_issues.length > 0 && effectiveUser.health_issues !== "אין";
      setHealthForm({
        has_limitations: hasLimits,
        health_issues: effectiveUser.health_issues || "",
        approved: effectiveUser.health_declaration_accepted || false
      });
    }
  }, [effectiveUser]);

  const { data: goals = [] } = useQuery({
    queryKey: ['trainee-goals'],
    queryFn: async () => {
      if (!user?.id) return [];
      try {
        return await base44.entities.Goal.filter({ trainee_id: user.id }, '-created_at');
      } catch {
        return [];
      }
    },
    enabled: !!user?.id && (activeTab === 'goals' || activeTab === 'metrics' || activeTab === 'achievements' || activeTab === 'overview'),
    refetchInterval: 30000
  });

  const { data: measurements = [] } = useQuery({
    queryKey: ['trainee-measurements'],
    queryFn: async () => {
      if (!user?.id) return [];
      try {
        return await base44.entities.Measurement.filter({ trainee_id: user.id }, '-date');
      } catch {
        return [];
      }
    },
    enabled: !!user?.id && (activeTab === 'metrics' || activeTab === 'overview'),
    refetchInterval: 30000
  });

  const { data: results = [] } = useQuery({
    queryKey: ['trainee-results'],
    queryFn: async () => {
      if (!user?.id) return [];
      try {
        return await base44.entities.ResultsLog.filter({ trainee_id: user.id }, '-date');
      } catch {
        return [];
      }
    },
    enabled: !!user?.id && (activeTab === 'achievements' || activeTab === 'metrics' || activeTab === 'overview'),
    refetchInterval: 30000
  });

  const { data: services = [] } = useQuery({
    queryKey: ['trainee-services', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      try {
        const filter = { trainee_id: user.id };
        if (currentUser?.id) filter.coach_id = currentUser.id;
        return await base44.entities.ClientService.filter(filter, '-created_at');
      } catch {
        return [];
      }
    },
    enabled: !!user?.id && (activeTab === 'services' || activeTab === 'overview'),
    refetchInterval: 30000
  });

  const { data: attendanceLog = [] } = useQuery({
    queryKey: ['trainee-attendance-log'],
    queryFn: async () => {
      if (!user?.id) return [];
      try {
        return await base44.entities.AttendanceLog.filter({ user_id: user.id }, '-date');
      } catch { return []; }
    },
    enabled: !!user?.id && (activeTab === 'attendance'),
    refetchInterval: 30000
  });

  const { data: trainingPlans = [] } = useQuery({
    queryKey: ['trainee-plans', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      try {
        // Fetch both assigned plans AND plans created by the trainee
        const [assigned, created] = await Promise.all([
          base44.entities.TrainingPlan.filter({ assigned_to: user.id }, '-created_at').catch(() => []),
          base44.entities.TrainingPlan.filter({ created_by: user.id }, '-created_at').catch(() => [])
        ]);

        const combined = [...(assigned || []), ...(created || [])];
        const uniquePlans = Array.from(new Map(combined.map(item => [item.id, item])).values());

        return uniquePlans.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
      } catch {
        return [];
      }
    },
    enabled: !!user?.id && (activeTab === 'plans' || activeTab === 'overview'),
    refetchInterval: 30000
  });

  const { data: workoutHistory = [] } = useQuery({
    queryKey: ['trainee-workout-history', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      try {
        return await base44.entities.WorkoutHistory.filter({ user_id: user.id }, '-date');
      } catch { return []; }
    },
    enabled: !!user?.id && (activeTab === 'plans' || activeTab === 'overview'),
    refetchInterval: 30000
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['trainee-sessions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      try {
        return await base44.entities.Session.filter({ participants: { $elemMatch: { trainee_id: user.id } } }, '-date');
      } catch (e) {
        // Fallback for simple filter if $elemMatch fails or standard fetch
        try {
            const allSessions = await base44.entities.Session.list('-date', 1000);
            return allSessions.filter(s => s.participants?.some(p => p.trainee_id === user.id));
        } catch { return []; }
      }
    },
    enabled: !!user?.id && (activeTab === 'attendance' || activeTab === 'overview'),
    refetchInterval: 30000
  });

  // Optimized: Removed global exercise fetch
  const getPlanProgress = (plan) => {
      return { 
        total: plan.exercises_count || 0, 
        completed: Math.round((plan.progress_percentage / 100) * (plan.exercises_count || 0)) || 0, 
        percent: plan.progress_percentage || 0 
      };
  };

  const { data: coach } = useQuery({
    queryKey: ['trainee-coach'],
    queryFn: async () => {
      try {
        // Fetch all users and find the coach in memory to avoid 500 error on invalid filter
        const users = await base44.entities.User.list('-created_at', 1000);
        return users.find(u => u.isCoach === true) || null;
      } catch {
        return null;
      }
    },
    enabled: !!user?.id,
    refetchInterval: 30000
  });

  const updateUserMutation = useMutation({
    mutationFn: (data) => {
      console.log("[updateUserMutation] calling updateMe with:", data);
      return base44.auth.updateMe(data);
    },
    onSuccess: (serverData, _variables) => {
      console.log("[updateUserMutation] onSuccess — server returned:", serverData);
      // Use server-returned data so local state matches what was actually saved
      setUser(prev => {
        const merged = prev ? { ...prev, ...serverData } : serverData;
        console.log("[updateUserMutation] merged user state:", merged);
        return merged;
      });
      queryClient.invalidateQueries({ queryKey: ['current-user-trainee-profile'] });
      setShowEdit(false);
      toast.success("✅ הפרופיל עודכן");
    },
    onError: (error) => {
      console.error("[updateUserMutation] onError:", error);
      toast.error("⚠️ שגיאה בעדכון הפרופיל: " + (error.message || "נסה שוב"));
    }
  });

  const updateHealthMutation = useMutation({
    mutationFn: async (data) => {
      if (isCoach && userIdParam) {
        await base44.entities.User.update(userIdParam, data);
      } else {
        await base44.auth.updateMe(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-user-trainee-profile'] });
      queryClient.invalidateQueries({ queryKey: ['target-user-profile'] });
      setShowHealthUpdate(false);
      toast.success("✅ הצהרת בריאות עודכנה");
    },
    onError: (error) => {
      console.error("Update health error:", error);
      toast.error("⚠️ שגיאה בעדכון הצהרת בריאות");
    }
  });

  const updateVisionMutation = useMutation({
    mutationFn: async (visionData) => {
      const dataToUpdate = { vision: visionData };
      if (isCoach && userIdParam) {
        await base44.entities.User.update(userIdParam, dataToUpdate);
      } else {
        // Ensure trainee cannot update coachNotesOnVision
        if (visionData.coachNotesOnVision && !isCoach) {
            delete visionData.coachNotesOnVision;
        }
        await base44.auth.updateMe(dataToUpdate);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-user-trainee-profile'] });
      queryClient.invalidateQueries({ queryKey: ['target-user-profile'] });
      setShowVisionDialog(false);
      toast.success("✅ חזון עודכן בהצלחה");
    },
    onError: (error) => {
      toast.error("❌ שגיאה בעדכון החזון: " + (error.message || "נסה שוב"));
    }
  });

  const createGoalMutation = useMutation({
    mutationFn: (data) => base44.entities.Goal.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-goals'] });
      setShowAddGoal(false);
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
      queryClient.invalidateQueries({ queryKey: ['trainee-goals'] });
      setShowEditGoal(false);
      setEditingGoal(null);
      toast.success("✅ יעד עודכן");
    },
    onError: (error) => {
      toast.error("❌ שגיאה בעדכון יעד: " + (error.message || "נסה שוב"));
    }
  });

  const createServiceMutation = useMutation({
    mutationFn: (data) => base44.entities.ClientService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
      queryClient.invalidateQueries({ queryKey: ['all-services-list'] }); // Sync financial stats
      setShowAddService(false);
      setServiceForm({
        service_type: "אימונים אישיים",
        package_name: "",
        total_sessions: "",
        price: "",
        start_date: new Date().toISOString().split('T')[0],
        end_date: ""
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
      queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
      queryClient.invalidateQueries({ queryKey: ['all-services-list'] }); // Sync financial stats
      setShowAddService(false);
      setEditingService(null);
      setServiceForm({
        service_type: "אימונים אישיים",
        package_name: "",
        total_sessions: "",
        price: "",
        start_date: new Date().toISOString().split('T')[0],
        end_date: ""
      });
      toast.success("✅ שירות עודכן");
    },
    onError: (error) => {
      toast.error("❌ שגיאה בעדכון שירות: " + (error.message || "נסה שוב"));
    }
  });

  const updateServiceUsageMutation = useMutation({
      mutationFn: async () => {
          if (!editingUsage) return;
          await base44.entities.ClientService.update(editingUsage, {
              used_sessions: parseInt(usageValue)
          });
      },
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
          queryClient.invalidateQueries({ queryKey: ['all-services-list'] }); // Sync financial stats
          setEditingUsage(null);
          setUsageValue("");
          toast.success("✅ ניצול אימונים עודכן ידנית");
      },
      onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const updateSessionStatusMutation = useMutation({
    mutationFn: async ({ session, newStatus }) => {
        // 1. Update Session
        const updatedParticipants = session.participants.map(p => 
            p.trainee_id === user.id ? { ...p, attendance_status: newStatus } : p
        );
        
        let sessionUpdateData = { participants: updatedParticipants };
        
        // Update main session status if it's personal training
        if (session.session_type === 'אישי') {
             sessionUpdateData.status = (newStatus === 'הגיע') ? 'התקיים' : 
                                       (newStatus === 'ביטל' || newStatus === 'בוטל') ? 'בוטל על ידי מאמן' : 
                                       (newStatus === 'נעדר' || newStatus === 'לא הגיע') ? 'לא הגיע' : 'ממתין לאישור';
        }

        await base44.entities.Session.update(session.id, sessionUpdateData);

        // 2. Update Package (Sync Logic) - Only for Personal Training with Punch Card
        if (session.session_type === 'אישי' || session.session_type === 'אימונים אישיים') {
            const oldStatus = session.participants?.find(p => p.trainee_id === user.id)?.attendance_status || 'ממתין';
            
            const isNowAttended = newStatus === 'הגיע';
            const wasAttended = oldStatus === 'הגיע';

            if (isNowAttended !== wasAttended) {
                // Find active package for personal training (must be punch_card or legacy with total_sessions)
                const activePackage = services.find(s => 
                    (s.status === 'פעיל' || s.status === 'active') && 
                    (s.service_type === 'אימונים אישיים' || s.service_type === 'אישי' || s.service_type === 'personal') &&
                    (s.billing_model === 'punch_card' || (s.total_sessions > 0 && !s.billing_model))
                );
                
                if (activePackage) {
                    const change = isNowAttended ? 1 : -1;
                    const newUsedCount = Math.max(0, (activePackage.used_sessions || 0) + change);
                    
                    await base44.entities.ClientService.update(activePackage.id, {
                        used_sessions: newUsedCount
                    });
                }
            }
        }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
      queryClient.invalidateQueries({ queryKey: ['all-sessions-list'] }); // Sync AllUsers
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SERVICES }); // Sync AllUsers
      toast.success("✅ סטטוס עודכן וסונכרן");
    },
    onError: (error) => {
        console.error("Error updating session:", error);
        toast.error("שגיאה בעדכון סטטוס");
    }
  });

  const updateTargetUserMutation = useMutation({
    mutationFn: ({ id, data }) => {
      console.log("[updateTargetUserMutation] calling User.update id:", id, "data:", data);
      return base44.entities.User.update(id, data);
    },
    onSuccess: (serverData, _variables) => {
      console.log("[updateTargetUserMutation] onSuccess — server returned:", serverData);
      setUser(prev => {
        const merged = prev ? { ...prev, ...serverData } : serverData;
        console.log("[updateTargetUserMutation] merged user state:", merged);
        return merged;
      });
      queryClient.invalidateQueries({ queryKey: ['target-user-profile', userIdParam] });
      setShowEdit(false);
      toast.success("✅ פרופיל מתאמן עודכן");
    },
    onError: (error) => {
      console.error("[updateTargetUserMutation] onError:", error);
      toast.error("⚠️ שגיאה בעדכון פרופיל מתאמן: " + (error.message || "נסה שוב"));
    }
  });

  const deleteGoalMutation = useMutation({
    mutationFn: (id) => base44.entities.Goal.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-goals'] });
      toast.success("✅ יעד נמחק");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const createResultMutation = useMutation({
    mutationFn: (data) => base44.entities.ResultsLog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-results'] });
      setShowAddResult(false);
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
      queryClient.invalidateQueries({ queryKey: ['trainee-results'] });
      setShowEditResult(false);
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
      queryClient.invalidateQueries({ queryKey: ['trainee-results'] });
      toast.success("✅ הישג נמחק");
    },
    onError: (err) => toast.error("❌ שגיאה: " + (err?.message || "נסה שוב")),
  });

  const isSavingRef = useRef(false);

  const handleSave = async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    let calculatedAge = formData.age;
    if (formData.birth_date) {
      try {
        const birthDate = new Date(formData.birth_date);
        const today = new Date();
        calculatedAge = Math.floor((today.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      } catch (_) {}
    }

    const dataToUpdate = {
      full_name: formData.full_name || null,
      phone: formData.phone || null,
      birth_date: formData.birth_date ? new Date(formData.birth_date).toISOString() : null,
      age: calculatedAge ? parseInt(calculatedAge) : null,
      gender: formData.gender || null,
      address: formData.address || null,
      city: formData.city || null,
      main_goal: formData.main_goal || null,
      sport_background: formData.sport_background || null,
      fitness_level: formData.fitness_level || null,
      training_goals: formData.training_goals || null,
      training_frequency: formData.training_frequency || null,
      preferred_training_style: formData.preferred_training_style || null,
      medical_history: formData.medical_history || null,
      notes: formData.notes || null,
      coach_notes: formData.coach_notes || null,
      bio: formData.bio || null,
      status: formData.status || null,
      emergency_contact_name: formData.emergency_contact_name || null,
      emergency_contact_phone: formData.emergency_contact_phone || null,
    };

    try {
      if (isCoach && userIdParam) {
        await updateTargetUserMutation.mutateAsync({ id: userIdParam, data: dataToUpdate });
      } else {
        await updateUserMutation.mutateAsync(dataToUpdate);
      }
      setShowEdit(false);
    } catch (error) {
      console.error("[handleSave] error:", error?.message || error);
    } finally {
      isSavingRef.current = false;
    }
  };

  const handleHealthUpdate = async () => {
    if (healthForm.has_limitations && !healthForm.health_issues) {
        toast.error("נא לפרט את המגבלה הרפואית");
        return;
    }
    if (!healthForm.approved) {
        toast.error("יש לאשר את הצהרת הבריאות");
        return;
    }

    const dataToUpdate = {
        health_issues: healthForm.health_issues,
        health_declaration_accepted: true
    };

    try {
      await updateHealthMutation.mutateAsync(dataToUpdate);
    } catch (error) {
      console.error("handleHealthUpdate error:", error);
    }
  };

  const handleAddOrUpdateService = async () => {
    if (!serviceForm.service_type || !serviceForm.start_date) {
        toast.error("נא למלא סוג שירות ותאריך התחלה");
        return;
    }

    // Calculate final price logic if not manually set (optional, can rely on form state)
    // For simplicity, we trust the form state which should sync base/discount -> final

    const data = {
        service_type: serviceForm.service_type,
        group_name: serviceForm.service_type === 'group' ? serviceForm.group_name : null,
        billing_model: serviceForm.billing_model,
        sessions_per_week: serviceForm.sessions_per_week ? parseInt(serviceForm.sessions_per_week) : null,
        package_name: serviceForm.package_name || "",
        base_price: serviceForm.base_price ? parseFloat(serviceForm.base_price) : 0,
        discount_type: serviceForm.discount_type,
        discount_value: parseFloat(serviceForm.discount_value || 0),
        final_price: serviceForm.final_price ? parseFloat(serviceForm.final_price) : 0,
        // Keep 'price' for backward compatibility or dashboard logic that uses it
        price: serviceForm.final_price ? parseFloat(serviceForm.final_price) : 0, 
        payment_method: serviceForm.payment_method,
        start_date: new Date(serviceForm.start_date).toISOString(),
        end_date: serviceForm.end_date ? new Date(serviceForm.end_date).toISOString() : null,
        next_billing_date: serviceForm.next_billing_date ? new Date(serviceForm.next_billing_date).toISOString() : null,
        total_sessions: serviceForm.total_sessions ? parseInt(serviceForm.total_sessions) : null,
        payment_status: serviceForm.payment_status || 'ממתין לתשלום',
        notes_internal: serviceForm.notes_internal || "",
        status: serviceForm.status || 'active'
    };

    try {
      if (editingService) {
        await updateServiceMutation.mutateAsync({ id: editingService.id, data });
      } else {
        await createServiceMutation.mutateAsync({
            ...data,
            trainee_id: user.id,
            trainee_name: user.full_name,
            used_sessions: 0,
            created_by_coach: currentUser?.id || null
        });
      }
    } catch (error) {
      console.error("handleAddOrUpdateService error:", error);
    }
  };

  const openEditService = (service) => {
    setEditingService(service);
    setServiceForm({
      service_type: service.service_type || "personal",
      group_name: service.group_name || "",
      billing_model: service.billing_model || "punch_card",
      sessions_per_week: service.sessions_per_week || "",
      package_name: service.package_name || "",
      base_price: service.base_price || service.price || "",
      discount_type: service.discount_type || "none",
      discount_value: service.discount_value || 0,
      final_price: service.final_price || service.price || "",
      payment_method: service.payment_method || "credit",
      start_date: service.start_date ? service.start_date.split('T')[0] : "",
      end_date: service.end_date ? service.end_date.split('T')[0] : "",
      next_billing_date: service.next_billing_date ? service.next_billing_date.split('T')[0] : "",
      total_sessions: service.total_sessions || "",
      payment_status: service.payment_status || "שולם",
      notes_internal: service.notes_internal || "",
      status: service.status || "active"
    });
    setShowAddService(true);
  };

  const handleManualAttendanceSubmit = async () => {
    if (!manualAttendanceForm.date || !manualAttendanceForm.time) {
        toast.error("נא למלא תאריך ושעה");
        return;
    }

    try {
        // 1. Create Session Record (Status: Attended)
        if (!currentUser?.id) {
            toast.error("שגיאה: לא ניתן לטעון את פרטי המאמן. אנא רענן את הדף.");
            return;
        }
        await base44.entities.Session.create({
            date: manualAttendanceForm.date,
            time: manualAttendanceForm.time,
            session_type: manualAttendanceForm.session_type,
            location: manualAttendanceForm.location,
            coach_id: currentUser.id,
            status: 'התקיים',
            coach_notes: `נוכחות ידנית: ${manualAttendanceForm.notes}`,
            participants: [{
                trainee_id: user.id,
                trainee_name: user.full_name,
                attendance_status: 'הגיע'
            }],
        });

        // 2. If Personal Training, update package
        if (manualAttendanceForm.session_type === 'אישי') {
            // Fetch fresh services to ensure data consistency
            const filterObj = { trainee_id: user.id, status: 'פעיל' };
            if (currentUser?.id) filterObj.coach_id = currentUser.id;
            const userServices = await base44.entities.ClientService.filter(filterObj);
            const activePackage = userServices.find(s => s.service_type === 'אימונים אישיים' || s.service_type.includes('אישי'));
            
            if (activePackage) {
                // Increment used sessions
                const newUsedCount = (activePackage.used_sessions || 0) + 1;
                
                await base44.entities.ClientService.update(activePackage.id, {
                    used_sessions: newUsedCount
                });
                
                // Invalidate all relevant queries
                queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
                queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SERVICES });
            }
        }

        queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
        queryClient.invalidateQueries({ queryKey: ['all-sessions-list'] });
        
        setShowManualAttendance(false);
        setManualAttendanceForm({ date: new Date().toISOString().split('T')[0], time: "10:00", session_type: "אישי", location: "ידני", notes: "" });
        toast.success("✅ נוכחות נרשמה וסונכרנה עם החבילה");

    } catch (error) {
        console.error("Error adding manual attendance:", error);
        toast.error("שגיאה ברישום נוכחות");
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("נא להעלות תמונה בלבד");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("גודל מקסימלי: 5MB");
      return;
    }

    setUploadingImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, profile_image: file_url });
      await base44.auth.updateMe({ profile_image: file_url });
      queryClient.invalidateQueries({ queryKey: ['current-user-trainee-profile'] });
      refetch();
      toast.success("✅ תמונה עודכנה");
    } catch (error) {
      console.error("Image upload error:", error);
      toast.error("❌ שגיאה בהעלאת תמונה");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAddGoal = async () => {
    if (!goalForm.goal_name || !goalForm.target_value) {
      toast.error("נא למלא שם יעד ויעד");
      return;
    }

    await createGoalMutation.mutateAsync({
      trainee_id: user.id,
      title: goalForm.goal_name || goalForm.title,
      description: goalForm.description || null,
      target_value: parseFloat(goalForm.target_value),
      current_value: goalForm.current_value ? parseFloat(goalForm.current_value) : null,
      target_unit: goalForm.unit || null,
      target_date: goalForm.target_date ? new Date(goalForm.target_date).toISOString() : null,
      status: goalForm.status || "בתהליך",
    });
  };

  const handleUpdateGoal = async () => {
    if (!editingGoal) return;

    const progress = goalForm.current_value && goalForm.target_value
      ? Math.min(100, Math.round((parseFloat(goalForm.current_value) / parseFloat(goalForm.target_value)) * 100))
      : 0;

    await updateGoalMutation.mutateAsync({
      id: editingGoal.id,
      data: {
        title: goalForm.goal_name || goalForm.title,
        description: goalForm.description || null,
        target_value: parseFloat(goalForm.target_value),
        current_value: goalForm.current_value ? parseFloat(goalForm.current_value) : null,
        target_unit: goalForm.unit || null,
        target_date: goalForm.target_date ? new Date(goalForm.target_date).toISOString() : null,
        status: goalForm.status
      }
    });
  };

  const handleAddResult = async () => {
    if (!resultForm.title) {
      toast.error("נא למלא כותרת");
      return;
    }

    await createResultMutation.mutateAsync({
      trainee_id: user.id,
      trainee_name: user.full_name,
      date: new Date(resultForm.date).toISOString(),
      title: resultForm.title,
      description: resultForm.description || null,
      related_goal_id: resultForm.related_goal_id || null
    });
  };

  const handleUpdateResult = async () => {
    if (!editingResult) return;

    await updateResultMutation.mutateAsync({
      id: editingResult.id,
      data: {
        date: new Date(resultForm.date).toISOString(),
        title: resultForm.title,
        description: resultForm.description || null,
        related_goal_id: resultForm.related_goal_id || null
      }
    });
  };

  const handlePasswordChange = async () => {
    if (passwordForm.newPass !== passwordForm.confirm) {
      toast.error("הסיסמאות החדשות לא תואמות");
      return;
    }
    if (passwordForm.newPass.length < 6) {
      toast.error("הסיסמה חייבת להכיל לפחות 6 תווים");
      return;
    }
    setPasswordLoading(true);
    const { error } = await supabase.auth.updateUser({ password: passwordForm.newPass });
    setPasswordLoading(false);
    if (error) {
      toast.error("שגיאה בשינוי הסיסמה: " + error.message);
    } else {
      toast.success("✅ הסיסמה שונתה בהצלחה");
      setShowPasswordChange(false);
      setPasswordForm({ newPass: "", confirm: "" });
    }
  };

  const activeGoals = goals.filter(g => g.status === 'בתהליך');
  const completedGoals = goals.filter(g => g.status === 'הושג');
  const activeServices = services.filter(s => s.status === 'פעיל');
  const latestMeasurement = measurements[0];

  const getWeightChange = () => {
    if (measurements.length < 2) return null;
    const latest = measurements[0]?.weight;
    const first = measurements[measurements.length - 1]?.weight;
    if (!latest || !first) return null;
    return latest - first;
  };

  const getBodyFatChange = () => {
    if (measurements.length < 2) return null;
    const latest = measurements[0]?.body_fat;
    const first = measurements[measurements.length - 1]?.body_fat;
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
      weight: m.weight || 0
    }))
    .filter(d => d.weight > 0);

  // Group results by type for Achievements tab
  const groupedResults = React.useMemo(() => {
    const groups = {};
    results.forEach(r => {
      const type = r.record_type || 'אחר';
      if (!groups[type]) groups[type] = [];
      groups[type].push(r);
    });
    return groups;
  }, [results]);

  // Calculate improvement metrics grouped by parent_plan_id
  const improvementData = React.useMemo(() => {
      const groups = {};
      const parentPlans = trainingPlans.filter(p => p.parent_plan_id || trainingPlans.some(child => child.parent_plan_id === p.id));

      parentPlans.forEach(plan => {
        const rootId = plan.parent_plan_id || plan.id;
        if (!groups[rootId]) groups[rootId] = [];

        // Calculate plan stats using pre-calculated fields
        const completionRate = plan.progress_percentage || 0;
        
        // Note: Averages would require fetching exercises, setting to 0 for summary view to avoid over-fetching
        const avgControl = 0; 
        const avgDifficulty = 0;

        groups[rootId].push({
            ...plan,
            stats: { completionRate, avgControl, avgDifficulty, date: plan.created_date }
        });
      });

      // Sort each group by date
      Object.keys(groups).forEach(key => {
        groups[key].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
      });

      return groups;
  }, [trainingPlans]);

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white" dir="rtl">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#FF6F20] mx-auto" />
          <p className="mt-4 text-sm text-gray-500">טוען את נתוני הפרופיל...</p>
        </div>
      </div>
    );
  }

  if (profileError || noUserFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4" dir="rtl">
        <div className="max-w-md w-full text-center bg-white border border-gray-100 rounded-3xl p-8 shadow-sm">
          <h1 className="text-xl font-bold mb-3">שגיאה בטעינת הפרופיל</h1>
          <p className="text-sm text-gray-600 mb-6">
            {profileError ? 'אירעה שגיאה בטעינת הפרופיל. אנא רענן את הדף או חזור מאוחר יותר.' : 'לא נמצא משתמש עם הפרופיל המבוקש.'}
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <Button variant="secondary" onClick={() => window.location.reload()} className="w-full sm:w-auto">רענן</Button>
            <Button variant="ghost" onClick={() => navigate(createPageUrl("TraineeHome"))} className="w-full sm:w-auto">חזור לדף הבית</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white" dir="rtl">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#FF6F20] mx-auto" />
          <p className="mt-4 text-sm text-gray-500">מכין את התצוגה שלך...</p>
        </div>
      </div>
    );
  }

  const isUrielsAccount = user.email === 'uriel111@gmail.com';

  const attendedSessions = sessions.filter(s => s.participants?.some(p => p.trainee_id === user?.id && p.attendance_status === 'הגיע'));
  const attendancePct = sessions.length > 0 ? Math.round((attendedSessions.length / sessions.length) * 100) : 0;
  const activeService = activeServices[0];
  const hasRecentResult = results.length > 0 && new Date(results[0].date) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const TAB_ITEMS = [
    { id: 'personal', label: 'פרטים אישיים', icon: User },
    { id: 'plans', label: 'תוכניות', icon: Folder },
    { id: 'attendance', label: 'מפגשים', icon: Calendar },
    { id: 'metrics', label: 'מדידות', icon: Activity },
    { id: 'achievements', label: 'שיאים', icon: Award },
    { id: 'goals', label: 'יעדים', icon: Target },
    { id: 'services', label: 'חבילות', icon: Package },
    { id: 'messages', label: 'הערות', icon: MessageSquare },
  ];

  return (
    <ErrorBoundary>
      <div className="h-screen w-full flex flex-col overflow-hidden bg-[#F2F2F7]" dir="rtl" style={{ fontSize: 16 }}>

        {/* ===== ZONE 1: HEADER ===== */}
        <div className="flex-shrink-0" style={{ backgroundColor: '#FF6F20' }}>
          <div className="px-4 pt-3 pb-3">
            {/* Top row: logo + logout */}
            <div className="flex justify-between items-center mb-2">
              <button
                onClick={async () => { await supabase.auth.signOut(); navigate('/login'); }}
                className="flex items-center gap-1 text-white/90 text-xs font-semibold bg-white/20 px-2.5 py-1.5 rounded-xl min-h-[32px]"
              >
                <LogOut className="w-3.5 h-3.5" />
                יציאה
              </button>
              <span className="text-white font-black text-lg tracking-tight">AG /</span>
            </div>
            {/* Profile row */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-white/25 border-2 border-white/50 flex items-center justify-center text-white text-lg font-black overflow-hidden flex-shrink-0">
                {user.profile_image
                  ? <img src={user.profile_image} alt={user.full_name} className="w-full h-full object-cover" />
                  : (user.full_name?.[0]?.toUpperCase() || 'U')
                }
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-white leading-tight truncate" style={{ fontFamily: "'Barlow Condensed', 'DM Sans', sans-serif", fontWeight: 900, fontSize: 20 }}>
                  {user.full_name}
                </h2>
                <p className="text-white/70 text-[11px] mt-0.5">
                  {user.age ? user.age + ' שנים' : ''}{user.age && user.phone ? ' • ' : ''}{user.phone || ''}{(user.age || user.phone) ? ' • ' : ''}מתאמן{coach ? ` של ${coach.full_name}` : ''}
                </p>
              </div>
              <button onClick={() => setShowEdit(true)} className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Edit2 className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            {/* Stats row */}
            <div className="flex gap-2 mt-2">
              {[
                { value: attendedSessions.length, label: 'אימונים' },
                { value: trainingPlans.length, label: 'תוכניות' },
                { value: attendancePct + '%', label: 'נוכחות' },
              ].map((s, i) => (
                <div key={i} className="flex-1 bg-white/15 rounded-xl py-1.5 text-center">
                  <div className="text-sm font-black text-white">{s.value}</div>
                  <div className="text-[9px] text-white/60 font-medium">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===== ZONE 2: TAB GRID ===== */}
        <div className="flex-shrink-0 px-3 py-2 bg-[#F2F2F7]">
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {TAB_ITEMS.map(tab => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center justify-center rounded-xl transition-all active:scale-95
                    py-2.5 sm:py-3 md:py-3.5
                    ${isActive
                      ? 'bg-[#FFF3EB] border-2 border-[#FF6F20] shadow-sm'
                      : 'bg-white border border-gray-100 hover:shadow-sm hover:border-gray-200'
                    }`}
                >
                  <Icon className={`w-5 h-5 sm:w-6 sm:h-6 mb-1 ${isActive ? 'text-[#FF6F20]' : 'text-gray-400'}`} />
                  <span className={`text-[10px] sm:text-xs font-bold leading-tight ${isActive ? 'text-[#FF6F20]' : 'text-gray-500'}`}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ===== ZONE 3: TAB CONTENT (scrollable) ===== */}
        <div className="flex-1 overflow-y-auto pb-20">
          <div className="max-w-6xl mx-auto px-4 py-4 w-full">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

              {/* Personal Details Tab */}
              <TabsContent value="personal" className="space-y-4 w-full">
                {/* Info Card */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
                    <h2 className="text-lg font-bold flex items-center gap-2"><User className="w-5 h-5 text-[#FF6F20]" />פרטים אישיים</h2>
                    <Button onClick={() => setShowEdit(true)} variant="ghost" className="rounded-lg px-3 py-2 font-medium text-xs min-h-[44px]" style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}>
                      <Edit2 className="w-3 h-3 ml-1" />ערוך
                    </Button>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { icon: <User className="w-4 h-4" />, label: 'שם מלא', value: user.full_name },
                        { icon: <Phone className="w-4 h-4" />, label: 'טלפון', value: user.phone || '—' },
                        { icon: <Mail className="w-4 h-4" />, label: 'אימייל', value: user.email || '—' },
                        { icon: <Calendar className="w-4 h-4" />, label: 'גיל', value: user.age ? user.age + ' שנים' : '—' },
                        { icon: <MapPin className="w-4 h-4" />, label: 'עיר', value: user.city || '—' },
                        { icon: <Heart className="w-4 h-4" />, label: 'מטרה', value: user.main_goal || '—' },
                      ].map((item, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="text-gray-400 mt-0.5 flex-shrink-0">{item.icon}</div>
                          <div className="min-w-0">
                            <div className="text-[10px] text-gray-400 font-medium">{item.label}</div>
                            <div className="text-sm font-semibold text-gray-900 truncate">{item.value}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setActiveTab('documents')} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-2 active:scale-[0.97] transition-transform">
                    <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0"><FileText className="w-4 h-4 text-[#FF6F20]" /></div>
                    <div className="text-right">
                      <div className="font-bold text-xs text-gray-900">מסמכים</div>
                      <div className="text-[10px] text-gray-400">
                        {[targetUser?.health_declaration_signed_at, targetUser?.cooperation_agreement_signed_at].filter(Boolean).length || user?.health_declaration_signed_at || user?.cooperation_agreement_signed_at ? 'חתומים' : 'להחתמה'}
                      </div>
                    </div>
                  </button>
                  <button onClick={() => setShowPasswordChange(true)} className="bg-gray-900 rounded-xl p-3 flex items-center gap-2 active:scale-[0.97] transition-transform">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0"><Lock className="w-4 h-4 text-white" /></div>
                    <div className="font-bold text-xs text-white">שינוי סיסמא</div>
                  </button>
                </div>
              </TabsContent>

              {/* Goals Tab */}
              <TabsContent value="goals" className="space-y-4 w-full">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold flex items-center gap-2"><Target className="w-5 h-5 text-[#FF6F20]" />יעדים</h2>
                  <Button onClick={() => { setEditingGoal(null); setShowAddGoal(true); }} variant="ghost" className="rounded-lg px-3 py-2 font-medium text-xs min-h-[44px]" style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}>
                    <Plus className="w-3 h-3 ml-1" />הוסף יעד
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-3 w-full">
                  {[
                    { icon: <Target className="w-5 h-5 mx-auto mb-1 text-[#FF6F20]" />, val: activeGoals.length, label: 'פעילים' },
                    { icon: <CheckCircle className="w-5 h-5 mx-auto mb-1 text-green-500" />, val: completedGoals.length, label: 'הושגו' },
                    { icon: <TrendingUp className="w-5 h-5 mx-auto mb-1 text-gray-400" />, val: goals.length, label: 'סה״כ' },
                  ].map((s, i) => (
                    <div key={i} className="p-3 rounded-lg text-center bg-white border border-gray-200">
                      {s.icon}<p className="text-xl font-bold">{s.val}</p><p className="text-xs text-gray-500">{s.label}</p>
                    </div>
                  ))}
                </div>
                {goals.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg"><Target className="w-10 h-10 mx-auto mb-3 text-gray-300" /><p className="text-gray-500">אין יעדים מוגדרים</p></div>
                ) : (
                  <div className="space-y-3">
                    {goals.map(goal => (
                      <div key={goal.id} className="p-4 rounded-lg bg-white border border-gray-200 shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <h4 className="font-bold text-lg mb-1">{goal.goal_name}</h4>
                            {goal.description && <p className="text-sm text-gray-500">{goal.description}</p>}
                          </div>
                          <div className="flex gap-1">
                            <Button onClick={() => { setEditingGoal(goal); setShowAddGoal(true); }} size="icon" variant="ghost" className="w-9 h-9 text-[#FF6F20]"><Edit2 className="w-4 h-4" /></Button>
                            <Button onClick={() => { if (window.confirm(`למחוק "${goal.goal_name}"?`)) deleteGoalMutation.mutate(goal.id); }} size="icon" variant="ghost" className="w-9 h-9 text-red-500"><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </div>
                        <div className="mb-2">
                          <div className="flex justify-between text-xs mb-1"><span className="text-gray-400">התקדמות</span><span className="font-bold text-[#FF6F20]">{goal.current_value || 0} / {goal.target_value} {goal.unit}</span></div>
                          <div className="h-2 rounded-full bg-gray-200 overflow-hidden"><div className="h-full bg-[#FF6F20]" style={{ width: `${goal.progress_percentage || 0}%` }} /></div>
                          <p className="text-xs text-center mt-1 font-bold text-[#FF6F20]">{goal.progress_percentage || 0}%</p>
                        </div>
                        {goal.target_date && <p className="text-xs text-gray-400 flex items-center gap-1"><Calendar className="w-3 h-3" />יעד: {format(new Date(goal.target_date), 'dd/MM/yy', { locale: he })}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Metrics Tab */}
              <TabsContent value="metrics" className="space-y-4 w-full">
                <h2 className="text-lg font-bold flex items-center gap-2"><TrendingUp className="w-5 h-5 text-[#FF6F20]" />מדדים פיזיים</h2>
                <PhysicalMetricsManager trainee={user} measurements={measurements} results={results} coach={isCoach ? currentUser : null} goals={goals} />
              </TabsContent>

              {/* Achievements Tab */}
              <TabsContent value="achievements" className="space-y-4 w-full">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold flex items-center gap-2"><Award className="w-5 h-5 text-yellow-500" />הישגים</h2>
                  <Button onClick={() => { setEditingResult(null); setShowAddResult(true); }} variant="ghost" className="rounded-lg px-3 py-2 font-medium text-xs min-h-[44px]" style={{ border: '1px solid #FFD700', color: '#000' }}>
                    <Plus className="w-3 h-3 ml-1" />הוסף שיא
                  </Button>
                </div>
                {results.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg"><Award className="w-10 h-10 mx-auto mb-3 text-gray-300" /><p className="text-gray-500">אין הישגים עדיין</p></div>
                ) : (
                  <div className="space-y-4 pb-4">
                    {Object.entries(groupedResults).map(([type, typeResults]) => (
                      <AchievementGroup key={type} type={type} results={typeResults} goals={goals}
                        onEdit={(r) => { setEditingResult(r); setShowAddResult(true); }}
                        onDelete={(id) => { if (window.confirm('למחוק?')) deleteResultMutation.mutate(id); }}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Services Tab */}
              <TabsContent value="services" className="space-y-6 w-full">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold flex items-center gap-2"><Package className="w-5 h-5 text-[#FF6F20]" />שירותים וחבילות</h2>
                  {isCoach && (
                    <Button onClick={() => { setEditingService(null); setServiceForm({ service_type: "personal", group_name: "", billing_model: "punch_card", sessions_per_week: "", package_name: "", base_price: "", discount_type: "none", discount_value: 0, final_price: "", payment_method: "credit", start_date: new Date().toISOString().split('T')[0], end_date: "", next_billing_date: "", total_sessions: "", payment_status: "ממתין לתשלום", notes_internal: "", status: "active" }); setShowAddService(true); }} variant="ghost" className="rounded-lg px-3 py-2 font-medium text-xs min-h-[44px]" style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}>
                      <Plus className="w-3 h-3 ml-1" />הוסף שירות
                    </Button>
                  )}
                </div>
                <div className="space-y-6">
                  {['personal', 'group', 'online'].map(type => {
                    const typeServices = activeServices.filter(s => {
                      if (type === 'personal') return s.service_type === 'personal' || s.service_type === 'אימונים אישיים';
                      if (type === 'group') return s.service_type === 'group' || s.service_type === 'פעילות קבוצתית';
                      if (type === 'online') return s.service_type === 'online' || s.service_type === 'ליווי אונליין';
                      return false;
                    });
                    if (typeServices.length === 0) return null;
                    const title = type === 'personal' ? '🏋️‍♂️ אימונים אישיים' : type === 'group' ? '👥 אימונים קבוצתיים' : '💻 ליווי אונליין';
                    const borderColor = type === 'personal' ? '#FF6F20' : type === 'group' ? '#2196F3' : '#9C27B0';
                    return (
                      <div key={type} className="space-y-3">
                        <h3 className="text-base font-bold text-gray-800">{title}</h3>
                        <div className="grid gap-4">
                          {typeServices.map(service => {
                            const isPunchCard = service.billing_model === 'punch_card' || service.total_sessions > 0;
                            const remaining = isPunchCard ? service.total_sessions - (service.used_sessions || 0) : null;
                            const priceDisplay = service.final_price || service.price;
                            return (
                              <div key={service.id} className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor }}>
                                <div className="p-4 border-b border-gray-50 flex justify-between items-start bg-gray-50/30">
                                  <div>
                                    <h4 className="font-bold text-lg text-gray-900">{service.group_name || service.package_name || (type === 'personal' ? 'חבילה אישית' : 'מנוי')}</h4>
                                    <p className="text-xs text-gray-500 mt-0.5">{service.billing_model === 'subscription' ? '📅 מנוי' : service.billing_model === 'punch_card' ? '🎫 כרטיסייה' : '⚡ חד פעמי'}{service.sessions_per_week ? ` • ${service.sessions_per_week}/שבוע` : ''}</p>
                                  </div>
                                  <div className="text-lg font-black" style={{ color: borderColor }}>₪{priceDisplay}<span className="text-xs font-normal text-gray-400 block">{service.billing_model === 'subscription' ? 'לחודש' : 'סה"כ'}</span></div>
                                </div>
                                <div className="p-4 space-y-3">
                                  <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                                    <div className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-md"><Calendar className="w-3 h-3" />התחלה: {format(new Date(service.start_date), 'dd/MM/yy')}</div>
                                    {service.next_billing_date && <div className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded-md"><Calendar className="w-3 h-3" />חיוב הבא: {format(new Date(service.next_billing_date), 'dd/MM/yy')}</div>}
                                    <div className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-md"><DollarSign className="w-3 h-3" />{service.payment_method === 'credit' ? 'אשראי' : service.payment_method === 'cash' ? 'מזומן' : service.payment_method === 'bit' ? 'ביט' : service.payment_method}</div>
                                  </div>
                                  {isPunchCard && (
                                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                      <div className="flex justify-between items-center text-sm mb-2">
                                        <span className="font-bold text-gray-700">ניצול כרטיסייה</span>
                                        {editingUsage === service.id ? (
                                          <div className="flex items-center gap-2">
                                            <Input type="number" value={usageValue} onChange={e => setUsageValue(e.target.value)} className="w-16 h-8 text-center bg-white" />
                                            <span className="text-gray-500">/ {service.total_sessions}</span>
                                            <Button onClick={() => updateServiceUsageMutation.mutate()} size="icon" className="h-8 w-8 bg-green-500 rounded-full"><CheckCircle className="w-4 h-4" /></Button>
                                            <Button onClick={() => setEditingUsage(null)} size="icon" variant="ghost" className="h-8 w-8 text-red-500"><Trash2 className="w-4 h-4" /></Button>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-2">
                                            <span className="font-mono font-bold">{service.used_sessions} / {service.total_sessions}</span>
                                            {isCoach && <Button onClick={() => { setEditingUsage(service.id); setUsageValue(String(service.used_sessions)); }} variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-[#FF6F20]"><Edit2 className="w-3 h-3" /></Button>}
                                          </div>
                                        )}
                                      </div>
                                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden"><div className="h-full" style={{ width: `${Math.min(100, (service.used_sessions / service.total_sessions) * 100)}%`, backgroundColor: borderColor }} /></div>
                                      <p className="text-xs text-center mt-1 font-bold" style={{ color: borderColor }}>נותרו {remaining} אימונים</p>
                                    </div>
                                  )}
                                  {isCoach && service.notes_internal && <div className="bg-yellow-50 p-2 rounded text-xs text-yellow-800 border border-yellow-100"><span className="font-bold">🔒 הערות פנימיות:</span> {service.notes_internal}</div>}
                                  {isCoach && <div className="pt-2 border-t border-gray-100 flex justify-end"><Button variant="ghost" size="sm" className="text-xs h-9" onClick={() => openEditService(service)}><Edit2 className="w-3 h-3 ml-1 text-gray-400" />ערוך</Button></div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {activeServices.length === 0 && (
                    <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                      <Package className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                      <p className="text-gray-500">אין שירותים פעילים</p>
                      {isCoach && <Button variant="link" onClick={() => setShowAddService(true)} className="text-[#FF6F20]">הוסף שירות ראשון</Button>}
                    </div>
                  )}
                </div>
                <div className="space-y-3 pt-4">
                  <h3 className="text-base font-bold text-gray-800 border-b pb-2">היסטוריית רכישות</h3>
                  <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 border-b border-gray-200"><tr><th className="px-3 py-2 text-right font-bold text-gray-600">שירות</th><th className="px-3 py-2 text-right font-bold text-gray-600">תאריך</th><th className="px-3 py-2 text-right font-bold text-gray-600">מחיר</th><th className="px-3 py-2 text-right font-bold text-gray-600">סטטוס</th></tr></thead>
                      <tbody className="divide-y divide-gray-200">
                        {services.length === 0 ? (
                          <tr><td colSpan="4" className="px-4 py-4 text-center text-gray-500 italic">אין היסטוריה</td></tr>
                        ) : (
                          services.map(s => (
                            <tr key={s.id} className="bg-white">
                              <td className="px-3 py-2"><div className="font-medium">{s.service_type}</div><div className="text-xs text-gray-500">{s.package_name}</div></td>
                              <td className="px-3 py-2 text-gray-600">{format(new Date(s.start_date), 'dd/MM/yy')}</td>
                              <td className="px-3 py-2 font-medium">₪{s.price}</td>
                              <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'הסתיים' ? 'bg-blue-100 text-blue-800' : s.status === 'פג תוקף' ? 'bg-red-100 text-red-800' : s.status === 'פעיל' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{s.status}</span></td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>

              {/* Attendance Tab */}
              <TabsContent value="attendance" className="space-y-4 w-full">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold flex items-center gap-2"><Calendar className="w-5 h-5 text-[#FF6F20]" />יומן נוכחות</h2>
                  {isCoach && (
                    <Button onClick={() => setShowManualAttendance(true)} variant="ghost" size="sm" className="rounded-lg px-3 py-2 font-medium text-xs min-h-[44px]" style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}>
                      <Plus className="w-3 h-3 ml-1" />נוכחות ידנית
                    </Button>
                  )}
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200"><tr><th className="px-3 py-2 text-right font-bold text-gray-600">תאריך</th><th className="px-3 py-2 text-right font-bold text-gray-600">סוג</th><th className="px-3 py-2 text-right font-bold text-gray-600">מיקום</th><th className="px-3 py-2 text-right font-bold text-gray-600">סטטוס</th></tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {sessions.length === 0 ? (
                          <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500">לא נמצאו אימונים</td></tr>
                        ) : (
                          sessions.map(session => {
                            const participant = session.participants?.find(p => p.trainee_id === user.id);
                            const displayStatus = participant?.attendance_status || 'ממתין';
                            return (
                              <tr key={session.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2"><div className="font-bold text-gray-800">{format(new Date(session.date), 'dd/MM/yy')}</div><div className="text-xs text-gray-500">{session.time}</div></td>
                                <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full border ${session.session_type === 'אישי' ? 'bg-purple-50 border-purple-100 text-purple-700' : session.session_type === 'קבוצתי' ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-green-50 border-green-100 text-green-700'}`}>{session.session_type}</span></td>
                                <td className="px-3 py-2 text-gray-500 text-xs truncate max-w-[80px]">{session.location}</td>
                                <td className="px-3 py-2">
                                  {isCoach ? (
                                    <Select value={displayStatus} onValueChange={val => { if (val !== displayStatus) updateSessionStatusMutation.mutate({ session, newStatus: val }); }}>
                                      <SelectTrigger className="h-8 text-xs w-auto min-w-[80px] border-gray-200"><SelectValue /></SelectTrigger>
                                      <SelectContent><SelectItem value="הגיע">הגיע</SelectItem><SelectItem value="לא הגיע">לא הגיע</SelectItem><SelectItem value="בוטל">בוטל</SelectItem><SelectItem value="ממתין">ממתין</SelectItem></SelectContent>
                                    </Select>
                                  ) : (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${displayStatus === 'הגיע' || displayStatus === 'התקיים' ? 'bg-green-100 text-green-800' : displayStatus?.includes('בוטל') ? 'bg-red-100 text-red-800' : displayStatus === 'לא הגיע' ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'}`}>{displayStatus}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>

              {/* Plans Tab */}
              <TabsContent value="plans" className="space-y-4 w-full">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-[#FF6F20]" />תוכניות אימון</h2>
                  {isCoach && <Button onClick={() => navigate(createPageUrl(`TrainingPlans?create=true`))} variant="ghost" className="rounded-lg px-3 py-2 font-medium text-xs min-h-[44px]" style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}><Plus className="w-3 h-3 ml-1" />צור תוכנית</Button>}
                </div>
                {trainingPlans.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg"><FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" /><p className="text-gray-500">אין תוכניות אימון</p></div>
                ) : (
                  <div className="space-y-4">
                    {trainingPlans.filter(p => p.created_by !== user?.id).length > 0 && (
                      <div className="p-4 rounded-xl bg-orange-50 border border-orange-100">
                        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#FF6F20]" />תוכניות מהמאמן</h3>
                        <div className="space-y-3">
                          {trainingPlans.filter(p => p.created_by !== user?.id).map(plan => {
                            const progress = getPlanProgress(plan);
                            return (
                              <div key={plan.id} onClick={() => isCoach && navigate(createPageUrl("TrainingPlans") + `?planId=${plan.id}`)} className="p-4 rounded-xl bg-white border border-gray-200 hover:shadow-md cursor-pointer">
                                <div className="flex justify-between items-start mb-2">
                                  <h4 className="font-bold text-base">{plan.plan_name}</h4>
                                  {isCoach && <Button onClick={e => { e.stopPropagation(); navigate(createPageUrl("TrainingPlans") + `?planId=${plan.id}`); }} size="sm" variant="outline" className="h-8 text-xs">פתח</Button>}
                                </div>
                                <div className="flex justify-between text-xs text-gray-500 mb-2"><span>{Array.isArray(plan.goal_focus) ? plan.goal_focus.join(', ') : plan.goal_focus}</span><span>{progress.completed}/{progress.total} תרגילים</span></div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-[#FF6F20]" style={{ width: `${progress.percent}%` }} /></div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {trainingPlans.filter(p => p.created_by === user?.id).length > 0 && (
                      <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-gray-400" />תוכניות עצמאיות</h3>
                        <div className="space-y-3">
                          {trainingPlans.filter(p => p.created_by === user?.id).map(plan => {
                            const progress = getPlanProgress(plan);
                            return (
                              <div key={plan.id} onClick={() => isCoach && navigate(createPageUrl("TrainingPlans") + `?planId=${plan.id}`)} className="p-4 rounded-xl bg-white border border-gray-200 hover:shadow-md cursor-pointer">
                                <div className="flex justify-between items-start mb-2">
                                  <h4 className="font-bold text-base">{plan.plan_name}</h4>
                                  {isCoach && <Button onClick={e => { e.stopPropagation(); navigate(createPageUrl("TrainingPlans") + `?planId=${plan.id}`); }} size="sm" variant="outline" className="h-8 text-xs">פתח</Button>}
                                </div>
                                <div className="flex justify-between text-xs text-gray-500 mb-2"><span>{Array.isArray(plan.goal_focus) ? plan.goal_focus.join(', ') : plan.goal_focus}</span><span>{progress.completed}/{progress.total} תרגילים</span></div>
                                <div className="h-2 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-gray-500" style={{ width: `${progress.percent}%` }} /></div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {workoutHistory.length > 0 && (
                      <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500" />היסטוריית אימונים</h3>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {workoutHistory.map(entry => (
                            <div key={entry.id} className="bg-white p-3 rounded-xl border border-blue-100 flex justify-between items-center">
                              <div><h4 className="font-bold text-sm text-blue-900">{entry.planName || "אימון"}</h4><span className="text-xs text-gray-500">{new Date(entry.date).toLocaleDateString('he-IL')}</span></div>
                              <div className="text-xs"><div className="font-bold text-green-600">שליטה: {entry.mastery_avg}</div><div className="font-bold text-orange-600">קושי: {entry.difficulty_avg}</div></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* Messages Tab */}
              <TabsContent value="messages" className="space-y-4 w-full">
                <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><MessageSquare className="w-5 h-5 text-purple-600" />שיחה עם המאמן</h2>
                {user && coach ? (
                  <div className="rounded-xl overflow-hidden border border-gray-200 bg-white">
                    <MessageCenter currentUserId={user.id} currentUserName={user.full_name} otherUserId={coach.id} otherUserName={coach.full_name} relatedUserId={user.id} />
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 rounded-lg"><MessageSquare className="w-10 h-10 mx-auto mb-3 text-gray-300" /><p className="text-gray-500">לא נמצא מאמן</p></div>
                )}
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents" className="space-y-4 w-full">
                <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
                  <FileText className="w-5 h-5 text-[#FF6F20]" />מסמכים וטפסים
                </h2>
                {[
                  {
                    key: 'health_declaration',
                    label: 'הצהרת בריאות',
                    signedAt: effectiveUser?.health_declaration_signed_at,
                    sigData: effectiveUser?.health_declaration_signature,
                  },
                  {
                    key: 'cooperation_agreement',
                    label: 'הסכם שיתוף פעולה',
                    signedAt: effectiveUser?.cooperation_agreement_signed_at,
                    sigData: effectiveUser?.cooperation_agreement_signature,
                  },
                ].map(doc => (
                  <div
                    key={doc.key}
                    className="rounded-xl p-4 border-2 bg-white"
                    style={{ borderColor: doc.signedAt ? '#4CAF50' : '#E0E0E0' }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5" style={{ color: doc.signedAt ? '#4CAF50' : '#FF6F20' }} />
                        <span className="font-bold text-sm text-gray-900">{doc.label}</span>
                      </div>
                      {doc.signedAt ? (
                        <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">
                          <CheckCircle className="w-3 h-3" /> נחתם
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                          ממתין לחתימה
                        </span>
                      )}
                    </div>
                    {doc.signedAt && (
                      <p className="text-xs text-gray-500 mt-1">
                        נחתם ב-{format(new Date(doc.signedAt), 'dd/MM/yyyy HH:mm', { locale: he })}
                      </p>
                    )}
                    {doc.signedAt && doc.sigData && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-400 mb-1">חתימה:</p>
                        <img src={doc.sigData} alt="חתימה" className="h-14 border rounded-lg bg-white"
                          style={{ border: '1px solid #E0E0E0' }} />
                      </div>
                    )}
                  </div>
                ))}
                {/* If trainee viewing own profile — link to sign forms */}
                {!isCoach && (
                  <Link
                    to={createPageUrl('Forms')}
                    className="w-full block text-center py-3 px-4 rounded-xl font-bold text-white min-h-[44px] flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#FF6F20' }}
                  >
                    <FileText className="w-4 h-4" />
                    עבור לדף טפסים וחתימות
                  </Link>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* ===== DIALOGS ===== */}

        {/* Edit Profile Dialog */}
        <Dialog open={showEdit} onOpenChange={setShowEdit}>
          <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl" style={{ backgroundColor: '#FFFFFF' }}>
            <DialogHeader><DialogTitle className="text-lg font-bold">ערוך פרופיל</DialogTitle></DialogHeader>
            <div className="space-y-5">
              {/* ── פרטים אישיים ── */}
              <div>
                <h3 className="text-sm font-bold text-[#FF6F20] mb-2">פרטים אישיים</h3>
                <div className="space-y-3">
                  <div><Label className="text-xs text-gray-500 mb-1 block">שם מלא</Label><Input value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} className="rounded-lg" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs text-gray-500 mb-1 block">טלפון</Label><Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="rounded-lg" /></div>
                    <div><Label className="text-xs text-gray-500 mb-1 block">אימייל</Label><Input value={formData.email} disabled className="rounded-lg bg-gray-50 text-gray-400" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label className="text-xs text-gray-500 mb-1 block">תאריך לידה</Label><Input type="date" value={formData.birth_date} onChange={e => { const d = e.target.value; let age = ''; if (d) { const b = new Date(d); age = String(Math.floor((Date.now() - b.getTime()) / (365.25*24*60*60*1000))); } setFormData({ ...formData, birth_date: d, age }); }} max={new Date().toISOString().split('T')[0]} className="rounded-lg" /></div>
                    <div><Label className="text-xs text-gray-500 mb-1 block">גיל</Label><Input value={formData.age} disabled className="rounded-lg bg-gray-50" /></div>
                    <div><Label className="text-xs text-gray-500 mb-1 block">מגדר</Label>
                      <Select value={formData.gender} onValueChange={v => setFormData({ ...formData, gender: v })}>
                        <SelectTrigger className="rounded-lg"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent><SelectItem value="זכר">זכר</SelectItem><SelectItem value="נקבה">נקבה</SelectItem><SelectItem value="אחר">אחר</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs text-gray-500 mb-1 block">עיר</Label><Input value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} className="rounded-lg" /></div>
                    <div><Label className="text-xs text-gray-500 mb-1 block">כתובת</Label><Input value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className="rounded-lg" /></div>
                  </div>
                  <div><Label className="text-xs text-gray-500 mb-1 block">סטטוס</Label>
                    <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v })}>
                      <SelectTrigger className="rounded-lg"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent><SelectItem value="active">פעיל</SelectItem><SelectItem value="inactive">לא פעיל</SelectItem><SelectItem value="frozen">מוקפא</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* ── פרטים מקצועיים ── */}
              <div>
                <h3 className="text-sm font-bold text-[#FF6F20] mb-2">פרטים מקצועיים</h3>
                <div className="space-y-3">
                  <div><Label className="text-xs text-gray-500 mb-1 block">מטרה עיקרית</Label><Input value={formData.main_goal} onChange={e => setFormData({ ...formData, main_goal: e.target.value })} className="rounded-lg" /></div>
                  <div><Label className="text-xs text-gray-500 mb-1 block">מטרות אימון</Label><Textarea value={formData.training_goals} onChange={e => setFormData({ ...formData, training_goals: e.target.value })} className="rounded-lg resize-none min-h-[60px]" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs text-gray-500 mb-1 block">רמת כושר</Label>
                      <Select value={formData.fitness_level} onValueChange={v => setFormData({ ...formData, fitness_level: v })}>
                        <SelectTrigger className="rounded-lg"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent><SelectItem value="מתחיל">מתחיל</SelectItem><SelectItem value="בינוני">בינוני</SelectItem><SelectItem value="מתקדם">מתקדם</SelectItem><SelectItem value="מקצועי">מקצועי</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div><Label className="text-xs text-gray-500 mb-1 block">תדירות אימון</Label><Input value={formData.training_frequency} onChange={e => setFormData({ ...formData, training_frequency: e.target.value })} placeholder="לדוגמה: 3 פעמים בשבוע" className="rounded-lg" /></div>
                  </div>
                  <div><Label className="text-xs text-gray-500 mb-1 block">רקע ספורטיבי</Label><Textarea value={formData.sport_background} onChange={e => setFormData({ ...formData, sport_background: e.target.value })} className="rounded-lg resize-none min-h-[60px]" /></div>
                  <div><Label className="text-xs text-gray-500 mb-1 block">סגנון אימון מועדף</Label><Input value={formData.preferred_training_style} onChange={e => setFormData({ ...formData, preferred_training_style: e.target.value })} className="rounded-lg" /></div>
                </div>
              </div>

              {/* ── בריאות ── */}
              <div>
                <h3 className="text-sm font-bold text-[#FF6F20] mb-2">בריאות</h3>
                <div className="space-y-3">
                  <div><Label className="text-xs text-gray-500 mb-1 block">בעיות בריאות / פציעות</Label><Textarea value={formData.health_issues} onChange={e => setFormData({ ...formData, health_issues: e.target.value })} className="rounded-lg resize-none min-h-[60px]" /></div>
                  <div><Label className="text-xs text-gray-500 mb-1 block">היסטוריה רפואית</Label><Textarea value={formData.medical_history} onChange={e => setFormData({ ...formData, medical_history: e.target.value })} className="rounded-lg resize-none min-h-[60px]" /></div>
                </div>
              </div>

              {/* ── חירום ── */}
              <div>
                <h3 className="text-sm font-bold text-[#FF6F20] mb-2">איש קשר לחירום</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs text-gray-500 mb-1 block">שם</Label><Input value={formData.emergency_contact_name} onChange={e => setFormData({ ...formData, emergency_contact_name: e.target.value })} className="rounded-lg" /></div>
                  <div><Label className="text-xs text-gray-500 mb-1 block">טלפון</Label><Input value={formData.emergency_contact_phone} onChange={e => setFormData({ ...formData, emergency_contact_phone: e.target.value })} className="rounded-lg" /></div>
                </div>
              </div>

              {/* ── הערות ── */}
              <div>
                <h3 className="text-sm font-bold text-[#FF6F20] mb-2">הערות</h3>
                <div className="space-y-3">
                  <div><Label className="text-xs text-gray-500 mb-1 block">ביוגרפיה</Label><Textarea value={formData.bio} onChange={e => setFormData({ ...formData, bio: e.target.value })} className="rounded-lg resize-none min-h-[60px]" /></div>
                  <div><Label className="text-xs text-gray-500 mb-1 block">הערות כלליות</Label><Textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="rounded-lg resize-none min-h-[60px]" /></div>
                  {isCoach && <div><Label className="text-xs text-gray-500 mb-1 block">הערות מאמן (פנימי)</Label><Textarea value={formData.coach_notes} onChange={e => setFormData({ ...formData, coach_notes: e.target.value })} className="rounded-lg resize-none min-h-[60px] bg-yellow-50 border-yellow-200" /></div>}
                </div>
              </div>

              <Button onClick={handleSave} disabled={updateUserMutation.isPending || updateTargetUserMutation.isPending} className="w-full font-bold text-white rounded-lg min-h-[44px]" style={{ backgroundColor: '#FF6F20' }}>
                {updateUserMutation.isPending || updateTargetUserMutation.isPending ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר...</> : 'שמור שינויים'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Health Declaration Dialog */}
        <Dialog open={showHealthUpdate} onOpenChange={setShowHealthUpdate}>
          <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>עדכון הצהרת בריאות</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border">
                <input type="checkbox" id="hasLimits" checked={healthForm.has_limitations} onChange={e => setHealthForm({ ...healthForm, has_limitations: e.target.checked })} className="w-5 h-5" />
                <Label htmlFor="hasLimits" className="cursor-pointer">יש מגבלות בריאותיות / פציעות</Label>
              </div>
              {healthForm.has_limitations && (
                <div><Label>פירוט מגבלות</Label><Input value={healthForm.health_issues} onChange={e => setHealthForm({ ...healthForm, health_issues: e.target.value })} className="rounded-lg mt-1" style={{ fontSize: 16 }} /></div>
              )}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 border border-orange-200">
                <input type="checkbox" id="approved" checked={healthForm.approved} onChange={e => setHealthForm({ ...healthForm, approved: e.target.checked })} className="w-5 h-5" />
                <Label htmlFor="approved" className="cursor-pointer text-sm">אני מאשר/ת שהמידע שמסרתי נכון ומדויק</Label>
              </div>
              <Button onClick={handleHealthUpdate} disabled={updateHealthMutation.isPending} className="w-full font-bold text-white rounded-lg min-h-[44px]" style={{ backgroundColor: '#FF6F20' }}>
                {updateHealthMutation.isPending ? 'שומר...' : 'אשר והמשך'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Vision Dialog */}
        <VisionFormDialog isOpen={showVisionDialog} onClose={() => setShowVisionDialog(false)} initialData={user?.vision || {}} onSubmit={data => updateVisionMutation.mutate(data)} isCoach={isCoach} isLoading={updateVisionMutation.isPending} />

        {/* Goal Dialog */}
        <GoalFormDialog isOpen={showAddGoal} onClose={() => { setShowAddGoal(false); setEditingGoal(null); }} traineeId={user.id} traineeName={user.full_name} editingGoal={editingGoal} />

        {/* Result Dialog */}
        <ResultFormDialog isOpen={showAddResult} onClose={() => { setShowAddResult(false); setEditingResult(null); }} traineeId={user.id} traineeName={user.full_name} editingResult={editingResult} />

        {/* Add/Edit Service Dialog */}
        <Dialog open={showAddService} onOpenChange={setShowAddService}>
          <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingService ? 'ערוך שירות' : 'הוסף שירות'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs mb-1 block">סוג שירות</Label>
                  <Select value={serviceForm.service_type} onValueChange={v => setServiceForm({ ...serviceForm, service_type: v })}>
                    <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="personal">אישי</SelectItem><SelectItem value="group">קבוצתי</SelectItem><SelectItem value="online">אונליין</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs mb-1 block">מודל חיוב</Label>
                  <Select value={serviceForm.billing_model} onValueChange={v => setServiceForm({ ...serviceForm, billing_model: v })}>
                    <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="punch_card">כרטיסייה</SelectItem><SelectItem value="subscription">מנוי</SelectItem><SelectItem value="single">חד פעמי</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label className="text-xs mb-1 block">שם החבילה</Label><Input value={serviceForm.package_name} onChange={e => setServiceForm({ ...serviceForm, package_name: e.target.value })} className="rounded-xl" style={{ fontSize: 16 }} /></div>
              {serviceForm.billing_model === 'punch_card' && <div><Label className="text-xs mb-1 block">מספר אימונים</Label><Input type="number" value={serviceForm.total_sessions} onChange={e => setServiceForm({ ...serviceForm, total_sessions: e.target.value })} className="rounded-xl" style={{ fontSize: 16 }} /></div>}
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs mb-1 block">מחיר בסיס (₪)</Label><Input type="number" value={serviceForm.base_price} onChange={e => setServiceForm({ ...serviceForm, base_price: e.target.value, final_price: e.target.value })} className="rounded-xl" style={{ fontSize: 16 }} /></div>
                <div><Label className="text-xs mb-1 block">מחיר סופי (₪)</Label><Input type="number" value={serviceForm.final_price} onChange={e => setServiceForm({ ...serviceForm, final_price: e.target.value })} className="rounded-xl" style={{ fontSize: 16 }} /></div>
              </div>
              <div><Label className="text-xs mb-1 block">תאריך התחלה</Label><Input type="date" value={serviceForm.start_date} onChange={e => setServiceForm({ ...serviceForm, start_date: e.target.value })} className="rounded-xl" style={{ fontSize: 16 }} /></div>
              {serviceForm.billing_model === 'subscription' && <div><Label className="text-xs mb-1 block">תאריך חיוב הבא</Label><Input type="date" value={serviceForm.next_billing_date} onChange={e => setServiceForm({ ...serviceForm, next_billing_date: e.target.value })} className="rounded-xl" style={{ fontSize: 16 }} /></div>}
              <div><Label className="text-xs mb-1 block">אמצעי תשלום</Label>
                <Select value={serviceForm.payment_method} onValueChange={v => setServiceForm({ ...serviceForm, payment_method: v })}>
                  <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="credit">💳 אשראי</SelectItem><SelectItem value="standing_order">🔄 הוראת קבע</SelectItem><SelectItem value="bit">📱 ביט</SelectItem><SelectItem value="cash">💵 מזומן</SelectItem><SelectItem value="transfer">🏦 העברה</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs mb-1 block">סטטוס</Label>
                <Select value={serviceForm.status} onValueChange={v => setServiceForm({ ...serviceForm, status: v })}>
                  <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="active">פעיל</SelectItem><SelectItem value="frozen">מושהה</SelectItem><SelectItem value="ended">הסתיים</SelectItem></SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddOrUpdateService} disabled={createServiceMutation.isPending || updateServiceMutation.isPending} className="w-full rounded-xl py-3 font-bold text-white min-h-[44px]" style={{ backgroundColor: '#FF6F20' }}>
                {createServiceMutation.isPending || updateServiceMutation.isPending ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר...</> : (editingService ? 'עדכן שירות' : 'הוסף שירות')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Manual Attendance Dialog */}
        <Dialog open={showManualAttendance} onOpenChange={setShowManualAttendance}>
          <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>הוסף נוכחות ידנית</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>תאריך</Label><Input type="date" value={manualAttendanceForm.date} onChange={e => setManualAttendanceForm({ ...manualAttendanceForm, date: e.target.value })} className="rounded-xl" style={{ fontSize: 16 }} /></div>
                <div><Label>שעה</Label><Input type="time" value={manualAttendanceForm.time} onChange={e => setManualAttendanceForm({ ...manualAttendanceForm, time: e.target.value })} className="rounded-xl" style={{ fontSize: 16 }} /></div>
              </div>
              <div><Label>סוג אימון</Label>
                <Select value={manualAttendanceForm.session_type} onValueChange={v => setManualAttendanceForm({ ...manualAttendanceForm, session_type: v })}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="אישי">אישי</SelectItem><SelectItem value="קבוצתי">קבוצתי</SelectItem><SelectItem value="אונליין">אונליין</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>הערות</Label><Input value={manualAttendanceForm.notes} onChange={e => setManualAttendanceForm({ ...manualAttendanceForm, notes: e.target.value })} placeholder="הערות" className="rounded-xl" style={{ fontSize: 16 }} /></div>
              <Button onClick={handleManualAttendanceSubmit} className="w-full rounded-xl py-3 font-bold text-white min-h-[44px]" style={{ backgroundColor: '#FF6F20' }}>שמור נוכחות</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Password Change Dialog */}
        <Dialog open={showPasswordChange} onOpenChange={setShowPasswordChange}>
          <DialogContent className="w-[95vw] max-w-sm max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>שינוי סיסמא</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label className="text-sm font-bold block mb-1">סיסמה חדשה</Label><Input type="password" placeholder="לפחות 6 תווים" value={passwordForm.newPass} onChange={e => setPasswordForm({ ...passwordForm, newPass: e.target.value })} className="rounded-lg h-11" style={{ direction: 'ltr', fontSize: 16 }} /></div>
              <div><Label className="text-sm font-bold block mb-1">אישור סיסמה חדשה</Label><Input type="password" placeholder="הכנס שוב" value={passwordForm.confirm} onChange={e => setPasswordForm({ ...passwordForm, confirm: e.target.value })} className="rounded-lg h-11" style={{ direction: 'ltr', fontSize: 16 }} /></div>
              <Button onClick={handlePasswordChange} disabled={passwordLoading} className="w-full font-bold text-white rounded-lg min-h-[44px]" style={{ backgroundColor: '#FF6F20' }}>
                {passwordLoading ? 'שומר...' : 'שמור סיסמה'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>


      </div>
    </ErrorBoundary>
  );
}
