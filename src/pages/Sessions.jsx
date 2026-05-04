import React, { useState, useContext, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useSessionStats } from "../components/hooks/useSessionStats";
import { deductSessionFromService, restoreSessionToService } from "../components/hooks/useServiceDeduction";
import { syncPackageStatus } from "@/lib/packageStatus";
import { QUERY_KEYS, invalidateDashboard } from "@/components/utils/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Clock, MapPin, Plus, Edit2, Trash2, AlertTriangle, Loader2, Search, ChevronDown, ChevronUp, UserPlus, Users, CheckSquare, Square } from "lucide-react";
import { format, isToday, isTomorrow, isPast, isFuture } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import PageLoader from "@/components/PageLoader";
import SessionFormDialog from "../components/forms/SessionFormDialog";
import SessionEditModal from "../components/SessionEditModal";
import { notifySessionScheduled, notifySessionCompleted } from "@/functions/notificationTriggers";
import { AuthContext } from "@/lib/AuthContext";
import useMultiSelect from "../hooks/useMultiSelect";
import { MultiSelectBar, SelectCheckbox } from "../components/MultiSelectBar";
import ViewToggle, { useViewToggle } from "@/components/ViewToggle";
import { useNavigate } from "react-router-dom";
import NewSessionCard from "@/components/sessions/SessionCard";
import PaymentOverrideDialog from "@/components/sessions/PaymentOverrideDialog";
import { requiresPayment } from "@/lib/sessionHelpers";
import { createPageUrl } from "@/utils";
import { groupSessionsByTime, BUCKET_LABELS, statusMatchesFilter } from "@/lib/sessionGrouping";

export default function Sessions() {
  const [showSessionDialog, setShowSessionDialog] = useState(false);
  // Completion-guard state — set when handleSessionStatusChange
  // catches 'הושלם' on a paid-but-unpaid row. The dialog opens; the
  // coach types a reason; on confirm, it writes the override + closes.
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [editingSession, setEditingSession] = useState(null);
  const [sessionToEdit, setSessionToEdit] = useState(null);
  const [deletingSession, setDeletingSession] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  // Permanent (soft-)delete is a separate destructive action from
  // cancel. Cancel keeps the row visible with a gray "בוטל" badge;
  // delete hides it from every list (deleted_at + status='deleted').
  const [purgingSession, setPurgingSession] = useState(null);
  const [showPurgeDialog, setShowPurgeDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  
  const searchParams = new URLSearchParams(window.location.search);
  const [filterType, setFilterType] = useState(searchParams.get('type') || "all");
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || "all");
  
  const [expandedSessions, setExpandedSessions] = useState({});
  const [view, setView] = useViewToggle('sessions_view', 'list');
  const [addingParticipantsTo, setAddingParticipantsTo] = useState(null);
  // Multi-select for bulk session actions (mark completed / cancel /
  // soft-delete). Toggled via the "בחירה" button in the header.
  const sessionSel = useMultiSelect();

  // Hook used by the redesigned grouped-cards view to deep-link into
  // a trainee's profile sessions tab. AuthProvider lives inside
  // <Router> so useNavigate() is always available here.
  const navigate = useNavigate();

  // 'classic' = the original gradient header + 4-section view. 'grouped'
  // = the redesigned collapsible cards (היום/מחר/השבוע/בעתיד/עברו).
  // Persists per browser via localStorage so the coach's preference
  // sticks between visits.
  const [sessionsLayout, setSessionsLayout] = useState(() => {
    try { return localStorage.getItem('sessions_layout') || 'grouped'; } catch { return 'grouped'; }
  });
  useEffect(() => {
    try { localStorage.setItem('sessions_layout', sessionsLayout); } catch {}
  }, [sessionsLayout]);

  // Past bucket starts collapsed — the coach asks for it open via a
  // toggle inside the grouped layout.
  const [showPast, setShowPast] = useState(false);

  // Local status-chip filter for the grouped layout. Distinct from
  // the existing filterStatus (which drives the 4-section's stat
  // tabs). Maps via STATUS_FAMILIES to all the legacy status values.
  const [groupedStatusFilter, setGroupedStatusFilter] = useState('all');

  // Group Training state
  const [activeView, setActiveView] = useState('sessions'); // 'sessions' | 'groups'
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupForm, setGroupForm] = useState({ name: '', description: '' });
  const [showGroupMembersDialog, setShowGroupMembersDialog] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showGroupSessionDialog, setShowGroupSessionDialog] = useState(false);
  const [groupSessionForm, setGroupSessionForm] = useState({ date: new Date().toISOString().split('T')[0], time: '09:00', location: 'סטודיו', notes: '' });
  const [markingGroupAttendance, setMarkingGroupAttendance] = useState(null);

  const queryClient = useQueryClient();

  const { user } = useContext(AuthContext);

  const { sessions, isLoading, todaySessionsCount } = useSessionStats();

  const { data: trainees = [] } = useQuery({
    queryKey: ['trainees-list'],
    queryFn: async () => {
      try {
        // Fetch with limit to prevent data loss and filter in memory for safety
        const allUsers = await base44.entities.User.list('-created_at', 1000);
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
    staleTime: 30000,
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

  // ── Group Training Queries ──
  const { data: trainingGroups = [], refetch: refetchGroups } = useQuery({
    queryKey: ['training-groups'],
    queryFn: async () => {
      try { return await base44.entities.TrainingGroup.filter({ coach_id: user?.id || '' }); }
      catch { return []; }
    },
    enabled: !!user?.id,
    staleTime: 30000
  });

  const { data: groupMembers = [], refetch: refetchGroupMembers } = useQuery({
    queryKey: ['group-members'],
    queryFn: async () => {
      try { return await base44.entities.TrainingGroupMember.list('-created_at', 500); }
      catch { return []; }
    },
    enabled: !!user?.id,
    staleTime: 30000
  });

  // Realtime sync — replace polling with instant updates
  useEffect(() => {
    if (!user?.id) return;
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['training-groups'] });
      queryClient.invalidateQueries({ queryKey: ['group-members'] });
    };
    const ch = supabase
      .channel(`coach-sessions-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'training_groups' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'training_group_members' }, refresh)
      .subscribe();
    window.addEventListener('data-changed', refresh);
    return () => { supabase.removeChannel(ch); window.removeEventListener('data-changed', refresh); };
  }, [user?.id, queryClient]);

  const createGroupMutation = useMutation({
    mutationFn: (data) => base44.entities.TrainingGroup.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['training-groups'] }); setShowGroupDialog(false); setGroupForm({ name: '', description: '' }); toast.success('✅ קבוצה נוצרה'); },
    onError: () => toast.error('שגיאה ביצירת קבוצה')
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TrainingGroup.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['training-groups'] }); setShowGroupDialog(false); setEditingGroup(null); toast.success('✅ קבוצה עודכנה'); },
    onError: (err) => toast.error('❌ שגיאה: ' + (err?.message || 'נסה שוב')),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id) => base44.entities.TrainingGroup.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['training-groups'] }); toast.success('✅ קבוצה נמחקה'); },
    onError: (err) => toast.error('❌ שגיאה: ' + (err?.message || 'נסה שוב')),
  });

  const addGroupMemberMutation = useMutation({
    mutationFn: ({ group_id, trainee_id, trainee_name }) => base44.entities.TrainingGroupMember.create({ group_id, trainee_id, trainee_name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['group-members'] }); toast.success('✅ מתאמן נוסף לקבוצה'); },
    onError: () => toast.error('שגיאה בהוספת מתאמן')
  });

  const removeGroupMemberMutation = useMutation({
    mutationFn: (id) => base44.entities.TrainingGroupMember.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['group-members'] }); toast.success('✅ מתאמן הוסר מהקבוצה'); },
    onError: (err) => toast.error('❌ שגיאה: ' + (err?.message || 'נסה שוב')),
  });

  const createGroupSessionMutation = useMutation({
    mutationFn: async ({ group, form }) => {
      const members = groupMembers.filter(m => m.group_id === group.id);
      const participants = members.map(m => ({ trainee_id: m.trainee_id, trainee_name: m.trainee_name, attendance_status: 'ממתין' }));
      return base44.entities.Session.create({
        date: form.date,
        time: form.time,
        session_type: 'קבוצתי',
        location: form.location,
        coach_id: user?.id,
        status: 'מתוכנן',
        coach_notes: form.notes,
        participants,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setShowGroupSessionDialog(false);
      setSelectedGroup(null);
      toast.success('✅ אימון קבוצתי נוצר לכל חברי הקבוצה');
    },
    onError: () => toast.error('שגיאה ביצירת אימון קבוצתי')
  });

  const markGroupAttendanceMutation = useMutation({
    mutationFn: async ({ session, status }) => {
      const updatedParticipants = session.participants.map(p => ({ ...p, attendance_status: status }));
      return base44.entities.Session.update(session.id, { participants: updatedParticipants, status: status === 'הגיע' ? 'התקיים' : session.status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setMarkingGroupAttendance(null);
      toast.success('✅ נוכחות עודכנה לכל חברי הקבוצה');
    },
    onError: () => toast.error('שגיאה בעדכון נוכחות')
  });

  const createSessionMutation = useMutation({
    mutationFn: (sessionData) => {
      console.log("[Sessions] Creating session with data:", sessionData);
      return base44.entities.Session.create(sessionData);
    },
    onSuccess: async (createdSession) => {
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      invalidateDashboard(queryClient);
      setShowSessionDialog(false);
      setEditingSession(null);
      toast.success("✅ המפגש נוצר בהצלחה");

      // Notify participants
      if (createdSession?.participants && coach) {
        for (const participant of createdSession.participants) {
          await notifySessionScheduled({
            traineeId: participant.trainee_id,
            sessionId: createdSession.id,
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
      console.error("[Sessions] Create error details:", {
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        body: error.body,
        error: error
      });
      toast.error("❌ שגיאה ביצירת המפגש. אנא נסה שוב.");
    }
  });

  const updateSessionMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Session.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      invalidateDashboard(queryClient);
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
    // Cancel = soft-mark as cancelled. Row stays in the DB and stays
    // visible in the list with a gray 'בוטל' badge so the coach has
    // a full audit trail.
    mutationFn: (sessionId) => base44.entities.Session.update(sessionId, {
      status: 'cancelled',
      status_updated_at: new Date().toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
      invalidateDashboard(queryClient);
      setShowDeleteDialog(false);
      setDeletingSession(null);
      toast.success("✅ המפגש בוטל");
    },
    onError: (error) => {
      console.error("[Sessions] Cancel error:", error);
      toast.error("❌ שגיאה בביטול המפגש");
    }
  });

  const purgeSessionMutation = useMutation({
    // Delete = soft-delete via status='deleted' + deleted_at. Row is
    // hidden from coach + trainee lists but the data is still in the
    // DB (recoverable). Hard DELETE FROM sessions is never used.
    mutationFn: (sessionId) => base44.entities.Session.update(sessionId, {
      status: 'deleted',
      deleted_at: new Date().toISOString(),
      status_updated_at: new Date().toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
      invalidateDashboard(queryClient);
      setShowPurgeDialog(false);
      setPurgingSession(null);
      toast.success("✅ המפגש נמחק");
    },
    onError: (error) => {
      console.error("[Sessions] Purge error:", error);
      toast.error("❌ שגיאה במחיקת המפגש");
    }
  });

  const handleSessionSubmit = async (sessionData) => {
    if (!coach || !coach.id) {
      toast.error("שגיאה: לא ניתן לטעון את פרטי המאמן. אנא רענן את הדף.");
      return;
    }

    // Casual-trainee gate: when the booked trainee's client_status is
    // 'casual', the session is saved as 'pending_approval' so the
    // TraineeHome banner can offer the health-declaration → confirm
    // flow. Anything else (active / suspended / legacy Hebrew status
    // / no row) keeps the existing 'ממתין לאישור' default. Best-effort
    // — if the lookup fails for any reason we fall back to the legacy
    // status rather than blocking the save.
    let traineeStatus = null;
    const traineeIds = [];
    if (sessionData?.trainee_id) traineeIds.push(sessionData.trainee_id);
    if (Array.isArray(sessionData?.participants)) {
      for (const p of sessionData.participants) {
        if (p?.trainee_id) traineeIds.push(p.trainee_id);
      }
    }
    if (traineeIds.length > 0) {
      try {
        const { data } = await supabase
          .from('users')
          .select('client_status')
          .in('id', traineeIds);
        // If ANY participant is casual, the whole session waits for
        // their approval — safer side of the gate.
        if ((data || []).some((row) => row?.client_status === 'casual')) {
          traineeStatus = 'casual';
        }
      } catch (e) {
        console.warn('[Sessions] client_status lookup failed:', e?.message);
      }
    }

    // Status precedence:
    //   1) sessionData.status === 'הושלם' (coach logged a past
    //      session — keep as completed, no approval needed)
    //   2) casual trainee → 'pending_approval' (needs trainee gate)
    //   3) default → 'ממתין לאישור'
    const fullSessionData = {
      ...sessionData,
      location: sessionData.location || "לא צוין",
      duration: sessionData.duration || 60,
      coach_id: coach.id,
      status: sessionData.status === 'הושלם'
        ? 'הושלם'
        : (traineeStatus === 'casual' ? 'pending_approval' : 'ממתין לאישור'),
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
    // Completion guard — the coach can't quietly mark a paid-but-
    // unpaid row 'הושלם'. Intercept and route through the override
    // dialog; that path writes status + payment_status='override_no_
    // payment' + the typed reason in one shot.
    if (newStatus === 'הושלם' && requiresPayment(session)) {
      setOverrideTarget(session);
      return;
    }

    // 1. Update session status
    await updateSessionMutation.mutateAsync({
      id: session.id,
      data: {
        status: newStatus
      }
    });

    // Best-effort trainee notification so changes surface on the
    // trainee's notification feed without polling. Failure here
    // doesn't undo the status change above.
    if (session.trainee_id) {
      try {
        const dateLabel = session.date
          ? new Date(session.date).toLocaleDateString('he-IL')
          : '';
        await supabase.from('notifications').insert({
          user_id: session.trainee_id,
          type: 'session_status_changed',
          title: '📅 סטטוס המפגש שונה',
          message: `הסטטוס של המפגש ב-${dateLabel} שונה ל-${newStatus}`,
          is_read: false,
        });
      } catch (e) {
        console.warn('[Sessions] status-change trainee notif failed:', e?.message);
      }
    }

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
            const activeServices = await base44.entities.ClientService.filter({ trainee_id: participant.trainee_id, status: 'פעיל', coach_id: user?.id });
            // Robust matching for service type
            const personalService = activeServices.find((s) => 
                s.service_type === 'אימונים אישיים' || 
                s.service_type.includes('אישי')
            );

            if (personalService) {
              await base44.entities.ClientService.update(personalService.id, {
                used_sessions: (personalService.used_sessions || 0) + 1
              });
              await syncPackageStatus(personalService.id);
            }
          } catch (error) {
            console.error("Error deducting session for mass update", error);
          }
        }
      }
      // Service-based deduction (if session linked to a package)
      if (session.service_id) {
        await deductSessionFromService(session, user?.id);
      }

      // Notify each participant that the session was completed
      for (const participant of session.participants || []) {
        if (participant.trainee_id) {
          try {
            await notifySessionCompleted({
              traineeId: participant.trainee_id,
              sessionDate: session.date,
              sessionType: session.session_type || 'אימון',
              coachName: coach?.full_name || 'המאמן',
            });
          } catch {}
        }
      }
      toast.success("✅ נוכחות נרשמה ויתרות עודכנו");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SERVICES });
      invalidateDashboard(queryClient);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
    // If status changed FROM 'התקיים' TO something else (Cancelled/No Show), we might need to RESTORE
    else if (session.status === 'התקיים' && newStatus !== 'התקיים') {
      for (const participant of session.participants || []) {
        // Only restore if they were marked as Attended
        if (participant.attendance_status === 'הגיע' || participant.attendance_status === 'attended') {
          if (session.session_type === 'אישי') {
            try {
              const activeServices = await base44.entities.ClientService.filter({ trainee_id: participant.trainee_id, status: 'פעיל', coach_id: user?.id });
              const personalService = activeServices.find((s) => 
                  s.service_type === 'אימונים אישיים' || 
                  s.service_type.includes('אישי')
              );

              if (personalService) {
                await base44.entities.ClientService.update(personalService.id, {
                  used_sessions: Math.max(0, (personalService.used_sessions || 0) - 1)
                });
                await syncPackageStatus(personalService.id);
              }
            } catch (error) {
              console.error("Error restoring session for mass update", error);
            }
          }
        }
      }
      // Service-based restore (if session linked to a package)
      if (session.service_id) {
        await restoreSessionToService(session, user?.id);
      }

      toast.success("סטטוס עודכן וזיכויים הוחזרו");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SERVICES });
      invalidateDashboard(queryClient);
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
          const activeServices = await base44.entities.ClientService.filter({ trainee_id: traineeId, status: 'פעיל', coach_id: user?.id });
          const personalService = activeServices.find((s) => 
              s.service_type === 'אימונים אישיים' || 
              s.service_type.includes('אישי')
          );

          if (personalService) {
            const change = isNowAttended ? 1 : -1;
            const newUsedCount = Math.max(0, (personalService.used_sessions || 0) + change);
            const totalSessions = personalService.total_sessions || 0;
            const remaining = totalSessions - newUsedCount;

            await base44.entities.ClientService.update(personalService.id, {
              used_sessions: newUsedCount
            });
            await syncPackageStatus(personalService.id);

            if (isNowAttended) toast.success("✅ אימון ירד מהחבילה");else
            toast.success("✅ אימון הוחזר לחבילה");

            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SERVICES });
            queryClient.invalidateQueries({ queryKey: ['trainee-services'] });
            queryClient.invalidateQueries({ queryKey: ['all-trainees'] });

            // Send low-package notifications
            if (isNowAttended && totalSessions > 0) {
              if (remaining === 2) {
                base44.entities.Notification.create({
                  user_id: traineeId,
                  title: "⚠️ נותרו 2 אימונים בחבילה",
                  message: `נותרו לך עוד 2 אימונים בחבילה "${personalService.service_type}". פנה למאמן לחידוש.`,
                  type: 'subscription',
                  is_read: false,
                  requires_acknowledgment: false,
                }).catch(console.error);
              } else if (remaining <= 0) {
                base44.entities.Notification.create({
                  user_id: traineeId,
                  title: "🔴 החבילה נגמרה",
                  message: `החבילה "${personalService.service_type}" נוצלה במלואה. פנה למאמן לחידוש.`,
                  type: 'subscription',
                  is_read: false,
                  requires_acknowledgment: true,
                }).catch(console.error);
              }
            }
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
    // Soft-deleted sessions are hidden from every list regardless of
    // any other filter. status='deleted' OR a populated deleted_at
    // both qualify so this handles older rows that only carry one.
    if (session.status === 'deleted' || session.deleted_at) return false;
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
      } else if (filterStatus === "today") {
        try {
          return session.date && isToday(new Date(session.date));
        } catch {
          return false;
        }
      } else if (filterStatus === "month") {
        try {
          const d = new Date(session.date);
          const now = new Date();
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        } catch {
          return false;
        }
      }
    }

    return true;
  });

  // Sessions filtered for the redesigned grouped layout. Distinct
  // from filteredSessions (which drives the legacy 4-section view)
  // because the grouped layout uses its own status-chip filter +
  // looser search semantics. Always strips soft-deleted rows.
  const groupedFilteredSessions = (sessions || []).filter(s => {
    if (s.status === 'deleted' || s.deleted_at) return false;
    if (!statusMatchesFilter(s.status, groupedStatusFilter)) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const traineeName = (s.participants?.[0]?.trainee_name || s.trainee_name || '').toLowerCase();
      if (!traineeName.includes(q) && !(s.location || '').toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  // Trainee lookup keyed by trainee_id — sourced inline from the
  // session.participants[0] (multi-trainee sessions still get the
  // first participant for the closed-card label). The new SessionCard
  // accepts the looked-up trainee row and falls back to session
  // fields when the row is missing.
  const traineeMap = (sessions || []).reduce((acc, s) => {
    const id = s.trainee_id;
    if (!id) return acc;
    if (acc[id]) return acc;
    const name = s.participants?.find(p => p.trainee_id === id)?.trainee_name
      || s.participants?.[0]?.trainee_name
      || s.trainee_name
      || '';
    acc[id] = { id, full_name: name };
    return acc;
  }, {});

  // Note: handleSessionStatusChange is defined further below (around
  // line 421). It already routes through updateSessionMutation, fires
  // attendance logging + service deduction/restoration, and toasts
  // success — the new SessionCard's onStatusChange wires straight to
  // it. We keep that single source of truth instead of adding a
  // parallel UPDATE path here.

  // Click on the redesigned card's CTA → deep-link into the trainee's
  // profile, attendance tab, with sessionId so TraineeProfile auto-
  // opens the SessionFormDialog on the right row.
  const openSessionInTraineeProfile = (session, trainee) => {
    const tid = trainee?.id || session?.trainee_id;
    if (!tid) {
      toast.error('לא נמצא מתאמן משויך למפגש');
      return;
    }
    const params = new URLSearchParams();
    params.set('userId', tid);
    params.set('tab', 'attendance');
    params.set('sessionId', session.id);
    navigate(`/TraineeProfile?${params.toString()}`);
  };

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

    const isSelectedRow = sessionSel.isSelecting && sessionSel.isSelected(session.id);

    return (
      <div
        className="rounded-2xl transition-all overflow-hidden cursor-pointer"
        style={{
          backgroundColor: '#FFFFFF',
          border: isSelectedRow
            ? '3px solid #FF6F20'
            : priority ? '3px solid #FF6F20' : '2px solid #E0E0E0',
          boxShadow: priority ? '0 8px 24px rgba(255, 111, 32, 0.25)' : isExpanded ? '0 6px 16px rgba(0,0,0,0.12)' : '0 3px 10px rgba(0,0,0,0.06)'
        }}>

        {/* Top Color Bar */}
        <div className="h-2" style={{ background: typeBadge.gradient }} />

        {/* Collapsed View */}
        <div
          className="p-5 cursor-pointer"
          onClick={() => {
            if (sessionSel.isSelecting) { sessionSel.toggleSelect(session.id); return; }
            toggleSessionExpanded(session.id);
          }}>

          {sessionSel.isSelecting && (
            <div style={{ marginBottom: 8 }}>
              <SelectCheckbox
                isSelected={sessionSel.isSelected(session.id)}
                onToggle={() => sessionSel.toggleSelect(session.id)}
              />
            </div>
          )}

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
            <button
              onClick={(e) => { e.stopPropagation(); setSessionToEdit(session); }}
              className="ml-auto p-2 rounded-lg transition-all hover:bg-orange-50"
              style={{ color: '#FF6F20', flexShrink: 0 }}>
              <Edit2 className="w-4 h-4" />
            </button>
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
                <div className="grid grid-cols-2 gap-2">
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
                </div>

                {/* Two destructive actions:
                      • בטל   → status='cancelled' (kept in list, gray badge)
                      • מחק   → status='deleted' + deleted_at (hidden) */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingSession(session);
                      setShowDeleteDialog(true);
                    }}
                    className="rounded-xl py-3 font-bold text-xs px-1"
                    style={{ backgroundColor: '#FFF3E0', color: '#E65100', border: '2px solid #FFCC80' }}>
                    ❌ בטל
                  </Button>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPurgingSession(session);
                      setShowPurgeDialog(true);
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

  // Page-level loading gate — render the unified loader instead of a
  // partial shell. Both the sessions list and the coach row are
  // primary data; without coach the header would render with empty
  // strings and the filter chips would render before counts arrive.
  if (isLoading || coachLoading) {
    return (
      <ProtectedCoachPage>
        <PageLoader fullHeight />
      </ProtectedCoachPage>
    );
  }

  return (
    <ProtectedCoachPage>
      <div className="min-h-screen overflow-x-hidden pb-24" dir="rtl" style={{ backgroundColor: '#FFFFFF', maxWidth: '100vw' }}>
        <div className="max-w-7xl mx-auto px-4 md:p-8" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
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

                <div className="flex items-center gap-2">
                  {activeView === 'sessions' && (
                    <button
                      type="button"
                      onClick={() => sessionSel.isSelecting ? sessionSel.clearSelection() : sessionSel.startSelecting()}
                      style={{
                        height: 44, padding: '0 14px', borderRadius: 14,
                        border: '1px solid #F0E4D0',
                        background: sessionSel.isSelecting ? '#FFF5EE' : 'white',
                        color: sessionSel.isSelecting ? '#FF6F20' : '#888',
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        fontFamily: "'Heebo', 'Assistant', sans-serif",
                      }}
                    >
                      {sessionSel.isSelecting ? '✕ ביטול' : '☑ בחירה'}
                    </button>
                  )}
                  <Button
                    onClick={() => setActiveView(activeView === 'sessions' ? 'groups' : 'sessions')}
                    variant="outline"
                    className="flex items-center gap-2 h-11 px-4 rounded-2xl font-bold"
                  >
                    <Users className="w-4 h-4" />
                    {activeView === 'sessions' ? 'קבוצות' : 'מפגשים'}
                  </Button>
                  {activeView === 'sessions' ? (
                    <Button
                      onClick={() => { if (coachLoading || !coach) { toast.error("אנא המתן לטעינת הנתונים"); return; } setEditingSession(null); setShowSessionDialog(true); }}
                      disabled={coachLoading || !coach}
                      className="flex items-center gap-2 h-11 px-4 rounded-2xl font-black text-white shadow-xl hover:shadow-2xl"
                      style={{ backgroundColor: '#FF6F20' }}
                    >
                      <Plus className="w-5 h-5" />קבע מפגש
                    </Button>
                  ) : (
                    <Button
                      onClick={() => { setEditingGroup(null); setGroupForm({ name: '', description: '' }); setShowGroupDialog(true); }}
                      className="flex items-center gap-2 h-11 px-4 rounded-2xl font-black text-white shadow-xl"
                      style={{ backgroundColor: '#4CAF50' }}
                    >
                      <Plus className="w-5 h-5" />קבוצה חדשה
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Tabs */}
          <div className="mb-8 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <div className="inline-grid grid-cols-4 gap-2 md:gap-3 p-1.5" style={{ minWidth: 'fit-content' }}>
              <button
                onClick={() => setFilterStatus(filterStatus === 'today' ? 'all' : 'today')}
                className="flex-col gap-1 px-1 py-2 md:px-4 md:py-3 rounded-xl transition-all font-bold flex items-center justify-center min-w-[60px] md:min-w-0"
                style={{
                  backgroundColor: filterStatus === 'today' ? '#FF6F20' : '#FFFFFF',
                  color: filterStatus === 'today' ? '#FFFFFF' : '#FF6F20',
                  border: '2px solid #FF6F20',
                  boxShadow: filterStatus === 'today' ? '0 2px 8px rgba(255, 111, 32, 0.35)' : '0 2px 8px rgba(255, 111, 32, 0.15)'
                }}>

                <span className="text-xl">🔥</span>
                <span className="text-lg md:text-2xl font-black">{todaySessions.length}</span>
                <span className="text-[8px] md:text-xs leading-tight">היום</span>
              </button>

              <button
                onClick={() => setFilterStatus(filterStatus === 'month' ? 'all' : 'month')}
                className="flex-col gap-1 px-1 py-2 md:px-4 md:py-3 rounded-xl transition-all font-bold flex items-center justify-center min-w-[60px] md:min-w-0"
                style={{
                  backgroundColor: filterStatus === 'month' ? '#9C27B0' : '#FFFFFF',
                  color: filterStatus === 'month' ? '#FFFFFF' : '#9C27B0',
                  border: '2px solid #9C27B0',
                  boxShadow: filterStatus === 'month' ? '0 2px 8px rgba(156, 39, 176, 0.35)' : '0 2px 8px rgba(156, 39, 176, 0.12)'
                }}>

                <span className="text-xl">📊</span>
                <span className="text-lg md:text-2xl font-black">{currentMonthSessions.length}</span>
                <span className="text-[8px] md:text-xs leading-tight">החודש</span>
              </button>

              <button
                onClick={() => setFilterStatus(filterStatus === 'upcoming' ? 'all' : 'upcoming')}
                className="flex-col gap-1 px-1 py-2 md:px-4 md:py-3 rounded-xl transition-all font-bold flex items-center justify-center min-w-[60px] md:min-w-0"
                style={{
                  backgroundColor: filterStatus === 'upcoming' ? '#9C27B0' : '#FFFFFF',
                  color: filterStatus === 'upcoming' ? '#FFFFFF' : '#9C27B0',
                  border: `2px solid ${filterStatus === 'upcoming' ? '#9C27B0' : '#E1BEE7'}`,
                  boxShadow: filterStatus === 'upcoming' ? '0 2px 8px rgba(156, 39, 176, 0.25)' : 'none'
                }}>

                <span className="text-xl">📆</span>
                <span className="text-lg md:text-2xl font-black">{upcomingSessions.length}</span>
                <span className="text-[8px] md:text-xs leading-tight">קרובים</span>
              </button>

              <button
                onClick={() => setFilterStatus(filterStatus === 'completed' ? 'all' : 'completed')}
                className="flex-col gap-1 px-1 py-2 md:px-4 md:py-3 rounded-xl transition-all font-bold flex items-center justify-center min-w-[60px] md:min-w-0"
                style={{
                  backgroundColor: filterStatus === 'completed' ? '#4CAF50' : '#FFFFFF',
                  color: filterStatus === 'completed' ? '#FFFFFF' : '#4CAF50',
                  border: `2px solid ${filterStatus === 'completed' ? '#4CAF50' : '#C8E6C9'}`,
                  boxShadow: filterStatus === 'completed' ? '0 2px 8px rgba(76, 175, 80, 0.25)' : 'none'
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

            <ViewToggle view={view} onChange={setView} />
          </div>

          {/* ═══ GROUPS VIEW ═══ */}
          {activeView === 'groups' && (
            <div className="space-y-4 pb-8">
              <h2 className="text-xl font-black text-gray-900 flex items-center gap-2"><Users className="w-5 h-5 text-[#4CAF50]" />קבוצות אימון</h2>
              {trainingGroups.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-500 font-medium">אין קבוצות עדיין</p>
                  <p className="text-gray-400 text-sm mt-1">צור קבוצה ראשונה כדי להתחיל</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {trainingGroups.map(group => {
                    const members = groupMembers.filter(m => m.group_id === group.id);
                    return (
                      <div key={group.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="font-black text-lg text-gray-900">{group.name}</h3>
                              {group.description && <p className="text-sm text-gray-500 mt-0.5">{group.description}</p>}
                              <p className="text-xs text-gray-400 mt-1">{members.length} חברים</p>
                            </div>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="w-9 h-9 text-blue-500" onClick={() => { setSelectedGroup(group); setShowGroupMembersDialog(true); }}><UserPlus className="w-4 h-4" /></Button>
                              <Button size="icon" variant="ghost" className="w-9 h-9 text-[#FF6F20]" onClick={() => { setEditingGroup(group); setGroupForm({ name: group.name, description: group.description || '' }); setShowGroupDialog(true); }}><Edit2 className="w-4 h-4" /></Button>
                              <Button size="icon" variant="ghost" className="w-9 h-9 text-red-500" onClick={() => { if (window.confirm(`למחוק את קבוצה "${group.name}"?`)) deleteGroupMutation.mutate(group.id); }}><Trash2 className="w-4 h-4" /></Button>
                            </div>
                          </div>
                          {members.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {members.map(m => (
                                <span key={m.id} className="text-xs bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full">{m.trainee_name}</span>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2 pt-2 border-t border-gray-100">
                            <Button
                              onClick={() => { setSelectedGroup(group); setGroupSessionForm({ date: new Date().toISOString().split('T')[0], time: '09:00', location: 'סטודיו', notes: '' }); setShowGroupSessionDialog(true); }}
                              className="flex-1 text-white text-sm font-bold rounded-xl min-h-[44px]"
                              style={{ backgroundColor: '#9C27B0' }}
                              disabled={members.length === 0}
                            >
                              <Calendar className="w-4 h-4 ml-1" />קבע אימון קבוצתי
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Group sessions with bulk attendance marking */}
              {sessions.filter(s => s.group_id).length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-3">אימונים קבוצתיים אחרונים</h3>
                  <div className="space-y-2">
                    {sessions.filter(s => s.group_id).slice(0, 10).map(session => (
                      <div key={session.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-sm text-gray-900">{session.group_name}</span>
                          <div className="text-xs text-gray-500 mt-0.5">{session.date} • {session.time} • {session.participants?.length || 0} משתתפים</div>
                        </div>
                        <Button
                          onClick={() => setMarkingGroupAttendance(session)}
                          variant="outline"
                          className="text-xs h-9 px-3 rounded-xl font-bold"
                          style={{ borderColor: '#4CAF50', color: '#4CAF50' }}
                        >
                          <CheckSquare className="w-3 h-3 ml-1" />סמן נוכחות
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ SESSIONS VIEW ═══ */}
          {activeView === 'sessions' && isLoading && <PageLoader />}

          {/* Redesigned grouped collapsible cards — default view.
              The legacy 4-section layout is still rendered below
              when sessionsLayout === 'classic' so the coach can
              fall back. Both pull from `sessions` (Hook) so they
              stay in sync after CRUD. */}
          {activeView === 'sessions' && !isLoading && sessionsLayout === 'grouped' && (() => {
            const groups = groupSessionsByTime(groupedFilteredSessions);
            const STATUS_FILTERS = [
              { id: 'all',       label: 'הכל' },
              { id: 'pending',   label: 'ממתין' },
              { id: 'confirmed', label: 'מאושר' },
              { id: 'completed', label: 'הושלם' },
              { id: 'cancelled', label: 'בוטל' },
            ];
            const visibleBuckets = ['today', 'tomorrow', 'thisWeek', 'future'];
            const totalVisible = visibleBuckets.reduce((n, k) => n + groups[k].length, 0);
            return (
              <div dir="rtl" style={{ paddingBottom: 80 }}>
                {/* Status filter chips */}
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 0 12px', marginBottom: 12 }}>
                  {STATUS_FILTERS.map(f => {
                    const active = groupedStatusFilter === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setGroupedStatusFilter(f.id)}
                        style={{
                          padding: '8px 16px', borderRadius: 999, border: 'none',
                          background: active
                            ? 'linear-gradient(135deg, #FF6F20 0%, #FF8A47 100%)'
                            : '#FFFFFF',
                          color: active ? '#fff' : '#555',
                          boxShadow: active ? '0 2px 8px rgba(255,111,32,0.25)' : 'none',
                          border: active ? '1.5px solid #FF6F20' : '1.5px solid #F0E4D0',
                          fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer',
                          fontFamily: "'Heebo', 'Assistant', sans-serif",
                          transition: 'all 0.2s ease',
                        }}
                      >{f.label}</button>
                    );
                  })}
                </div>

                {/* Toggle back to classic if needed */}
                <div style={{ textAlign: 'left', marginBottom: 12 }}>
                  <button
                    type="button"
                    onClick={() => setSessionsLayout('classic')}
                    style={{
                      background: 'none', border: 'none', color: '#888',
                      fontSize: 12, cursor: 'pointer', padding: '4px 6px',
                    }}
                  >תצוגה קלאסית →</button>
                </div>

                {totalVisible === 0 && groups.past.length === 0 && (
                  <div style={{
                    textAlign: 'center', padding: 60, color: '#888',
                    background: 'white', borderRadius: 14, border: '1px solid #F0E4D0',
                  }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>📅</div>
                    <div style={{ fontSize: 15 }}>אין מפגשים תחת הסינון הזה</div>
                  </div>
                )}

                {visibleBuckets.map(bucketKey => {
                  const list = groups[bucketKey];
                  if (!list.length) return null;
                  return (
                    <div key={bucketKey} style={{ marginBottom: 18 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        marginBottom: 8,
                      }}>
                        <h3 style={{
                          margin: 0,
                          fontSize: 18, fontWeight: 700,
                          color: '#1A1A1A',
                          fontFamily: "'Barlow Condensed', 'Heebo', sans-serif",
                          letterSpacing: 0.3,
                        }}>{BUCKET_LABELS[bucketKey]}</h3>
                        <span style={{
                          fontSize: 12, fontWeight: 600, color: '#FF6F20',
                          background: '#FFF5EE', padding: '2px 10px', borderRadius: 999,
                        }}>{list.length}</span>
                      </div>
                      {list.map(s => (
                        <NewSessionCard
                          key={s.id}
                          session={s}
                          trainee={traineeMap[s.trainee_id]}
                          onClick={openSessionInTraineeProfile}
                          onStatusChange={handleSessionStatusChange}
                        />
                      ))}
                    </div>
                  );
                })}

                {/* Past — collapsed by default */}
                {groups.past.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <button
                      type="button"
                      onClick={() => setShowPast(p => !p)}
                      style={{
                        width: '100%', padding: 12, borderRadius: 12,
                        border: '1px dashed #F0E4D0',
                        background: 'transparent', color: '#888',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        marginBottom: 10,
                        fontFamily: "'Heebo', 'Assistant', sans-serif",
                      }}
                    >
                      {showPast
                        ? `▲ הסתר מפגשים שעברו (${groups.past.length})`
                        : `▼ הצג מפגשים שעברו (${groups.past.length})`}
                    </button>
                    {showPast && groups.past.map(s => (
                      <NewSessionCard
                        key={s.id}
                        session={s}
                        trainee={traineeMap[s.trainee_id]}
                        onClick={openSessionInTraineeProfile}
                        onStatusChange={handleSessionStatusChange}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {activeView === 'sessions' && !isLoading && sessionsLayout === 'classic' &&
          <>
              {/* Quick toggle back to the redesigned grouped view */}
              <div style={{ textAlign: 'left', marginBottom: 12, direction: 'rtl' }}>
                <button
                  type="button"
                  onClick={() => setSessionsLayout('grouped')}
                  style={{
                    background: 'none', border: 'none', color: '#888',
                    fontSize: 12, cursor: 'pointer', padding: '4px 6px',
                  }}
                >תצוגה מקובצת →</button>
              </div>
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
                  <div className={view === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-5'}>
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
                  <div className={view === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-5'}>
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
                  <div className={view === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-5'}>
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
                  <div className={view === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-5'}>
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

          {/* Floating multi-select action bar — bulk-update sessions */}
          <MultiSelectBar
            count={sessionSel.selectedCount}
            onCancel={sessionSel.clearSelection}
            actions={[
              {
                icon: '✓', label: 'הושלם', primary: true,
                onClick: async () => {
                  const ids = Array.from(sessionSel.selectedIds);
                  try {
                    for (const id of ids) {
                      await supabase.from('sessions').update({ status: 'completed' }).eq('id', id);
                    }
                    queryClient.invalidateQueries({ queryKey: ['sessions'] });
                    queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
                    queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
                    toast.success(`${ids.length} מפגשים עודכנו`);
                    sessionSel.clearSelection();
                  } catch (e) { toast.error('שגיאה בעדכון'); }
                },
              },
              {
                icon: '❌', label: 'בטל',
                onClick: async () => {
                  const ids = Array.from(sessionSel.selectedIds);
                  try {
                    for (const id of ids) {
                      await supabase.from('sessions').update({ status: 'cancelled' }).eq('id', id);
                    }
                    queryClient.invalidateQueries({ queryKey: ['sessions'] });
                    queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
                    toast.success(`${ids.length} מפגשים בוטלו`);
                    sessionSel.clearSelection();
                  } catch (e) { toast.error('שגיאה בביטול'); }
                },
              },
              {
                icon: '🗑️', label: 'מחק', danger: true,
                onClick: async () => {
                  const ids = Array.from(sessionSel.selectedIds);
                  if (!window.confirm(`למחוק ${ids.length} מפגשים?`)) return;
                  try {
                    for (const id of ids) {
                      await supabase.from('sessions').update({
                        status: 'deleted',
                        deleted_at: new Date().toISOString(),
                      }).eq('id', id);
                    }
                    queryClient.invalidateQueries({ queryKey: ['sessions'] });
                    queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
                    toast.success(`${ids.length} מפגשים נמחקו`);
                    sessionSel.clearSelection();
                  } catch (e) { toast.error('שגיאה במחיקה'); }
                },
              },
            ]}
          />

          {/* ── Group Create/Edit Dialog ── */}
          <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>{editingGroup ? 'ערוך קבוצה' : 'קבוצה חדשה'}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>שם הקבוצה</Label><Input value={groupForm.name} onChange={e => setGroupForm({ ...groupForm, name: e.target.value })} className="rounded-xl mt-1" style={{ fontSize: 16 }} placeholder="למשל: קבוצת בוקר" /></div>
                <div><Label>תיאור (אופציונלי)</Label><Input value={groupForm.description} onChange={e => setGroupForm({ ...groupForm, description: e.target.value })} className="rounded-xl mt-1" style={{ fontSize: 16 }} placeholder="תיאור קצר" /></div>
                <Button
                  onClick={() => { if (!groupForm.name.trim()) { toast.error('נא למלא שם קבוצה'); return; } if (editingGroup) { updateGroupMutation.mutate({ id: editingGroup.id, data: { name: groupForm.name, description: groupForm.description } }); } else { createGroupMutation.mutate({ name: groupForm.name, description: groupForm.description, coach_id: user?.id, coach_name: coach?.full_name || '' }); } }}
                  disabled={createGroupMutation.isPending || updateGroupMutation.isPending}
                  className="w-full font-bold text-white rounded-xl min-h-[44px]" style={{ backgroundColor: '#4CAF50' }}
                >
                  {createGroupMutation.isPending || updateGroupMutation.isPending ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר...</> : (editingGroup ? 'עדכן קבוצה' : 'צור קבוצה')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* ── Group Members Dialog ── */}
          <Dialog open={showGroupMembersDialog} onOpenChange={setShowGroupMembersDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>חברי קבוצה: {selectedGroup?.name}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-gray-500">לחץ על מתאמן להוספה/הסרה מהקבוצה</p>
                {trainees.map(trainee => {
                  const existing = groupMembers.find(m => m.group_id === selectedGroup?.id && m.trainee_id === trainee.id);
                  return (
                    <div key={trainee.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
                      <div>
                        <div className="font-bold text-sm text-gray-900">{trainee.full_name}</div>
                        <div className="text-xs text-gray-500">{trainee.phone}</div>
                      </div>
                      <Button
                        onClick={() => { if (existing) { removeGroupMemberMutation.mutate(existing.id); } else { addGroupMemberMutation.mutate({ group_id: selectedGroup.id, trainee_id: trainee.id, trainee_name: trainee.full_name }); } }}
                        variant={existing ? 'default' : 'outline'}
                        className="text-xs h-9 px-3 rounded-xl font-bold min-w-[70px]"
                        style={existing ? { backgroundColor: '#4CAF50', color: 'white' } : {}}
                        disabled={addGroupMemberMutation.isPending || removeGroupMemberMutation.isPending}
                      >
                        {existing ? <><CheckSquare className="w-3 h-3 ml-1" />חבר</> : <><Square className="w-3 h-3 ml-1" />הוסף</>}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>

          {/* ── Group Session Dialog ── */}
          <Dialog open={showGroupSessionDialog} onOpenChange={setShowGroupSessionDialog}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>אימון קבוצתי: {selectedGroup?.name}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-xs text-gray-500">כל חברי הקבוצה ({groupMembers.filter(m => m.group_id === selectedGroup?.id).length}) יתווספו אוטומטית</p>
                <div><Label>תאריך</Label><Input type="date" value={groupSessionForm.date} onChange={e => setGroupSessionForm({ ...groupSessionForm, date: e.target.value })} className="rounded-xl mt-1" style={{ fontSize: 16 }} /></div>
                <div><Label>שעה</Label><Input type="time" value={groupSessionForm.time} onChange={e => setGroupSessionForm({ ...groupSessionForm, time: e.target.value })} className="rounded-xl mt-1" style={{ fontSize: 16 }} /></div>
                <div><Label>מיקום</Label><Input value={groupSessionForm.location} onChange={e => setGroupSessionForm({ ...groupSessionForm, location: e.target.value })} className="rounded-xl mt-1" style={{ fontSize: 16 }} /></div>
                <div><Label>הערות</Label><Input value={groupSessionForm.notes} onChange={e => setGroupSessionForm({ ...groupSessionForm, notes: e.target.value })} className="rounded-xl mt-1" style={{ fontSize: 16 }} /></div>
                <Button
                  onClick={() => createGroupSessionMutation.mutate({ group: selectedGroup, form: groupSessionForm })}
                  disabled={createGroupSessionMutation.isPending}
                  className="w-full font-bold text-white rounded-xl min-h-[44px]" style={{ backgroundColor: '#9C27B0' }}
                >
                  {createGroupSessionMutation.isPending ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />יוצר...</> : 'צור אימון לכל הקבוצה'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* ── Mark Group Attendance Dialog ── */}
          <Dialog open={!!markingGroupAttendance} onOpenChange={() => setMarkingGroupAttendance(null)}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>סימון נוכחות קבוצתית</DialogTitle></DialogHeader>
              {markingGroupAttendance && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">{markingGroupAttendance.group_name} • {markingGroupAttendance.date} • {markingGroupAttendance.time}</p>
                  <p className="text-xs text-gray-400">{markingGroupAttendance.participants?.filter(p => p.attendance_status && p.attendance_status !== 'ממתין').length || 0} / {markingGroupAttendance.participants?.length || 0} סומנו</p>

                  {/* Per-member attendance — 4 statuses */}
                  <div style={{ maxHeight: '40vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    {(markingGroupAttendance.participants || []).map((p, idx) => {
                      const statusConfig = [
                        { key: 'הגיע', color: '#16a34a', bg: '#dcfce7' },
                        { key: 'איחר', color: '#eab308', bg: '#fef9c3' },
                        { key: 'לא הגיע', color: '#dc2626', bg: '#fee2e2' },
                        { key: 'ביטל', color: '#6b7280', bg: '#f3f4f6' },
                      ];
                      return (
                        <div key={p.trainee_id || idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f5f5', direction: 'rtl', gap: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.trainee_name}</div>
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', flexShrink: 0 }}>
                            {statusConfig.map(st => {
                              const active = p.attendance_status === st.key;
                              return (
                                <button key={st.key} onClick={async () => {
                                  const newStatus = active ? 'ממתין' : st.key;
                                  const updated = markingGroupAttendance.participants.map(pp =>
                                    pp.trainee_id === p.trainee_id ? { ...pp, attendance_status: newStatus } : pp
                                  );
                                  try {
                                    await base44.entities.Session.update(markingGroupAttendance.id, { participants: updated });
                                    setMarkingGroupAttendance(prev => prev ? { ...prev, participants: updated } : null);
                                    queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
                                  } catch {}
                                }}
                                  style={{
                                    padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                                    border: `1.5px solid ${active ? st.color : '#eee'}`,
                                    background: active ? st.bg : 'white',
                                    color: active ? st.color : '#bbb',
                                    cursor: 'pointer', touchAction: 'manipulation',
                                  }}>
                                  {st.key}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Bulk actions */}
                  <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-gray-100">
                    <Button onClick={() => markGroupAttendanceMutation.mutate({ session: markingGroupAttendance, status: 'הגיע' })} disabled={markGroupAttendanceMutation.isPending} className="font-bold text-white rounded-lg min-h-[36px] text-[10px] px-1" style={{ backgroundColor: '#16a34a' }}>
                      כולם הגיעו
                    </Button>
                    <Button onClick={() => markGroupAttendanceMutation.mutate({ session: markingGroupAttendance, status: 'לא הגיע' })} disabled={markGroupAttendanceMutation.isPending} variant="outline" className="font-bold rounded-lg min-h-[36px] text-[10px] px-1 border-red-200 text-red-500">
                      לא הגיעו
                    </Button>
                    <Button onClick={() => markGroupAttendanceMutation.mutate({ session: markingGroupAttendance, status: 'ביטל' })} disabled={markGroupAttendanceMutation.isPending} variant="outline" className="font-bold rounded-lg min-h-[36px] text-[10px] px-1 text-gray-500 border-gray-200">
                      ביטל
                    </Button>
                  </div>
                  <Button onClick={() => markGroupAttendanceMutation.mutate({ session: markingGroupAttendance, status: 'ממתין' })} disabled={markGroupAttendanceMutation.isPending} variant="outline" className="font-bold rounded-lg min-h-[32px] text-[10px] w-full text-gray-400 border-gray-100 mt-1">
                    ↩ אפס הכל
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>

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
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold flex items-center gap-3" style={{ color: '#000000' }}>
                  <AlertTriangle className="w-8 h-8" style={{ color: '#f44336' }} />
                  מחק מפגש
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-6">
                {/* 24h deadline warning */}
                {deletingSession && (() => {
                  try {
                    const sessionTime = new Date(deletingSession.date + 'T' + (deletingSession.time || '00:00'));
                    const hoursUntil = (sessionTime - new Date()) / 3600000;
                    if (hoursUntil > 0 && hoursUntil < 24) {
                      return (
                        <div className="p-4 rounded-xl flex items-start gap-3" style={{ backgroundColor: '#FFF3E0', border: '2px solid #FF6F20' }}>
                          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#FF6F20' }} />
                          <div>
                            <p className="text-sm font-black" style={{ color: '#FF6F20' }}>אזהרה: פחות מ-24 שעות עד האימון!</p>
                            <p className="text-xs mt-1" style={{ color: '#000000' }}>
                              המפגש מתוכנן בעוד {Math.round(hoursUntil)} שעות. ביטול ברגע האחרון עלול לפגוע במתאמן.
                            </p>
                          </div>
                        </div>
                      );
                    }
                  } catch {}
                  return null;
                })()}
                <div className="p-5 rounded-xl" style={{ backgroundColor: '#FFEBEE', border: '2px solid #f44336' }}>
                  <p className="text-base leading-relaxed mb-3" style={{ color: '#000000' }}>
                    האם לבטל את המפגש?
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
                  <p className="text-sm" style={{ color: '#7D7D7D' }}>
                    המפגש יישאר בהיסטוריה עם סטטוס "בוטל".
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

                    חזור
                  </Button>
                  <Button
                    onClick={handleDeleteSession}
                    disabled={deleteSessionMutation.isPending}
                    className="flex-1 rounded-xl py-6 font-bold text-white"
                    style={{ backgroundColor: '#FF8F00' }}>

                    {deleteSessionMutation.isPending ?
                    <>
                        <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                        מבטל...
                      </> :

                    <>
                        ❌ כן, בטל מפגש
                      </>
                    }
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Permanent-delete dialog — separate red action that hides
              the session from every list. The row is preserved in DB
              with status='deleted' + deleted_at, so it can be
              recovered manually if needed. Hard DELETE is never used. */}
          <Dialog open={showPurgeDialog} onOpenChange={(open) => { if (!open) { setShowPurgeDialog(false); setPurgingSession(null); } }}>
            <DialogContent className="max-w-sm rounded-2xl">
              <div style={{ padding: 16, direction: 'rtl', textAlign: 'right' }}>
                <h3 className="text-xl font-black mb-3" style={{ color: '#000000' }}>
                  🗑️ מחיקת מפגש
                </h3>
                <p className="text-base leading-relaxed mb-3" style={{ color: '#000000' }}>
                  למחוק את המפגש לצמיתות?
                </p>
                {purgingSession && (
                  <div className="p-3 rounded-lg mb-3" style={{ backgroundColor: '#FFFFFF', border: '1px solid #FFCDD2' }}>
                    <p className="text-sm" style={{ color: '#7D7D7D' }}>
                      📅 {purgingSession.date} | ⏰ {purgingSession.time}
                    </p>
                    <p className="text-sm font-bold" style={{ color: '#000000' }}>
                      {purgingSession.participants?.length || 0} משתתפים רשומים
                    </p>
                  </div>
                )}
                <p className="text-sm font-bold mb-3" style={{ color: '#D32F2F' }}>
                  ⚠️ המפגש לא יופיע יותר באף רשימה.
                </p>

                <div className="flex gap-3">
                  <Button
                    onClick={() => { setShowPurgeDialog(false); setPurgingSession(null); }}
                    variant="outline"
                    className="flex-1 rounded-xl py-6 font-bold"
                    style={{ border: '1px solid #E0E0E0', color: '#000000' }}>
                    חזור
                  </Button>
                  <Button
                    onClick={() => purgeSessionMutation.mutate(purgingSession?.id)}
                    disabled={purgeSessionMutation.isPending || !purgingSession?.id}
                    className="flex-1 rounded-xl py-6 font-bold text-white"
                    style={{ backgroundColor: '#D32F2F' }}>
                    {purgeSessionMutation.isPending ? (
                      <>
                        <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                        מוחק...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-5 h-5 ml-2" />
                        כן, מחק לצמיתות
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <SessionEditModal
        session={sessionToEdit}
        isOpen={!!sessionToEdit}
        onClose={() => {
          setSessionToEdit(null);
          queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
          invalidateDashboard(queryClient);
        }}
      />

      {/* Completion guard — fires from handleSessionStatusChange
          when a coach tries to mark an unpaid paid-row complete.
          The dialog writes its own update + the audit notification;
          we just refresh the visible lists on confirm. */}
      <PaymentOverrideDialog
        session={overrideTarget}
        isOpen={!!overrideTarget}
        onCancel={() => setOverrideTarget(null)}
        onConfirm={() => {
          queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
          queryClient.invalidateQueries({ queryKey: ['sessions'] });
          queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
          invalidateDashboard(queryClient);
          setOverrideTarget(null);
        }}
      />
    </ProtectedCoachPage>);

}