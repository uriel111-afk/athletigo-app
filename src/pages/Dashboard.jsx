import React, { useState, useEffect, useContext, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import {
  Users, UserPlus, Calendar, ClipboardList, Loader2,
  Target, Plus, Award, Search, Dumbbell, Bell,
  DollarSign, Ruler, LogOut, Package, Zap, Clock
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { AuthContext } from "@/lib/AuthContext";

import { useDashboardStats } from "../components/hooks/useDashboardStats";
import { usePackageExpiry } from "../components/hooks/usePackageExpiry";
import { useBirthdayReminder } from "@/hooks/useBirthdayReminder";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS, invalidateDashboard } from "@/components/utils/queryKeys";
import { toast } from "sonner";
import { notifySessionScheduled, notifyPlanCreated } from "@/functions/notificationTriggers";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import AddTraineeDialog from "../components/forms/AddTraineeDialog";
import LeadFormDialog from "../components/forms/LeadFormDialog";
import SessionFormDialog from "../components/forms/SessionFormDialog";
import PlanFormDialog from "../components/training/PlanFormDialog";
import GoalFormDialog from "../components/forms/GoalFormDialog";
import ResultFormDialog from "../components/forms/ResultFormDialog";
import MeasurementFormDialog from "../components/forms/MeasurementFormDialog";
import PackageFormDialog from "../components/forms/PackageFormDialog";
import BaselineFormDialog from "../components/forms/BaselineFormDialog";
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

const BG = {
  backgroundColor: "#FDF8F3",
};

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
  const [isBaselineDialogOpen, setIsBaselineDialogOpen] = useState(false);

  // Trainee selection for goal/result/measurement actions
  const [showSelectTraineeDialog, setShowSelectTraineeDialog] = useState(false);
  const [selectedTrainee, setSelectedTrainee] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [traineeSearch, setTraineeSearch] = useState("");

  const { data: stats, isLoading: statsLoading } = useDashboardStats();

  // Due 48-hour plan follow-ups for this coach — scheduled_at is set 48h
  // ahead when a plan is sent. We surface rows that are past due and
  // still unread; the coach dismisses them by tapping (marks is_read).
  const { data: planFollowUps = [], refetch: refetchFollowUps } = useQuery({
    queryKey: ['plan-followups', coach?.id],
    queryFn: async () => {
      if (!coach?.id) return [];
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', coach.id)
          .eq('type', 'plan_followup')
          .eq('is_read', false)
          .lte('scheduled_at', new Date().toISOString())
          .order('scheduled_at', { ascending: true });
        if (error) throw error;
        return data || [];
      } catch (err) {
        console.warn('[Dashboard] plan-followups query failed:', err?.message);
        return [];
      }
    },
    enabled: !!coach?.id,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const dismissFollowUp = async (id) => {
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', id);
      refetchFollowUps();
    } catch (err) {
      console.warn('[Dashboard] dismiss follow-up failed:', err?.message);
    }
  };

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
    if (pendingAction === "baseline") setIsBaselineDialogOpen(true);
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
          goal_focus: gf, description: planData.description || "",
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
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#FF6F20]" />
        </div>
      </ProtectedCoachPage>
    );
  }

  // ── RENDER ──────────────────────────────────────────────────────────
  return (
    <ProtectedCoachPage>
      <div className="flex flex-col" dir="rtl" style={BG}>
        <div className="max-w-md mx-auto w-full pt-1 pb-1">

          {/* ═══ SECTION 1 — פעולות ליבה (diamond layout) ═══════
                Container overflow:visible so the rotated 84×84
                squares can spill past the 210×210 box corners. */}
          <SectionHeader title="פעולות ליבה" />
          <div style={{
            position: 'relative',
            width: 210, height: 210,
            margin: '0 auto 12px',
            overflow: 'visible',
          }}>
            {[
              // The + is a text character (not an emoji) so it stays orange.
              { label: "הוסף מתאמן",  emoji: "+",  orange: true,  onClick: () => setIsAddTraineeOpen(true),    pos: { top: 0,   left: '50%', transform: 'translateX(-50%) rotate(45deg)' } },
              { label: "הוסף ליד",    emoji: "👥",                onClick: () => setIsLeadDialogOpen(true),     pos: { top: 63,  right: 0,    transform: 'rotate(45deg)' } },
              { label: "בנה תוכנית",  emoji: "📋",                onClick: () => setIsPlanDialogOpen(true),     pos: { top: 63,  left: 0,     transform: 'rotate(45deg)' } },
              { label: "קבע מפגש",    emoji: "📅",                onClick: () => setIsSessionDialogOpen(true), pos: { top: 126, left: '50%', transform: 'translateX(-50%) rotate(45deg)' } },
            ].map((btn) => (
              <button
                key={btn.label}
                onClick={btn.onClick}
                style={{
                  position: 'absolute',
                  width: 84, height: 84,
                  background: 'white',
                  borderRadius: 14,
                  boxShadow: '0 4px 14px rgba(255,111,32,0.18)',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  overflow: 'visible',
                  ...btn.pos,
                }}
                className="hover:shadow-lg active:scale-[0.97] transition-all"
              >
                <div style={{
                  width: '100%', height: '100%',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 4,
                  transform: 'rotate(-45deg)',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a', textAlign: 'center', lineHeight: 1.15, padding: '0 4px' }}>
                    {btn.label}
                  </span>
                  <span style={{
                    fontSize: 22,
                    lineHeight: 1,
                    color: btn.orange ? '#FF6F20' : undefined,
                    fontWeight: btn.orange ? 700 : undefined,
                  }}>
                    {btn.emoji}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* ═══ SECTION — תזכורות מעקב (plan follow-ups, 48h after send) ═══ */}
          {planFollowUps.length > 0 && (
            <div style={{ padding: '0 8px', marginBottom: 10 }}>
              <SectionHeader title="תזכורות מעקב" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {planFollowUps.map((fu) => (
                  <button
                    key={fu.id}
                    onClick={() => dismissFollowUp(fu.id)}
                    style={{
                      background: '#FFF9F0',
                      border: '1px solid #FFD0A0',
                      borderRadius: 10,
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      textAlign: 'right',
                      cursor: 'pointer',
                      direction: 'rtl',
                    }}
                    title="סמן כנקרא"
                  >
                    <span style={{ fontSize: 18, lineHeight: 1 }}>⏰</span>
                    <span style={{ flex: 1, fontSize: 13, color: '#1a1a1a', lineHeight: 1.35 }}>
                      {fu.message}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ═══ SECTION 2 — מטריקות מרכזיות (4-col row) ═══════ */}
          <SectionHeader title="מטריקות" />
          <div className="grid grid-cols-4 px-2" style={{ gap: 6, marginBottom: 10 }}>
            {[
              { label: "לידים חדשים",    value: newLeadsCount,         color: "#dc2626", rgb: "220,38,38",   to: createPageUrl("Leads") + "?filter=new" },
              { label: "מפגשים קרובים",  value: upcomingSessionsCount, color: "#7F47B5", rgb: "127,71,181",  to: createPageUrl("Sessions") + "?status=upcoming" },
              { label: "מתאמנים פעילים", value: activeClientsCount,    color: "#16a34a", rgb: "22,163,74",   to: createPageUrl("AllUsers") + "?filter=active" },
              { label: "תוכניות פעילות", value: activePlansCount,      color: "#FF6F20", rgb: "255,111,32",  to: createPageUrl("PlanBuilder") },
            ].map((m) => (
              <button key={m.label} onClick={() => navigate(m.to)}
                className="bg-white flex flex-col items-center cursor-pointer transition-all active:scale-[0.97]"
                style={{
                  borderRadius: 12,
                  padding: '10px 4px',
                  border: '1px solid rgba(0,0,0,0.04)',
                  boxShadow: `0 3px 10px rgba(${m.rgb}, 0.12)`,
                }}>
                {statsLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
                ) : (
                  <span className="leading-none" style={{ color: m.color, fontSize: 28, fontWeight: 500 }}>{m.value}</span>
                )}
                <span className="mt-1 text-center leading-tight" style={{ color: '#1a1a1a', fontSize: 11, fontWeight: 600 }}>{m.label}</span>
              </button>
            ))}
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
                        onClick={() => navigate(`/trainee/${trainee.id}`)}
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

          {/* ═══ SECTION 4 — גישה מהירה (circular icons) ═══════ */}
          <SectionHeader title="גישה מהירה" />
          {(() => {
            const quickItems = [
              { label: "בייסליין",  emoji: "⚡",   action: () => handleActionClick("baseline") },
              { label: "יעד",       emoji: "🎯",   action: () => handleActionClick("goal") },
              { label: "שיא",       emoji: "🏆",   action: () => handleActionClick("result") },
              { label: "שעונים",    emoji: "⏱️",   action: () => navigate(createPageUrl("Clocks")) },
              { label: "חבילה",     emoji: "🎫",   action: () => handleActionClick("package") },
              { label: "מדידה",     emoji: "📐",   action: () => handleActionClick("measurement") },
              { label: "התראות",    emoji: "🔔",   action: () => navigate(createPageUrl("Notifications")) },
            ];
            const renderItem = (q) => (
              <button key={q.label} onClick={q.action}
                className="flex flex-col items-center bg-transparent border-none cursor-pointer active:scale-[0.95] transition-transform"
                style={{ background: 'transparent', gap: 4 }}>
                <div style={{
                  width: 54, height: 54,
                  borderRadius: 14,
                  background: 'white',
                  boxShadow: '0 3px 10px rgba(255,111,32,0.14)',
                  border: '1px solid rgba(0,0,0,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24,
                  lineHeight: 1,
                }}>
                  {q.emoji}
                </div>
                <span style={{ color: '#1a1a1a', fontSize: 12, fontWeight: 600 }}>{q.label}</span>
              </button>
            );
            return (
              <div className="px-2 pb-2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="flex justify-around items-start" style={{ gap: 8 }}>
                  {quickItems.slice(0, 4).map(renderItem)}
                </div>
                <div className="flex justify-around items-start" style={{ gap: 8, paddingInline: '12%' }}>
                  {quickItems.slice(4).map(renderItem)}
                </div>
              </div>
            );
          })()}

        </div>
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────── */}
      <AddTraineeDialog open={isAddTraineeOpen} onClose={() => { setIsAddTraineeOpen(false); refreshAll(); }} />
      <LeadFormDialog isOpen={isLeadDialogOpen} onClose={() => setIsLeadDialogOpen(false)}
        onSubmit={async (data) => {
          await createLeadMutation.mutateAsync({ ...data, coach_id: coach?.id || null });
        }}
        isLoading={createLeadMutation.isPending} />
      <SessionFormDialog isOpen={isSessionDialogOpen} onClose={() => setIsSessionDialogOpen(false)}
        onSubmit={async (data) => {
          await createSessionMutation.mutateAsync({ ...data, location: data.location || "לא צוין", duration: data.duration || 60, coach_id: coach?.id, status: "ממתין לאישור" });
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

      {/* Trainee-specific form dialogs */}
      {selectedTrainee && (
        <>
          <GoalFormDialog isOpen={isGoalDialogOpen} onClose={() => setIsGoalDialogOpen(false)}
            traineeId={selectedTrainee.id} traineeName={selectedTrainee.full_name} />
          <ResultFormDialog isOpen={isResultDialogOpen} onClose={() => setIsResultDialogOpen(false)}
            traineeId={selectedTrainee.id} traineeName={selectedTrainee.full_name} />
          <MeasurementFormDialog isOpen={isMeasurementDialogOpen} onClose={() => setIsMeasurementDialogOpen(false)}
            traineeId={selectedTrainee.id} traineeName={selectedTrainee.full_name} />
          <PackageFormDialog isOpen={isPackageDialogOpen} onClose={() => setIsPackageDialogOpen(false)}
            traineeId={selectedTrainee.id} traineeName={selectedTrainee.full_name} />
          <BaselineFormDialog isOpen={isBaselineDialogOpen} onClose={() => setIsBaselineDialogOpen(false)}
            traineeId={selectedTrainee.id} traineeName={selectedTrainee.full_name} />
        </>
      )}
    </ProtectedCoachPage>
  );
}
