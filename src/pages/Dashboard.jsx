import React, { useState, useEffect, useContext, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import {
  Users, UserPlus, Calendar, ClipboardList, Loader2,
  Target, Plus, Award, Search, Dumbbell, Bell,
  DollarSign, Ruler, LogOut, Package, Zap, Clock,
  Trophy, AlarmClock, Ticket, Timer,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { AuthContext } from "@/lib/AuthContext";
import PageLoader from "@/components/PageLoader";
import RemindersPanel from "@/components/RemindersPanel";
import NotificationPopup from "@/components/NotificationPopup";
import ChallengeBank from "@/components/ChallengeBank";

import { useDashboardStats } from "../components/hooks/useDashboardStats";
import { usePackageExpiry } from "../components/hooks/usePackageExpiry";
import { useBirthdayReminder } from "@/hooks/useBirthdayReminder";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS, invalidateDashboard } from "@/components/utils/queryKeys";
import { toast } from "sonner";
import { notifySessionScheduled, notifyPlanCreated } from "@/functions/notificationTriggers";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import PopupNotificationManager from "../components/PopupNotificationManager";
import RecentPaymentsCard from "../components/RecentPaymentsCard";
import AppSwitcher from "@/components/lifeos/AppSwitcher";
import AddTraineeDialog from "../components/forms/AddTraineeDialog";
import LeadFormDialog from "../components/forms/LeadFormDialog";
import SessionFormDialog from "../components/forms/SessionFormDialog";
import PlanFormDialog from "../components/training/PlanFormDialog";
import GoalFormDialog from "../components/forms/GoalFormDialog";
import ResultFormDialog from "../components/forms/ResultFormDialog";
import MeasurementFormDialog from "../components/forms/MeasurementFormDialog";
import PackageFormDialog from "../components/forms/PackageFormDialog";
import { openBaselineDialog } from "../components/forms/BaselineFormDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// ── Design ────────────────────────────────────────────────────────────
const SectionHeader = ({ title }) => (
  <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
    <div className="flex-1 h-[1.5px] rounded-full" style={{ backgroundColor: "#FF6F20" }} />
    <span className="whitespace-nowrap" style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>{title}</span>
    <div className="flex-1 h-[1.5px] rounded-full" style={{ backgroundColor: "#FF6F20" }} />
  </div>
);

// The cream halo background + soft orange ambient glows now live in
// the `.lumen-dashboard` CSS scope (index.css). The empty BG object
// is kept so any leftover style spreads (none currently) stay safe.
const BG = {};

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: coach } = useContext(AuthContext);
  usePackageExpiry(coach?.id);
  useBirthdayReminder(coach?.id);

  // Trainees with packages — real-time
  const [trainees, setTrainees] = useState([]);

  const fetchTrainees = useCallback(async () => {
    if (!coach?.id) return;
    try {
      const { data: services } = await supabase
        .from('client_services')
        .select('trainee_id')
        .eq('coach_id', coach.id);

      const traineeIds = [...new Set((services || []).map(s => s.trainee_id).filter(Boolean))];
      if (traineeIds.length === 0) { setTrainees([]); return; }

      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, client_services(id, status, total_sessions, remaining_sessions, used_sessions, start_date, end_date, package_name)')
        .in('id', traineeIds)
        .order('full_name');

      setTrainees(users || []);
    } catch (err) {
      console.error('[Dashboard] fetchTrainees error:', err);
    }
  }, [coach?.id]);

  useEffect(() => {
    fetchTrainees();

    if (!coach?.id) return;

    // Refresh both the local trainees list AND every TanStack Query that
    // feeds the dashboard counters (active trainees, active packages,
    // sessions, etc.). Without invalidateDashboard() the counters stayed
    // stale until window-focus refetch — that was the realtime bug.
    const onChange = () => {
      fetchTrainees();
      invalidateDashboard(queryClient);
    };

    const traineeChannel = supabase
      .channel(`dashboard-${coach.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_services' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, onChange)
      .subscribe();

    window.addEventListener('data-changed', onChange);

    return () => {
      supabase.removeChannel(traineeChannel);
      window.removeEventListener('data-changed', onChange);
    };
  }, [coach?.id, fetchTrainees, queryClient]);

  // Dialog states
  const [isAddTraineeOpen, setIsAddTraineeOpen] = useState(false);
  const [isLeadDialogOpen, setIsLeadDialogOpen] = useState(false);
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false);
  const [isGoalDialogOpen, setIsGoalDialogOpen] = useState(false);
  const [isResultDialogOpen, setIsResultDialogOpen] = useState(false);
  const [isMeasurementDialogOpen, setIsMeasurementDialogOpen] = useState(false);

  const [showActionPicker, setShowActionPicker] = useState(false);
  const [isPackageDialogOpen, setIsPackageDialogOpen] = useState(false);
  // Baseline dialog is mounted globally in App.jsx — opened here via
  // openBaselineDialog({ traineeId, traineeName }).

  // Trainee selection for goal/result/measurement actions
  const [showSelectTraineeDialog, setShowSelectTraineeDialog] = useState(false);
  const [selectedTrainee, setSelectedTrainee] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [traineeSearch, setTraineeSearch] = useState("");

  // Reminders — list + due-popup. Reminders live in the notifications
  // table with `type='coach_reminder'`. See RemindersPanel/AddForm.
  const [showReminders, setShowReminders] = useState(false);
  const [showChallengeBank, setShowChallengeBank] = useState(false);
  const [reminders, setReminders] = useState([]);
  const [duePopup, setDuePopup] = useState(null);
  const [shownReminderIds, setShownReminderIds] = useState(() => new Set());

  const { data: stats, isLoading: statsLoading } = useDashboardStats();

  // Reminders — fetch on mount, poll every 30s, surface the first overdue
  // one as a NotificationPopup (each reminder popped at most once per session).
  const fetchReminders = useCallback(async () => {
    if (!coach?.id) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', coach.id)
      .eq('type', 'coach_reminder')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('[Dashboard] reminders fetch failed:', error?.message);
      return;
    }
    setReminders(data || []);
  }, [coach?.id]);

  useEffect(() => {
    if (!coach?.id) return;
    fetchReminders();
    const iv = setInterval(fetchReminders, 30000);
    return () => clearInterval(iv);
  }, [coach?.id, fetchReminders]);

  useEffect(() => {
    if (duePopup) return;
    const now = new Date();
    const due = reminders.find(r =>
      !r.is_read &&
      r.data?.remind_at &&
      new Date(r.data.remind_at) <= now &&
      !shownReminderIds.has(r.id)
    );
    if (due) {
      setDuePopup(due);
      setShownReminderIds(prev => { const n = new Set(prev); n.add(due.id); return n; });
    }
  }, [reminders, duePopup, shownReminderIds]);

  // Direct trainees query — shared key with useDashboardStats, no initialData
  const { data: allTrainees = [] } = useQuery({
    queryKey: QUERY_KEYS.TRAINEES,
    queryFn: async () => {
      const users = await base44.entities.User.list('-created_at', 1000);
      return users.filter(u => u.role === 'user' || u.role === 'trainee');
    },
    staleTime: 1000 * 30,
    refetchOnMount: 'always',
  });

  // Force-refetch all dashboard data after any mutation
  const refreshAll = () => {
    queryClient.refetchQueries({ queryKey: QUERY_KEYS.TRAINEES });
    queryClient.refetchQueries({ queryKey: QUERY_KEYS.SERVICES });
    queryClient.refetchQueries({ queryKey: QUERY_KEYS.SESSIONS });
    queryClient.refetchQueries({ queryKey: QUERY_KEYS.PLANS });
    queryClient.refetchQueries({ queryKey: QUERY_KEYS.LEADS });
  };

  const {
    activeClientsCount = 0,
    upcomingSessionsCount = 0,
    newLeadsCount = 0,
    activePlansCount = 0,
    pendingSessionsCount = 0,
    expiringPackagesCount = 0,
    traineeCards = [],
  } = stats || {};

  // ── Handlers ────────────────────────────────────────────────────────
  const handleActionClick = (action) => {
    // Package action skips the legacy "pick a trainee" pre-dialog —
    // trainee selection is now step 1 of the unified wizard itself
    // (May 2026 spec). Other actions (goal/result/measurement/
    // baseline) still need a pre-pick because their dialogs assume a
    // selected trainee at mount.
    if (action === "package") {
      setSelectedTrainee(null);
      setPendingAction(null);
      setIsPackageDialogOpen(true);
      return;
    }
    setPendingAction(action);
    setTraineeSearch("");
    setShowSelectTraineeDialog(true);
  };

  const handleTraineeSelect = (trainee) => {
    setSelectedTrainee(trainee);
    setShowSelectTraineeDialog(false);
    if (pendingAction === "goal") setIsGoalDialogOpen(true);
    if (pendingAction === "result") setIsResultDialogOpen(true);
    if (pendingAction === "measurement") setIsMeasurementDialogOpen(true);
    if (pendingAction === "package") setIsPackageDialogOpen(true);
    if (pendingAction === "baseline") {
      // Open the global baseline dialog (mounted in App.jsx). Form
      // state + minimize pill survive route changes from there.
      openBaselineDialog({ traineeId: trainee.id, traineeName: trainee.full_name });
    }
  };

  // ── Mutations ───────────────────────────────────────────────────────
  const createLeadMutation = useMutation({
    mutationFn: async (data) => {
      const result = await base44.entities.Lead.create(data);
      return result;
    },
    onSuccess: () => {
      refreshAll();
      toast.success("ליד חדש נוסף בהצלחה");
    },
    onError: (e) => {
      console.error("[Dashboard] Lead creation error:", e);
      toast.error("שגיאה ביצירת ליד: " + (e.message || "נסה שוב"));
    },
  });

  const createSessionMutation = useMutation({
    mutationFn: (d) => {
      return base44.entities.Session.create(d);
    },
    onSuccess: async (s) => {
      refreshAll();
      queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
      toast.success("המפגש נקבע בהצלחה");
      if (s?.participants && coach) {
        for (const p of s.participants) {
          try {
            await notifySessionScheduled({ traineeId: p.trainee_id, sessionId: s.id, sessionDate: s.date, sessionTime: s.time, sessionType: s.session_type, coachName: coach.full_name });
          } catch {}
        }
      }
    },
    onError: (e) => {
      console.error("[Dashboard] Session creation error:", e);
      toast.error("שגיאה ביצירת מפגש: " + (e.message || "נסה שוב"));
    },
  });

  const createPlanMutation = useMutation({
    mutationFn: async ({ planData, selectedTrainees }) => {
      if (!coach?.id) throw new Error("פרטי מאמן חסרים");
      const gf = Array.isArray(planData.goal_focus) && planData.goal_focus.length > 0 ? planData.goal_focus : ["כוח"];
      const targets = selectedTrainees?.length > 0 ? selectedTrainees : [null];
      const results = [];
      for (const tid of targets) {
        const t = allTrainees.find((x) => x.id === tid);
        results.push(await base44.entities.TrainingPlan.create({
          title: planData.plan_name, plan_name: planData.plan_name,
          assigned_to: t?.id || "", assigned_to_name: t?.full_name || "",
          created_by: coach.id, created_by_name: coach.full_name,
          goal_focus: gf,
          weekly_days: Array.isArray(planData.weekly_days) ? planData.weekly_days : [],
          difficulty_level: planData.difficulty_level || null,
          duration_weeks: typeof planData.duration_weeks === 'number' ? planData.duration_weeks : null,
          description: planData.description || "",
          start_date: new Date().toISOString().split("T")[0], status: "פעילה", is_template: false,
        }));
      }
      return results;
    },
    onSuccess: async (results) => {
      refreshAll();
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      toast.success("תוכנית נוצרה!");
      // Notify assigned trainees
      if (results && coach) {
        for (const plan of results) {
          if (plan.assigned_to) {
            try {
              await notifyPlanCreated({
                traineeId: plan.assigned_to,
                traineeName: plan.assigned_to_name,
                planName: plan.plan_name || plan.title,
                coachId: coach.id,
                coachName: coach.full_name,
              });
            } catch {}
          }
        }
      }
      if (results?.length === 1 && results[0]?.id) {
        navigate(createPageUrl("PlanBuilder") + `?planId=${results[0].id}`);
      } else {
        navigate(createPageUrl("PlanBuilder"));
      }
    },
    onError: (e) => {
      console.error("[Dashboard] Plan creation error:", e);
      toast.error("שגיאה ביצירת תוכנית: " + (e.message || "נסה שוב"));
    },
  });

  // ── Loading ─────────────────────────────────────────────────────────
  if (!coach) {
    return (
      <ProtectedCoachPage>
        <PageLoader />
      </ProtectedCoachPage>
    );
  }

  // ── RENDER ──────────────────────────────────────────────────────────
  return (
    <ProtectedCoachPage>
      {/* Popup queue: trainee onboarding-complete + session
          confirm/cancel + past-date "what happened?" prompts.
          Coach-only by design (the manager checks isCoach before
          fetching anything). */}
      <PopupNotificationManager />

      <div className="flex flex-col lumen-dashboard" dir="rtl" style={BG}>
        {/* Inner column — fills the viewport (minHeight, not height)
            so each section keeps its intrinsic size. The earlier
            "height + overflow:hidden" lock was squishing the diamond
            container and clipping the second quick-access row on
            shorter viewports. Sections that MUST keep their height
            now carry flex-shrink:0 explicitly. */}
        <div
          className="max-w-md mx-auto w-full"
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 'calc(100vh - 116px)',
            padding: '8px 12px 0',
          }}
        >

          {/* App switcher — only renders for the Life OS coach. */}
          <AppSwitcher />

          {/* ═══ SECTION 1 — פעולות ליבה (tight 280px, final spec) ═══════ */}
          <div style={{ padding: '4px 12px 8px', overflow: 'visible' }}>
            <h3 style={{
              textAlign: 'right',
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--ag-text-primary)',
              margin: '8px 16px 12px',
              fontFamily: "'Bebas Neue', sans-serif",
              // Stays above the diamond layer so the rotated 115×115
              // top-tip can't visually cover the title text.
              position: 'relative',
              zIndex: 2,
            }}>
              פעולות ליבה
            </h3>
          <div style={{
            position: 'relative',
            width: '100%',
            height: 280,
            flexShrink: 0,
            margin: '0 auto',
            overflow: 'visible',
          }}>
            {[
              // The + is a text character (not an emoji) so it stays orange.
              { line1: 'הוסף', line2: 'מתאמן', emoji: '+',  iconSize: 32, iconWeight: 300, iconColor: '#FF6F20',
                onClick: () => setIsAddTraineeOpen(true),
                pos: { top: 0, left: '50%', marginLeft: -55 } },
              { line1: 'הוסף', line2: 'ליד',    emoji: '👥', iconSize: 26, iconColor: '#7F47B5',
                onClick: () => setIsLeadDialogOpen(true),
                pos: { top: 85, right: 18 } },
              { line1: 'בנה',  line2: 'תוכנית', emoji: '📋', iconSize: 26, iconColor: '#EAB308',
                onClick: () => setIsPlanDialogOpen(true),
                pos: { top: 85, left: 18 } },
              { line1: 'קבע',  line2: 'מפגש',   emoji: '📅', iconSize: 26, iconColor: '#3B82F6',
                onClick: () => setIsSessionDialogOpen(true),
                pos: { top: 170, left: '50%', marginLeft: -55 } },
            ].map((btn) => (
              <button
                key={`${btn.line1}-${btn.line2}`}
                onClick={btn.onClick}
                onMouseEnter={(e) => {
                  // Floating-card lift on hover. Mirrors --ag-shadow-high
                  // but slightly deeper to read as an active state.
                  e.currentTarget.style.boxShadow =
                    '0 1px 3px rgba(78,54,30,0.06), 0 18px 32px -14px rgba(78,54,30,0.24)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'var(--ag-shadow-high)';
                }}
                style={{
                  position: 'absolute',
                  width: 110, height: 110,
                  background: 'var(--ag-surface)',
                  borderRadius: 'var(--ag-radius-icon-btn)',
                  // Lumen: white surface + soft layered shadow over the
                  // cream halo background creates the "floating white
                  // card" look. No more brand-orange glow on every tile
                  // — that drag has moved to true CTAs only.
                  boxShadow: 'var(--ag-shadow-high)',
                  border: '1px solid var(--ag-line)',
                  cursor: 'pointer',
                  padding: 0,
                  overflow: 'visible',
                  transform: 'rotate(45deg)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  ...btn.pos,
                }}
                className="active:scale-[0.97]"
              >
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  transform: 'rotate(-45deg)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  overflow: 'visible',
                }}>
                  <div style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--ag-text-primary)',
                    lineHeight: 1.15,
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                  }}>
                    {btn.line1}<br />{btn.line2}
                  </div>
                  <span style={{
                    fontSize: btn.iconSize,
                    lineHeight: 1,
                    color: btn.iconColor || undefined,
                    fontWeight: btn.iconWeight || undefined,
                  }}>
                    {btn.emoji}
                  </span>
                </div>
              </button>
            ))}
          </div>
          </div>

          {/* ═══ SECTION 3 — מתאמנים (hidden — keeps the home screen
                no-scroll. The full trainees list lives in /AllUsers.) */}
          {false && trainees.length > 0 && (
            <>
              <SectionHeader title="מתאמנים" />
              <div style={{
                overflowX: 'auto',
                overflowY: 'hidden',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                padding: '4px 0 8px'
              }}>
                <style>{`.trainees-row::-webkit-scrollbar { display: none; }`}</style>
                <div className="trainees-row" style={{
                  display: 'flex',
                  flexDirection: 'row',
                  gap: '12px',
                  width: 'max-content',
                  padding: '0 16px'
                }}>
                  {trainees.map((trainee) => {
                    const activePackage = trainee.client_services?.find(pkg =>
                      (pkg.status === 'active' || pkg.status === 'פעיל') &&
                      ((pkg.remaining_sessions ?? (pkg.total_sessions - (pkg.used_sessions || 0))) > 0) &&
                      (!pkg.end_date || new Date(pkg.end_date) >= new Date())
                    );

                    const total = activePackage?.total_sessions ?? 0;
                    const remaining = activePackage?.remaining_sessions ?? (total - (activePackage?.used_sessions || 0));
                    const used = total - remaining;

                    return (
                      <div
                        key={trainee.id}
                        onClick={() => navigate(createPageUrl('TraineeProfile') + `?userId=${encodeURIComponent(trainee.id)}`)}
                        style={{
                          width: '120px',
                          flexShrink: 0,
                          background: 'white',
                          border: '0.5px solid #eee',
                          borderRadius: '16px',
                          padding: '14px 10px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
                        }}
                      >
                        {/* Avatar */}
                        <div style={{
                          width: '48px', height: '48px',
                          borderRadius: '50%',
                          background: '#FF6F20',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '20px', fontWeight: '900', color: 'white'
                        }}>
                          {(trainee.full_name || '?')[0]}
                        </div>

                        {/* Name */}
                        <div style={{
                          fontSize: '13px', fontWeight: '700', color: '#1a1a1a',
                          textAlign: 'center',
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap', width: '100%'
                        }}>
                          {trainee.full_name}
                        </div>

                        {/* Package info */}
                        {activePackage ? (
                          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ fontSize: '11px', color: '#666', textAlign: 'center' }}>
                              {remaining} נותרו
                            </div>
                            <div style={{
                              height: '4px', background: '#F0F0F0',
                              borderRadius: '2px', overflow: 'hidden'
                            }}>
                              <div style={{
                                height: '100%',
                                width: `${total > 0 ? (used / total) * 100 : 0}%`,
                                background: remaining <= 1 ? '#ef4444' : '#FF6F20',
                                borderRadius: '2px'
                              }}/>
                            </div>
                          </div>
                        ) : (
                          <div style={{
                            fontSize: '10px', color: '#FF6F20',
                            fontWeight: '600', textAlign: 'center'
                          }}>
                            אין חבילה
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ═══ SECTION — תשלומים אחרונים ═══════════════════════ */}
          <RecentPaymentsCard coachId={coach?.id} />

          {/* ═══ SECTION 4 — גישה מהירה (final spec: 78×78, lucide SVG icons) ═══════ */}
          <div style={{ padding: '8px 14px 12px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ height: 1, background: '#FF6F20', flex: 1 }} />
              <span style={{
                fontSize: 14, fontWeight: 700, color: 'var(--ag-text-primary)',
                fontFamily: "'Bebas Neue', sans-serif",
              }}>
                גישה מהירה
              </span>
              <div style={{ height: 1, background: '#FF6F20', flex: 1 }} />
            </div>
            {(() => {
              const pendingReminders = reminders.filter(r => !r.is_read).length;
              // RTL visual order — first row mimics: שעונים / שיא /
              // יעד / בייסליין (reading right-to-left). DOM array is
              // already in the natural visual order; the dir="rtl" on
              // the page container handles the right-to-left flow.
              const row1 = [
                { label: "שעונים",   Icon: Timer,      color: '#888',
                  action: () => navigate(createPageUrl("Clocks")) },
                { label: "שיא",       Icon: Trophy,     color: '#EAB308',
                  action: () => handleActionClick("result") },
                { label: "יעד",       Icon: Target,     color: '#dc2626',
                  action: () => handleActionClick("goal") },
                { label: "בייסליין",  Icon: Zap,        color: '#FF6F20',
                  action: () => handleActionClick("baseline") },
              ];
              const row2 = [
                { label: "התראות",    Icon: Bell,       color: '#EAB308',
                  action: () => navigate(createPageUrl("Notifications")) },
                { label: "תזכורות",   Icon: AlarmClock, color: '#dc2626',
                  action: () => setShowReminders(true),
                  badge: pendingReminders > 0 ? pendingReminders : null },
                { label: "מדידה",     Icon: Ruler,      color: '#3B82F6',
                  action: () => handleActionClick("measurement") },
                { label: "חבילה",     Icon: Ticket,     color: '#888',
                  action: () => handleActionClick("package") },
              ];
              const renderCard = (q) => {
                const IconComp = q.Icon;
                return (
                  <button
                    key={q.label}
                    onClick={q.action}
                    style={{
                      // aspectRatio + explicit height — height is the
                      // fallback for older iOS Safari where aspectRatio
                      // inside a grid cell doesn't kick in.
                      aspectRatio: '1 / 1',
                      height: 70,
                      // Lumen: secondary card → white surface + med
                      // shadow + hairline for a subtle floating feel.
                      background: 'var(--ag-surface)',
                      borderRadius: 'var(--ag-radius-icon-btn)',
                      boxShadow: 'var(--ag-shadow-med)',
                      border: '1px solid var(--ag-line)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3,
                      cursor: 'pointer',
                      position: 'relative',
                      padding: 0,
                    }}
                    className="active:scale-[0.97] transition-transform"
                  >
                    <IconComp size={22} color={q.color} strokeWidth={2} />
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: 'var(--ag-text-primary)', textAlign: 'center',
                      lineHeight: 1.2,
                    }}>
                      {q.label}
                    </span>
                    {q.badge != null && q.badge > 0 && (
                      <div style={{
                        position: 'absolute', top: 6, left: 6,
                        width: 18, height: 18, borderRadius: '50%',
                        background: '#FF6F20', color: 'white',
                        fontSize: 10, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{q.badge}</div>
                    )}
                  </button>
                );
              };
              return (
                <>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 8,
                    marginBottom: 8,
                  }}>
                    {row1.map(renderCard)}
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 8,
                    marginBottom: 8,
                  }}>
                    {row2.map(renderCard)}
                  </div>
                </>
              );
            })()}
          </div>

        </div>
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────── */}
      <AddTraineeDialog open={isAddTraineeOpen} onClose={() => { setIsAddTraineeOpen(false); refreshAll(); }} />
      <LeadFormDialog isOpen={isLeadDialogOpen} onClose={() => setIsLeadDialogOpen(false)}
        onSubmit={async (data) => {
          // Canonical leads schema is user_id + name (not coach_id +
          // full_name). RLS rejects owner-less rows with WITH CHECK
          // (auth.uid() = user_id), so the legacy coach_id alias
          // would silently fail.
          await createLeadMutation.mutateAsync({ ...data, user_id: coach?.id || null });
        }}
        isLoading={createLeadMutation.isPending} />
      <SessionFormDialog isOpen={isSessionDialogOpen} onClose={() => setIsSessionDialogOpen(false)}
        onSubmit={async (data) => {
          // Honor 'הושלם' from the form (past-date heuristic in
          // SessionFormDialog) so retroactive sessions don't get
          // forced back into "ממתין לאישור".
          await createSessionMutation.mutateAsync({
            ...data,
            location: data.location || "לא צוין",
            duration: data.duration || 60,
            coach_id: coach?.id,
            status: data.status === 'הושלם' ? 'הושלם' : 'ממתין לאישור',
          });
        }}
        trainees={allTrainees} isLoading={createSessionMutation.isPending} />
      <PlanFormDialog isOpen={isPlanDialogOpen} onClose={() => setIsPlanDialogOpen(false)}
        onSubmit={async (data) => { await createPlanMutation.mutateAsync(data); }}
        trainees={allTrainees} isLoading={createPlanMutation.isPending} />

      {/* Action Picker removed — שיא/יעד/בייסליין are separate buttons now */}
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogContent><div /></DialogContent>
      </Dialog>

      {/* Select Trainee Dialog */}
      <Dialog open={showSelectTraineeDialog} onOpenChange={setShowSelectTraineeDialog}>
        <DialogContent className="max-w-sm p-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-right">בחר מתאמן</DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
            <Input placeholder="חפש מתאמן..." value={traineeSearch}
              onChange={(e) => setTraineeSearch(e.target.value)} className="pr-9 h-10 rounded-xl" />
          </div>
          <div className="space-y-2">
            {allTrainees.filter((t) => t.full_name?.includes(traineeSearch)).map((trainee) => (
              <div key={trainee.id} onClick={() => handleTraineeSelect(trainee)}
                className="p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                  {trainee.full_name?.[0]}
                </div>
                <span className="font-medium text-sm text-gray-800">{trainee.full_name}</span>
              </div>
            ))}
            {allTrainees.length === 0 && <p className="text-center text-gray-400 text-sm py-4">אין מתאמנים</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Trainee-specific form dialogs (gated on a pre-picked trainee) */}
      {selectedTrainee && (
        <>
          <GoalFormDialog isOpen={isGoalDialogOpen} onClose={() => setIsGoalDialogOpen(false)}
            traineeId={selectedTrainee.id} traineeName={selectedTrainee.full_name} />
          <ResultFormDialog isOpen={isResultDialogOpen} onClose={() => setIsResultDialogOpen(false)}
            traineeId={selectedTrainee.id} traineeName={selectedTrainee.full_name} />
          <MeasurementFormDialog isOpen={isMeasurementDialogOpen} onClose={() => setIsMeasurementDialogOpen(false)}
            traineeId={selectedTrainee.id} traineeName={selectedTrainee.full_name} />
          {/* BaselineFormDialog mounted at App.jsx root — opened via
              openBaselineDialog() in handleTraineeSelect. */}
        </>
      )}

      {/* Add-package wizard — mounted outside the selectedTrainee
          guard so the dashboard "🎫 חבילה" quick action can open it
          with no preselected trainee (step 1 picks one). */}
      <PackageFormDialog
        isOpen={isPackageDialogOpen}
        onClose={() => setIsPackageDialogOpen(false)}
        traineeId={selectedTrainee?.id || null}
        traineeName={selectedTrainee?.full_name || null}
      />

      <RemindersPanel
        isOpen={showReminders}
        onClose={() => setShowReminders(false)}
        userId={coach?.id}
        onChange={setReminders}
      />
      <ChallengeBank
        isOpen={showChallengeBank}
        onClose={() => setShowChallengeBank(false)}
        coach={coach}
        trainees={allTrainees}
      />
      {duePopup && (
        <NotificationPopup
          notification={duePopup}
          onDismiss={() => setDuePopup(null)}
          onTap={() => { setDuePopup(null); setShowReminders(true); }}
        />
      )}
      {/* MentorChat is global (App.jsx). Trigger sits in Layout's header. */}
    </ProtectedCoachPage>
  );
}
