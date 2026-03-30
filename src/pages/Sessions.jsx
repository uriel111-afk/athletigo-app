import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query"; // Keep useQuery for local non-shared queries if any
import { useSessionStats } from "../components/hooks/useSessionStats";
import { QUERY_KEYS } from "@/components/utils/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Clock, MapPin, Plus, Edit2, Trash2, AlertTriangle, Loader2, Search, ChevronDown, ChevronUp, UserPlus } from "lucide-react";
import { format, isToday, isTomorrow, isPast, isFuture } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import SessionFormDialog from "../components/forms/SessionFormDialog";
import { notifySessionScheduled } from "@/functions/notificationTriggers";

export default function Sessions() {
  const [showSessionDialog, setShowSessionDialog] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [deletingSession, setDeletingSession] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  const searchParams = new URLSearchParams(window.location.search);
  const [filterType, setFilterType] = useState(searchParams.get('type') || "all");
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || "all");
  
  const [expandedSessions, setExpandedSessions] = useState({});
  const [addingParticipantsTo, setAddingParticipantsTo] = useState(null);

  const queryClient = useQueryClient();

  const { sessions, isLoading, todaySessionsCount } = useSessionStats();

  const { data: trainees = [] } = useQuery({
    queryKey: ['trainees-list'],
    queryFn: async () => {
      try {
        // Fetch with limit to prevent data loss and filter in memory for safety
        const allUsers = await base44.entities.User.list('-created_date', 1000);
        return allUsers.filter((u) =>
        !u.account_deleted &&
        u.role !== 'admin' &&
        u.user_role !== 'coach' && (
        u.role === 'user' || u.role === 'trainee')
        );
      } catch (error) {
        console.error("[Sessions] Error loading trainees:", error);
        return [];
      }
    },
    initialData: [],
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
    retry: 2
  });

  const { data: coach, isLoading: coachLoading } = useQuery({
    queryKey: ['current-coach'],
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch (error) {
        console.error("[Sessions] Error loading coach:", error);
        return null;
      }
    },
    retry: 2
  });

  const createSessionMutation = useMutation({
    mutationFn: (sessionData) => base44.entities.Session.create(sessionData),
    onSuccess: async (createdSession) => {
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setShowSessionDialog(false);
      setEditingSession(null);
      toast.success("✅ המפגש נוצר בהצלחה");

      // Notify participants
      if (createdSession?.participants && coach) {
        for (const participant of createdSession.participants) {
          await notifySessionScheduled({
            traineeId: participant.trainee_id,
            sessionDate: createdSession.date,
            sessionTime: createdSession.time,
            sessionType: createdSession.session_type,
            coachName: coach.full_name
          });
        }
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
    },
    onError: (error) => {
      console.error("[Sessions] Create error:", error);
      toast.error("❌ שגיאה ביצירת המפגש. אנא נסה שוב.");
    }
  });

  const updateSessionMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Session.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setShowSessionDialog(false);
      setEditingSession(null);
      setAddingParticipantsTo(null);
      toast.success("✅ המפגש עודכן בהצלחה");
    },
    onError: (error) => {
      console.error("[Sessions] Update error:", error);
      toast.error("❌ שגיאה בעדכון המפגש");
    }
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId) => base44.entities.Session.delete(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setShowDeleteDialog(false);
      setDeletingSession(null);
      toast.success("✅ המפגש נמחק בהצלחה");
    },
    onError: (error) => {
      console.error("[Sessions] Delete error:", error);
      toast.error("❌ שגיאה במחיקת המפגש");
    }
  });

  const handleSessionSubmit = async (sessionData) => {
    if (!coach || !coach.id) {
      toast.error("שגיאה: לא ניתן לטעון את פרטי המאמן. אנא רענן את הדף.");
      return;
    }

    const fullSessionData = {
      ...sessionData,
      location: sessionData.location || "לא צוין",
      duration: sessionData.duration || 60,
      coach_id: coach.id,
      coach_name: coach.full_name || "המאמן",
      status: 'ממתין לאישור'
    };

    if (editingSession) {
      await updateSessionMutation.mutateAsync({
        id: editingSession.id,
        data: sessionData
      });
    } else {
      await createSessionMutation.mutateAsync(fullSessionData);
    }
  };

  const handleDeleteSession = async () => {
    if (!deletingSession) return;
    await deleteSessionMutation.mutateAsync(deletingSession.id);
  };

  const handleSessionStatusChange = async (session, newStatus) => {
    // 1. Update session status
    await updateSessionMutation.mutateAsync({
      id: session.id,
      data: {
        status: newStatus,
        status_updated_at: new Date().toISOString(),
        status_updated_by: coach?.id
      }
    });

    // 2. Handle Automatic Logic (Deduction / Restoration)
    // If new status implies the session HAPPENED (Attended)
    if (newStatus === 'התקיים') {
      for (const participant of session.participants || []) {
        // Skip if already marked as attended to avoid double deduction
        if (participant.attendance_status === 'הגיע' || participant.attendance_status === 'attended') continue;

        await logAttendanceForParticipant(participant.trainee_id, session, 'attended');

        // Deduct credit ONLY if Personal Training
        // Mapping: Session Type "אישי" -> Service Type "אימונים אישיים"
        if (session.session_type === 'אישי') {
          try {
            const activeServices = await base44.entities.ClientService.filter({ trainee_id: participant.trainee_id, status: 'פעיל' });
            // Robust matching for service type
            const personalService = activeServices.find((s) => 
                s.service_type === 'אימונים אישיים' || 
                s.service_type.includes('אישי')
            );

            if (personalService) {
              await base44.entities.ClientService.update(personalService.id, {
                used_sessions: (personalService.used_sessions || 0) + 1
              });
            }
          } catch (error) {
            console.error("Error deducting session for mass update", error);
          }
        }
      }
      toast.success("✅ נוכחות נרשמה ויתרות עודכנו");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SERVICES });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    }
    // If status changed FROM 'התקיים' TO something else (Cancelled/No Show), we might need to RESTORE
    else if (session.status === 'התקיים' && newStatus !== 'התקיים') {
      for (const participant of session.participants || []) {
        // Only restore if they were marked as Attended
        if (participant.attendance_status === 'הגיע' || participant.attendance_status === 'attended') {
          if (session.session_type === 'אישי') {
            try {
              const activeServices = await base44.entities.ClientService.filter({ trainee_id: participant.trainee_id, status: 'פעיל' });
              const personalService = activeServices.find((s) => 
                  s.service_type === 'אימונים אישיים' || 
                  s.service_type.includes('אישי')
              );

              if (personalService) {
                await base44.entities.ClientService.update(personalService.id, {
                  used_sessions: Math.max(0, (personalService.used_sessions || 0) - 1)
                });
              }
            } catch (error) {
              console.error("Error restoring session for mass update", error);
            }
          }
        }
      }
      toast.success("✅ סטטוס עודכן וזיכויים הוחזרו (במידת הצורך)");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SERVICES });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    }
  };

  const handleEditSession = (session) => {
    setEditingSession(session);
    setShowSessionDialog(true);
  };

  const handleAddParticipantsToSession = (session) => {
    setAddingParticipantsTo(session);
    setEditingSession(session);
    setShowSessionDialog(true);
  };



  // Helper to fetch user details and log attendance
  const logAttendanceForParticipant = async (participantId, session, status, notes = "") => {
    try {
      let userDetails = null;
      // Try to find in trainees list first (cache)
      userDetails = trainees.find((t) => t.id === participantId);

      // If not found, fetch from User or Lead
      if (!userDetails) {
        try {
          const users = await base44.entities.User.filter({ id: participantId });
          if (users.length > 0) userDetails = users[0];else
          {
            const leads = await base44.entities.Lead.filter({ id: participantId });
            if (leads.length > 0) userDetails = leads[0];
          }
        } catch (e) {console.error("Error fetching user for log", e);}
      }

      if (userDetails) {
        await base44.entities.AttendanceLog.create({
          userId: participantId,
          fullName: userDetails.full_name,
          dob: userDetails.birth_date ? new Date(userDetails.birth_date).toISOString().split('T')[0] : null,
          age: userDetails.age || 0,
          parentName: userDetails.parent_name || null,
          serviceType: session.session_type,
          sessionId: session.id,
          location: session.location,
          time: session.time,
          date: session.date,
          trainerId: coach?.id,
          status: status,
          notes: notes,
          isTemp: !!userDetails.parent_name // Heuristic or we can check source
        });
      }
    } catch (err) {
      console.error("Error creating attendance log", err);
    }
  };

  const updateParticipantAttendance = async (session, traineeId, newStatus) => {
    const participant = session.participants.find((p) => p.trainee_id === traineeId);
    const oldStatus = participant?.attendance_status;

    const updatedParticipants = session.participants.map((p) =>
    p.trainee_id === traineeId ? {
      ...p,
      attendance_status: newStatus,
      updated_at: new Date().toISOString()
    } : p
    );

    await updateSessionMutation.mutateAsync({
      id: session.id,
      data: { participants: updatedParticipants }
    });

    // ATTENDANCE LOGIC:
    // 1. Create Log if attended
    if (newStatus === 'הגיע' || newStatus === 'attended') {
      await logAttendanceForParticipant(traineeId, session, 'attended');
    }

    // 2. Handle Package Deduction/Restoration
    const isPersonalTraining = session.session_type === 'אישי';

    if (isPersonalTraining) {
      const wasAttended = oldStatus === 'הגיע' || oldStatus === 'attended';
      const isNowAttended = newStatus === 'הגיע' || newStatus === 'attended';

      if (wasAttended !== isNowAttended) {
        try {
          const activeServices = await base44.entities.ClientService.filter({ trainee_id: traineeId, status: 'פעיל' });
          const personalService = activeServices.find((s) => 
              s.service_type === 'אימונים אישיים' || 
              s.service_type.includes('אישי')
          );

          if (personalService) {
            const change = isNowAttended ? 1 : -1;
            const newUsedCount = Math.max(0, (personalService.used_sessions || 0) + change);

            await base44.entities.ClientService.update(personalService.id, {
              used_sessions: newUsedCount
            });

            if (isNowAttended) toast.success("✅ אימון ירד מהחבילה");else
            toast.success("✅ אימון הוחזר לחבילה");

            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SERVICES });
            queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
          }
        } catch (error) {
          console.error("Error updating package usage", error);
        }
      }
    }
  };

  const toggleSessionExpanded = (sessionId) => {
    setExpandedSessions((prev) => ({
      ...prev,
      [sessionId]: !prev[sessionId]
    }));
  };

  const filteredSessions = sessions.filter((session) => {
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
      session.location?.toLowerCase().includes(searchLower) ||
      session.participants?.some((p) => p.trainee_name?.toLowerCase().includes(searchLower)) ||
      session.coach_notes?.toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;
    }

    if (filterType !== "all") {
        // Handle "Group" mapping if needed, or partial match
        if (filterType === 'קבוצתי' && (session.session_type === 'קבוצתי' || session.session_type === 'קבוצה')) return true;
        if (session.session_type !== filterType) return false;
    }

    if (filterStatus !== "all") {
      if (filterStatus === "upcoming") {
        try {
          const sessionDate = new Date(session.date + 'T' + session.time);
          return sessionDate >= new Date() && !['התקיים', 'לא הגיע', 'בוטל על ידי מאמן', 'בוטל על ידי מתאמן'].includes(session.status);
        } catch {
          return false;
        }
      } else if (filterStatus === "completed") {
        return session.status === 'התקיים';
      } else if (filterStatus === "cancelled") {
        return ['בוטל על ידי מאמן', 'בוטל על ידי מתאמן'].includes(session.status);
      }
    }

    return true;
  });

  const todaySessions = filteredSessions.filter((s) => {
    try {
      return s.date && isToday(new Date(s.date)) && !['התקיים', 'לא הגיע', 'בוטל על ידי מאמן', 'בוטל על ידי מתאמן'].includes(s.status);
    } catch {
      return false;
    }
  });

  // Verify synchronization with hook (debug only)
  console.log("Page_SessionsTodayCount", todaySessions.length);
  console.log("Hook_SessionsTodayCount", todaySessionsCount);

  const tomorrowSessions = filteredSessions.filter((s) => {
    try {
      return s.date && isTomorrow(new Date(s.date)) && !['התקיים', 'לא הגיע', 'בוטל על ידי מאמן', 'בוטל על ידי מתאמן'].includes(s.status);
    } catch {
      return false;
    }
  });

  const upcomingSessions = filteredSessions.filter((s) => {
    try {
      if (!s.date) return false;
      const sessionDate = new Date(s.date);
      return isFuture(sessionDate) && !isToday(sessionDate) && !isTomorrow(sessionDate) && !['התקיים', 'לא הגיע', 'בוטל על ידי מאמן', 'בוטל על ידי מתאמן'].includes(s.status);
    } catch {
      return false;
    }
  });

  const completedSessions = filteredSessions.filter((s) => s.status === 'התקיים');

  // Calculate current month sessions
  const currentMonthSessions = filteredSessions.filter((s) => {
    try {
      if (!s.date) return false;
      const sessionDate = new Date(s.date);
      const now = new Date();
      return sessionDate.getMonth() === now.getMonth() &&
      sessionDate.getFullYear() === now.getFullYear() &&
      s.status === 'התקיים';
    } catch {
      return false;
    }
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'אישר':
        return { bg: '#4CAF50', text: 'white' };
      case 'ביטל':
        return { bg: '#f44336', text: 'white' };
      case 'ממתין':
        return { bg: '#FFA726', text: 'white' };
      case 'הגיע':
        return { bg: '#2196F3', text: 'white' };
      default:
        return { bg: '#e0e0e0', text: '#333' };
    }
  };

  const getSessionTypeIcon = (type) => {
    switch (type) {
      case 'אישי':
        return '🧍‍♂️';
      case 'קבוצתי':
        return '👥';
      case 'אונליין':
        return '💻';
      default:
        return '📅';
    }
  };

  const SessionCard = ({ session, priority = false }) => {
    const isExpanded = expandedSessions[session.id];
    const confirmedParticipants = session.participants?.filter((p) => p.attendance_status === 'אישר') || [];
    const arrivedParticipants = session.participants?.filter((p) => p.attendance_status === 'הגיע') || [];
    const cancelledParticipants = session.participants?.filter((p) => p.attendance_status === 'ביטל') || [];
    const waitingParticipants = session.participants?.filter((p) => p.attendance_status === 'ממתין') || [];
    const totalCount = session.participants?.length || 0;

    const getSessionTypeBadgeStyle = (type) => {
      switch (type) {
        case 'אישי':
          return { bg: '#FF6F20', gradient: 'linear-gradient(135deg, #FF6F20 0%, #FF8F50 100%)', color: 'white', icon: '🧍‍♂️', label: 'אישי' };
        case 'קבוצתי':
          return { bg: '#2196F3', gradient: 'linear-gradient(135deg, #2196F3 0%, #42A5F5 100%)', color: 'white', icon: '👥', label: 'קבוצתי' };
        case 'אונליין':
          return { bg: '#9C27B0', gradient: 'linear-gradient(135deg, #9C27B0 0%, #BA68C8 100%)', color: 'white', icon: '💻', label: 'אונליין' };
        default:
          return { bg: '#7D7D7D', gradient: 'linear-gradient(135deg, #7D7D7D 0%, #9E9E9E 100%)', color: 'white', icon: '📅', label: 'מפגש' };
      }
    };

    const getSessionStatusBadge = (status) => {
      switch (status) {
        case 'ממתין לאישור':
          return { bg: '#9E9E9E', text: 'white', label: '⏳ ממתין', icon: '⏳' };
        case 'מאושר':
          return { bg: '#FF6F20', text: 'white', label: '🟧 מאושר', icon: '🟧' };
        case 'התקיים':
          return { bg: '#4CAF50', text: 'white', label: '✅ התקיים', icon: '✅' };
        case 'לא הגיע':
          return { bg: '#B71C1C', text: 'white', label: '🔴 לא הגיע', icon: '🔴' };
        case 'בוטל על ידי מתאמן':
          return { bg: '#f44336', text: 'white', label: '❌ בוטל ע״י מתאמן', icon: '❌' };
        case 'בוטל על ידי מאמן':
          return { bg: '#E53935', text: 'white', label: '❌ בוטל ע״י מאמן', icon: '❌' };
        default:
          return { bg: '#E0E0E0', text: '#000000', label: status || 'ללא סטטוס', icon: '•' };
      }
    };

    const typeBadge = getSessionTypeBadgeStyle(session.session_type);
    const statusBadge = getSessionStatusBadge(session.status);

    const participantNames = session.participants?.map((p) => p.trainee_name).join(', ') || 'אין משתתפים';

    return (
      <div
        className="rounded-2xl transition-all overflow-hidden cursor-pointer"
        style={{
          backgroundColor: '#FFFFFF',
          border: priority ? '3px solid #FF6F20' : '2px solid #E0E0E0',
          boxShadow: priority ? '0 8px 24px rgba(255, 111, 32, 0.25)' : isExpanded ? '0 6px 16px rgba(0,0,0,0.12)' : '0 3px 10px rgba(0,0,0,0.06)'
        }}>

        {/* Top Color Bar */}
        <div className="h-2" style={{ background: typeBadge.gradient }} />

        {/* Collapsed View */}
        <div
          className="p-5 cursor-pointer"
          onClick={() => toggleSessionExpanded(session.id)}>

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="px-3 py-1.5 rounded-xl font-bold text-sm flex items-center gap-1.5"
                style={{ background: typeBadge.gradient, color: typeBadge.color }}>

                <span className="text-lg">{typeBadge.icon}</span>
                <span>{typeBadge.label}</span>
              </div>
              <span
                className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5"
                style={{ backgroundColor: statusBadge.bg, color: statusBadge.text }}>

                <span>{statusBadge.icon}</span>
                <span>{statusBadge.label}</span>
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleSessionExpanded(session.id);
              }}
              className="text-sm font-bold flex items-center gap-1 px-3 py-2 rounded-lg transition-all"
              style={{ color: '#7D7D7D', backgroundColor: '#F7F7F7' }}>

              {isExpanded ?
              <>
                  <span>סגור</span>
                  <ChevronUp className="w-4 h-4" />
                </> :

              <>
                  <span>פרטים</span>
                  <ChevronDown className="w-4 h-4" />
                </>
              }
            </button>
          </div>

          {/* Date & Time - Clear and Bold */}
          <h3 className="text-2xl font-black mb-1" style={{ color: '#000000' }}>
            {format(new Date(session.date), 'EEEE, dd בMMMM', { locale: he })}
          </h3>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5" style={{ color: '#FF6F20' }} />
            <span className="text-xl font-black" style={{ color: '#FF6F20' }}>
              {session.time}
            </span>
            <span className="text-sm font-medium" style={{ color: '#7D7D7D' }}>
              • {participantNames}
            </span>
          </div>
        </div>

          {/* Expanded Details */}
          {isExpanded &&
        <div className="border-t pt-5 px-5 pb-5" style={{ borderColor: '#E0E0E0' }}>
              {/* Location */}
              {session.location &&
          <div className="flex items-center gap-2 mb-4 p-3 rounded-lg" style={{ backgroundColor: '#F7F7F7' }}>
                  <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: '#7D7D7D' }} />
                  <span className="text-sm font-medium" style={{ color: '#000000' }}>
                    {session.location}
                  </span>
                </div>
          }

              {/* Participants - Small */}
              {session.participants && session.participants.length > 0 &&
          <div className="mb-4">
                  <p className="text-xs font-bold mb-2" style={{ color: '#7D7D7D' }}>
                    משתתפים ({totalCount})
                  </p>
                  <div className="space-y-1">
                    {session.participants.map((participant, idx) => {
                const colors = getStatusColor(participant.attendance_status);
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 py-2">

                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div
                        className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0"
                        style={{ backgroundColor: '#F7F7F7', color: '#000000' }}>

                              {participant.trainee_name?.[0] || 'U'}
                            </div>
                            <p className="text-xs font-medium truncate" style={{ color: '#000000' }}>
                              {participant.trainee_name}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span
                        className="px-2 py-0.5 rounded-full text-xs font-bold"
                        style={{ backgroundColor: colors.bg, color: colors.text }}>

                              {participant.attendance_status === 'אישר' && '✅'}
                              {participant.attendance_status === 'ביטל' && '❌'}
                              {participant.attendance_status === 'ממתין' && '🕓'}
                              {participant.attendance_status === 'הגיע' && '✓'}
                            </span>

                            {participant.is_guest &&
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(createPageUrl("Leads"), "_blank");
                        }}
                        size="sm"
                        variant="outline"
                        className="rounded-lg px-2 py-1 text-[10px] h-6">

                                  המר ללקוח
                                </Button>
                      }
                            {(participant.attendance_status === 'אישר' || participant.attendance_status === 'ממתין') &&
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateParticipantAttendance(session, participant.trainee_id, 'הגיע');
                        }}
                        size="sm"
                        className="rounded-lg px-2 py-1 text-xs font-bold text-white"
                        style={{ backgroundColor: '#FF6F20' }}>

                                הגיע
                              </Button>
                      }
                          </div>
                        </div>);

              })}
                  </div>
                </div>
          }

              {/* Coach Private Notes - Only for Coach */}
              {session.coach_notes &&
          <div className="mb-4 p-4 rounded-xl" style={{ backgroundColor: '#FFF8F3', border: '2px solid #FF6F20' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🔒</span>
                    <p className="text-sm font-black" style={{ color: '#FF6F20' }}>
                      הערות למאמן בלבד
                    </p>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: '#000000' }}>
                    {session.coach_notes}
                  </p>
                </div>
          }

              {/* Coach Action Buttons */}
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddParticipantsToSession(session);
                    }}
                    className="rounded-xl py-3 font-bold text-white text-xs px-1"
                    style={{ backgroundColor: '#FF6F20' }}>
                    <UserPlus className="w-3.5 h-3.5 ml-1" />
                    הוסף
                  </Button>
                  
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditSession(session);
                    }}
                    className="rounded-xl py-3 font-bold text-xs px-1"
                    style={{ backgroundColor: '#FFFFFF', color: '#000000', border: '2px solid #E0E0E0' }}>
                    <Edit2 className="w-3.5 h-3.5 ml-1" />
                    ערוך
                  </Button>

                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingSession(session);
                      setShowDeleteDialog(true);
                    }}
                    className="rounded-xl py-3 font-bold text-xs px-1"
                    style={{ backgroundColor: '#FFEBEE', color: '#D32F2F', border: '2px solid #FFCDD2' }}>
                    <Trash2 className="w-3.5 h-3.5 ml-1" />
                    מחק
                  </Button>
                </div>

                {/* Coach Status Management */}
                <div className="p-3 bg-gray-50 rounded-xl">
                  <label className="text-xs font-bold text-gray-500 mb-2 block">ניהול סטטוס</label>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <Button
                  size="sm"
                  onClick={(e) => {e.stopPropagation();handleSessionStatusChange(session, 'התקיים');}}
                  className={`text-xs font-bold ${session.status === 'התקיים' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border'}`}>

                      ✅ התקיים
                    </Button>
                    <Button
                  size="sm"
                  onClick={(e) => {e.stopPropagation();handleSessionStatusChange(session, 'מאושר');}}
                  className={`text-xs font-bold ${session.status === 'מאושר' ? 'bg-orange-500 text-white' : 'bg-white text-gray-700 border'}`}>

                      🟧 מאושר
                    </Button>
                    <Button
                  size="sm"
                  onClick={(e) => {e.stopPropagation();handleSessionStatusChange(session, 'לא הגיע');}}
                  className={`text-xs font-bold ${session.status === 'לא הגיע' ? 'bg-red-700 text-white' : 'bg-white text-gray-700 border'}`}>

                      🔴 לא הגיע
                    </Button>
                    <Button
                  size="sm"
                  onClick={(e) => {e.stopPropagation();handleSessionStatusChange(session, 'בוטל על ידי מאמן');}}
                  className={`text-xs font-bold ${session.status === 'בוטל על ידי מאמן' ? 'bg-red-500 text-white' : 'bg-white text-gray-700 border'}`}>

                      ❌ בוטל (מאמן)
                    </Button>
                  </div>
                  {session.status === 'ממתין לאישור' &&
              <Button
                onClick={(e) => {e.stopPropagation();handleSessionStatusChange(session, 'מאושר');}}
                className="w-full mt-2 bg-orange-500 hover:bg-orange-600 text-white font-bold">

                      אשר בקשה
                    </Button>
              }
                </div>
              </div>
            </div>
        }
      </div>);

  };

  return (
    <ProtectedCoachPage>
      <div className="min-h-screen overflow-x-hidden" style={{ backgroundColor: '#FFFFFF', maxWidth: '100vw' }}>
        <div className="max-w-7xl mx-auto p-6 md:p-8" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
          {/* Hero Header */}
          <div className="mb-8 relative">
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-5"
            style={{ background: 'radial-gradient(circle, #FF6F20 0%, transparent 70%)' }} />
            
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-3">
                    <div
                      className="flex items-center justify-center w-16 h-16 rounded-3xl"
                      style={{ background: 'linear-gradient(135deg, #FF6F20 0%, #FF8F50 100%)', boxShadow: '0 6px 16px rgba(255, 111, 32, 0.35)' }}>

                      <Calendar className="w-9 h-9 text-white" />
                    </div>
                    <div>
                      <h1 className="text-4xl md:text-5xl font-black leading-tight"
                      style={{
                        background: 'linear-gradient(135deg, #000000 0%, #4D4D4D 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        fontFamily: 'Montserrat, Heebo, sans-serif'
                      }}>
                        מפגשים ואימונים
                      </h1>
                      <p className="text-xl font-medium mt-1" style={{ color: '#7D7D7D' }}>
                        📅 לוח זמנים מלא ומסודר
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-24 rounded-full" style={{ background: 'linear-gradient(90deg, #FF6F20 0%, #FF8F50 100%)' }} />
                    <div className="h-1 w-12 rounded-full" style={{ backgroundColor: '#E6E6E6' }} />
                    <div className="h-1 w-6 rounded-full" style={{ backgroundColor: '#E6E6E6' }} />
                  </div>
                </div>

                <Button
                  onClick={() => {
                    if (coachLoading || !coach) {
                      toast.error("אנא המתן לטעינת הנתונים");
                      return;
                    }
                    setEditingSession(null);
                    setShowSessionDialog(true);
                  }}
                  disabled={coachLoading || !coach} className="bg-primary text-white my-1 px-1 py-5 text-lg font-black rounded-2xl justify-center whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-primary/90 h-9 flex items-center gap-3 shadow-xl hover:shadow-2xl transition-all"

                  style={{ backgroundColor: '#FF6F20' }}>

                  <Plus className="w-6 h-6" />
                  קבע מפגש
                </Button>
              </div>
            </div>
          </div>

          {/* Stats Tabs */}
          <div className="mb-8 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <div className="inline-grid grid-cols-4 gap-2 md:gap-3 p-1.5" style={{ minWidth: 'fit-content' }}>
              <button
                className="flex-col gap-1 px-1 py-2 md:px-4 md:py-3 rounded-xl transition-all font-bold flex items-center justify-center min-w-[60px] md:min-w-0"
                style={{
                  backgroundColor: '#FFFFFF',
                  color: '#FF6F20',
                  border: '2px solid #FF6F20',
                  boxShadow: '0 2px 8px rgba(255, 111, 32, 0.15)'
                }}>

                <span className="text-xl">🔥</span>
                <span className="text-lg md:text-2xl font-black">{todaySessions.length}</span>
                <span className="text-[8px] md:text-xs leading-tight">היום</span>
              </button>

              <button
                className="flex-col gap-1 px-1 py-2 md:px-4 md:py-3 rounded-xl transition-all font-bold flex items-center justify-center min-w-[60px] md:min-w-0"
                style={{
                  backgroundColor: '#FFFFFF',
                  color: '#9C27B0',
                  border: '2px solid #9C27B0',
                  boxShadow: '0 2px 8px rgba(156, 39, 176, 0.12)'
                }}>

                <span className="text-xl">📊</span>
                <span className="text-lg md:text-2xl font-black">{currentMonthSessions.length}</span>
                <span className="text-[8px] md:text-xs leading-tight">החודש</span>
              </button>

              <button
                className="flex-col gap-1 px-1 py-2 md:px-4 md:py-3 rounded-xl transition-all font-bold flex items-center justify-center min-w-[60px] md:min-w-0"
                style={{
                  backgroundColor: '#FFFFFF',
                  color: '#9C27B0',
                  border: '2px solid #E1BEE7',
                  boxShadow: 'none'
                }}>

                <span className="text-xl">📆</span>
                <span className="text-lg md:text-2xl font-black">{upcomingSessions.length}</span>
                <span className="text-[8px] md:text-xs leading-tight">קרובים</span>
              </button>

              <button
                className="flex-col gap-1 px-1 py-2 md:px-4 md:py-3 rounded-xl transition-all font-bold flex items-center justify-center min-w-[60px] md:min-w-0"
                style={{
                  backgroundColor: '#FFFFFF',
                  color: '#4CAF50',
                  border: '2px solid #C8E6C9',
                  boxShadow: 'none'
                }}>

                <span className="text-xl">✅</span>
                <span className="text-lg md:text-2xl font-black">{completedSessions.length}</span>
                <span className="text-[8px] md:text-xs leading-tight">הושלמו</span>
              </button>
            </div>
          </div>

          {/* Search & Filters - Minimal */}
          <div className="mb-6 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: '#7D7D7D' }} />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="חיפוש..."
                className="rounded-lg pr-10 py-2 text-sm"
                style={{ border: '1px solid #E0E0E0', backgroundColor: '#FFFFFF' }} />

            </div>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="rounded-lg w-32" style={{ border: '1px solid #E0E0E0', backgroundColor: '#FFFFFF' }}>
                <SelectValue placeholder="סוג" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הסוגים</SelectItem>
                <SelectItem value="אישי">🧍‍♂️ אישי</SelectItem>
                <SelectItem value="קבוצתי">👥 קבוצתי</SelectItem>
                <SelectItem value="אונליין">💻 אונליין</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="rounded-lg w-32" style={{ border: '1px solid #E0E0E0', backgroundColor: '#FFFFFF' }}>
                <SelectValue placeholder="סטטוס" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="upcoming">⏰ קרובים</SelectItem>
                <SelectItem value="completed">✅ הושלמו</SelectItem>
                <SelectItem value="cancelled">❌ בוטלו</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading &&
          <div className="text-center py-12">
              <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" style={{ color: '#FF6F20' }} />
              <p className="text-lg" style={{ color: '#7D7D7D' }}>טוען מפגשים...</p>
            </div>
          }

          {!isLoading &&
          <>
              {/* Today's Sessions - Priority */}
              {todaySessions.length > 0 &&
            <div className="mb-10">
                  <div className="mb-5">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="text-3xl">🔥</div>
                      <h2 className="text-3xl font-black" style={{ color: '#FF6F20', fontFamily: 'Montserrat, sans-serif' }}>
                        היום
                      </h2>
                      <span className="px-4 py-1.5 rounded-full font-black text-sm" style={{ backgroundColor: '#FFF8F3', color: '#FF6F20' }}>
                        {todaySessions.length}
                      </span>
                    </div>
                    <div className="w-16 h-1 rounded-full" style={{ background: 'linear-gradient(90deg, #FF6F20 0%, #FF8F50 100%)' }} />
                  </div>
                  <div className="space-y-5">
                    {todaySessions.map((session) =>
                <SessionCard key={session.id} session={session} priority={true} />
                )}
                  </div>
                </div>
            }

              {/* Tomorrow's Sessions */}
              {tomorrowSessions.length > 0 &&
            <div className="mb-10">
                  <div className="mb-5">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="text-3xl">📅</div>
                      <h2 className="text-3xl font-black" style={{ color: '#2196F3', fontFamily: 'Montserrat, sans-serif' }}>
                        מחר
                      </h2>
                      <span className="px-4 py-1.5 rounded-full font-black text-sm" style={{ backgroundColor: '#E3F2FD', color: '#2196F3' }}>
                        {tomorrowSessions.length}
                      </span>
                    </div>
                    <div className="w-16 h-1 rounded-full" style={{ backgroundColor: '#2196F3' }} />
                  </div>
                  <div className="space-y-5">
                    {tomorrowSessions.map((session) =>
                <SessionCard key={session.id} session={session} />
                )}
                  </div>
                </div>
            }

              {/* Upcoming Sessions */}
              {upcomingSessions.length > 0 &&
            <div className="mb-10">
                  <div className="mb-5">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="text-3xl">📆</div>
                      <h2 className="text-3xl font-black" style={{ color: '#000000', fontFamily: 'Montserrat, sans-serif' }}>
                        קרובים
                      </h2>
                      <span className="px-4 py-1.5 rounded-full font-black text-sm" style={{ backgroundColor: '#F7F7F7', color: '#000000' }}>
                        {upcomingSessions.length}
                      </span>
                    </div>
                    <div className="w-16 h-1 rounded-full" style={{ backgroundColor: '#000000' }} />
                  </div>
                  <div className="space-y-5">
                    {upcomingSessions.map((session) =>
                <SessionCard key={session.id} session={session} />
                )}
                  </div>
                </div>
            }

              {/* Completed Sessions */}
              {completedSessions.length > 0 && filterStatus !== "upcoming" &&
            <div className="mb-10">
                  <div className="mb-5">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="text-3xl">✅</div>
                      <h2 className="text-3xl font-black" style={{ color: '#4CAF50', fontFamily: 'Montserrat, sans-serif' }}>
                        הושלמו
                      </h2>
                      <span className="px-4 py-1.5 rounded-full font-black text-sm" style={{ backgroundColor: '#F0F9F0', color: '#4CAF50' }}>
                        {completedSessions.length}
                      </span>
                    </div>
                    <div className="w-16 h-1 rounded-full" style={{ backgroundColor: '#4CAF50' }} />
                  </div>
                  <div className="space-y-5">
                    {completedSessions.slice(0, 5).map((session) =>
                <SessionCard key={session.id} session={session} />
                )}
                  </div>
                  {completedSessions.length > 5 &&
              <div className="text-center mt-6">
                      <p className="text-sm font-bold px-4 py-2 rounded-lg inline-block" style={{ color: '#7D7D7D', backgroundColor: '#F7F7F7' }}>
                        מציג 5 אחרונים מתוך {completedSessions.length} מפגשים שהושלמו
                      </p>
                    </div>
              }
                </div>
            }

              {/* Empty State - Premium */}
              {filteredSessions.length === 0 &&
            <div className="text-center py-16 p-10 rounded-2xl relative overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '2px solid #E0E0E0' }}>
                  <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-5"
              style={{ background: 'radial-gradient(circle, #FF6F20 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
                  
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
                style={{ backgroundColor: '#F7F7F7' }}>
                      <Calendar className="w-10 h-10" style={{ color: '#E0E0E0' }} />
                    </div>
                    <h3 className="text-2xl font-black mb-3" style={{ color: '#000000', fontFamily: 'Montserrat, sans-serif' }}>
                      {searchTerm || filterType !== "all" || filterStatus !== "all" ?
                  'לא נמצאו מפגשים' :
                  'אין מפגשים מתוכננים'}
                    </h3>
                    <p className="text-lg mb-6" style={{ color: '#7D7D7D' }}>
                      {searchTerm || filterType !== "all" || filterStatus !== "all" ?
                  "נסה לשנות את הפילטרים או החיפוש" :
                  "הגיע הזמן לקבוע את המפגש הראשון"}
                    </p>
                    {!searchTerm && filterType === "all" && filterStatus === "all" && !coachLoading && coach &&
                <Button
                  onClick={() => {
                    setEditingSession(null);
                    setShowSessionDialog(true);
                  }}
                  className="rounded-2xl px-8 py-5 font-black text-white shadow-xl hover:shadow-2xl transition-all text-lg"
                  style={{ backgroundColor: '#FF6F20' }}>

                        <Plus className="w-6 h-6 ml-2" />
                        קבע מפגש
                      </Button>
                }
                  </div>
                </div>
            }
            </>
          }

          <SessionFormDialog
            isOpen={showSessionDialog}
            onClose={() => {
              setShowSessionDialog(false);
              setEditingSession(null);
              setAddingParticipantsTo(null);
            }}
            onSubmit={handleSessionSubmit}
            trainees={trainees}
            editingSession={editingSession}
            isLoading={createSessionMutation.isPending || updateSessionMutation.isPending} />


          {/* Delete Confirmation Dialog */}
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogContent className="max-w-md" style={{ backgroundColor: '#FFFFFF' }}>
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold flex items-center gap-3" style={{ color: '#000000' }}>
                  <AlertTriangle className="w-8 h-8" style={{ color: '#f44336' }} />
                  מחק מפגש
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-6">
                <div className="p-5 rounded-xl" style={{ backgroundColor: '#FFEBEE', border: '2px solid #f44336' }}>
                  <p className="text-base leading-relaxed mb-3" style={{ color: '#000000' }}>
                    האם אתה בטוח שברצונך למחוק את המפגש הזה?
                  </p>
                  {deletingSession &&
                  <div className="p-3 rounded-lg mb-3" style={{ backgroundColor: '#FFFFFF' }}>
                      <p className="text-sm" style={{ color: '#7D7D7D' }}>
                        📅 {deletingSession.date} | ⏰ {deletingSession.time}
                      </p>
                      <p className="text-sm font-bold" style={{ color: '#000000' }}>
                        {deletingSession.participants?.length || 0} משתתפים רשומים
                      </p>
                    </div>
                  }
                  <p className="text-sm font-bold" style={{ color: '#f44336' }}>
                    ⚠️ פעולה זו אינה ניתנת לביטול!
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={() => {
                      setShowDeleteDialog(false);
                      setDeletingSession(null);
                    }}
                    variant="outline"
                    className="flex-1 rounded-xl py-6 font-bold"
                    style={{ border: '1px solid #E0E0E0', color: '#000000' }}>

                    ביטול
                  </Button>
                  <Button
                    onClick={handleDeleteSession}
                    disabled={deleteSessionMutation.isPending}
                    className="flex-1 rounded-xl py-6 font-bold text-white"
                    style={{ backgroundColor: '#f44336' }}>

                    {deleteSessionMutation.isPending ?
                    <>
                        <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                        מוחק...
                      </> :

                    <>
                        <Trash2 className="w-5 h-5 ml-2" />
                        כן, מחק מפגש
                      </>
                    }
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </ProtectedCoachPage>);

}