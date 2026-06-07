import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabaseClient";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
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
import { calculateAge as calcAge, formatBirthWithAge } from "@/lib/dateHelpers";

export default function AllUsers() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
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
  }, [allTrainees, allServices, searchTerm, filterType, sortMode, showFormer]);

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

  return (
    <ProtectedCoachPage>
      <div style={{ minHeight: '100vh', background: '#FFF9F0', paddingBottom: 100, direction: 'rtl' }}>
        {/* A. Page header */}
        <div style={{
          padding: 16,
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a' }}>👥 מתאמנים</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              {visibleTrainees.length} מתאמנים · {counts.active} פעילים
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {/* Groups hub entry. When already inside the hub the same
                button doubles as a "back to trainees" exit so the coach
                isn't trapped on a screen without an explicit way out. */}
            <button
              onClick={() => {
                if (view === 'list') {
                  sel.clearSelection();
                  setSelectedGroup(null);
                  setView('groups');
                } else {
                  setSelectedGroup(null);
                  setView('list');
                }
              }}
              style={{
                padding: '8px 14px', borderRadius: 12,
                border: view !== 'list' ? '1px solid #FF6F20' : '1px solid #F0E4D0',
                background: view !== 'list' ? '#FFF5EE' : 'white',
                color: view !== 'list' ? '#FF6F20' : '#555',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {view === 'list' ? '👥 קבוצות' : '↩ מתאמנים'}
            </button>
            <button
              onClick={() => sel.isSelecting ? sel.clearSelection() : sel.startSelecting()}
              style={{
                padding: '8px 14px', borderRadius: 12,
                border: '1px solid #F0E4D0',
                background: sel.isSelecting ? '#FFF5EE' : 'white',
                color: sel.isSelecting ? '#FF6F20' : '#888',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {sel.isSelecting ? '✕ ביטול' : '☑ בחירה'}
            </button>
            <button
              onClick={() => setIsAddTraineeOpen(true)}
              style={{
                background: '#FF6F20', color: 'white',
                border: 'none', borderRadius: 12,
                padding: '10px 16px', fontSize: 13,
                fontWeight: 600, cursor: 'pointer',
              }}
            >+ מתאמן חדש</button>
            {isAdmin && (
              <button
                onClick={() => setIsAddCoachOpen(true)}
                style={{
                  background: '#2d3748', color: 'white',
                  border: 'none', borderRadius: 12,
                  padding: '10px 16px', fontSize: 13,
                  fontWeight: 600, cursor: 'pointer',
                }}
              >+ מאמן חדש</button>
            )}
          </div>
        </div>

        {view === 'list' && (
        <>
        {/* B. Search + sort toggle */}
        <div style={{ padding: '0 16px 10px', display: 'flex', gap: 8 }}>
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="🔍 חיפוש מתאמן..."
            style={{
              flex: 1, padding: '12px 16px',
              borderRadius: 14,
              border: '1.5px solid #F0E4D0',
              fontSize: 14, direction: 'rtl',
              background: 'white', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {/* Cycle: recent → asc (א-ב) → desc (ב-א) → asc → desc → ...
              Once the coach taps once, "recent" is no longer in the
              cycle — they explicitly want a name sort. The label
              shows the action that the next tap will perform, which
              is the most predictable affordance. */}
          <button
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
              padding: '0 14px',
              borderRadius: 14,
              border: '1.5px solid #F0E4D0',
              background: sortMode === 'recent' ? 'white' : '#FFF3E5',
              color: '#1a1a1a',
              fontSize: 13, fontWeight: 700,
              cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
            }}
          >
            {sortMode === 'desc' ? 'מיין א-ב' : 'מיין ב-א'}
          </button>
        </div>

        {/* C. Filter chips */}
        <div style={{
          display: 'flex', gap: 6,
          padding: '0 16px 12px',
          overflowX: 'auto',
        }}>
          {[
            { id: 'all',      label: 'הכל',          count: counts.all },
            { id: 'active',   label: 'פעילים',       count: counts.active },
            { id: 'expiring', label: 'חבילה נגמרת',  count: counts.expiring },
            { id: 'inactive', label: 'לא פעילים',    count: counts.inactive },
          ].map(f => {
            const active = filterType === f.id;
            return (
              <div key={f.id} onClick={() => setFilterType(f.id)} style={{
                padding: '6px 12px', borderRadius: 20,
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
                background: active ? '#FF6F20' : 'white',
                color: active ? 'white' : '#888',
                border: active ? 'none' : '1px solid #F0E4D0',
              }}>{f.label} ({f.count})</div>
            );
          })}
          {/* Archived toggle — separate from the package-state chips
              because client_status is a different axis. Tap to flip
              archived (former) trainees in/out of the list. */}
          <div
            onClick={() => setShowFormer((v) => !v)}
            style={{
              padding: '6px 12px', borderRadius: 20,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
              background: showFormer ? '#FEE2E2' : 'white',
              color: showFormer ? '#B91C1C' : '#888',
              border: showFormer ? '1px solid #FCA5A5' : '1px solid #F0E4D0',
            }}
            title={showFormer ? 'מציג גם לשעבר' : 'הצג גם לשעבר'}
          >
            {showFormer ? '× לשעבר מוצגים' : '× הצג לשעבר'}
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
                border: sel.isSelecting && sel.isSelected(t.id)
                  ? '1.5px solid #FF6F20'
                  : isExpiring
                    ? '1.5px solid #EAB308'
                    : pkg
                      ? '1.5px solid #FF6F20'
                      : '0.5px solid #F0E4D0',
              }}
            >
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
                  בחר מתאמנים ולחץ "הקם קבוצה" כדי להתחיל
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {trainingGroups.map((group) => {
                  const memberCount = groupMembers.filter((m) => m.group_id === group.id).length;
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
                      {/* Initial avatar — first letter of the group name */}
                      <div style={{
                        width: 40, height: 40, borderRadius: 12,
                        background: '#FFF5EE', color: '#FF6F20',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, fontWeight: 800,
                        flexShrink: 0,
                      }}>
                        {(group.name || '?').trim().charAt(0)}
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
                      </div>
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
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'white', borderRadius: 14,
                border: '1px solid #F0E4D0', padding: '12px 14px',
                marginBottom: 12,
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
              </div>

              {/* Member list */}
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
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 14px', borderRadius: 12,
                        background: 'white',
                        border: '1px solid #F0E4D0',
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
                      {/* Chevron hints at future per-member actions —
                          actions themselves come in a later layer. */}
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
              icon: '🔄', label: 'שנה סטטוס', primary: true,
              onClick: () => setShowBulkStatus(true),
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
        {isAdmin && (
          <AddCoachDialog open={isAddCoachOpen} onClose={() => setIsAddCoachOpen(false)} />
        )}
      </div>
    </ProtectedCoachPage>
  );
}