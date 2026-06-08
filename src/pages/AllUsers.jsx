import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import RenameUserDialog from "../components/forms/RenameUserDialog";
import AddTraineeDialog from "../components/forms/AddTraineeDialog";
import AddCoachDialog from "../components/forms/AddCoachDialog";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { useClientStats } from "../components/hooks/useClientStats";
import { useSessionStats } from "../components/hooks/useSessionStats";
import PageLoader from "../components/PageLoader";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ProtectedCoachPage from "../components/ProtectedCoachPage";
import { normalizeStatus, isActivePackage } from "@/lib/enums";
import useMultiSelect from "../hooks/useMultiSelect";
import { MultiSelectBar, SelectCheckbox } from "../components/MultiSelectBar";
import { calculateAge as calcAge, formatBirthWithAge, daysUntilBirthday } from "@/lib/dateHelpers";
import FastAttendanceDialog from "../components/groups/FastAttendanceDialog";
import PlanFormDialog from "../components/training/PlanFormDialog";
import TraineeNoteDialog from "../components/groups/TraineeNoteDialog";
import CreateGroupDialog from "../components/groups/CreateGroupDialog";
import MemberEligibilityDialog from "../components/groups/MemberEligibilityDialog";
import MeasurementFormDialog from "../components/forms/MeasurementFormDialog";
import NewRecordDialog from "../components/forms/NewRecordDialog";
import { openBaselineDialog } from "../components/forms/BaselineFormDialog";
import { ATHLETIGO_ADMIN_UUID } from "@/constants/admin";
import { Filter, Search, Users } from "lucide-react";

// Service-type normalizer. client_services.service_type is mixed in
// the live DB: post-migration English keys ('personal'/'online'/'group')
// alongside legacy Hebrew labels ('אישי'/'אונליין'/'קבוצתי') AND the
// long legacy forms ('אימונים אישיים'/'ליווי אונליין'/'פעילות קבוצתית').
// All three shapes collapse onto the canonical English key here so the
// service filter doesn't have to care which row was written when.
function normalizeServiceType(v) {
  const s = (v == null ? '' : String(v)).toLowerCase().trim();
  if (!s) return null;
  if (s === 'personal' || s.includes('אישי')) return 'personal';
  if (s === 'online'   || s.includes('אונליין')) return 'online';
  if (s === 'group'    || s.includes('קבוצתי') || s.includes('פעילות קבוצתית')) return 'group';
  return null;
}

export default function AllUsers() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  // Tighter gate for the "+ מאמן חדש" button — only Oriel (the owner
  // account) sees it. role==='admin' still gates the rest of the
  // admin-shaped UI elsewhere, but coach onboarding stays a single-
  // user privilege per the redesign brief.
  const isOwnerAdmin = currentUser?.id === ATHLETIGO_ADMIN_UUID;
  console.log('[AllUsers] render gate:', { role: currentUser?.role, isAdmin, id: currentUser?.id, email: currentUser?.email });
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddTraineeOpen, setIsAddTraineeOpen] = useState(false);
  const [isAddCoachOpen, setIsAddCoachOpen] = useState(false);
  const [filterType, setFilterType] = useState(new URLSearchParams(window.location.search).get('filter') || "all"); // all, active, expiring, inactive
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [userToRename, setUserToRename] = useState(null);
  // Sort: 'recent' = created_at desc (default), 'asc' = full_name א-ב,
  // 'desc' = full_name ב-א. Toggle cycles asc → desc → asc (one tap
  // flip). The "recent" default kicks in until the coach taps it once.
  const [sortMode, setSortMode] = useState('recent');
  // 'former' trainees are archived — hidden from the main list by
  // default and surfaced via this toggle. casual / active / suspended
  // always show; only 'former' is gated.
  const [showFormer, setShowFormer] = useState(false);
  // Toggles the secondary controls panel (sort / former toggle /
  // multi-select) inside the unified filter bar. Off by default — keeps
  // the header uncluttered until the coach actually needs another filter.
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  // Inline status-edit dropdown — holds the trainee id whose menu is
  // open, or null when no menu is showing. One-at-a-time by design.
  const [statusMenuOpen, setStatusMenuOpen] = useState(null);
  // Order of choices in the dropdown — uses the same STATUS_BADGES
  // map (defined below) for the visual label/colors.
  const STATUS_OPTIONS = ['onboarding', 'casual', 'active', 'suspended', 'former'];
  // Multi-select state — toggled by the "בחירה" header button. When
  // active, each card gets a checkbox + the floating MultiSelectBar
  // surfaces bulk actions (status change, archive, create group).
  const sel = useMultiSelect();
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  // Group-creation flow: the bulk bar's "+ הקם קבוצה" action opens this
  // dialog with the multi-selected trainees pre-locked as the members.
  // Reuses the existing TrainingGroup / TrainingGroupMember entities
  // (same path Sessions.jsx writes through) so no new schema/server work.
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', description: '' });
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Groups hub — a local-only view switch ('list' | 'groups' | 'groupDetail').
  // No URL involvement (mobile crash risk from earlier useSearchParams
  // experiments — see 9585fd0). Persistence across reloads is out of
  // scope for this layer; the coach lands back on the trainee list
  // after a refresh and re-enters the hub if they want.
  const [view, setView] = useState('list');
  const [selectedGroup, setSelectedGroup] = useState(null);
  // Whole-group action dialogs (layer 2). Both flows reuse existing
  // components/mutations — FastAttendanceDialog wraps the same
  // Session.create path Sessions.jsx uses; PlanFormDialog is the same
  // component every other "+ תוכנית חדשה" entry point opens, with the
  // group's members pre-seeded into its trainee picker.
  const [fastAttendanceGroup, setFastAttendanceGroup] = useState(null);
  const [planFormGroup, setPlanFormGroup] = useState(null);

  // Per-member action sheet (layer 3) — opens when a group member row
  // is tapped. Tracks one member at a time + which leaf dialog to
  // mount next. Baseline is event-based via the global Manager, so it
  // doesn't get a local mount flag.
  //   selectedMember     — { trainee_id, trainee_name } | null
  //   memberActionOpen   — whether the action sheet itself is open
  //   measurementForMember / recordForMember / noteForMember — flags
  //     that gate the corresponding existing dialog (measurement +
  //     PR are reused as-is; note is the new minimal dialog).
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberActionOpen, setMemberActionOpen] = useState(false);
  const [measurementForMember, setMeasurementForMember] = useState(false);
  const [recordForMember, setRecordForMember] = useState(false);
  const [noteForMember, setNoteForMember] = useState(false);

  // "+ קבוצה חדשה" comprehensive dialog (location, contact, schedule,
  // members, color). Writes to the SAME training_groups table the
  // Sessions tab reads from so the result appears in both views.
  const [showCreateGroupFull, setShowCreateGroupFull] = useState(false);
  // Per-member weekly eligibility (allowed_days / weekly_quota) editor
  // — opened from the per-member action sheet. Holds the full
  // training_group_members row so the dialog can prefill from the
  // current values without an extra fetch.
  const [eligibilityForMember, setEligibilityForMember] = useState(null);

  // Service-type filter (multi-select). Values are the canonical
  // English keys returned by normalizeServiceType — 'personal' /
  // 'online' / 'group'. An empty set means "no service filter": every
  // trainee passes. Otherwise a trainee passes iff at least one of
  // their derived tags overlaps with the active set (OR within the
  // service axis; ANDed against the existing status + search filters).
  const [serviceFilter, setServiceFilter] = useState(() => new Set());
  const toggleServiceFilter = (tag) => {
    setServiceFilter((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  // Status badge config — mirrors the canonical statuses on the
  // trainee profile page so the visual language is consistent
  // (blue 🔄 onboarding, orange ⏳ casual, green ✓ active,
  //  gray ⏸ suspended, red × former).
  const STATUS_BADGES = {
    onboarding:{ label: 'אונבורדינג', bg: '#DBEAFE', fg: '#1D4ED8', border: '#93C5FD', icon: '🔄' },
    casual:    { label: 'מזדמן',  bg: '#FFF3E5', fg: '#92400E', border: '#FCD9B6', icon: '⏳' },
    active:    { label: 'פעיל',   bg: '#E8F5E9', fg: '#15803D', border: '#BBE5C0', icon: '✓' },
    suspended: { label: 'מושהה',  bg: '#F3F4F6', fg: '#4B5563', border: '#D1D5DB', icon: '⏸' },
    former:    { label: 'לשעבר',  bg: '#FEE2E2', fg: '#B91C1C', border: '#FCA5A5', icon: '×' },
  };
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const renameUserMutation = useMutation({
    mutationFn: async ({ id, fullName }) => {
      await base44.entities.User.update(id, { full_name: fullName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] }); // Assuming useClientStats uses this key or similar
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      toast.success("שם המשתמש עודכן בהצלחה");
      setShowRenameDialog(false);
      setUserToRename(null);
    },
    onError: (error) => {
      console.error("Failed to rename user:", error);
      toast.error("שגיאה בעדכון השם");
    }
  });

  // ── Delete-group flow ─────────────────────────────────────────────
  // Holds the row to delete while the confirmation dialog is open.
  // The styled confirm sits at the bottom of the page (same Dialog
  // primitive Layout.jsx uses for logout confirmation).
  const [groupToDelete, setGroupToDelete] = useState(null);

  // The matching mutation in Sessions.jsx only deletes the
  // training_groups row, which leaves orphan rows in
  // training_group_members. Here we do the full clean-up in the
  // correct order — memberships first (one batch query through
  // supabase, since the base44 entity API only deletes one row at a
  // time) and the group itself second. Trainees, sessions, plans
  // and everything else stay untouched on purpose: historical group
  // sessions reference group_id/group_name and remain readable even
  // after the group row is gone.
  const deleteGroupMutation = useMutation({
    mutationFn: async (group) => {
      if (!group?.id) throw new Error('קבוצה לא זוהתה');
      // 1. Remove every membership link for this group.
      const { error: memErr } = await supabase
        .from('training_group_members')
        .delete()
        .eq('group_id', group.id);
      if (memErr) {
        // Partial-failure surface: nothing got deleted yet, so the
        // group row stays intact and the caller can retry.
        throw new Error('שגיאה במחיקת השיוכים: ' + (memErr.message || 'נסה שוב'));
      }
      // 2. Delete the group row itself.
      try {
        await base44.entities.TrainingGroup.delete(group.id);
      } catch (err) {
        // Memberships are gone but the group row is not — surface a
        // clear, distinct error so the coach knows the state.
        throw new Error('השיוכים הוסרו אך הקבוצה לא נמחקה: ' + (err?.message || 'נסה שוב'));
      }
      return group.id;
    },
    onSuccess: (deletedId) => {
      // Shared keys with Sessions.jsx — the group disappears from
      // both the AllUsers groups hub and the Sessions group list.
      queryClient.invalidateQueries({ queryKey: ['training-groups'] });
      queryClient.invalidateQueries({ queryKey: ['group-members'] });
      // If the deleted group was the one currently open in
      // groupDetail, fall back to the hub list.
      if (view === 'groupDetail' && selectedGroup?.id === deletedId) {
        setSelectedGroup(null);
        setView('groups');
      }
      setGroupToDelete(null);
      toast.success('✅ הקבוצה נמחקה');
    },
    onError: (err) => {
      console.error('[AllUsers] deleteGroupMutation error:', err);
      toast.error('❌ ' + (err?.message || 'שגיאה במחיקת הקבוצה'));
    },
  });

  // 1. Fetch Users & Services (Shared Hook)
  const { allTrainees, visibleTrainees, allServices, activeClientsCount, traineesLoading } = useClientStats();

  // Groups + members — SAME query keys Sessions.jsx uses so the cache
  // (and its realtime invalidations) is shared. Filtering by coach_id
  // mirrors the Sessions side exactly. Stale-while-revalidate is fine
  // here; the realtime channel below keeps us fresh in the
  // groups view.
  const { data: trainingGroups = [] } = useQuery({
    queryKey: ['training-groups'],
    queryFn: async () => {
      try { return await base44.entities.TrainingGroup.filter({ coach_id: currentUser?.id || '' }); }
      catch { return []; }
    },
    enabled: !!currentUser?.id,
    staleTime: 30000,
  });
  const { data: groupMembers = [] } = useQuery({
    queryKey: ['group-members'],
    queryFn: async () => {
      try { return await base44.entities.TrainingGroupMember.list('-created_at', 500); }
      catch { return []; }
    },
    enabled: !!currentUser?.id,
    staleTime: 30000,
  });

  // Keep groups data live while the coach is in the hub. Same channel
  // pattern Sessions.jsx uses, scoped to this page.
  useEffect(() => {
    if (!currentUser?.id) return;
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['training-groups'] });
      queryClient.invalidateQueries({ queryKey: ['group-members'] });
    };
    const ch = supabase
      .channel(`allusers-groups-${currentUser.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'training_groups' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'training_group_members' }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentUser?.id, queryClient]);

  // Realtime sync — refetch when users/services change
  useEffect(() => {
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['all-services-list'] });
    };
    const ch = supabase
      .channel('allusers-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_services' }, refresh)
      .subscribe();
    window.addEventListener('data-changed', refresh);
    return () => { supabase.removeChannel(ch); window.removeEventListener('data-changed', refresh); };
  }, [queryClient]);

  // Close the status dropdown on any click outside it. The badge and
  // dropdown items stopPropagation so this only fires for clicks
  // anywhere else on the page.
  useEffect(() => {
    if (!statusMenuOpen) return;
    const handleClickOutside = () => setStatusMenuOpen(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [statusMenuOpen]);

  // Build the canonical TrainingPlan row payload for one trainee. Kept
  // separate from the loop driver so the retry path can rebuild the
  // exact same shape for failed-only ids without copy-paste.
  const buildPlanRowForTrainee = (planData, trainee) => {
    const goalFocusArray = Array.isArray(planData.goal_focus) && planData.goal_focus.length > 0
      ? planData.goal_focus
      : ['כוח'];
    return {
      title: planData.plan_name,
      plan_name: planData.plan_name,
      assigned_to: trainee.id,
      assigned_to_name: trainee.full_name,
      created_by: currentUser.id,
      created_by_name: currentUser.full_name || '',
      goal_focus: goalFocusArray,
      weekly_days: Array.isArray(planData.weekly_days) ? planData.weekly_days : [],
      difficulty_level: planData.difficulty_level || null,
      duration_weeks: typeof planData.duration_weeks === 'number' ? planData.duration_weeks : null,
      description: planData.description || '',
      start_date: new Date().toISOString().split('T')[0],
      status: 'פעילה',
      is_template: false,
      series_id: planData.series_id || null,
    };
  };

  // Drive the per-trainee create loop without aborting on a single
  // failure. Returns { succeededIds, failedIds, succeededNames,
  // failedNames } so the caller can shape a retry-aware toast.
  // Network/RLS failure on any single trainee leaves the rest of the
  // group's writes intact — the coach hears exactly who's missing
  // instead of a silent half-state.
  const runPlanCreateLoop = async (planData, ids) => {
    const succeededIds = [];
    const succeededNames = [];
    const failedIds = [];
    const failedNames = [];
    for (const traineeId of ids) {
      const trainee = (allTrainees || []).find((t) => t.id === traineeId);
      if (!trainee) {
        // Unknown id (deleted while dialog open, etc.) — treat as
        // failed so the coach sees it instead of silent dropping.
        failedIds.push(traineeId);
        failedNames.push(traineeId);
        continue;
      }
      const row = buildPlanRowForTrainee(planData, trainee);
      try {
        await base44.entities.TrainingPlan.create(row);
        succeededIds.push(traineeId);
        succeededNames.push(trainee.full_name || traineeId);
        // Notification is best-effort: the plan landed even if the
        // toast/badge doesn't ping, so we don't downgrade success.
        try {
          await base44.entities.Notification.create({
            user_id: trainee.id,
            type: 'training_plan',
            title: 'תוכנית אימון חדשה 🎯',
            message: `המאמן ${currentUser.full_name || ''} יצר לך תוכנית חדשה: "${row.plan_name}"`,
            is_read: false,
          });
        } catch (e) {
          console.warn('[AllUsers] plan notification failed for', traineeId, ':', e?.message);
        }
      } catch (e) {
        console.warn('[AllUsers] plan create failed for', traineeId, ':', e?.message);
        failedIds.push(traineeId);
        failedNames.push(trainee.full_name || traineeId);
      }
    }
    return { succeededIds, succeededNames, failedIds, failedNames };
  };

  // Plan-create handler for the group hub. Logic mirrors the existing
  // TrainingPlans.jsx multi-trainee assign path (lines 228-292 there)
  // BUT with explicit per-trainee success/failure tracking and an
  // in-toast retry action for the failed-only subset, so a network
  // blip mid-loop never silently leaves part of the group without
  // the plan. Coach context comes from useAuth.
  const handlePlanFormSubmit = async ({ planData, selectedTrainees }) => {
    if (!currentUser?.id) throw new Error('פרטי מאמן חסרים');
    const ids = Array.isArray(selectedTrainees) ? selectedTrainees : [];

    // Unassigned-plan path (no trainees picked at all). Same single
    // create, but wrapped in try/catch so a failure surfaces a clear
    // toast instead of bubbling up and crashing the dialog.
    if (ids.length === 0) {
      const row = {
        title: planData.plan_name,
        plan_name: planData.plan_name,
        assigned_to: null,
        assigned_to_name: null,
        created_by: currentUser.id,
        created_by_name: currentUser.full_name || '',
        goal_focus: Array.isArray(planData.goal_focus) && planData.goal_focus.length > 0
          ? planData.goal_focus
          : ['כוח'],
        weekly_days: Array.isArray(planData.weekly_days) ? planData.weekly_days : [],
        difficulty_level: planData.difficulty_level || null,
        duration_weeks: typeof planData.duration_weeks === 'number' ? planData.duration_weeks : null,
        description: planData.description || '',
        start_date: new Date().toISOString().split('T')[0],
        status: 'פעילה',
        is_template: false,
        series_id: planData.series_id || null,
      };
      try {
        const created = await base44.entities.TrainingPlan.create(row);
        queryClient.invalidateQueries({ queryKey: ['training-plans'] });
        setPlanFormGroup(null);
        toast.success('✅ תוכנית נוצרה (לא משויכת למתאמן)');
        return [created];
      } catch (e) {
        toast.error('❌ יצירת התוכנית נכשלה: ' + (e?.message || 'נסה שוב'));
        return [];
      }
    }

    // Per-trainee loop with success/failure tracking.
    const { succeededIds, succeededNames, failedIds, failedNames } =
      await runPlanCreateLoop(planData, ids);

    queryClient.invalidateQueries({ queryKey: ['training-plans'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });

    if (failedIds.length === 0) {
      // All good.
      setPlanFormGroup(null);
      toast.success(`✅ התוכנית הוקצתה ל-${succeededIds.length} מתאמנים`);
      return succeededIds;
    }

    if (succeededIds.length === 0) {
      // Nothing landed — leave the dialog open so the coach can
      // resubmit without losing the form.
      toast.error(
        `❌ ההקצאה נכשלה לכל ${failedIds.length} המתאמנים — נסה שוב`,
      );
      return [];
    }

    // Partial success — name names and offer a single-tap retry for
    // the failed subset. The retry calls back into the same loop with
    // only the failed ids; on its own success the toast resolves.
    const failedListShort = failedNames.slice(0, 3).join(', ')
      + (failedNames.length > 3 ? ` ועוד ${failedNames.length - 3}` : '');
    toast(
      `הוקצתה ל-${succeededIds.length} מתוך ${ids.length} — נכשלו: ${failedListShort}`,
      {
        duration: 12000,
        action: {
          label: 'נסה שוב את הנכשלים',
          onClick: async () => {
            const retry = await runPlanCreateLoop(planData, failedIds);
            queryClient.invalidateQueries({ queryKey: ['training-plans'] });
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
            if (retry.failedIds.length === 0) {
              toast.success(`✅ הוקצתה לכל ${retry.succeededIds.length} שנותרו`);
              setPlanFormGroup(null);
            } else if (retry.succeededIds.length === 0) {
              toast.error(`❌ ה-${retry.failedIds.length} נכשלו שוב`);
            } else {
              const stillFailedShort = retry.failedNames.slice(0, 3).join(', ')
                + (retry.failedNames.length > 3 ? ` ועוד ${retry.failedNames.length - 3}` : '');
              toast(
                `הוקצתה לעוד ${retry.succeededIds.length} — עדיין נכשלו: ${stillFailedShort}`,
                { duration: 10000 },
              );
            }
          },
        },
      },
    );
    return succeededIds;
  };

  // Create a TrainingGroup with the currently-selected trainees as
  // its initial members. Mirrors the path Sessions.jsx uses (same
  // base44 entities, same field names) so the group lands in the same
  // place the existing groups view + attendance flow already reads
  // from — no schema or API change.
  //
  // Failure model: the group itself either lands or aborts the flow.
  // Member adds run sequentially and collect per-trainee failures so
  // we can surface "created with N/total members" instead of leaving
  // the coach to guess what happened.
  const handleCreateGroup = async () => {
    const name = (groupForm.name || '').trim();
    if (!name) { toast.error('נא למלא שם קבוצה'); return; }
    if (sel.selectedCount === 0) { toast.error('לא נבחרו מתאמנים'); return; }

    setCreatingGroup(true);
    try {
      const newGroup = await base44.entities.TrainingGroup.create({
        name,
        description: (groupForm.description || '').trim() || null,
        coach_id: currentUser?.id || null,
        coach_name: currentUser?.full_name || '',
      });
      if (!newGroup?.id) throw new Error('יצירת הקבוצה נכשלה');

      const ids = Array.from(sel.selectedIds);
      const failures = [];
      for (const traineeId of ids) {
        const trainee = (allTrainees || []).find((t) => t.id === traineeId);
        try {
          await base44.entities.TrainingGroupMember.create({
            group_id: newGroup.id,
            trainee_id: traineeId,
            trainee_name: trainee?.full_name || '',
          });
        } catch (e) {
          console.warn('[AllUsers] add group member failed:', traineeId, e?.message);
          failures.push(trainee?.full_name || traineeId);
        }
      }

      // Same invalidations Sessions.jsx fires so the groups view +
      // realtime listeners reconcile immediately.
      queryClient.invalidateQueries({ queryKey: ['training-groups'] });
      queryClient.invalidateQueries({ queryKey: ['group-members'] });

      sel.clearSelection();
      setShowCreateGroup(false);
      setGroupForm({ name: '', description: '' });

      const added = ids.length - failures.length;
      if (failures.length === 0) {
        toast.success(`✅ הקבוצה "${name}" נוצרה עם ${added} חברים`);
      } else if (added > 0) {
        toast.success(`הקבוצה "${name}" נוצרה (${added}/${ids.length}). נכשלו: ${failures.join(', ')}`);
      } else {
        toast.error('הקבוצה נוצרה אך הוספת החברים נכשלה — נסה להוסיף ידנית');
      }
    } catch (e) {
      console.error('[AllUsers] create group failed:', e);
      toast.error('שגיאה ביצירת הקבוצה: ' + (e?.message || 'נסה שוב'));
    } finally {
      setCreatingGroup(false);
    }
  };

  // Persist a status change to users.client_status, then refresh the
  // shared caches so the badge + filter chips update without a manual
  // reload. Defensive try/catch so a transient network error doesn't
  // leave the dropdown open with no feedback.
  const updateClientStatus = async (traineeId, newStatus) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ client_status: newStatus })
        .eq('id', traineeId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      const label = STATUS_BADGES[newStatus]?.label || newStatus;
      toast.success(`סטטוס עודכן ל-${label}`);
    } catch (e) {
      console.warn('[AllUsers] status update failed:', e?.message);
      toast.error('שגיאה בעדכון הסטטוס');
    } finally {
      setStatusMenuOpen(null);
    }
  };

  // 2. Fetch Sessions (Shared Hook)
  const { sessions: allSessions } = useSessionStats();

  // ── Helpers — derive a trainee's package + session stats ───────
  const getActivePackage = (traineeId) => {
    return allServices.find(p =>
      p.trainee_id === traineeId &&
      isActivePackage(normalizeStatus(p.status))
    );
  };
  const getRemaining = (pkg) => {
    if (!pkg) return 0;
    if (pkg.remaining_sessions != null) return Number(pkg.remaining_sessions);
    if (pkg.sessions_remaining != null) return Number(pkg.sessions_remaining);
    return Math.max(0, (Number(pkg.total_sessions) || 0) - (Number(pkg.used_sessions) || 0));
  };
  const getCompletedSessions = (traineeId) => {
    return allSessions.filter(s => {
      const matches = s.trainee_id === traineeId
        || (Array.isArray(s.participants) && s.participants.some(p => p?.trainee_id === traineeId));
      if (!matches) return false;
      const n = normalizeStatus(s.status);
      return n === 'completed' || n === 'present';
    }).length;
  };

  // ── Card data — same calculation as TraineeProfile packages tab ─
  // The packages tab's "מפגשים מקושרים" count uses
  //   sessions WHERE service_id = pkg.id AND was_deducted = true
  // (see TraineeProfile.jsx:314 and the refreshLinkedAfterChange
  // sync at line 1340 which writes back to pkg.used_sessions /
  // remaining_sessions). To stay consistent we prefer pkg's stored
  // counts (kept in sync), and fall back to the same filter.
  const getLinkedUsed = (pkg) => {
    if (!pkg) return 0;
    if (pkg.used_sessions != null) return Number(pkg.used_sessions);
    return allSessions.filter(
      s => s.service_id === pkg.id && s.was_deducted === true
    ).length;
  };

  const getNextSession = (traineeId) => {
    const today = new Date().toISOString().slice(0, 10);
    return allSessions
      .filter(s => {
        const matches = s.trainee_id === traineeId
          || (Array.isArray(s.participants) && s.participants.some(p => p?.trainee_id === traineeId));
        if (!matches) return false;
        if (!s.date || s.date < today) return false;
        const n = normalizeStatus(s.status);
        return n !== 'cancelled';
      })
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0] || null;
  };

  const formatSmartDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((d - today) / 86_400_000);
    if (diff === 0) return 'היום';
    if (diff === 1) return 'מחר';
    if (diff > 1 && diff < 7) return `בעוד ${diff} ימים`;
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  };

  // Service tags per trainee — derived once per (allTrainees, allServices)
  // change, then reused by the filter pass below. Each entry is a
  // Set<string> of canonical service keys this trainee has at least
  // one client_services row for. A trainee with two אישי packages and
  // one קבוצתי package collapses to { 'personal', 'group' }.
  const tagsByTraineeId = useMemo(() => {
    const map = new Map();
    for (const s of allServices || []) {
      const tag = normalizeServiceType(s?.service_type);
      if (!tag || !s?.trainee_id) continue;
      if (!map.has(s.trainee_id)) map.set(s.trainee_id, new Set());
      map.get(s.trainee_id).add(tag);
    }
    return map;
  }, [allServices]);

  // ── Counts for filter chips ─────────────────────────────────────
  // Counts run on `visibleTrainees` (excludes former + suspended)
  // so the chip numbers always match what the user actually sees
  // when the "× הצג לשעבר" toggle is OFF.
  const counts = useMemo(() => {
    let active = 0, expiring = 0, inactive = 0;
    for (const t of visibleTrainees) {
      const pkg = getActivePackage(t.id);
      if (!pkg) { inactive++; continue; }
      const rem = getRemaining(pkg);
      if (rem > 0 && rem <= 2) expiring++;
      else if (rem > 0) active++;
      else inactive++;
    }
    return { all: visibleTrainees.length, active, expiring, inactive };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTrainees, allServices]);

  // ── Filter + sort logic ─────────────────────────────────────────
  const filteredTrainees = useMemo(() => {
    const q = searchTerm.toLowerCase();
    const hasServiceFilter = serviceFilter.size > 0;
    const filtered = allTrainees.filter(t => {
      // Archive gate — 'former' AND 'suspended' trainees are hidden
      // unless the coach explicitly flips the toggle. Skips before
      // the package logic so an archived trainee with a stale
      // package doesn't surface.
      const isArchived = t.client_status === 'former' || t.client_status === 'suspended';
      if (isArchived && !showFormer) return false;
      if (q) {
        const hit = (t.full_name || '').toLowerCase().includes(q)
          || (t.email || '').toLowerCase().includes(q)
          || (t.phone || '').includes(searchTerm);
        if (!hit) return false;
      }
      // Service-type filter ANDs against status + search; OR within
      // the service axis (a trainee with any matching tag passes).
      if (hasServiceFilter) {
        const tags = tagsByTraineeId.get(t.id);
        if (!tags) return false;
        let anyMatch = false;
        for (const sel of serviceFilter) { if (tags.has(sel)) { anyMatch = true; break; } }
        if (!anyMatch) return false;
      }
      if (filterType === 'all') return true;
      const pkg = getActivePackage(t.id);
      const rem = pkg ? getRemaining(pkg) : 0;
      if (filterType === 'active')   return !!pkg && rem > 2;
      if (filterType === 'expiring') return !!pkg && rem > 0 && rem <= 2;
      if (filterType === 'inactive') return !pkg || rem === 0;
      return true;
    });

    // Sort: default is reverse-chronological by created_at (most
    // recent signups first). Tapping the toggle switches to Hebrew
    // alphabetical (asc/desc) via localeCompare with locale 'he'.
    if (sortMode === 'asc' || sortMode === 'desc') {
      const dir = sortMode === 'asc' ? 1 : -1;
      filtered.sort((a, b) =>
        dir * (a.full_name || '').localeCompare(b.full_name || '', 'he')
      );
    } else {
      filtered.sort((a, b) =>
        new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );
    }
    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTrainees, allServices, searchTerm, filterType, sortMode, showFormer, serviceFilter, tagsByTraineeId]);

  // Page-level loading gate — render the unified loader instead of a
  // partial shell with empty filter chips and a "loading…" stub list.
  // `traineesLoading` is initial-load only (it flips false once on
  // first fetch). Realtime refetches keep allTrainees populated, so
  // this won't flash on every supabase invalidate.
  if (traineesLoading) {
    return (
      <ProtectedCoachPage>
        <PageLoader fullHeight />
      </ProtectedCoachPage>
    );
  }

  // Neumorphic shadow tokens — shared by every white card/control in
  // the Trainees header. Dual-tone (warm cream + cool highlight) so
  // surfaces feel raised over the cream page bg. insetShadow is for
  // pressed/inset affordances (the filter icon).
  const cardShadow = "4px 4px 10px rgba(200,180,150,0.4), -4px -4px 10px rgba(255,255,255,0.9)";
  const insetShadow = "inset 2px 2px 4px rgba(200,180,150,0.5), inset -2px -2px 4px rgba(255,255,255,0.9)";

  return (
    <ProtectedCoachPage>
      <div style={{ minHeight: '100vh', background: 'var(--cream)', paddingBottom: 100, direction: 'rtl' }}>
        {/* Row A — Title block + people icon on a single flex row */}
        <div style={{
          padding: '16px 16px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
        }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{
              fontSize: 34,
              fontWeight: 700,
              lineHeight: 1.05,
              color: '#1a1a1a',
              letterSpacing: '-0.5px',
              margin: 0,
              fontFamily: 'Rubik, sans-serif',
            }}>
              מתאמנים
            </h1>
            <div style={{ fontSize: 14, color: '#888', marginTop: 6 }}>
              {visibleTrainees.length} מתאמנים • {counts.active} פעילים
            </div>
          </div>
          <div style={{
            width: 60, height: 60,
            borderRadius: 18,
            background: '#FF6F20',
            color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '5px 5px 12px rgba(200,120,60,0.35), -5px -5px 12px rgba(255,255,255,0.7)',
            flexShrink: 0,
          }}>
            <Users size={28} className="text-white" />
          </div>
        </div>

        {view === 'list' && (
        <>
        {/* Row B — Actions: primary "+ מתאמן חדש" + secondary "+ מאמן חדש" (admin only) */}
        <div style={{ padding: '0 16px', display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setIsAddTraineeOpen(true)}
            style={{
              flex: 1,
              background: '#FF6F20',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              padding: '13px 0', fontSize: 15, fontWeight: 500,
              cursor: 'pointer',
              fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
            }}
          >
            + מתאמן חדש
          </button>
          {isOwnerAdmin && (
            <button
              type="button"
              onClick={() => setIsAddCoachOpen(true)}
              style={{
                background: '#fff',
                color: '#5F5E5A',
                border: 'none',
                borderRadius: 12,
                padding: '0 16px', fontSize: 14,
                boxShadow: cardShadow,
                cursor: 'pointer',
                fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
              }}
            >
              + מאמן חדש
            </button>
          )}
        </div>
        </>
        )}

        {/* Row C — Service-type tabs. Three pills in RTL reading order:
            אונליין / אישי / קבוצות. Still wired to the same view +
            serviceFilter handlers used before. */}
        {view !== 'groupDetail' && (
          <div style={{ padding: '0 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { key: 'online',   label: 'אונליין', bg: '#FFE9D8', fg: '#993C1D' },
                { key: 'personal', label: 'אישי',   bg: '#E6F1FB', fg: '#185FA5' },
                { key: 'group',    label: 'קבוצות', bg: '#EEEDFE', fg: '#534AB7' },
              ].map((s) => {
                const isGroupChip = s.key === 'group';
                const active = isGroupChip
                  ? view === 'groups'
                  : (view === 'list' && serviceFilter.has(s.key));
                const handleClick = () => {
                  if (isGroupChip) {
                    if (view === 'groups') {
                      setSelectedGroup(null);
                      setView('list');
                    } else {
                      sel.clearSelection();
                      setSelectedGroup(null);
                      setServiceFilter((prev) => {
                        if (!prev.has('group')) return prev;
                        const next = new Set(prev);
                        next.delete('group');
                        return next;
                      });
                      setView('groups');
                    }
                  } else {
                    if (view === 'groups') {
                      setSelectedGroup(null);
                      setView('list');
                    }
                    toggleServiceFilter(s.key);
                  }
                };
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={handleClick}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      borderRadius: 11,
                      padding: '11px 0',
                      fontSize: 14, fontWeight: 500,
                      border: 'none',
                      background: active ? s.fg : s.bg,
                      color: active ? '#fff' : s.fg,
                      cursor: 'pointer',
                      fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {view === 'list' && (
        <>
        {/* Row D — Search bar (its own row) */}
        <div style={{ padding: '0 16px', marginBottom: 16 }}>
          <div style={{
            background: '#fff',
            borderRadius: 12,
            height: 46,
            padding: '0 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: cardShadow,
          }}>
            <Search size={18} color="#888" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="חיפוש מתאמן במערכת"
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: 14,
                direction: 'rtl',
                fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
              }}
            />
          </div>
        </div>

        {/* Row E — Unified filter bar: chips inline + filter icon, with
            a collapsible panel for sort / former / multi-select. */}
        <div style={{ padding: '0 16px', marginBottom: 8 }}>
          <div style={{
            background: '#fff',
            borderRadius: 14,
            padding: 6,
            boxShadow: cardShadow,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <button
              type="button"
              onClick={() => setShowMoreFilters((v) => !v)}
              aria-label="מסננים נוספים"
              style={{
                width: 34, height: 34,
                borderRadius: 9,
                background: '#FBF3EA',
                color: '#FF6F20',
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: insetShadow,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <Filter size={16} />
            </button>
            <div style={{
              display: 'flex', gap: 4,
              overflowX: 'auto', flexWrap: 'nowrap',
              flex: 1, minWidth: 0,
            }}>
              {[
                { id: 'all',      label: 'הכל',       count: counts.all },
                { id: 'active',   label: 'פעילים',    count: counts.active },
                { id: 'inactive', label: 'לא פעילים',  count: counts.inactive },
              ].map((f) => {
                const active = filterType === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilterType(f.id)}
                    style={{
                      background: active ? '#FF6F20' : 'transparent',
                      color: active ? '#fff' : '#888',
                      border: 'none',
                      borderRadius: 9,
                      padding: active ? '7px 12px' : '7px 10px',
                      fontSize: 13, fontWeight: active ? 600 : 500,
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
                      flexShrink: 0,
                    }}
                  >
                    {f.label} {f.count}
                  </button>
                );
              })}
            </div>
          </div>

          {showMoreFilters && (
            <div style={{
              background: '#fff',
              borderRadius: 14,
              padding: 12,
              marginTop: 8,
              boxShadow: cardShadow,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              <button
                type="button"
                onClick={() =>
                  setSortMode(prev =>
                    prev === 'asc' ? 'desc' : 'asc'
                  )
                }
                title={
                  sortMode === 'recent'
                    ? 'מיון לפי שם — לחץ למיון א-ב'
                    : sortMode === 'asc'
                      ? 'כעת ממוין א-ב — לחץ למיון ב-א'
                      : 'כעת ממוין ב-א — לחץ למיון א-ב'
                }
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid #F0E4D0',
                  background: sortMode === 'recent' ? '#fff' : '#FFF3E5',
                  color: '#1a1a1a',
                  fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
                }}
              >
                {sortMode === 'desc' ? 'מיין א-ב' : 'מיין ב-א'}
              </button>

              <button
                type="button"
                onClick={() => setShowFormer((v) => !v)}
                title={showFormer ? 'מציג גם לשעבר' : 'הצג גם לשעבר'}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: showFormer ? '1px solid #FCA5A5' : '1px solid #F0E4D0',
                  background: showFormer ? '#FEE2E2' : '#fff',
                  color: showFormer ? '#B91C1C' : '#666',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
                }}
              >
                מתאמנים לשעבר
              </button>

              <button
                type="button"
                onClick={() => sel.isSelecting ? sel.clearSelection() : sel.startSelecting()}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid #F0E4D0',
                  background: sel.isSelecting ? '#FFF5EE' : '#fff',
                  color: sel.isSelecting ? '#FF6F20' : '#666',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
                }}
              >
                {sel.isSelecting ? '✕ ביטול בחירה' : '☑ בחירה מרובה'}
              </button>
            </div>
          )}

          <div style={{
            fontSize: 12, color: '#aaa',
            textAlign: 'left', marginTop: 10,
          }}>
            מציג {filteredTrainees.length} מתאמנים
          </div>
        </div>

        {/* D. User cards or empty state */}
        {traineesLoading ? (
          <PageLoader />
        ) : filteredTrainees.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            color: '#888',
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
            <div style={{ fontSize: 14 }}>
              {searchTerm ? 'לא נמצאו תוצאות' : 'אין מתאמנים'}
            </div>
          </div>
        ) : filteredTrainees.map(t => {
          const pkg = getActivePackage(t.id);
          const remaining = pkg ? getRemaining(pkg) : 0;
          const usedInPkg = pkg ? getLinkedUsed(pkg) : 0;
          const totalInPkg = pkg ? Number(pkg.total_sessions) || 0 : 0;
          const nextSession = getNextSession(t.id);
          const birthDate = t.birth_date || null;
          const isExpiring = !!pkg && remaining > 0 && remaining <= 2;
          const inactive = !pkg || remaining === 0;
          const initial = (t.full_name || '?').trim().charAt(0);
          // Birthday spotlight — null when no DOB on file, integer
          // days otherwise. 0 = today (filled pill + amber card
          // border); 1-7 = soft pill + small cake icon. Everything
          // else: no overlay at all.
          const daysToBday = daysUntilBirthday(birthDate);
          const isBdayToday = daysToBday === 0;
          const isBdaySoon = daysToBday != null && daysToBday >= 1 && daysToBday <= 7;

          // Verify card numbers match the packages tab.
          if (typeof window !== 'undefined' && window.__DEBUG_TRAINEE_CARDS__) {
            // eslint-disable-next-line no-console
            console.log('[TraineeCard]', t.full_name,
              'used:', usedInPkg, 'total:', totalInPkg,
              'remaining:', remaining,
              'pkgId:', pkg?.id);
          }

          return (
            <div
              key={t.id}
              onClick={() => {
                if (sel.isSelecting) { sel.toggleSelect(t.id); return; }
                navigate(createPageUrl('TraineeProfile') + `?userId=${encodeURIComponent(t.id)}`);
              }}
              style={{
                background: 'white',
                borderRadius: 16,
                padding: 14,
                margin: '0 12px 8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                cursor: 'pointer',
                // position:relative anchors the absolute birthday pill
                // below — the existing card body inside is untouched.
                position: 'relative',
                // Birthday today wins priority over the package/expiring
                // border so the spotlight is unmistakable.
                border: isBdayToday
                  ? '2px solid #EF9F27'
                  : sel.isSelecting && sel.isSelected(t.id)
                    ? '1.5px solid #FF6F20'
                    : isExpiring
                      ? '1.5px solid #EAB308'
                      : pkg
                        ? '1.5px solid #FF6F20'
                        : '0.5px solid #F0E4D0',
              }}
            >
              {/* Birthday pill — absolutely positioned overlay so the
                  card's flow / fields are not touched. RTL anchors it
                  at the right edge (logical start). The today variant
                  is filled amber; the "soon" variant is soft amber. */}
              {(isBdayToday || isBdaySoon) && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: -10,
                    right: 14,
                    padding: '4px 10px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    background: isBdayToday ? '#EF9F27' : '#FAEEDA',
                    color: isBdayToday ? 'white' : '#854F0B',
                    border: isBdayToday ? '1px solid #EF9F27' : '1px solid #F0D9A8',
                    boxShadow: '0 2px 6px rgba(239,159,39,0.18)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
                  }}
                >
                  <span aria-hidden>🎂</span>
                  {isBdayToday
                    ? 'היום יום ההולדת!'
                    : daysToBday === 1
                      ? 'יום הולדת מחר'
                      : `יום הולדת בעוד ${daysToBday} ימים`}
                </div>
              )}

              {/* Top row */}
              <div style={{
                display: 'flex', alignItems: 'center',
                gap: 10, marginBottom: 10,
              }}>
                {sel.isSelecting && (
                  <SelectCheckbox
                    isSelected={sel.isSelected(t.id)}
                    onToggle={() => sel.toggleSelect(t.id)}
                  />
                )}
                <div style={{
                  width: 44, height: 44, borderRadius: 14,
                  background: '#FFF0E4',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, fontWeight: 600, color: '#FF6F20',
                  flexShrink: 0,
                }}>{initial}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                  }}>
                    <span style={{
                      fontSize: 15, fontWeight: 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: '100%',
                    }}>{t.full_name || 'מתאמן'}</span>
                    {/* Clickable client_status badge — opens a small
                        dropdown to switch the status inline. Always
                        renders even for legacy/null status so the
                        coach can fix it from the list. The badge +
                        dropdown stopPropagation so the surrounding
                        card click (→ navigate to profile) doesn't
                        fire while the menu is open. */}
                    {(() => {
                      const cur = STATUS_BADGES[t.client_status];
                      const buttonBg = cur?.bg || '#F5F5F5';
                      const buttonFg = cur?.fg || '#888';
                      const buttonBorder = cur?.border || '#E5E7EB';
                      const buttonLabel = cur?.label || t.client_status || 'לא מוגדר';
                      const menuOpen = statusMenuOpen === t.id;
                      return (
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStatusMenuOpen(menuOpen ? null : t.id);
                            }}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              padding: '1px 7px', borderRadius: 999,
                              background: buttonBg, color: buttonFg,
                              border: `1px solid ${buttonBorder}`,
                              fontSize: 10, fontWeight: 700,
                              cursor: 'pointer',
                              fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
                            }}
                          >
                            {cur?.icon && <span aria-hidden>{cur.icon}</span>}
                            <span>{buttonLabel}</span>
                            <span aria-hidden style={{ fontSize: 9, marginRight: 1 }}>▾</span>
                          </button>
                          {menuOpen && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                                background: 'white', borderRadius: 12,
                                border: '1px solid #F0E4D0',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                zIndex: 100, overflow: 'hidden',
                                minWidth: 140, direction: 'rtl',
                              }}
                            >
                              {STATUS_OPTIONS.map((s, idx) => {
                                const opt = STATUS_BADGES[s];
                                const selected = t.client_status === s;
                                return (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateClientStatus(t.id, s);
                                    }}
                                    style={{
                                      width: '100%', padding: '10px 14px',
                                      border: 'none',
                                      background: selected ? '#FFF5EE' : 'white',
                                      color: selected ? '#FF6F20' : '#1A1A1A',
                                      fontSize: 13, cursor: 'pointer',
                                      textAlign: 'right',
                                      borderBottom: idx < STATUS_OPTIONS.length - 1
                                        ? '1px solid #F0E4D0' : 'none',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center', gap: 8,
                                      fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
                                    }}
                                  >
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                      {opt?.icon && <span aria-hidden>{opt.icon}</span>}
                                      <span>{opt?.label || s}</span>
                                    </span>
                                    {selected && <span aria-hidden>✓</span>}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  {/* Secondary meta — wraps onto a second row on
                      narrow screens so a long birth label like
                      "15/03/1990 (36)" doesn't get clipped with an
                      ellipsis next to the phone number. Bullet
                      separator only renders when both halves are
                      present, so a row with phone-only or birth-
                      only doesn't get a stray dot. */}
                  {(() => {
                    const contact = t.phone || t.email || '';
                    const birth = formatBirthWithAge(t);
                    return (
                      <div style={{
                        fontSize: 11, color: '#888', marginTop: 1,
                        display: 'flex', flexWrap: 'wrap', gap: 6,
                      }}>
                        {contact && <span>{contact}</span>}
                        {contact && birth && <span aria-hidden>·</span>}
                        {birth && <span>{birth}</span>}
                      </div>
                    );
                  })()}
                </div>

                <div style={{
                  padding: '3px 10px', borderRadius: 8,
                  fontSize: 10, fontWeight: 600, flexShrink: 0,
                  background: pkg ? (isExpiring ? '#FFF9E6' : '#E8F5E9') : '#F3F4F6',
                  color: pkg ? (isExpiring ? '#EAB308' : '#16a34a') : '#888',
                }}>
                  {inactive ? 'לא פעיל' : (isExpiring ? 'נגמר בקרוב' : 'פעיל')}
                </div>
              </div>

              {/* Info row — sessions used/total + next session + birthday */}
              <div style={{ display: 'flex', gap: 4 }}>
                {/* Sessions: used/total — same as packages tab */}
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 4,
                  background: '#FFF9F0',
                  borderRadius: 8, padding: '6px 8px',
                }}>
                  <span style={{ fontSize: 12 }}>🎫</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600,
                      color: pkg && remaining <= 2 ? '#dc2626' : '#1a1a1a',
                    }}>
                      {pkg ? `${usedInPkg}/${totalInPkg}` : '—'}
                    </div>
                    <div style={{ fontSize: 8, color: '#888' }}>בוצעו</div>
                  </div>
                </div>

                {/* Next upcoming session */}
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 4,
                  background: '#FFF9F0',
                  borderRadius: 8, padding: '6px 8px',
                }}>
                  <span style={{ fontSize: 12 }}>📅</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: '#1a1a1a',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {nextSession ? formatSmartDate(nextSession.date) : '—'}
                    </div>
                    <div style={{ fontSize: 8, color: '#888' }}>הבא</div>
                  </div>
                </div>

                {/* Birthday — full DD/MM/YYYY + current age in years */}
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 4,
                  background: '#FFF9F0',
                  borderRadius: 8, padding: '6px 8px',
                }}>
                  <span style={{ fontSize: 12 }}>🎂</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 600, color: '#1a1a1a',
                      // Allow wrap on narrow screens so a long
                      // "15/03/1990 (36)" doesn't get cropped.
                      wordBreak: 'break-word',
                    }}>
                      {formatBirthWithAge(t) || '—'}
                    </div>
                    <div style={{ fontSize: 8, color: '#888' }}>יום הולדת</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        </>
        )}

        {/* ── GROUPS HUB — list of every group the coach owns ── */}
        {view === 'groups' && (
          <div style={{ padding: '0 16px 24px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>
                👥 הקבוצות שלי
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>
                {trainingGroups.length} {trainingGroups.length === 1 ? 'קבוצה' : 'קבוצות'}
              </div>
            </div>

            {/* "+ קבוצה חדשה" — primary CTA at the top of the hub.
                Writes to the SAME training_groups table the Sessions
                tab reads from (shared queryKey ['training-groups']) so
                the new group appears in both views immediately. */}
            <button
              type="button"
              onClick={() => setShowCreateGroupFull(true)}
              style={{
                width: '100%',
                padding: '12px 0',
                borderRadius: 12, border: 'none',
                background: '#FF6F20', color: 'white',
                fontSize: 14, fontWeight: 700,
                cursor: 'pointer',
                marginBottom: 12,
                fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
              }}
            >
              + קבוצה חדשה
            </button>

            {trainingGroups.length === 0 ? (
              <div style={{
                padding: '40px 20px', textAlign: 'center',
                background: 'white', borderRadius: 14,
                border: '1px dashed #F0E4D0', color: '#888',
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
                <div style={{ fontSize: 13, marginBottom: 4, color: '#1a1a1a', fontWeight: 600 }}>
                  עדיין אין קבוצות
                </div>
                <div style={{ fontSize: 12, color: '#888' }}>
                  לחץ "+ קבוצה חדשה" למעלה כדי ליצור את הקבוצה הראשונה
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {trainingGroups.map((group) => {
                  const memberCount = groupMembers.filter((m) => m.group_id === group.id).length;
                  // Additive surface for the new extras — only renders
                  // if the column was set (post-migration). Pre-migration
                  // groups stay untouched.
                  const meta = [];
                  if (group.location_name) meta.push(`📍 ${group.location_name}`);
                  if (group.session_time)  meta.push(`🕐 ${group.session_time}`);
                  const avatarColor = group.color || '#FF6F20';
                  const avatarIcon = group.icon || null;
                  return (
                    <div
                      key={group.id}
                      onClick={() => { setSelectedGroup(group); setView('groupDetail'); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '14px 16px', borderRadius: 14,
                        background: 'white',
                        border: '1px solid #F0E4D0',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                      }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: 12,
                        background: avatarIcon ? `${avatarColor}22` : '#FFF5EE',
                        color: avatarColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: avatarIcon ? 20 : 18, fontWeight: 800,
                        flexShrink: 0,
                      }}>
                        {avatarIcon || (group.name || '?').trim().charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 14, fontWeight: 700, color: '#1a1a1a',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {group.name || 'קבוצה ללא שם'}
                        </div>
                        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                          {memberCount} {memberCount === 1 ? 'חבר' : 'חברים'}
                          {group.description ? ` · ${group.description}` : ''}
                        </div>
                        {meta.length > 0 && (
                          <div style={{
                            fontSize: 11, color: '#9A6A3A', marginTop: 4,
                            display: 'flex', gap: 8, flexWrap: 'wrap',
                          }}>
                            {meta.map((m, i) => <span key={i}>{m}</span>)}
                          </div>
                        )}
                      </div>
                      {/* Destructive action — small + subdued so the
                          row's primary affordance is still "open the
                          group", but the trash is reachable without
                          a long-press / extra screen. stopPropagation
                          keeps the row's onClick from firing. */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setGroupToDelete(group); }}
                        aria-label={`מחק את הקבוצה ${group.name || ''}`}
                        title="מחק קבוצה"
                        style={{
                          width: 32, height: 32, borderRadius: 8,
                          border: '1px solid #FCA5A5',
                          background: 'white',
                          color: '#B91C1C',
                          fontSize: 14,
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                          padding: 0,
                        }}
                      >
                        🗑
                      </button>
                      <span style={{ color: '#C9A24A', fontSize: 14, flexShrink: 0 }}>›</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── GROUPS HUB — single-group detail view (display only) ── */}
        {view === 'groupDetail' && selectedGroup && (() => {
          const members = groupMembers.filter((m) => m.group_id === selectedGroup.id);
          return (
            <div style={{ padding: '0 16px 24px' }}>
              {/* Header band: back button + group title */}
              <div style={{
                background: 'white', borderRadius: 14,
                border: '1px solid #F0E4D0', padding: '12px 14px',
                marginBottom: 12,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  marginBottom: members.length > 0 ? 12 : 0,
                }}>
                  <button
                    type="button"
                    onClick={() => { setSelectedGroup(null); setView('groups'); }}
                    style={{
                      width: 36, height: 36, borderRadius: 10,
                      border: '1px solid #F0E4D0', background: 'white',
                      color: '#FF6F20', fontSize: 18, fontWeight: 700,
                      cursor: 'pointer', flexShrink: 0,
                    }}
                    aria-label="חזרה לרשימת הקבוצות"
                  >
                    →
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 16, fontWeight: 800, color: '#1a1a1a',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {selectedGroup.name || 'קבוצה ללא שם'}
                    </div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                      {members.length} {members.length === 1 ? 'חבר' : 'חברים'}
                      {selectedGroup.description ? ` · ${selectedGroup.description}` : ''}
                    </div>
                  </div>
                  {/* Mirror of the list-row trash so the destructive
                      action is also reachable from inside the group. */}
                  <button
                    type="button"
                    onClick={() => setGroupToDelete(selectedGroup)}
                    aria-label={`מחק את הקבוצה ${selectedGroup.name || ''}`}
                    title="מחק קבוצה"
                    style={{
                      width: 36, height: 36, borderRadius: 10,
                      border: '1px solid #FCA5A5',
                      background: 'white',
                      color: '#B91C1C',
                      fontSize: 15,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                      padding: 0,
                    }}
                  >
                    🗑
                  </button>
                </div>

                {/* Whole-group action buttons — disabled until the
                    group has at least one member so the dialogs never
                    open empty. Both reuse existing flows; nothing new
                    on the server side. */}
                {members.length > 0 && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setFastAttendanceGroup(selectedGroup)}
                      style={{
                        flex: 1,
                        padding: '12px 8px', borderRadius: 12, border: 'none',
                        background: '#4CAF50', color: 'white',
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
                      }}
                    >
                      ✅ סמן נוכחות
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlanFormGroup(selectedGroup)}
                      style={{
                        flex: 1,
                        padding: '12px 8px', borderRadius: 12, border: 'none',
                        background: '#FF6F20', color: 'white',
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
                      }}
                    >
                      📋 כתוב תוכנית לקבוצה
                    </button>
                  </div>
                )}
              </div>

              {/* Member list — each row taps open the per-member
                  action sheet (5 actions: מדידה / שיא / בייסליין /
                  הערה / פתח פרופיל). One member at a time. */}
              {members.length === 0 ? (
                <div style={{
                  padding: '32px 20px', textAlign: 'center',
                  background: 'white', borderRadius: 14,
                  border: '1px dashed #F0E4D0', color: '#888',
                  fontSize: 13,
                }}>
                  אין חברים בקבוצה
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {members.map((m) => (
                    <div
                      key={m.id || m.trainee_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        // Pass the full membership row through so the
                        // eligibility editor below can prefill from the
                        // existing allowed_days / weekly_quota without
                        // a second fetch. Note + measure + PR ignore
                        // those extra keys (they only read trainee_id +
                        // trainee_name).
                        setSelectedMember({
                          id: m.id,
                          trainee_id: m.trainee_id,
                          trainee_name: m.trainee_name,
                          allowed_days: m.allowed_days,
                          weekly_quota: m.weekly_quota,
                        });
                        setMemberActionOpen(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedMember({
                            id: m.id,
                            trainee_id: m.trainee_id,
                            trainee_name: m.trainee_name,
                            allowed_days: m.allowed_days,
                            weekly_quota: m.weekly_quota,
                          });
                          setMemberActionOpen(true);
                        }
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 14px', borderRadius: 12,
                        background: 'white',
                        border: '1px solid #F0E4D0',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: 999,
                        background: '#E8F5E9', color: '#15803D',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, fontWeight: 800,
                        flexShrink: 0,
                      }}>
                        {(m.trainee_name || '?').trim().charAt(0)}
                      </div>
                      <div style={{
                        flex: 1, minWidth: 0,
                        fontSize: 14, fontWeight: 600, color: '#1a1a1a',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {m.trainee_name || 'מתאמן'}
                      </div>
                      <span style={{ color: '#C9A24A', fontSize: 14, flexShrink: 0 }}>›</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Floating multi-select action bar — shows when 1+ trainees
            are checked. Status changes go through a small dialog so
            the coach can pick the target status. Archive (former) is
            a one-tap action behind a confirm. */}
        <MultiSelectBar
          count={sel.selectedCount}
          onCancel={sel.clearSelection}
          actions={[
            {
              icon: '👥', label: 'הקם קבוצה', primary: true,
              onClick: () => {
                setGroupForm({ name: '', description: '' });
                setShowCreateGroup(true);
              },
            },
            {
              icon: '🗑️', label: 'ארכיון', danger: true,
              onClick: async () => {
                if (!window.confirm(`להעביר ${sel.selectedCount} לארכיון?`)) return;
                const ids = Array.from(sel.selectedIds);
                try {
                  for (const id of ids) {
                    await supabase.from('users').update({ client_status: 'former' }).eq('id', id);
                  }
                  queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
                  queryClient.invalidateQueries({ queryKey: ['users-list'] });
                  toast.success(`${ids.length} הועברו לארכיון`);
                  sel.clearSelection();
                } catch (e) {
                  console.warn('[AllUsers] bulk archive failed:', e?.message);
                  toast.error('שגיאה בהעברה לארכיון');
                }
              },
            },
          ]}
        />

        {/* Create-group dialog — opens from the bar's "+ הקם קבוצה" action.
            Same overlay pattern as the bulk-status picker above so the
            visual language stays consistent. Members are the already-
            selected trainees; the dialog only asks for the group name +
            optional description. */}
        {showCreateGroup && (
          <div
            onClick={() => { if (!creatingGroup) setShowCreateGroup(false); }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.4)', zIndex: 10000,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'white', borderRadius: 14, padding: 20,
                maxWidth: 360, width: '90%', direction: 'rtl',
                fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, textAlign: 'center', color: '#1a1a1a' }}>
                הקם קבוצה חדשה
              </div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 16, textAlign: 'center' }}>
                {sel.selectedCount} מתאמנים יתווספו כחברים
              </div>

              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6 }}>
                שם הקבוצה *
              </label>
              <input
                type="text"
                value={groupForm.name}
                onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="לדוגמה: קבוצת בוקר"
                disabled={creatingGroup}
                style={{
                  width: '100%', padding: '10px 12px',
                  borderRadius: 10,
                  border: '1.5px solid #F0E4D0',
                  fontSize: 14, direction: 'rtl',
                  background: creatingGroup ? '#F5F5F5' : 'white', outline: 'none',
                  boxSizing: 'border-box', marginBottom: 12,
                  fontFamily: 'inherit',
                }}
                autoFocus
              />

              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6 }}>
                תיאור (אופציונלי)
              </label>
              <textarea
                value={groupForm.description}
                onChange={(e) => setGroupForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="הוסף תיאור קצר"
                disabled={creatingGroup}
                rows={2}
                style={{
                  width: '100%', padding: '10px 12px',
                  borderRadius: 10,
                  border: '1.5px solid #F0E4D0',
                  fontSize: 13, direction: 'rtl',
                  background: creatingGroup ? '#F5F5F5' : 'white', outline: 'none',
                  boxSizing: 'border-box', marginBottom: 16,
                  fontFamily: 'inherit', resize: 'vertical',
                }}
              />

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateGroup(false)}
                  disabled={creatingGroup}
                  style={{
                    flex: 1, padding: '11px 0', borderRadius: 12,
                    border: '1px solid #F0E4D0', background: 'white',
                    fontSize: 13, fontWeight: 700, color: '#666',
                    cursor: creatingGroup ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={handleCreateGroup}
                  disabled={creatingGroup || !groupForm.name.trim()}
                  style={{
                    flex: 1, padding: '11px 0', borderRadius: 12, border: 'none',
                    background: (creatingGroup || !groupForm.name.trim()) ? '#D1D5DB' : '#FF6F20',
                    color: 'white',
                    fontSize: 13, fontWeight: 800,
                    cursor: (creatingGroup || !groupForm.name.trim()) ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {creatingGroup ? 'יוצר...' : 'צור קבוצה'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk status picker — opens from the bar's "שנה סטטוס" action */}
        {showBulkStatus && (
          <div
            onClick={() => setShowBulkStatus(false)}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.4)', zIndex: 10000,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'white', borderRadius: 14, padding: 20,
                maxWidth: 320, width: '90%', direction: 'rtl',
                fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, textAlign: 'center' }}>
                שנה סטטוס ל-{sel.selectedCount} נבחרים
              </div>
              {STATUS_OPTIONS.map((s) => {
                const opt = STATUS_BADGES[s];
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={async () => {
                      const ids = Array.from(sel.selectedIds);
                      try {
                        for (const id of ids) {
                          await supabase.from('users').update({ client_status: s }).eq('id', id);
                        }
                        queryClient.invalidateQueries({ queryKey: ['all-trainees'] });
                        queryClient.invalidateQueries({ queryKey: ['users-list'] });
                        toast.success(`${ids.length} עודכנו ל-${opt?.label || s}`);
                        sel.clearSelection();
                        setShowBulkStatus(false);
                      } catch (e) {
                        console.warn('[AllUsers] bulk status failed:', e?.message);
                        toast.error('שגיאה בעדכון הסטטוס');
                      }
                    }}
                    style={{
                      width: '100%', padding: 12, borderRadius: 12,
                      border: '1px solid #F0E4D0', background: 'white',
                      fontSize: 14, cursor: 'pointer', marginBottom: 6,
                      display: 'flex', alignItems: 'center', gap: 8,
                      justifyContent: 'center',
                      fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
                    }}
                  >
                    {opt?.icon && <span aria-hidden>{opt.icon}</span>}
                    <span>{opt?.label || s}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <RenameUserDialog
          isOpen={showRenameDialog}
          onClose={() => {
            setShowRenameDialog(false);
            setUserToRename(null);
          }}
          onSubmit={(newName) => {
            if (userToRename) {
              renameUserMutation.mutate({ id: userToRename.id, fullName: newName });
            }
          }}
          user={userToRename}
          isLoading={renameUserMutation.isPending}
        />

        <AddTraineeDialog open={isAddTraineeOpen} onClose={() => setIsAddTraineeOpen(false)} />
        {/* Mount gate mirrors the button gate above — only the main
            admin UUID (Oriel) can open AddCoachDialog. role==='admin'
            users without the UUID see neither the trigger nor the
            dialog tree, which keeps the mount tree tight and prevents
            future code from accidentally surfacing it. */}
        {isOwnerAdmin && (
          <AddCoachDialog open={isAddCoachOpen} onClose={() => setIsAddCoachOpen(false)} />
        )}

        {/* Per-member action sheet (layer 3). Tapping a group member
            row opens this; tapping an action launches the matching
            existing dialog (or navigates to the profile). Baseline
            uses the global Manager so no mount needed here. */}
        {memberActionOpen && selectedMember && (
          <div
            onClick={() => setMemberActionOpen(false)}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.5)', zIndex: 10001,
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              padding: 0,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'white',
                borderRadius: '20px 20px 0 0',
                padding: '18px 16px 24px',
                width: '100%',
                maxWidth: 480,
                direction: 'rtl',
                fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
                boxShadow: '0 -8px 32px rgba(0,0,0,0.15)',
              }}
            >
              {/* Grabber */}
              <div style={{
                width: 40, height: 4, background: '#E5E5E5',
                borderRadius: 999, margin: '0 auto 14px',
              }} />

              {/* Header — member name */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                paddingBottom: 12, marginBottom: 8,
                borderBottom: '1px solid #F0F0F0',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 999,
                  background: '#E8F5E9', color: '#15803D',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 800, flexShrink: 0,
                }}>
                  {(selectedMember.trainee_name || '?').trim().charAt(0)}
                </div>
                <div style={{
                  fontSize: 16, fontWeight: 800, color: '#1a1a1a',
                  flex: 1, minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {selectedMember.trainee_name || 'מתאמן'}
                </div>
              </div>

              {/* Actions */}
              {[
                {
                  icon: '📏', label: 'מדידה',
                  onClick: () => { setMemberActionOpen(false); setMeasurementForMember(true); },
                },
                {
                  icon: '🏆', label: 'שיא',
                  onClick: () => { setMemberActionOpen(false); setRecordForMember(true); },
                },
                {
                  icon: '📊', label: 'בייסליין',
                  onClick: () => {
                    setMemberActionOpen(false);
                    openBaselineDialog({
                      traineeId: selectedMember.trainee_id,
                      traineeName: selectedMember.trainee_name,
                    });
                  },
                },
                {
                  icon: '📝', label: 'הערה',
                  onClick: () => { setMemberActionOpen(false); setNoteForMember(true); },
                },
                {
                  icon: '🗓️', label: 'זכאות שבועית',
                  onClick: () => {
                    setMemberActionOpen(false);
                    setEligibilityForMember(selectedMember);
                  },
                },
                {
                  icon: '👤', label: 'פתח פרופיל', primary: true,
                  onClick: () => {
                    setMemberActionOpen(false);
                    if (selectedMember?.trainee_id) {
                      navigate(createPageUrl('TraineeProfile')
                        + `?userId=${encodeURIComponent(selectedMember.trainee_id)}`);
                    }
                  },
                },
              ].map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={a.onClick}
                  style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 12px', borderRadius: 12,
                    background: a.primary ? '#FFF5EE' : 'white',
                    border: a.primary ? '1px solid #FF6F20' : '1px solid #F0E4D0',
                    color: a.primary ? '#FF6F20' : '#1a1a1a',
                    fontSize: 14, fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    marginBottom: 6,
                    textAlign: 'right',
                  }}
                >
                  <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>{a.icon}</span>
                  <span style={{ flex: 1 }}>{a.label}</span>
                  <span aria-hidden style={{ color: '#C9A24A', fontSize: 14 }}>›</span>
                </button>
              ))}

              <button
                type="button"
                onClick={() => setMemberActionOpen(false)}
                style={{
                  width: '100%',
                  padding: '11px 0', borderRadius: 12,
                  border: '1px solid #F0E4D0', background: 'white',
                  fontSize: 13, fontWeight: 700, color: '#666',
                  cursor: 'pointer', marginTop: 6,
                  fontFamily: 'inherit',
                }}
              >
                ביטול
              </button>
            </div>
          </div>
        )}

        {/* Per-member leaf dialogs — all reuse existing components.
            Each closes back to AllUsers; the action sheet is already
            dismissed by the action that triggered them. selectedMember
            is the source of truth for trainee_id / trainee_name. */}
        {measurementForMember && selectedMember && (
          <MeasurementFormDialog
            isOpen={measurementForMember}
            onClose={() => setMeasurementForMember(false)}
            traineeId={selectedMember.trainee_id}
            traineeName={selectedMember.trainee_name}
          />
        )}
        {recordForMember && selectedMember && (
          <NewRecordDialog
            isOpen={recordForMember}
            onClose={() => setRecordForMember(false)}
            traineeId={selectedMember.trainee_id}
            coachId={currentUser?.id}
            currentUserId={currentUser?.id}
            isCoach={true}
          />
        )}
        {noteForMember && selectedMember && (
          <TraineeNoteDialog
            isOpen={noteForMember}
            onClose={() => setNoteForMember(false)}
            traineeId={selectedMember.trainee_id}
            traineeName={selectedMember.trainee_name}
            currentNote={
              (allTrainees || []).find((t) => t.id === selectedMember.trainee_id)?.additional_notes || ''
            }
          />
        )}

        {/* Per-member weekly eligibility editor — opened from the
            per-member action sheet on a group's detail screen. Edits
            allowed_days + weekly_quota on the membership row; the
            attendance dialog reads these to compute its informational
            tags. */}
        <MemberEligibilityDialog
          member={eligibilityForMember}
          onClose={() => setEligibilityForMember(null)}
        />

        {/* Confirm-delete-group modal — uses the same Dialog primitive
            Layout.jsx's logout confirmation uses. We never call
            window.confirm here: keeps the modal styled + RTL +
            dismiss-on-pending-disabled, matching the rest of the app. */}
        <Dialog
          open={!!groupToDelete}
          onOpenChange={(o) => {
            if (!o && !deleteGroupMutation.isPending) setGroupToDelete(null);
          }}
        >
          <DialogContent className="max-w-sm p-5">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-right">
                מחיקת קבוצה
              </DialogTitle>
            </DialogHeader>
            <div dir="rtl" style={{ fontFamily: "'Rubik', system-ui, -apple-system, sans-serif" }}>
              <div style={{ fontSize: 14, color: '#1a1a1a', lineHeight: 1.55, marginTop: 6 }}>
                למחוק את הקבוצה <b>"{groupToDelete?.name || 'ללא שם'}"</b>?
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 6, lineHeight: 1.5 }}>
                המתאמנים יישארו במערכת — רק השיוך לקבוצה יוסר.
                מפגשים היסטוריים נשמרים כפי שהם.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { if (!deleteGroupMutation.isPending) setGroupToDelete(null); }}
                  disabled={deleteGroupMutation.isPending}
                  className="flex-1 rounded-xl font-bold min-h-[44px]"
                >
                  ביטול
                </Button>
                <Button
                  type="button"
                  onClick={() => deleteGroupMutation.mutate(groupToDelete)}
                  disabled={deleteGroupMutation.isPending || !groupToDelete}
                  className="flex-1 rounded-xl font-bold text-white min-h-[44px] bg-red-600 hover:bg-red-700"
                >
                  {deleteGroupMutation.isPending ? 'מוחק…' : 'מחק קבוצה'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Comprehensive "+ קבוצה חדשה" dialog — opens from the
            primary CTA at the top of the groups hub. Writes to the
            SAME training_groups + training_group_members tables the
            Sessions view reads from, so a group created here appears
            in both places via the shared ['training-groups'] cache. */}
        <CreateGroupDialog
          isOpen={showCreateGroupFull}
          onClose={() => setShowCreateGroupFull(false)}
          currentUser={currentUser}
          trainees={allTrainees || []}
        />

        {/* Whole-group dialogs — same components Sessions.jsx /
            TrainingPlans.jsx mount. Pre-seeded with the group's
            members so the coach goes straight to building, not
            re-picking the roster. */}
        <FastAttendanceDialog
          group={fastAttendanceGroup}
          groupMembers={groupMembers}
          coachId={currentUser?.id}
          onClose={() => setFastAttendanceGroup(null)}
        />
        {planFormGroup && (
          <PlanFormDialog
            isOpen={!!planFormGroup}
            onClose={() => setPlanFormGroup(null)}
            onSubmit={handlePlanFormSubmit}
            trainees={allTrainees || []}
            initialSelectedTraineeIds={
              groupMembers
                .filter((m) => m.group_id === planFormGroup.id)
                .map((m) => m.trainee_id)
            }
            formKeySuffix={`group_${planFormGroup.id}`}
          />
        )}
      </div>
    </ProtectedCoachPage>
  );
}