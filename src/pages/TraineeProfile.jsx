import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Edit2, User, Mail, Phone, MapPin, Heart, Award, TrendingUp, Package, Plus, Loader2, Camera, Target, CheckCircle, Calendar, Shield, LayoutDashboard, Trash2, Home, FileText, MessageSquare, ArrowRight, Activity, ChevronDown, ChevronUp, Folder, FolderOpen, DollarSign } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Dumbbell } from "lucide-react";
import { QUERY_KEYS } from "@/components/utils/queryKeys";
import PhysicalMetricsManager from "../components/PhysicalMetricsManager";
import MessageCenter from "../components/MessageCenter";
import GoalFormDialog from "../components/forms/GoalFormDialog";
import ResultFormDialog from "../components/forms/ResultFormDialog";
import VisionFormDialog from "../components/forms/VisionFormDialog";
import { Checkbox } from "@/components/ui/checkbox";

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
  const [activeTab, setActiveTab] = useState("overview");
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
    full_name: "",
    email: "",
    phone: "",
    birth_date: "",
    age: "",
    gender: "",
    address: "",
    city: "",
    main_goal: "",
    current_status: "",
    future_vision: "",
    health_issues: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    profile_image: ""
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

  const { data: currentUser, refetch } = useQuery({
    queryKey: ['current-user-trainee-profile'],
    queryFn: () => base44.auth.me(),
    refetchInterval: 5000
  });

  const isCoach = currentUser?.isCoach || currentUser?.role === 'admin';

  const { data: targetUser } = useQuery({
    queryKey: ['target-user-profile', userIdParam],
    queryFn: async () => {
        if (!userIdParam) return null;
        const res = await base44.entities.User.filter({ id: userIdParam });
        return res[0];
    },
    enabled: !!userIdParam && !!isCoach,
    refetchInterval: 5000
  });

  useEffect(() => {
    const effectiveUser = (userIdParam && isCoach) ? targetUser : currentUser;
    
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
        emergency_contact_name: effectiveUser.emergency_contact_name || "",
        emergency_contact_phone: effectiveUser.emergency_contact_phone || "",
        profile_image: effectiveUser.profile_image || ""
      });
      
      // Init health form
      const hasLimits = effectiveUser.health_issues && effectiveUser.health_issues.length > 0 && effectiveUser.health_issues !== "אין";
      setHealthForm({
        has_limitations: hasLimits,
        health_issues: effectiveUser.health_issues || "",
        approved: effectiveUser.health_declaration_accepted || false
      });
    }
  }, [currentUser, targetUser, userIdParam, isCoach]);

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
    enabled: !!user?.id && (activeTab === 'goals' || activeTab === 'metrics' || activeTab === 'achievements'),
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
    enabled: !!user?.id && (activeTab === 'metrics'),
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
    enabled: !!user?.id && (activeTab === 'achievements' || activeTab === 'metrics'),
    refetchInterval: 30000
  });

  const { data: services = [] } = useQuery({
    queryKey: ['trainee-services'],
    queryFn: async () => {
      if (!user?.id) return [];
      try {
        return await base44.entities.ClientService.filter({ trainee_id: user.id, coach_id: currentUser.id }, '-created_at');
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
    enabled: !!user?.id && (activeTab === 'plans'),
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
    enabled: !!user?.id && (activeTab === 'plans'),
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
    enabled: !!user?.id && (activeTab === 'attendance'),
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
    mutationFn: (data) => base44.auth.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-user-trainee-profile'] });
      refetch();
      setShowEdit(false);
      toast.success("✅ הפרופיל עודכן");
    },
    onError: (error) => {
      console.error("Update profile error:", error);
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
    }
  });

  const createGoalMutation = useMutation({
    mutationFn: (data) => base44.entities.Goal.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-goals'] });
      setShowAddGoal(false);
      setGoalForm({ goal_name: "", description: "", target_value: "", current_value: "", unit: "", target_date: "", status: "בתהליך" });
      toast.success("✅ יעד נוסף");
    }
  });

  const updateGoalMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Goal.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-goals'] });
      setShowEditGoal(false);
      setEditingGoal(null);
      toast.success("✅ יעד עודכן");
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
      }
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
    mutationFn: ({ id, data }) => base44.entities.User.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['target-user-profile'] });
      refetch();
      setShowEdit(false);
      toast.success("✅ פרופיל מתאמן עודכן");
    },
    onError: (error) => {
      console.error("Update target user error:", error);
      toast.error("⚠️ שגיאה בעדכון פרופיל מתאמן");
    }
  });

  const deleteGoalMutation = useMutation({
    mutationFn: (id) => base44.entities.Goal.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-goals'] });
      toast.success("✅ יעד נמחק");
    }
  });

  const createResultMutation = useMutation({
    mutationFn: (data) => base44.entities.ResultsLog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-results'] });
      setShowAddResult(false);
      setResultForm({ date: new Date().toISOString().split('T')[0], title: "", description: "", related_goal_id: "" });
      toast.success("✅ הישג נוסף");
    }
  });

  const updateResultMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ResultsLog.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-results'] });
      setShowEditResult(false);
      setEditingResult(null);
      toast.success("✅ הישג עודכן");
    }
  });

  const deleteResultMutation = useMutation({
    mutationFn: (id) => base44.entities.ResultsLog.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee-results'] });
      toast.success("✅ הישג נמחק");
    }
  });

  const handleSave = async () => {
    let calculatedAge = formData.age;
    if (formData.birth_date) {
      try {
        const birthDate = new Date(formData.birth_date);
        const today = new Date();
        calculatedAge = Math.floor((today.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      } catch (error) {
        console.error("Error calculating age:", error);
      }
    }

    const dataToUpdate = {
      phone: formData.phone,
      birth_date: formData.birth_date ? new Date(formData.birth_date).toISOString() : null,
      age: calculatedAge,
      gender: formData.gender,
      address: formData.address,
      city: formData.city,
      main_goal: formData.main_goal,
      current_status: formData.current_status,
      future_vision: formData.future_vision,
      emergency_contact_name: formData.emergency_contact_name,
      emergency_contact_phone: formData.emergency_contact_phone,
      ...(isCoach ? { full_name: formData.full_name } : {}) // Allow coach to update name
    };

    if (isCoach && userIdParam) {
        await updateTargetUserMutation.mutateAsync({ id: userIdParam, data: dataToUpdate });
    } else {
        await updateUserMutation.mutateAsync(dataToUpdate);
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

    await updateHealthMutation.mutateAsync(dataToUpdate);
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

    if (editingService) {
      await updateServiceMutation.mutateAsync({ id: editingService.id, data });
    } else {
      await createServiceMutation.mutateAsync({
          ...data,
          trainee_id: user.id,
          trainee_name: user.full_name,
          used_sessions: 0,
          created_by_coach: currentUser.id
      });
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
        await base44.entities.Session.create({
            date: manualAttendanceForm.date,
            time: manualAttendanceForm.time,
            session_type: manualAttendanceForm.session_type,
            location: manualAttendanceForm.location,
            coach_id: currentUser.id,
            coach_name: currentUser.full_name,
            status: 'התקיים',
            coach_notes: `נוכחות ידנית: ${manualAttendanceForm.notes}`,
            participants: [{
                trainee_id: user.id,
                trainee_name: user.full_name,
                attendance_status: 'הגיע'
            }],
            status_updated_at: new Date().toISOString(),
            status_updated_by: currentUser.id
        });

        // 2. If Personal Training, update package
        if (manualAttendanceForm.session_type === 'אישי') {
            // Fetch fresh services to ensure data consistency
            const userServices = await base44.entities.ClientService.filter({ trainee_id: user.id, status: 'active', coach_id: currentUser.id });
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
  };

  const handleUpdateGoal = async () => {
    if (!editingGoal) return;

    const progress = goalForm.current_value && goalForm.target_value
      ? Math.min(100, Math.round((parseFloat(goalForm.current_value) / parseFloat(goalForm.target_value)) * 100))
      : 0;

    await updateGoalMutation.mutateAsync({
      id: editingGoal.id,
      data: {
        goal_name: goalForm.goal_name,
        description: goalForm.description || null,
        target_value: parseFloat(goalForm.target_value),
        current_value: goalForm.current_value ? parseFloat(goalForm.current_value) : null,
        unit: goalForm.unit || null,
        target_date: goalForm.target_date ? new Date(goalForm.target_date).toISOString() : null,
        status: goalForm.status,
        progress_percentage: progress
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

  const activeGoals = goals.filter(g => g.status === 'בתהליך');
  const completedGoals = goals.filter(g => g.status === 'הושג');
  const activeServices = services.filter(s => s.status === 'פעיל');
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

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFFFFF' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#FF6F20' }} />
      </div>
    );
  }

  const isUrielsAccount = user.email === 'uriel111@gmail.com';

  return (
    <div className="min-h-screen w-full overflow-x-hidden pb-32" style={{ backgroundColor: '#FFFFFF' }} dir="rtl">
      <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-8 w-full">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2" style={{ color: '#000000' }}>
              {userIdParam && isCoach ? 'פרופיל מתאמן' : 'הפרופיל שלי'}
            </h1>
            <p className="text-sm md:text-base" style={{ color: '#7D7D7D' }}>
              פרטים אישיים וניהול חשבון
            </p>
          </div>
          {userIdParam && isCoach && (
             <Button 
               onClick={() => navigate(createPageUrl("AllUsers"))}
               variant="outline"
               className="gap-2"
             >
               <ArrowRight className="w-4 h-4" />
               חזרה למתאמנים
             </Button>
          )}
        </div>

        {isUrielsAccount && (
          <div className="mb-6 md:mb-8 p-4 md:p-6 rounded-xl w-full" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 w-full">
              <div className="flex items-center gap-3">
                <Shield className="w-6 h-6 md:w-8 md:h-8 flex-shrink-0" style={{ color: '#FF6F20' }} />
                <div>
                  <h3 className="text-base md:text-xl font-black" style={{ color: '#000000' }}>
                    👨‍💼 גישת מאמן
                  </h3>
                  <p className="text-xs md:text-sm" style={{ color: '#7D7D7D' }}>
                    יש לך גישה מלאה לדשבורד
                  </p>
                </div>
              </div>
              <Button
                onClick={() => navigate(createPageUrl("Dashboard"))}
                className="rounded-xl px-4 md:px-6 py-3 font-bold text-white text-sm md:text-base w-full md:w-auto"
                style={{ backgroundColor: '#FF6F20' }}
              >
                <LayoutDashboard className="w-4 h-4 md:w-5 md:h-5 ml-2" />
                דשבורד מאמן
              </Button>
            </div>
          </div>
        )}

        {/* Header Card */}
        <div className="mb-4 p-4 rounded-lg w-full text-center" style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E0E0E0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>
          <div className="relative inline-block mb-3">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-3xl border-2 mx-auto"
              style={{
                backgroundColor: '#FFFFFF',
                color: '#FF6F20',
                borderColor: '#FF6F20',
                boxShadow: '0 2px 8px rgba(255, 111, 32, 0.12)'
              }}
            >
              {user.profile_image ? (
                <img
                  src={user.profile_image}
                  alt={user.full_name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                user.full_name?.[0] || 'U'
              )}
            </div>
            <div className="absolute -bottom-1 -left-1">
              <input type="file" id="img" accept="image/*" onChange={handleImageUpload} className="hidden" />
              <label htmlFor="img">
                <div className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer" style={{ backgroundColor: '#FF6F20', border: '2px solid white', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}>
                  {uploadingImage ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Camera className="w-4 h-4 text-white" />}
                </div>
              </label>
            </div>
          </div>
          <h2 className="text-xl md:text-2xl font-bold mb-1" style={{ color: '#000000' }}>
            {user.full_name}
          </h2>
          <p className="text-xs" style={{ color: '#7D7D7D' }}>
            מתאמן AthletiGo
          </p>
        </div>

        {/* Tabs - Compact Grid Layout */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="mb-4">
            <div className="grid grid-cols-4 md:grid-cols-8 gap-1.5">
              {[
                { id: "overview", label: "פרטים", icon: User },
                { id: "services", label: "שירותים", icon: Package },
                { id: "attendance", label: "נוכחות", icon: Calendar },
                { id: "metrics", label: "מדדים", icon: TrendingUp },
                { id: "goals", label: "יעדים", icon: Target },
                { id: "achievements", label: "הישגים", icon: Award },
                { id: "plans", label: "תוכניות", icon: FileText },
                { id: "messages", label: "הודעות", icon: MessageSquare },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex flex-col items-center justify-center p-2 rounded-lg transition-all h-full"
                  style={{
                    backgroundColor: activeTab === tab.id ? '#FFF8F3' : '#FFFFFF',
                    color: activeTab === tab.id ? '#FF6F20' : '#7D7D7D',
                    border: activeTab === tab.id ? '1px solid #FF6F20' : '1px solid #E0E0E0'
                  }}
                >
                  <tab.icon className="w-5 h-5 mb-1" />
                  <span className="text-[10px] md:text-xs font-bold leading-tight text-center">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Overview Tab - פרטים אישיים */}
          <TabsContent value="overview" className="space-y-4 w-full">
            <div className="bg-white p-4 rounded-xl" style={{ direction: 'rtl' }}>
              <div className="flex justify-end mb-4">
                <Button
                  onClick={() => setShowEdit(true)}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-full hover:bg-gray-100 text-gray-400 hover:text-[#FF6F20]"
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-3 text-right">
                <div className="flex items-center justify-start gap-2">
                  <span className="text-sm text-gray-400 min-w-[90px]">שם מלא:</span>
                  <span className="text-base font-bold text-gray-800">{user.full_name}</span>
                </div>

                <div className="flex items-center justify-start gap-2">
                  <span className="text-sm text-gray-400 min-w-[90px]">תאריך לידה:</span>
                  <span className="text-base font-bold text-gray-800">
                    {user.birth_date ? format(new Date(user.birth_date), 'dd.MM.yyyy') : "-"}
                  </span>
                </div>

                <div className="flex items-center justify-start gap-2">
                  <span className="text-sm text-gray-400 min-w-[90px]">גיל:</span>
                  <span className="text-base font-bold text-gray-800">{user.age || "-"}</span>
                </div>

                <div className="flex items-center justify-start gap-2">
                  <span className="text-sm text-gray-400 min-w-[90px]">טלפון:</span>
                  <span className="text-base font-bold text-gray-800" dir="ltr">{user.phone || "-"}</span>
                </div>

                <div className="flex items-center justify-start gap-2">
                  <span className="text-sm text-gray-400 min-w-[90px]">אימייל:</span>
                  <span className="text-base font-bold text-gray-800 truncate" dir="ltr">{user.email || "-"}</span>
                </div>

                <div className="flex items-center justify-start gap-2">
                  <span className="text-sm text-gray-400 min-w-[90px]">עיר מגורים:</span>
                  <span className="text-base font-bold text-gray-800">{user.city || "-"}</span>
                </div>

                <div className="flex items-center justify-start gap-2">
                  <span className="text-sm text-gray-400 min-w-[90px]">תאריך הצטרפות:</span>
                  <span className="text-base font-bold text-gray-800">
                    {user.created_date ? format(new Date(user.created_date), 'dd.MM.yyyy') : "-"}
                  </span>
                </div>

                <div className="flex items-center justify-start gap-2">
                  <span className="text-sm text-gray-400 min-w-[90px]">סטטוס לקוח:</span>
                  <span className={`text-base font-bold ${services.some(s => s.status === 'פעיל') ? 'text-green-600' : 'text-gray-500'}`}>
                    {services.some(s => s.status === 'פעיל') ? 'לקוח פעיל' : 'לא פעיל'}
                  </span>
                </div>
              </div>
            </div>

            {/* Health Summary Section */}
            <div className="bg-white p-4 rounded-xl mt-4" style={{ direction: 'rtl' }}>
              <h3 className="text-base font-bold text-gray-900 mb-3 border-b border-gray-100 pb-2">
                מצב רפואי והצהרת בריאות
              </h3>
              <div className="space-y-3 text-right">
                <div className="flex flex-col gap-1">
                  <span className="text-sm text-gray-400">מצב בריאותי כללי:</span>
                  <span className={`text-base font-bold ${
                    !user.health_issues || user.health_issues === "אין" ? "text-green-600" : "text-red-600"
                  }`}>
                    {(!user.health_issues || user.health_issues === "אין") 
                      ? "אין מגבלות בריאותיות / כשיר לפעילות" 
                      : "יש מגבלה / פציעה"}
                  </span>
                </div>

                {user.health_issues && user.health_issues !== "אין" && (
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-gray-400">פירוט מגבלות / פציעות:</span>
                    <span className="text-base font-bold text-gray-800 leading-relaxed">
                      {user.health_issues}
                    </span>
                  </div>
                )}

                {user.health_declaration_accepted && (
                  <div className="flex items-center gap-2 text-xs text-green-600 mt-1">
                    <CheckCircle className="w-3 h-3" />
                    <span>הצהרת בריאות אושרה</span>
                  </div>
                )}

                <button
                  onClick={() => setShowHealthUpdate(true)}
                  className="text-xs text-[#FF6F20] hover:underline font-medium mt-2 inline-block"
                >
                  עדכון הצהרת בריאות
                </button>
              </div>
            </div>

            <div 
              onClick={() => setShowVisionDialog(true)}
              className="p-4 rounded-xl cursor-pointer transition-all hover:shadow-md active:scale-[0.99]" 
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}
            >
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-50">
                <h3 className="text-base font-bold flex items-center gap-2 text-gray-900">
                  <Target className="w-4 h-4 text-[#FF6F20]" />
                  מטרות וחזון
                </h3>
                <Edit2 className="w-3 h-3 text-gray-400" />
              </div>
              
              <div className="space-y-3">
                {user.vision?.mainGoalShort ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-gray-900">🎯 מטרה מרכזית:</span>
                      <p className="text-sm text-gray-600 leading-relaxed">{user.vision.mainGoalShort}</p>
                    </div>
                    
                    {user.vision.longTermVision && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold text-gray-900">🔭 חזון לשנה קדימה:</span>
                        <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">{user.vision.longTermVision}</p>
                      </div>
                    )}

                    {user.vision.keySkills && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold text-gray-900">🏷 מיומנויות נבחרות:</span>
                        <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded-lg">{user.vision.keySkills}</p>
                      </div>
                    )}
                  </>
                ) : (
                  // Fallback/Empty State
                  <div className="text-center py-4 space-y-2">
                    <p className="text-sm text-gray-500">טרם הוגדרו יעדים וחזון מפורט</p>
                    <span className="text-xs text-[#FF6F20] font-bold underline">לחץ כאן להגדרת חזון</span>
                  </div>
                )}
              </div>
            </div>

            {/* Old Health Section Removed as per request to replace/update flow */}
            {user.emergency_contact_name && (
              <div className="p-4 rounded-lg" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
                <h3 className="text-base font-bold mb-3 pb-2 flex items-center gap-2" style={{ color: '#000000', borderBottom: '1px solid #F0F0F0' }}>
                  <Phone className="w-4 h-4" style={{ color: '#FF9800' }} />
                  איש קשר לחירום
                </h3>
                <div className="p-3 rounded-lg" style={{ backgroundColor: '#FFF3E0', border: '1px solid #FF9800' }}>
                  {user.emergency_contact_name && <p className="text-sm mb-1" style={{ color: '#000000' }}><span className="font-bold">שם:</span> {user.emergency_contact_name}</p>}
                  {user.emergency_contact_phone && <p className="text-sm" style={{ color: '#000000' }}><span className="font-bold">טלפון:</span> {user.emergency_contact_phone}</p>}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Goals Tab */}
          <TabsContent value="goals" className="space-y-4 w-full">
            <div className="flex justify-between items-center">
              <h2 className="text-lg md:text-xl font-bold flex items-center gap-2" style={{ color: '#000000' }}>
                <Target className="w-5 h-5" style={{ color: '#FF6F20' }} />
                יעדים
              </h2>
              <Button onClick={() => { setEditingGoal(null); setShowAddGoal(true); }} variant="ghost" className="rounded-lg px-3 py-2 font-medium text-xs" style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}>
                <Plus className="w-3 h-3 ml-1" />
                הוסף יעד
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-3 w-full">
              <div className="p-3 md:p-4 rounded-lg text-center" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
                <Target className="w-5 h-5 mx-auto mb-1" style={{ color: '#FF6F20' }} />
                <p className="text-xl md:text-2xl font-bold mb-0.5" style={{ color: '#000000' }}>{activeGoals.length}</p>
                <p className="text-[10px] md:text-xs" style={{ color: '#7D7D7D' }}>פעילים</p>
              </div>
              <div className="p-3 md:p-4 rounded-lg text-center" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
                <CheckCircle className="w-5 h-5 mx-auto mb-1" style={{ color: '#4CAF50' }} />
                <p className="text-xl md:text-2xl font-bold mb-0.5" style={{ color: '#000000' }}>{completedGoals.length}</p>
                <p className="text-[10px] md:text-xs" style={{ color: '#7D7D7D' }}>הושגו</p>
              </div>
              <div className="p-3 md:p-4 rounded-lg text-center" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0' }}>
                <TrendingUp className="w-5 h-5 mx-auto mb-1" style={{ color: '#7D7D7D' }} />
                <p className="text-xl md:text-2xl font-bold mb-0.5" style={{ color: '#000000' }}>{goals.length}</p>
                <p className="text-[10px] md:text-xs" style={{ color: '#7D7D7D' }}>סה״כ</p>
              </div>
            </div>

            {goals.length === 0 ? (
              <div className="text-center py-8 p-5 rounded-lg" style={{ backgroundColor: '#FAFAFA' }}>
                <Target className="w-10 h-10 mx-auto mb-3" style={{ color: '#E0E0E0' }} />
                <p className="text-base" style={{ color: '#7D7D7D' }}>אין יעדים מוגדרים</p>
              </div>
            ) : (
              <div className="space-y-3 w-full">
                {goals.map(goal => (
                  <div key={goal.id} className="p-4 rounded-lg" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <h4 className="font-bold text-lg mb-2" style={{ color: '#000' }}>{goal.goal_name}</h4>
                        {goal.description && <p className="text-sm mb-2" style={{ color: '#7D7D7D' }}>{goal.description}</p>}
                      </div>
                      <div className="flex gap-1">
                        <Button onClick={() => { setEditingGoal(goal); setShowAddGoal(true); }} size="icon" variant="ghost" className="w-8 h-8 rounded-lg" style={{ color: '#FF6F20' }}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button onClick={() => { if (window.confirm(`למחוק "${goal.goal_name}"?`)) deleteGoalMutation.mutate(goal.id); }} size="icon" variant="ghost" className="w-8 h-8 rounded-lg" style={{ color: '#f44336' }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mb-3">
                      <div className="flex justify-between text-xs mb-2">
                        <span style={{ color: '#7D7D7D' }}>התקדמות</span>
                        <span className="font-bold" style={{ color: '#FF6F20' }}>
                          {goal.current_value || 0} / {goal.target_value} {goal.unit}
                        </span>
                      </div>
                      <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: '#E0E0E0' }}>
                        <div className="h-full transition-all" style={{ width: `${goal.progress_percentage || 0}%`, backgroundColor: '#FF6F20' }} />
                      </div>
                      <p className="text-xs mt-2 text-center font-bold" style={{ color: '#FF6F20' }}>{goal.progress_percentage || 0}% הושלם</p>
                    </div>
                    {goal.target_date && (
                      <p className="text-xs flex items-center gap-1" style={{ color: '#7D7D7D' }}>
                        <Calendar className="w-3 h-3" />
                        יעד: {format(new Date(goal.target_date), 'dd/MM/yy', { locale: he })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Metrics Tab */}
          <TabsContent value="metrics" className="space-y-4 w-full">
            <h2 className="text-lg md:text-xl font-bold flex items-center gap-2" style={{ color: '#000000' }}>
              <TrendingUp className="w-5 h-5" style={{ color: '#FF6F20' }} />
              מדדים פיזיים
            </h2>
            <PhysicalMetricsManager
              trainee={user}
              measurements={measurements}
              results={results}
              coach={isCoach ? currentUser : null}
              goals={goals}
            />
          </TabsContent>

          {/* Achievements Tab */}
          <TabsContent value="achievements" className="space-y-4 w-full">
            <div className="flex justify-between items-center">
              <h2 className="text-lg md:text-xl font-bold flex items-center gap-2" style={{ color: '#000000' }}>
                <Award className="w-5 h-5" style={{ color: '#FFD700' }} />
                הישגים
              </h2>
              <Button onClick={() => { setEditingResult(null); setShowAddResult(true); }} variant="ghost" className="rounded-lg px-3 py-2 font-medium text-xs" style={{ border: '1px solid #FFD700', color: '#000000' }}>
                <Plus className="w-3 h-3 ml-1" />
                הוסף שיא חדש
              </Button>
            </div>

            {results.length === 0 ? (
              <div className="text-center py-8 p-5 rounded-lg" style={{ backgroundColor: '#FAFAFA' }}>
                <Award className="w-10 h-10 mx-auto mb-3" style={{ color: '#E0E0E0' }} />
                <p className="text-base" style={{ color: '#7D7D7D' }}>אין הישגים עדיין</p>
              </div>
            ) : (
              <div className="space-y-4 w-full pb-20">
                {Object.entries(groupedResults).map(([type, typeResults]) => (
                  <AchievementGroup
                    key={type}
                    type={type}
                    results={typeResults}
                    goals={goals}
                    onEdit={(r) => { setEditingResult(r); setShowAddResult(true); }}
                    onDelete={(id) => { if (window.confirm(`למחוק את השיא?`)) deleteResultMutation.mutate(id); }}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Attendance Tab Removed - Merged into Services */}

          {/* Services Tab */}
          <TabsContent value="services" className="space-y-6 w-full">
            <div className="flex justify-between items-center">
                <h2 className="text-lg md:text-xl font-bold flex items-center gap-2" style={{ color: '#000000' }}>
                <Package className="w-5 h-5" style={{ color: '#FF6F20' }} />
                שירותים וחבילות
                </h2>
                {isCoach && (
                    <Button 
                        onClick={() => {
                          setEditingService(null);
                          setServiceForm({ 
                            service_type: "personal", 
                            group_name: "",
                            billing_model: "punch_card",
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
                            payment_status: "ממתין לתשלום",
                            notes_internal: "",
                            status: "active"
                          });
                          setShowAddService(true);
                        }} 
                        variant="ghost" 
                        className="rounded-lg px-3 py-2 font-medium text-xs" 
                        style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}
                    >
                        <Plus className="w-3 h-3 ml-1" />
                        הוסף שירות
                    </Button>
                )}
            </div>

            {/* A. Active Services - Grouped */}
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
                            <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                                {title}
                            </h3>
                            <div className="grid gap-4">
                                {typeServices.map(service => {
                                    const isPunchCard = service.billing_model === 'punch_card' || service.total_sessions > 0;
                                    const remaining = isPunchCard ? service.total_sessions - (service.used_sessions || 0) : null;
                                    const priceDisplay = service.final_price || service.price;
                                    
                                    return (
                                        <div key={service.id} className="bg-white rounded-xl border shadow-sm relative overflow-hidden transition-all" style={{ borderColor: borderColor }}>
                                            {/* Header */}
                                            <div className="p-4 border-b border-gray-50 flex justify-between items-start bg-gray-50/30">
                                                <div>
                                                    <h4 className="font-bold text-lg text-gray-900">
                                                        {service.group_name || service.package_name || (type === 'personal' ? 'חבילה אישית' : 'מנוי')}
                                                    </h4>
                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                        {service.billing_model === 'subscription' ? '📅 מנוי מתחדש' : 
                                                         service.billing_model === 'punch_card' ? '🎫 כרטיסייה' : '⚡ חד פעמי'}
                                                        {service.sessions_per_week ? ` • ${service.sessions_per_week} אימונים בשבוע` : ''}
                                                    </p>
                                                </div>
                                                <div className="text-left">
                                                    <div className="text-lg font-black" style={{ color: borderColor }}>
                                                        ₪{priceDisplay}
                                                        <span className="text-xs font-normal text-gray-400 block">
                                                            {service.billing_model === 'subscription' ? 'לחודש' : 'סה"כ'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="p-4 space-y-4">
                                                {/* Status & Dates */}
                                                <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                                                    <div className="flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded-md">
                                                        <Calendar className="w-3.5 h-3.5" />
                                                        <span>התחלה: {format(new Date(service.start_date), 'dd/MM/yy')}</span>
                                                    </div>
                                                    {service.next_billing_date && (
                                                        <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2 py-1 rounded-md">
                                                            <Calendar className="w-3.5 h-3.5" />
                                                            <span>חיוב הבא: {format(new Date(service.next_billing_date), 'dd/MM/yy')}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded-md">
                                                        <DollarSign className="w-3.5 h-3.5" />
                                                        <span>{service.payment_method === 'credit' ? 'אשראי' : service.payment_method === 'cash' ? 'מזומן' : service.payment_method === 'bit' ? 'ביט' : service.payment_method}</span>
                                                    </div>
                                                </div>

                                                {/* Progress Bar for Punch Cards */}
                                                {isPunchCard && (
                                                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                                        <div className="flex justify-between items-center text-sm mb-2">
                                                            <span className="font-bold text-gray-700">ניצול כרטיסייה</span>
                                                            {editingUsage === service.id ? (
                                                                <div className="flex items-center gap-2 scale-90 origin-left">
                                                                    <Input 
                                                                        type="number" 
                                                                        value={usageValue} 
                                                                        onChange={(e) => setUsageValue(e.target.value)}
                                                                        className="w-16 h-8 text-center bg-white"
                                                                    />
                                                                    <span className="text-gray-500">/ {service.total_sessions}</span>
                                                                    <Button onClick={() => updateServiceUsageMutation.mutate()} size="icon" className="h-8 w-8 bg-green-500 hover:bg-green-600 rounded-full"><CheckCircle className="w-4 h-4" /></Button>
                                                                    <Button onClick={() => setEditingUsage(null)} size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:bg-red-50 rounded-full"><Trash2 className="w-4 h-4" /></Button>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-mono font-bold">{service.used_sessions} / {service.total_sessions}</span>
                                                                    {isCoach && (
                                                                        <Button onClick={() => { setEditingUsage(service.id); setUsageValue(service.used_sessions.toString()); }} variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-[#FF6F20]"><Edit2 className="w-3 h-3" /></Button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                                            <div className="h-full transition-all" style={{ width: `${Math.min(100, (service.used_sessions / service.total_sessions) * 100)}%`, backgroundColor: borderColor }} />
                                                        </div>
                                                        <p className="text-xs text-center mt-1.5 font-bold" style={{ color: borderColor }}>
                                                            נותרו {remaining} אימונים
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Internal Notes (Coach Only) */}
                                                {isCoach && service.notes_internal && (
                                                    <div className="bg-yellow-50 p-2 rounded text-xs text-yellow-800 border border-yellow-100">
                                                        <span className="font-bold">🔒 הערות פנימיות:</span> {service.notes_internal}
                                                    </div>
                                                )}

                                                {/* Actions Footer */}
                                                {isCoach && (
                                                    <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                                                        <Button variant="ghost" size="sm" className="text-xs h-8 hover:bg-gray-50" onClick={() => openEditService(service)}>
                                                            <Edit2 className="w-3 h-3 ml-1.5 text-gray-400" /> ערוך
                                                        </Button>
                                                    </div>
                                                )}
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

            {/* B. Purchase History */}
            <div className="space-y-4 pt-4">
                <h3 className="text-base font-bold text-gray-800 border-b pb-2">היסטוריית רכישות</h3>
                <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-100 border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold text-gray-600">שירות</th>
                                <th className="px-4 py-3 text-right font-bold text-gray-600">תאריך</th>
                                <th className="px-4 py-3 text-right font-bold text-gray-600">מחיר</th>
                                <th className="px-4 py-3 text-right font-bold text-gray-600">סטטוס</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {services.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-4 py-4 text-center text-gray-500 italic">אין היסטוריה</td>
                                </tr>
                            ) : (
                                services.map(service => (
                                    <tr key={service.id} className="bg-white">
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{service.service_type}</div>
                                            <div className="text-xs text-gray-500">{service.package_name}</div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {format(new Date(service.start_date), 'dd/MM/yy')}
                                        </td>
                                        <td className="px-4 py-3 font-medium">₪{service.price}</td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs px-2 py-1 rounded-full ${
                                                service.status === 'הסתיים' ? 'bg-blue-100 text-blue-800' : 
                                                service.status === 'פג תוקף' ? 'bg-red-100 text-red-800' : 
                                                service.status === 'פעיל' ? 'bg-green-100 text-green-800' :
                                                'bg-gray-100 text-gray-800'
                                            }`}>
                                                {service.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
          </TabsContent>

          {/* Attendance Tab */}
          <TabsContent value="attendance" className="space-y-6 w-full">
            <div className="flex justify-between items-center">
                <h2 className="text-lg md:text-xl font-bold flex items-center gap-2" style={{ color: '#000000' }}>
                <Calendar className="w-5 h-5" style={{ color: '#FF6F20' }} />
                יומן נוכחות
                </h2>
                {isCoach && (
                    <Button
                        onClick={() => setShowManualAttendance(true)}
                        variant="ghost"
                        size="sm"
                        className="rounded-lg px-3 py-2 font-medium text-xs"
                        style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}
                    >
                        <Plus className="w-3 h-3 ml-1" />
                        נוכחות ידנית
                    </Button>
                )}
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3 text-right font-bold text-gray-600">תאריך</th>
                                <th className="px-4 py-3 text-right font-bold text-gray-600">סוג</th>
                                <th className="px-4 py-3 text-right font-bold text-gray-600">מיקום</th>
                                <th className="px-4 py-3 text-right font-bold text-gray-600">סטטוס</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {sessions.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-4 py-8 text-center text-gray-500">לא נמצאו אימונים</td>
                                </tr>
                            ) : (
                                sessions.map(session => {
                                    const participant = session.participants?.find(p => p.trainee_id === user.id);
                                    const displayStatus = participant?.attendance_status || 'ממתין';
                                    
                                    return (
                                        <tr key={session.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-gray-800">
                                                    {format(new Date(session.date), 'dd/MM/yy')}
                                                </div>
                                                <div className="text-xs text-gray-500">{session.time}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-xs px-2 py-1 rounded-full border ${
                                                    session.session_type === 'אישי' ? 'bg-purple-50 border-purple-100 text-purple-700' :
                                                    session.session_type === 'קבוצתי' ? 'bg-blue-50 border-blue-100 text-blue-700' :
                                                    'bg-green-50 border-green-100 text-green-700'
                                                }`}>
                                                    {session.session_type}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 text-xs truncate max-w-[100px]">
                                                {session.location}
                                            </td>
                                            <td className="px-4 py-3">
                                                {isCoach ? (
                                                    <Select 
                                                        value={displayStatus} 
                                                        onValueChange={(val) => {
                                                            if (val !== displayStatus) {
                                                                updateSessionStatusMutation.mutate({ session, newStatus: val });
                                                            }
                                                        }}
                                                    >
                                                        <SelectTrigger className="h-8 text-xs w-auto min-w-[90px] border-gray-200">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="הגיע">הגיע</SelectItem>
                                                            <SelectItem value="לא הגיע">לא הגיע</SelectItem>
                                                            <SelectItem value="בוטל">בוטל</SelectItem>
                                                            <SelectItem value="ממתין">ממתין</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                ) : (
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                        displayStatus === 'התקיים' || displayStatus === 'הגיע' ? 'bg-green-100 text-green-800' :
                                                        displayStatus === 'בוטל' || displayStatus?.includes('בוטל') ? 'bg-red-100 text-red-800' :
                                                        displayStatus === 'לא הגיע' ? 'bg-orange-100 text-orange-800' :
                                                        'bg-yellow-100 text-yellow-800'
                                                    }`}>
                                                        {displayStatus === 'attended' ? 'הגיע' :
                                                         displayStatus === 'noshow' ? 'לא הגיע' :
                                                         displayStatus === 'cancelled' ? 'בוטל' :
                                                         displayStatus === 'confirmed' ? 'מאושר' :
                                                         displayStatus}
                                                    </span>
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
                <h2 className="text-lg md:text-xl font-bold flex items-center gap-2" style={{ color: '#000000' }}>
                <FileText className="w-5 h-5" style={{ color: '#FF6F20' }} />
                תוכניות אימון
                </h2>
                {isCoach && (
                    <Button 
                        onClick={() => navigate(createPageUrl(`TrainingPlans?create=true`))} 
                        variant="ghost" 
                        className="rounded-lg px-3 py-2 font-medium text-xs" 
                        style={{ border: '1px solid #FF6F20', color: '#FF6F20' }}
                    >
                        <Plus className="w-3 h-3 ml-1" />
                        צור תוכנית
                    </Button>
                )}
            </div>
            {trainingPlans.length === 0 ? (
              <div className="text-center py-8 p-5 rounded-lg" style={{ backgroundColor: '#FAFAFA' }}>
                <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: '#E0E0E0' }} />
                <p className="text-base" style={{ color: '#7D7D7D' }}>אין תוכניות אימון</p>
              </div>
            ) : (
              <div className="space-y-8 w-full">
                {/* Coach Plans */}
                {trainingPlans.filter(p => p.created_by !== user?.id).length > 0 && (
                    <div className="p-4 rounded-xl bg-orange-50 border border-orange-100">
                        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#FF6F20]"></span>
                            תוכניות מהמאמן
                        </h3>
                        <div className="space-y-3">
                            {trainingPlans.filter(p => p.created_by !== user?.id).map(plan => {
                                const progress = getPlanProgress(plan);
                                return (
                                    <div 
                                        key={plan.id} 
                                        onClick={() => isCoach && navigate(createPageUrl("TrainingPlans") + `?planId=${plan.id}`)}
                                        className="p-4 rounded-xl bg-white border border-gray-200 hover:shadow-md transition-all cursor-pointer group"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-base group-hover:text-[#FF6F20] transition-colors">{plan.plan_name}</h4>
                                            {isCoach && (
                                                <Button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(createPageUrl("TrainingPlans") + `?planId=${plan.id}`);
                                                    }} 
                                                    size="sm" 
                                                    variant="outline" 
                                                    className="h-7 text-xs"
                                                >
                                                    פתח
                                                </Button>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                                            <span>{plan.goal_focus}</span>
                                            <span>{progress.completed}/{progress.total} תרגילים</span>
                                        </div>
                                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-[#FF6F20] transition-all duration-500"
                                                style={{ width: `${progress.percent}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Self Created Plans */}
                {trainingPlans.filter(p => p.created_by === user?.id).length > 0 && (
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                            תוכניות עצמאיות
                        </h3>
                        <div className="space-y-3">
                            {trainingPlans.filter(p => p.created_by === user?.id).map(plan => {
                                const progress = getPlanProgress(plan);
                                return (
                                    <div 
                                        key={plan.id} 
                                        onClick={() => isCoach && navigate(createPageUrl("TrainingPlans") + `?planId=${plan.id}`)}
                                        className="p-4 rounded-xl bg-white border border-gray-200 hover:shadow-md transition-all cursor-pointer group"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-base group-hover:text-gray-700 transition-colors">{plan.plan_name}</h4>
                                            {isCoach && (
                                                <Button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(createPageUrl("TrainingPlans") + `?planId=${plan.id}`);
                                                    }} 
                                                    size="sm" 
                                                    variant="outline" 
                                                    className="h-7 text-xs"
                                                >
                                                    פתח
                                                </Button>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                                            <span>{plan.goal_focus}</span>
                                            <span>{progress.completed}/{progress.total} תרגילים</span>
                                        </div>
                                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-gray-500 transition-all duration-500"
                                                style={{ width: `${progress.percent}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Workout History List */}
                {workoutHistory.length > 0 && (
                    <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#2196F3]"></span>
                            היסטוריית אימונים
                        </h3>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {workoutHistory.map((entry) => (
                                <div key={entry.id} className="bg-white p-3 rounded-xl border border-blue-100 shadow-sm flex justify-between items-center">
                                    <div>
                                        <h4 className="font-bold text-sm text-blue-900">{entry.planName || "אימון"}</h4>
                                        <span className="text-xs text-gray-500">{new Date(entry.date).toLocaleDateString('he-IL')}</span>
                                    </div>
                                    <div className="text-left text-xs">
                                        <div className="font-bold text-green-600">שליטה: {entry.mastery_avg}</div>
                                        <div className="font-bold text-orange-600">קושי: {entry.difficulty_avg}</div>
                                    </div>
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
            <h2 className="text-lg md:text-xl font-bold flex items-center gap-2 mb-4" style={{ color: '#000000' }}>
              <MessageSquare className="w-5 h-5" style={{ color: '#9C27B0' }} />
              שיחה עם המאמן
            </h2>
            {user && coach ? (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E0E0E0', backgroundColor: '#FFFFFF' }}>
                <MessageCenter
                  currentUserId={user.id}
                  currentUserName={user.full_name}
                  otherUserId={coach.id}
                  otherUserName={coach.full_name}
                  relatedUserId={user.id}
                />
              </div>
            ) : (
              <div className="text-center py-8 p-5 rounded-lg" style={{ backgroundColor: '#FAFAFA' }}>
                <MessageSquare className="w-10 h-10 mx-auto mb-3" style={{ color: '#E0E0E0' }} />
                <p className="text-base" style={{ color: '#7D7D7D' }}>לא נמצא מאמן</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="w-[95vw] md:w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFFFFF', WebkitOverflowScrolling: 'touch' }}>
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl font-bold" style={{ color: '#000' }}>ערוך פרטים</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label className="text-sm">טלפון</Label><Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="rounded-lg" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-sm">תאריך לידה</Label><Input type="date" value={formData.birth_date} onChange={(e) => {
                const newBirthDate = e.target.value;
                let calculatedAge = "";
                if (newBirthDate) {
                  try {
                    const birthDate = new Date(newBirthDate);
                    const today = new Date();
                    calculatedAge = Math.floor((today.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)).toString();
                  } catch (error) {
                    console.error("Error calculating age:", error);
                  }
                }
                setFormData({ ...formData, birth_date: newBirthDate, age: calculatedAge });
              }} max={new Date().toISOString().split('T')[0]} className="rounded-lg" /></div>
              <div><Label className="text-sm">גיל</Label><Input value={formData.age} disabled placeholder="מחושב אוטומטית" className="rounded-lg bg-gray-50" /></div>
            </div>
            <div><Label className="text-sm">מגדר</Label>
              <Select value={formData.gender} onValueChange={(value) => setFormData({ ...formData, gender: value })}>
                <SelectTrigger className="rounded-lg"><SelectValue placeholder="בחר מגדר" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="זכר">זכר</SelectItem>
                  <SelectItem value="נקבה">נקבה</SelectItem>
                  <SelectItem value="אחר">אחר</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isCoach && (
                <div>
                    <Label className="text-sm font-bold text-[#FF6F20]">שם מלא (עריכת מאמן)</Label>
                    <Input value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} className="rounded-lg border-orange-200" />
                </div>
            )}
            <div><Label className="text-sm">כתובת</Label><Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="rounded-lg" /></div>
            <div><Label className="text-sm">עיר</Label><Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="rounded-lg" /></div>
            <div><Label className="text-sm">מטרה ראשית</Label><Textarea value={formData.main_goal} onChange={(e) => setFormData({ ...formData, main_goal: e.target.value })} className="rounded-lg min-h-[80px]" /></div>
            <div><Label className="text-sm">סטטוס נוכחי</Label><Textarea value={formData.current_status} onChange={(e) => setFormData({ ...formData, current_status: e.target.value })} className="rounded-lg min-h-[80px]" /></div>
            <div><Label className="text-sm">חזון עתידי</Label><Textarea value={formData.future_vision} onChange={(e) => setFormData({ ...formData, future_vision: e.target.value })} className="rounded-lg min-h-[80px]" /></div>
            {/* Removed old health issues field from general edit to avoid confusion with new flow */}
            <div><Label className="text-sm">שם איש קשר לחירום</Label><Input value={formData.emergency_contact_name} onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })} className="rounded-lg" /></div>
            <div><Label className="text-sm">טלפון איש קשר</Label><Input value={formData.emergency_contact_phone} onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })} className="rounded-lg" /></div>
            <Button onClick={handleSave} disabled={updateUserMutation.isPending || updateTargetUserMutation.isPending} className="w-full rounded-lg py-5 font-bold text-white" style={{ backgroundColor: '#FF6F20' }}>
              {updateUserMutation.isPending || updateTargetUserMutation.isPending ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר...</> : <>שמור שינויים</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Health Update Dialog */}
      <Dialog open={showHealthUpdate} onOpenChange={setShowHealthUpdate}>
        <DialogContent className="w-[95vw] md:w-full max-w-lg p-6 rounded-2xl" style={{ backgroundColor: '#FFFFFF', direction: 'rtl' }}>
          <DialogHeader className="mb-4">
            <DialogTitle className="text-lg font-bold text-right">עדכון הצהרת בריאות</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-right block font-bold text-sm">מצב בריאותי כללי</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setHealthForm({ ...healthForm, has_limitations: false, health_issues: "אין" })}
                  className={`p-3 rounded-xl border-2 font-bold text-xs transition-all ${
                    !healthForm.has_limitations
                      ? "border-[#4CAF50] bg-green-50 text-[#2E7D32]"
                      : "border-gray-100 bg-white text-gray-500 hover:border-gray-200"
                  }`}
                >
                  אין מגבלות בריאותיות
                </button>
                <button
                  onClick={() => setHealthForm({ ...healthForm, has_limitations: true, health_issues: "" })}
                  className={`p-3 rounded-xl border-2 font-bold text-xs transition-all ${
                    healthForm.has_limitations
                      ? "border-[#f44336] bg-red-50 text-[#c62828]"
                      : "border-gray-100 bg-white text-gray-500 hover:border-gray-200"
                  }`}
                >
                  יש מגבלה / פציעה
                </button>
              </div>
            </div>

            {healthForm.has_limitations && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <Label className="text-right block font-bold text-xs text-[#c62828]">פרטי המגבלה / הפציעה *</Label>
                <Textarea
                  value={healthForm.health_issues}
                  onChange={(e) => setHealthForm({ ...healthForm, health_issues: e.target.value })}
                  className="bg-white border-red-100 focus:border-red-300 min-h-[80px] text-right resize-none text-sm"
                  placeholder="אנא פרט/י כאן..."
                />
              </div>
            )}

            <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <Checkbox 
                id="health-confirm" 
                checked={healthForm.approved}
                onCheckedChange={(checked) => setHealthForm({ ...healthForm, approved: checked })}
                className="mt-0.5 data-[state=checked]:bg-[#FF6F20] data-[state=checked]:border-[#FF6F20]"
              />
              <label htmlFor="health-confirm" className="text-xs text-gray-600 leading-relaxed cursor-pointer select-none">
                אני מאשר/ת שהמידע שמסרתי מדויק, ומבין/ה את הסיכונים הכרוכים בפעילות גופנית.
              </label>
            </div>

            <Button 
              onClick={handleHealthUpdate} 
              disabled={updateHealthMutation.isPending} 
              className="w-full rounded-xl py-6 font-bold text-white shadow-md" 
              style={{ backgroundColor: '#FF6F20' }}
            >
              {updateHealthMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "שמור הצהרת בריאות"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vision Form Dialog */}
      <VisionFormDialog
        isOpen={showVisionDialog}
        onClose={() => setShowVisionDialog(false)}
        initialData={user?.vision || {}}
        onSubmit={(data) => updateVisionMutation.mutate(data)}
        isCoach={isCoach}
        isLoading={updateVisionMutation.isPending}
      />

      {/* Goal Form Dialog (Create/Edit) */}
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

      {/* Result Form Dialog */}
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

      {/* Add/Edit Service Dialog */}
      <Dialog open={showAddService} onOpenChange={setShowAddService}>
        <DialogContent className="w-[95vw] md:w-full max-w-md max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFF', WebkitOverflowScrolling: 'touch' }}>
          <DialogHeader><DialogTitle className="text-lg font-bold">{editingService ? 'ערוך שירות' : 'הוסף שירות'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Service Type & Model */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label className="text-xs mb-1 block">סוג שירות</Label>
                    <Select value={serviceForm.service_type} onValueChange={(value) => setServiceForm({ ...serviceForm, service_type: value })}>
                        <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="personal">🏋️‍♂️ אישי</SelectItem>
                            <SelectItem value="group">👥 קבוצתי</SelectItem>
                            <SelectItem value="online">💻 אונליין</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Label className="text-xs mb-1 block">מודל חיוב</Label>
                    <Select value={serviceForm.billing_model} onValueChange={(value) => setServiceForm({ ...serviceForm, billing_model: value })}>
                        <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="punch_card">🎫 כרטיסייה</SelectItem>
                            <SelectItem value="subscription">📅 מנוי</SelectItem>
                            <SelectItem value="single">⚡ חד פעמי</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Group Name (Conditional) */}
            {serviceForm.service_type === 'group' && (
                <div>
                    <Label className="text-xs mb-1 block">שם הקבוצה</Label>
                    <Input 
                        value={serviceForm.group_name} 
                        onChange={(e) => setServiceForm({ ...serviceForm, group_name: e.target.value })} 
                        placeholder="למשל: קבוצת בוקר" 
                        className="rounded-xl" 
                    />
                </div>
            )}

            {/* Sessions Details */}
            <div className="grid grid-cols-2 gap-3">
                {serviceForm.billing_model === 'punch_card' && (
                    <div>
                        <Label className="text-xs mb-1 block">כמות אימונים</Label>
                        <Input 
                            type="number" 
                            value={serviceForm.total_sessions} 
                            onChange={(e) => setServiceForm({ ...serviceForm, total_sessions: e.target.value })} 
                            placeholder="10" 
                            className="rounded-xl" 
                        />
                    </div>
                )}
                {serviceForm.billing_model === 'subscription' && (
                    <div>
                        <Label className="text-xs mb-1 block">אימונים בשבוע</Label>
                        <Input 
                            type="number" 
                            value={serviceForm.sessions_per_week} 
                            onChange={(e) => setServiceForm({ ...serviceForm, sessions_per_week: e.target.value })} 
                            placeholder="2" 
                            className="rounded-xl" 
                        />
                    </div>
                )}
                <div>
                    <Label className="text-xs mb-1 block">שם חבילה (לתצוגה)</Label>
                    <Input 
                        value={serviceForm.package_name} 
                        onChange={(e) => setServiceForm({ ...serviceForm, package_name: e.target.value })} 
                        placeholder='למשל "מנוי זהב"' 
                        className="rounded-xl" 
                    />
                </div>
            </div>

            {/* Pricing */}
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                <h4 className="text-xs font-bold text-gray-500">פרטי תשלום</h4>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <Label className="text-xs mb-1 block">מחיר בסיס</Label>
                        <Input 
                            type="number" 
                            value={serviceForm.base_price} 
                            onChange={(e) => {
                                const base = parseFloat(e.target.value) || 0;
                                let final = base;
                                if (serviceForm.discount_type === 'percent') final = base * (1 - (serviceForm.discount_value / 100));
                                if (serviceForm.discount_type === 'fixed') final = base - serviceForm.discount_value;
                                setServiceForm({ ...serviceForm, base_price: e.target.value, final_price: Math.max(0, final).toFixed(0) });
                            }} 
                            className="rounded-xl bg-white" 
                        />
                    </div>
                    <div>
                        <Label className="text-xs mb-1 block">מחיר סופי לתשלום</Label>
                        <Input 
                            type="number" 
                            value={serviceForm.final_price} 
                            onChange={(e) => setServiceForm({ ...serviceForm, final_price: e.target.value })} 
                            className="rounded-xl bg-white border-[#FF6F20] text-[#FF6F20] font-bold" 
                        />
                    </div>
                </div>
                
                <div className="flex gap-3 items-end">
                    <div className="flex-1">
                        <Label className="text-xs mb-1 block">סוג הנחה</Label>
                        <Select value={serviceForm.discount_type} onValueChange={(value) => setServiceForm({ ...serviceForm, discount_type: value })}>
                            <SelectTrigger className="rounded-xl h-9 text-xs bg-white"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">ללא</SelectItem>
                                <SelectItem value="percent">% אחוז</SelectItem>
                                <SelectItem value="fixed">₪ סכום</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {serviceForm.discount_type !== 'none' && (
                        <div className="flex-1">
                            <Label className="text-xs mb-1 block">ערך הנחה</Label>
                            <Input 
                                type="number" 
                                value={serviceForm.discount_value} 
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    const base = parseFloat(serviceForm.base_price) || 0;
                                    let final = base;
                                    if (serviceForm.discount_type === 'percent') final = base * (1 - (val / 100));
                                    if (serviceForm.discount_type === 'fixed') final = base - val;
                                    setServiceForm({ ...serviceForm, discount_value: e.target.value, final_price: Math.max(0, final).toFixed(0) });
                                }}
                                className="rounded-xl h-9 bg-white" 
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Dates & Payment Method */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label className="text-xs mb-1 block">תאריך התחלה</Label>
                    <Input type="date" value={serviceForm.start_date} onChange={(e) => setServiceForm({ ...serviceForm, start_date: e.target.value })} className="rounded-xl" />
                </div>
                {serviceForm.billing_model === 'subscription' && (
                    <div>
                        <Label className="text-xs mb-1 block">תאריך חיוב הבא</Label>
                        <Input type="date" value={serviceForm.next_billing_date} onChange={(e) => setServiceForm({ ...serviceForm, next_billing_date: e.target.value })} className="rounded-xl" />
                    </div>
                )}
                <div>
                    <Label className="text-xs mb-1 block">אמצעי תשלום</Label>
                    <Select value={serviceForm.payment_method} onValueChange={(value) => setServiceForm({ ...serviceForm, payment_method: value })}>
                        <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="credit">💳 אשראי</SelectItem>
                            <SelectItem value="standing_order">🔄 הוראת קבע</SelectItem>
                            <SelectItem value="bit">📱 ביט/פייבוקס</SelectItem>
                            <SelectItem value="cash">💵 מזומן</SelectItem>
                            <SelectItem value="transfer">🏦 העברה</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Label className="text-xs mb-1 block">סטטוס</Label>
                    <Select value={serviceForm.status} onValueChange={(value) => setServiceForm({ ...serviceForm, status: value })}>
                        <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="active">פעיל</SelectItem>
                            <SelectItem value="frozen">מושהה</SelectItem>
                            <SelectItem value="ended">הסתיים</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Internal Notes */}
            <div>
                <Label className="text-xs mb-1 block text-gray-500">🔒 הערות פנימיות (למאמן בלבד)</Label>
                <Textarea 
                    value={serviceForm.notes_internal} 
                    onChange={(e) => setServiceForm({ ...serviceForm, notes_internal: e.target.value })} 
                    className="rounded-xl min-h-[60px] bg-yellow-50 border-yellow-100"
                    placeholder="סיכומים, תנאים מיוחדים וכו'..."
                />
            </div>

            <Button onClick={handleAddOrUpdateService} disabled={createServiceMutation.isPending || updateServiceMutation.isPending} className="w-full rounded-xl py-4 font-bold text-white" style={{ backgroundColor: '#FF6F20' }}>
              {createServiceMutation.isPending || updateServiceMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />שומר...</> : (editingService ? 'עדכן שירות' : 'הוסף שירות')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Attendance Dialog */}
      <Dialog open={showManualAttendance} onOpenChange={setShowManualAttendance}>
        <DialogContent className="w-[95vw] md:w-full max-w-md max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#FFF' }}>
            <DialogHeader><DialogTitle className="text-lg font-bold">הוסף נוכחות ידנית</DialogTitle></DialogHeader>
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <Label>תאריך</Label>
                        <Input type="date" value={manualAttendanceForm.date} onChange={(e) => setManualAttendanceForm({...manualAttendanceForm, date: e.target.value})} className="rounded-xl" />
                    </div>
                    <div>
                        <Label>שעה</Label>
                        <Input type="time" value={manualAttendanceForm.time} onChange={(e) => setManualAttendanceForm({...manualAttendanceForm, time: e.target.value})} className="rounded-xl" />
                    </div>
                </div>
                <div>
                    <Label>סוג אימון</Label>
                    <Select value={manualAttendanceForm.session_type} onValueChange={(value) => setManualAttendanceForm({...manualAttendanceForm, session_type: value})}>
                        <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="אישי">אישי</SelectItem>
                            <SelectItem value="קבוצתי">קבוצתי</SelectItem>
                            <SelectItem value="אונליין">אונליין</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Label>הערות</Label>
                    <Input value={manualAttendanceForm.notes} onChange={(e) => setManualAttendanceForm({...manualAttendanceForm, notes: e.target.value})} placeholder="הערות למאמן" className="rounded-xl" />
                </div>
                <Button onClick={handleManualAttendanceSubmit} className="w-full rounded-xl py-4 font-bold text-white" style={{ backgroundColor: '#FF6F20' }}>
                    שמור נוכחות
                </Button>
            </div>
        </DialogContent>
      </Dialog>

      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t z-50 shadow-lg" style={{ borderColor: '#E6E6E6', boxShadow: '0 -2px 10px rgba(0,0,0,0.08)' }}>
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex justify-around items-center">
            <Link to={createPageUrl("TraineeHome")} className="flex flex-col items-center gap-1">
              <Home className="w-5 h-5" style={{ color: '#7D7D7D' }} />
              <span className="text-xs font-medium" style={{ color: '#7D7D7D' }}>דף הבית</span>
            </Link>
            <Link to={createPageUrl("MyPlan")} className="flex flex-col items-center gap-1">
              <Dumbbell className="w-5 h-5" style={{ color: '#7D7D7D' }} />
              <span className="text-xs font-medium" style={{ color: '#7D7D7D' }}>התוכנית שלי</span>
            </Link>

            <Link to={createPageUrl("Progress")} className="flex flex-col items-center gap-1">
              <TrendingUp className="w-5 h-5" style={{ color: '#7D7D7D' }} />
              <span className="text-xs font-medium" style={{ color: '#7D7D7D' }}>התקדמות</span>
            </Link>
            <Link to={createPageUrl("TraineeProfile")} className="flex flex-col items-center gap-1">
              <User className="w-5 h-5" style={{ color: '#FF6F20' }} />
              <span className="text-xs font-bold" style={{ color: '#FF6F20' }}>פרופיל</span>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}