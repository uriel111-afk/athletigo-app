import React, { useState, useEffect, useContext, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { AuthContext } from "@/lib/AuthContext";
import { suggestPackageForSession } from "../hooks/useServiceDeduction";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Calendar, Check, UserPlus, User } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import { useFormDraft } from "@/hooks/useFormDraft";
import { useKeepScreenAwake } from "@/hooks/useKeepScreenAwake";
import { supabase } from "@/lib/supabaseClient";
import { createNotification } from "@/lib/notify";
import SessionStatusPicker from "@/components/sessions/SessionStatusPicker";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import PaymentOverrideDialog from "@/components/sessions/PaymentOverrideDialog";
import { requiresPayment } from "@/lib/sessionHelpers";
import { DraftBanner } from "@/components/DraftBanner";
import DraftPrompt from "@/components/DraftPrompt";

// Strict past-date check at day granularity. Today counts as "not
// past" so a same-day session still defaults to "ממתין לאישור".
// Exported so downstream callers (Sessions.jsx, Dashboard.jsx)
// can apply the same rule when post-processing the form payload.
export const isPastDate = (dateStr) => {
  if (!dateStr) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${dateStr}T00:00:00`);
  return !Number.isNaN(d.getTime()) && d < today;
};

const INITIAL_DATA = {
  date: "",
  time: "10:00",
  session_type: "אישי",
  location: "",
  duration: 60,
  coach_notes: "",
  // Private coach-only notes — shipped behind a separate column so
  // a future trainee-side SELECT can omit it without losing the
  // public coach_notes field.
  coach_private_notes: "",
  participants: [],
  service_id: null,
  // Optional price — null/empty = free. When set, the trainee sees
  // a "שלם" CTA on the session card that goes through the
  // payment-create Edge Function (Grow integration).
  price: "",
  // Recurring-series fields. Stored alongside the rest so
  // useFormDraft persists them on every keystroke. Only active when
  // `recurring` flips on.
  recurring: false,
  recurDays: [],
  recurEndType: 'date',
  recurEndDate: '',
  recurEndCount: 4,
};

export default function SessionFormDialog({
  isOpen,
  onClose,
  onSubmit,
  trainees = [],
  editingSession = null,
  isLoading = false,
  // Coach id passed down from the parent (Sessions.jsx already has a
  // loaded `coach` object). Prefer it over the AuthContext value so
  // the trainee query no longer races AuthContext hydration — the
  // parent only opens this dialog once its coach is ready.
  coachId = null,
  // Sessions list from the parent — used only to derive the coach's
  // most-recent trainees for the quick-select chips. Optional; absent
  // → no recent chips, full list still works.
  sessions = [],
}) {
  const { user: currentCoach } = useContext(AuthContext);
  // Single source for "who is the coach" — prop wins, AuthContext is
  // the fallback for any caller that doesn't pass coachId.
  const effectiveCoachId = coachId ?? currentCoach?.id ?? null;
  const queryClient = useQueryClient();

  // Trainee picker source — loads ALL users in the system except the
  // coach themselves. Mirrors PackageFormDialog's loader. Bypasses
  // whatever filtered list the parent passes via `trainees`: too many
  // legacy rows have role=NULL / coach_id=NULL, and a strict filter
  // upstream surfaced "אין מתאמנים זמינים" even when the coach had
  // dozens of real trainees. effectiveTrainees prefers this internal
  // list; falls back to the prop only if the load fails/empty.
  const [searchQuery, setSearchQuery] = useState('');
  // Ref + delayed focus (see effect below) so the search field is
  // ready-to-type the instant a coach opens the dialog to create.
  const searchInputRef = useRef(null);
  // No initialData here on purpose — leaving data undefined until the
  // first fetch resolves is what makes `isLoading` true on open, so
  // the spinner can show instead of a misleading empty state.
  console.log('[SessionForm] Query enabled check:', {
    isOpen,
    coachId,
    currentCoachId: currentCoach?.id,
    effectiveCoachId: coachId || currentCoach?.id,
    enabled: isOpen && !!(coachId || currentCoach?.id),
  });
  const {
    data: allUsers = [],
    isLoading: isLoadingUsers,
    error: usersError,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: ['session-dialog-all-users', coachId || currentCoach?.id],
    queryFn: async () => {
      console.log('[loadAllUsers] starting for coach:', effectiveCoachId);
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, phone, role, coach_id, client_status, avatar_url')
        // Scope to this coach's trainees plus legacy unassigned rows
        // (coach_id IS NULL) — many older trainee rows never got a
        // coach_id and would otherwise vanish from the picker.
        .or(`coach_id.eq.${effectiveCoachId},coach_id.is.null`)
        .neq('id', effectiveCoachId)
        .order('full_name', { ascending: true });
      // Throw so the query surfaces `error` (and retries) instead of
      // silently resolving to [] — the UI shows a retry button.
      if (error) {
        console.error('[loadAllUsers] error:', error);
        console.error('[SessionForm] Supabase error:', JSON.stringify(error));
        throw error;
      }
      const filtered = (data || []).filter((u) => u.id !== effectiveCoachId);
      console.log('[loadAllUsers] total:', data?.length, 'after excluding coach:', filtered.length);
      console.log('[SessionForm] Got trainees:', data?.length, data?.map((u) => u.full_name));
      return filtered;
    },
    // Gate on a known coach id — the coach_id filter above requires it.
    // coachId comes from the parent (already loaded) so this resolves
    // the old AuthContext timing race.
    enabled: isOpen && !!(coachId || currentCoach?.id),
  });

  const effectiveTrainees = (allUsers && allUsers.length > 0) ? allUsers : trainees;

  const filteredTrainees = (() => {
    if (!searchQuery) return effectiveTrainees;
    const q = searchQuery.toLowerCase();
    return effectiveTrainees.filter((t) => (
      t.full_name?.toLowerCase().includes(q) ||
      t.email?.toLowerCase().includes(q) ||
      t.phone?.includes(q)
    ));
  })();

  // Recent trainees — last few unique people the coach booked, surfaced
  // as one-tap chips above the full list. Derived from the parent's
  // sessions list (newest first), resolved against the loaded trainee
  // rows so chips carry name/avatar. Capped at 5.
  const recentTrainees = useMemo(() => {
    if (!Array.isArray(sessions) || sessions.length === 0) return [];
    const byId = new Map((effectiveTrainees || []).map((t) => [t.id, t]));
    const ordered = [...sessions].sort(
      (a, b) =>
        new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0)
    );
    const seen = new Set();
    const result = [];
    for (const s of ordered) {
      const ids = [];
      if (s.trainee_id) ids.push(s.trainee_id);
      if (Array.isArray(s.participants)) {
        s.participants.forEach((p) => p?.trainee_id && ids.push(p.trainee_id));
      }
      for (const id of ids) {
        if (seen.has(id)) continue;
        const t = byId.get(id);
        if (!t) continue;
        seen.add(id);
        result.push(t);
        if (result.length >= 5) break;
      }
      if (result.length >= 5) break;
    }
    return result;
  }, [sessions, effectiveTrainees]);

  // Auto-focus the trainee search when creating (not editing) so the
  // coach can type-to-filter immediately. 300ms lets the dialog open
  // animation settle before stealing focus.
  useEffect(() => {
    if (!isOpen || editingSession) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, [isOpen, editingSession]);

  const initialData = editingSession ? {
    date: editingSession.date || "",
    time: editingSession.time || "",
    session_type: editingSession.session_type || "אישי",
    location: editingSession.location || "",
    duration: editingSession.duration || 60,
    coach_notes: editingSession.coach_notes || "",
    coach_private_notes: editingSession.coach_private_notes || "",
    participants: editingSession.participants || [],
    service_id: editingSession.service_id || null,
    price: editingSession.price != null ? String(editingSession.price) : "",
    // Recurring is a create-only flow; edit mode keeps the fields in
    // state but the UI for them is hidden.
    recurring: false,
    recurDays: [],
    recurEndType: 'date',
    recurEndDate: '',
    recurEndCount: 4,
  } : { ...INITIAL_DATA, date: new Date().toISOString().split('T')[0] };

  const scopeKey = `${currentCoach?.id ?? 'no-coach'}_${editingSession?.id ?? 'new'}`;
  // Draft context = who the session is for (first participant) so the
  // resume prompt can say "draft for <name>".
  const firstParticipant = (editingSession?.participants?.[0]) || null;
  const draftContext = firstParticipant ? {
    traineeId: firstParticipant.trainee_id,
    traineeName: firstParticipant.trainee_name,
  } : null;
  const {
    data: sessionForm, setData: setSessionForm,
    hasDraft, keepDraft, discardDraft, clearDraft,
    draftContext: savedContext,
  } = useFormDraft('SessionForm', scopeKey, isOpen, initialData, draftContext);

  useKeepScreenAwake(isOpen);

  const [showGuestForm, setShowGuestForm] = useState(false);
  const [availableServices, setAvailableServices] = useState([]);
  // Additional-participants picker — drives the session_participants
  // table rather than the existing JSONB participants. Shape per row:
  //   { id?, trainee_id, trainee_name, package_id, package_name,
  //     package_remaining, deducted }
  // Rows with deducted=true are read-only (audit-trail protection).
  const [additionalParticipants, setAdditionalParticipants] = useState([]);
  // Per-trainee cache of their active packages so each row's package
  // dropdown can populate without re-querying on every render.
  const [packagesByTrainee, setPackagesByTrainee] = useState({});
  // Completion guard for the inline status pills row at the top of
  // the dialog. Holds the editingSession + price snapshot when the
  // coach taps 'הושלם' on a paid-but-unpaid row.
  const [overrideTarget, setOverrideTarget] = useState(null);

  // Fetch active services when participant changes
  useEffect(() => {
    const fetchServices = async () => {
      if (sessionForm.participants.length === 0) { setAvailableServices([]); return; }
      const firstTrainee = sessionForm.participants[0]?.trainee_id;
      if (!firstTrainee) return;
      try {
        const all = await base44.entities.ClientService.filter({ trainee_id: firstTrainee, status: 'פעיל' });
        const active = (all || []).filter(s => {
          // Group: check expiry only
          if (s.package_type === "group") return !s.expires_at || new Date(s.expires_at) >= new Date();
          // Personal/online: check remaining
          return ((s.total_sessions || s.sessions_count || 0) - (s.used_sessions || 0)) > 0;
        });
        setAvailableServices(active);
        // Auto-suggest best matching package
        if (!sessionForm.service_id && active.length > 0) {
          const suggested = suggestPackageForSession(sessionForm.session_type, active);
          if (suggested) setSessionForm(prev => ({ ...prev, service_id: suggested.id }));
        }
      } catch { setAvailableServices([]); }
    };
    fetchServices();
  }, [sessionForm.participants.length, sessionForm.session_type]);

  // Load existing session_participants rows when editing — enriches
  // each row with trainee + package names so the dropdowns render the
  // saved selections rather than empty strings.
  useEffect(() => {
    if (!editingSession?.id) {
      setAdditionalParticipants([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: rows, error } = await supabase
        .from('session_participants')
        .select('id, trainee_id, package_id, deducted')
        .eq('session_id', editingSession.id);
      if (cancelled) return;
      if (error || !rows) {
        if (error) console.warn('[SessionForm] load participants failed:', error.message);
        setAdditionalParticipants([]);
        return;
      }
      if (rows.length === 0) { setAdditionalParticipants([]); return; }
      const traineeIds = [...new Set(rows.map(r => r.trainee_id).filter(Boolean))];
      const pkgIds = [...new Set(rows.map(r => r.package_id).filter(Boolean))];
      const [usersRes, pkgsRes] = await Promise.all([
        traineeIds.length
          ? supabase.from('users').select('id, full_name').in('id', traineeIds)
          : Promise.resolve({ data: [] }),
        pkgIds.length
          ? supabase.from('client_services')
              .select('id, package_name, service_type, total_sessions, used_sessions, status')
              .in('id', pkgIds)
          : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;
      const tMap = Object.fromEntries((usersRes.data || []).map(u => [u.id, u]));
      const pMap = Object.fromEntries((pkgsRes.data || []).map(p => [p.id, p]));
      setAdditionalParticipants(rows.map(r => {
        const pkg = pMap[r.package_id];
        return {
          id: r.id,
          trainee_id: r.trainee_id,
          trainee_name: tMap[r.trainee_id]?.full_name || '',
          package_id: r.package_id || null,
          package_name: pkg ? (pkg.package_name || pkg.service_type || null) : null,
          package_remaining: pkg ? Math.max(0, (pkg.total_sessions || 0) - (pkg.used_sessions || 0)) : null,
          deducted: !!r.deducted,
        };
      }));
    })();
    return () => { cancelled = true; };
  }, [editingSession?.id]);

  // Lazy-fetch packages for a trainee when their row is configured.
  // Cached by trainee id so the same trainee in two rows hits Supabase
  // only once.
  const ensurePackagesForTrainee = async (traineeId) => {
    if (!traineeId || packagesByTrainee[traineeId]) return;
    try {
      const { data } = await supabase
        .from('client_services')
        .select('id, package_name, service_type, total_sessions, used_sessions, status')
        .eq('trainee_id', traineeId)
        .in('status', ['active', 'פעיל']);
      setPackagesByTrainee(prev => ({ ...prev, [traineeId]: data || [] }));
    } catch (e) {
      console.warn('[SessionForm] packages fetch failed:', e?.message);
    }
  };

  const addAdditionalParticipant = () => {
    setAdditionalParticipants(prev => [
      ...prev,
      { trainee_id: '', trainee_name: '', package_id: null, package_name: null, package_remaining: null, deducted: false },
    ]);
  };
  const updateAdditionalParticipant = (idx, patch) => {
    setAdditionalParticipants(prev => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
    if (patch.trainee_id) ensurePackagesForTrainee(patch.trainee_id);
  };
  const removeAdditionalParticipant = (idx) => {
    setAdditionalParticipants(prev => prev.filter((_, i) => i !== idx));
  };
  const [guestForm, setGuestForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    birth_date: "",
    parent_name: "",
    health_declaration: false,
    notes: ""
  });
  const [creatingGuest, setCreatingGuest] = useState(false);

  const calculateAge = (dateString) => {
    if (!dateString) return null;
    const today = new Date();
    const birthDate = new Date(dateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
  };

  const handleAddGuest = async () => {
    if (!guestForm.full_name) {
      toast.error("חובה למלא שם מלא לאורח");
      return;
    }
    if (!guestForm.health_declaration) {
      toast.error("חובה לאשר הצהרת בריאות");
      return;
    }

    const age = calculateAge(guestForm.birth_date);
    if (age !== null && age < 18 && !guestForm.parent_name) {
      toast.error("מתחת לגיל 18 חובה למלא שם הורה/אפוטרופוס");
      return;
    }

    setCreatingGuest(true);
    try {
      // Canonical leads schema: user_id + name. The legacy
      // coach_id + full_name pair doesn't exist on the live table
      // — RLS uses (auth.uid() = user_id), so an owner-less row is
      // rejected. Single-write the canonical fields.
      const lead = await base44.entities.Lead.create({
        name: guestForm.full_name,
        phone: guestForm.phone || null,
        email: guestForm.email || null,
        birth_date: guestForm.birth_date || null,
        age: age,
        parent_name: guestForm.parent_name || null,
        coach_notes: guestForm.notes || null,
        status: "חדש",
        source: "אחר",
        user_id: currentCoach?.id || null,
      });

      setSessionForm(prev => ({
        ...prev,
        participants: [...prev.participants, {
          trainee_id: lead.id,
          trainee_name: lead.full_name + " (אורח)",
          attendance_status: 'ממתין',
          is_guest: true
        }]
      }));

      setGuestForm({ full_name: "", phone: "", email: "", birth_date: "", parent_name: "", health_declaration: false, notes: "" });
      setShowGuestForm(false);
      // Trainee/lead lists pick up the new row on next render.
      queryClient.invalidateQueries({ queryKey: ['trainees-list'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success("משתתף חדש נוסף בהצלחה");
    } catch (e) {
        console.error("Error creating guest lead:", e);
        toast.error("שגיאה ביצירת משתתף");
    } finally {
        setCreatingGuest(false);
    }
  };

  // Removed useEffect for setSessionForm as useFormPersistence handles it via key change
  // and currentDefaults.

  const toggleParticipant = (traineeId, traineeName) => {
    setSessionForm(prev => {
      const exists = prev.participants.some(p => p.trainee_id === traineeId);

      if (exists) {
        return {
          ...prev,
          participants: prev.participants.filter(p => p.trainee_id !== traineeId)
        };
      } else {
        if (prev.session_type === 'אישי' && prev.participants.length >= 1) {
          toast.error("אימון אישי יכול להכיל משתתף אחד בלבד");
          return prev;
        }

        return {
          ...prev,
          participants: [...prev.participants, {
            trainee_id: traineeId,
            trainee_name: traineeName,
            attendance_status: 'ממתין'
          }]
        };
      }
    });
  };

  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    console.log("[SessionForm] Submit clicked. Form data:", JSON.stringify(sessionForm));

    if (!sessionForm.date || !sessionForm.time) {
      console.warn("[SessionForm] Validation failed — missing date or time");
      toast.error("יש למלא תאריך ושעה");
      return;
    }

    // === RECURRING SERIES BRANCH ===
    // Generates many future sessions in one go, all sharing a single
    // series_id + recurrence payload. Each row is created with the
    // SAME default status string the single-session path uses
    // ('ממתין לאישור' for future, 'הושלם' for past), so the existing
    // completion-flow deduction logic stays the only path that ever
    // touches remaining_sessions.
    if (sessionForm.recurring && !editingSession) {
      if (!Array.isArray(sessionForm.recurDays) || sessionForm.recurDays.length === 0) {
        toast.error("יש לבחור לפחות יום אחד בשבוע");
        return;
      }
      const traineeId = sessionForm.participants?.[0]?.trainee_id || null;
      if (!traineeId) {
        toast.error("יש לבחור משתתף לפני יצירת סדרת מפגשים");
        return;
      }

      let endDate = null;
      let cap = Infinity;
      if (sessionForm.recurEndType === 'date') {
        if (!sessionForm.recurEndDate) { toast.error("יש לבחור תאריך סיום"); return; }
        endDate = new Date(sessionForm.recurEndDate + 'T00:00:00');
      } else if (sessionForm.recurEndType === 'count') {
        cap = Math.max(0, Number(sessionForm.recurEndCount) || 0);
        if (!cap) { toast.error("יש להזין מספר מפגשים"); return; }
      } else if (sessionForm.recurEndType === 'package') {
        const pkg = availableServices.find(s => s.id === sessionForm.service_id);
        if (!pkg) {
          toast.warning("לא נבחרה חבילה — לא נוצרו מפגשים חוזרים");
          return;
        }
        cap = pkg.remaining_sessions != null
          ? Number(pkg.remaining_sessions)
          : Math.max(0, (Number(pkg.total_sessions) || 0) - (Number(pkg.used_sessions) || 0));
        if (!cap) {
          toast.warning("אין מפגשים נותרים בחבילה");
          return;
        }
      }

      const formatYYYYMMDD = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      const startDate = new Date(sessionForm.date + 'T00:00:00');
      const planned = [];
      const cursor = new Date(startDate);
      const MAX_ITER = 366 * 3; // safety bound (~3 years)
      for (let i = 0; i < MAX_ITER; i++) {
        if (endDate && cursor > endDate) break;
        if (sessionForm.recurDays.includes(cursor.getDay())) {
          planned.push(formatYYYYMMDD(cursor));
          if (planned.length >= cap) break;
        }
        cursor.setDate(cursor.getDate() + 1);
      }

      console.log('[SessionForm][recurring] planned dates:', planned);

      if (planned.length === 0) {
        toast.error("לא חושבו מפגשים — בדוק את הימים והתאריכים");
        return;
      }

      setSaving(true);
      try {
        // Duplicate guard — fetch any existing sessions for this
        // trainee+time on the planned dates so we skip rather than
        // duplicate. Same-trainee + same-date + same-time is the
        // intended uniqueness key here.
        const { data: existing } = await supabase
          .from('sessions')
          .select('date, time')
          .eq('trainee_id', traineeId)
          .eq('time', sessionForm.time)
          .in('date', planned);
        const existingSet = new Set((existing || []).map(r => r.date));

        const priceNumber = sessionForm.price === "" || sessionForm.price == null
          ? null
          : Number(sessionForm.price);
        const seriesId = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `series_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const recurrence = {
          days: sessionForm.recurDays,
          time: sessionForm.time,
          endType: sessionForm.recurEndType,
          endValue: sessionForm.recurEndType === 'date'
            ? sessionForm.recurEndDate
            : (sessionForm.recurEndType === 'count' ? (Number(sessionForm.recurEndCount) || 0) : cap),
        };

        const baseRow = {
          coach_id: effectiveCoachId || null,
          trainee_id: traineeId,
          time: sessionForm.time,
          session_type: sessionForm.session_type,
          location: sessionForm.location || 'לא צוין',
          duration: sessionForm.duration || 60,
          coach_notes: sessionForm.coach_notes || null,
          coach_private_notes: sessionForm.coach_private_notes || null,
          participants: sessionForm.participants || [],
          price: Number.isFinite(priceNumber) && priceNumber > 0 ? priceNumber : null,
          payment_status: Number.isFinite(priceNumber) && priceNumber > 0 ? 'unpaid' : null,
          series_id: seriesId,
          recurrence,
        };
        if (sessionForm.service_id) baseRow.service_id = sessionForm.service_id;

        let created = 0;
        let skipped = 0;
        for (const d of planned) {
          if (existingSet.has(d)) { skipped++; continue; }
          try {
            await base44.entities.Session.create({
              ...baseRow,
              date: d,
              // Same default status string as the single-session path
              // — generation MUST NOT change remaining_sessions; only
              // the completion flow ever deducts.
              status: isPastDate(d) ? 'הושלם' : 'ממתין לאישור',
            });
            created++;
          } catch (err) {
            console.warn('[SessionForm][recurring] insert failed for', d, err?.message);
            skipped++;
          }
        }

        console.log('[SessionForm][recurring] created:', created, 'skipped:', skipped);

        queryClient.invalidateQueries({ queryKey: ['sessions'] });
        queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
        queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
        queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });

        toast.success(`נוצרו ${created} מפגשים, דולגו ${skipped}`);
        clearDraft();
        onClose();
      } catch (error) {
        console.error("[SessionForm][recurring] Save error:", error);
        const msg = error?.message || error?.body?.message || "שגיאה לא צפויה";
        toast.error("שגיאה ביצירת סדרת מפגשים: " + msg);
      } finally {
        setSaving(false);
      }
      return;
    }

    // === SINGLE-SESSION BRANCH (unchanged path) ===
    // Explicit field mapping — no blind spread
    const priceNumber = sessionForm.price === "" || sessionForm.price == null
      ? null
      : Number(sessionForm.price);
    // Mirror the first participant onto a top-level trainee_id so
    // every consumer that filters by sessions.trainee_id (e.g. the
    // package link-dialog, the trainee profile sessions query)
    // finds the row without needing the participants JSONB
    // contains() filter. participants[] is preserved as the source
    // of truth — this is just a denormalized convenience column.
    const firstTraineeId = sessionForm.participants?.[0]?.trainee_id || null;
    const sessionDataWithStatus = {
      date: sessionForm.date,
      time: sessionForm.time,
      session_type: sessionForm.session_type,
      location: sessionForm.location || null,
      duration: sessionForm.duration || 60,
      coach_notes: sessionForm.coach_notes || null,
      coach_private_notes: sessionForm.coach_private_notes || null,
      coach_id: effectiveCoachId || null,
      trainee_id: firstTraineeId,
      participants: sessionForm.participants || [],
      // null = free / no price; positive number → unpaid until the
      // trainee runs payment-create. Coach can mark paid manually.
      price: Number.isFinite(priceNumber) && priceNumber > 0 ? priceNumber : null,
      payment_status: Number.isFinite(priceNumber) && priceNumber > 0 ? 'unpaid' : null,
      // Past-date heuristic: a coach logging a session whose date
      // already passed is almost always recording history, so the
      // default flips from "waiting for approval" to "הושלם". The
      // parent caller in Sessions.jsx / Dashboard.jsx is wired to
      // honor this exact value (rather than always overwriting).
      status: editingSession
        ? sessionForm.status
        : (isPastDate(sessionForm.date) ? 'הושלם' : 'ממתין לאישור'),
    };
    // Only include service_id if a package was selected
    if (sessionForm.service_id) {
      sessionDataWithStatus.service_id = sessionForm.service_id;
    }

    // Additional-participants picker → parent strips this field
    // before insert and writes the rows separately into
    // session_participants once the session row exists.
    sessionDataWithStatus.additional_participants = additionalParticipants
      .filter(p => p.trainee_id)
      .map(p => ({ trainee_id: p.trainee_id, package_id: p.package_id || null }));

    console.log("[SessionForm] Sending to parent:", JSON.stringify(sessionDataWithStatus));
    setSaving(true);
    try {
      await onSubmit(sessionDataWithStatus);
      console.log("[SessionForm] Success — closing");
      clearDraft();
      onClose();
    } catch (error) {
      console.error("[SessionForm] Save error:", error);
      const msg = error?.message || error?.body?.message || "שגיאה לא צפויה";
      toast.error("שגיאה בשמירת מפגש: " + msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {isOpen && hasDraft && (
        <DraftPrompt
          traineeName={savedContext?.traineeName}
          formLabel="טופס מפגש"
          onResume={keepDraft}
          onNew={discardDraft}
          onDiscard={discardDraft}
        />
      )}
      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) {
          // Just closing, preserve draft
          onClose();
        }
      }}>
        <DialogContent
          className="max-w-3xl"
          // Lock the dialog to X-button / successful-save dismissal
          // only — accidental backdrop taps or Esc would otherwise
          // wipe a long form-in-progress before draft persistence
          // can save it on the next keystroke.
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-xl md:text-2xl font-black mb-2" style={{ color: '#000000' }}>
              {editingSession ? '✏️ ערוך מפגש' : '➕ צור מפגש חדש'}
            </DialogTitle>
          </DialogHeader>

          {/* flex column (not space-y) so visual `order` below can lift
              the trainee picker to the top without breaking spacing. */}
          <div className="flex flex-col gap-5">
          {/* Status pills — when editing an existing row, switching the
              chip writes to the DB immediately AND mirrors into the
              local form state so a later "save" of other fields
              persists the new status too. For new sessions there's no
              row yet → only the local form state is touched and the
              create flow picks up the chosen status on submit. */}
          {editingSession?.id && (
            <div style={{ order: -2 }}>
              <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                סטטוס המפגש
              </Label>
              <SessionStatusPicker
                variant="pills"
                value={sessionForm.status}
                onChange={async (newStatus) => {
                  // Completion guard — same gate Sessions.jsx uses.
                  // Snapshot price+payment_status from the latest
                  // form values + editingSession so the dialog gets
                  // the row even before the user saves the parent.
                  const snapshot = {
                    ...editingSession,
                    price: sessionForm.price ?? editingSession?.price,
                    payment_status: editingSession?.payment_status ?? sessionForm.payment_status,
                  };
                  if (newStatus === 'הושלם' && requiresPayment(snapshot)) {
                    setOverrideTarget(snapshot);
                    return;
                  }

                  setSessionForm(prev => ({ ...prev, status: newStatus }));
                  try {
                    const { error } = await supabase
                      .from('sessions')
                      .update({ status: newStatus, updated_at: new Date().toISOString() })
                      .eq('id', editingSession.id);
                    if (error) throw error;
                    if (editingSession.trainee_id) {
                      try {
                        const dateLabel = editingSession.date
                          ? new Date(editingSession.date).toLocaleDateString('he-IL')
                          : '';
                        await createNotification({
                          userId: editingSession.trainee_id,
                          type: 'session_status_changed',
                          message: `הסטטוס של המפגש ב-${dateLabel} שונה ל-${newStatus}`,
                        });
                      } catch (e) {
                        console.warn('[SessionForm] status-change notif failed:', e?.message);
                      }
                    }
                    // Refresh every list that paints session status.
                    // Both keys are passed in different parts of the
                    // app (coach Sessions page uses ['sessions'],
                    // TraineeProfile uses ['trainee-sessions']).
                    queryClient.invalidateQueries({ queryKey: ['sessions'] });
                    queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
                    queryClient.invalidateQueries({ queryKey: ['trainee-today-session'] });
                    toast.success(`הסטטוס עודכן ל-${newStatus}`);
                  } catch (e) {
                    console.warn('[SessionForm] status update failed:', e?.message);
                    toast.error('שגיאה בעדכון הסטטוס');
                  }
                }}
              />
            </div>
          )}

          {/* Date Selection — Calendar picker */}
          <div>
            <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
              {sessionForm.recurring ? 'תאריך התחלה' : 'תאריך'}
            </Label>
            <Input
              type="date"
              value={sessionForm.date || new Date().toISOString().split('T')[0]}
              onChange={(e) => setSessionForm({ ...sessionForm, date: e.target.value })}
              // No min — past dates intentional. Coaches need to log
              // sessions that already happened (retroactive entry,
              // imports, etc.). The submit handler defaults a
              // past-date session's status to 'הושלם' automatically.
              className="rounded-xl text-base h-12 w-full"
              style={{ border: '2px solid #E0E0E0', fontSize: '16px' }}
            />
            {sessionForm.date && (
              <p className="text-xs text-gray-500 mt-1 text-center">
                {format(new Date(sessionForm.date + 'T00:00:00'), 'EEEE, d בMMMM yyyy', { locale: he })}
              </p>
            )}
          </div>

          {/* Quick Time Selection */}
          <div>
            <Label className="text-sm font-bold mb-3 block" style={{ color: '#000000' }}>
              🕐 בחר שעה מהירה
            </Label>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {['06:00', '08:00', '12:00', '16:00', '18:00', '20:00'].map(time => (
                <button
                  key={time}
                  type="button"
                  onClick={() => setSessionForm({ ...sessionForm, time })}
                  className="p-2 rounded-lg font-bold text-sm transition-all"
                  style={{
                    backgroundColor: sessionForm.time === time ? 'var(--ag-accent)' : '#FFFFFF',
                    color: sessionForm.time === time ? 'white' : '#000000',
                    border: sessionForm.time === time ? 'none' : '2px solid #E0E0E0'
                  }}
                >
                  {time}
                </button>
              ))}
            </div>
            <Input
              type="time"
              value={sessionForm.time}
              onChange={(e) => setSessionForm({ ...sessionForm, time: e.target.value })}
              className="rounded-xl text-base py-6"
              style={{ border: '2px solid #E0E0E0' }}
            />
          </div>

          {/* Recurring series — create-only. Toggle off = identical
              behavior to the existing single-session flow. Toggle on =
              the existing date+time fields become the series start, and
              handleSubmit branches into the bulk-insert path. */}
          {!editingSession && (
            <div className="rounded-xl p-4" style={{ backgroundColor: '#FAFAFA', border: '1px solid var(--ag-chip-border)' }}>
              <div className="flex items-center justify-between">
                <Label className="text-sm font-bold" style={{ color: '#000000', margin: 0 }}>
                  🔁 מפגש חוזר
                </Label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={sessionForm.recurring}
                  onClick={() => setSessionForm({ ...sessionForm, recurring: !sessionForm.recurring })}
                  style={{
                    position: 'relative',
                    width: '48px',
                    height: '26px',
                    borderRadius: '9999px',
                    border: 'none',
                    backgroundColor: sessionForm.recurring ? 'var(--ag-accent)' : 'var(--ag-chip-border)',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease',
                    padding: 0,
                  }}
                  aria-label="הפעל מפגש חוזר"
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '3px',
                      left: sessionForm.recurring ? '25px' : '3px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: '#FFFFFF',
                      transition: 'left 0.15s ease',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                    }}
                  />
                </button>
              </div>

              {sessionForm.recurring && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Weekday chips — labels rendered right-to-left
                      visually, mapping to JS getDay() 0..6. */}
                  <div>
                    <Label className="text-xs font-bold mb-2 block" style={{ color: '#555' }}>
                      ימים בשבוע
                    </Label>
                    <div style={{ display: 'flex', gap: '6px', direction: 'rtl', flexWrap: 'wrap' }}>
                      {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((label, idx) => {
                        const dow = idx;
                        const selected = sessionForm.recurDays.includes(dow);
                        return (
                          <button
                            key={dow}
                            type="button"
                            onClick={() => {
                              setSessionForm({
                                ...sessionForm,
                                recurDays: selected
                                  ? sessionForm.recurDays.filter(d => d !== dow)
                                  : [...sessionForm.recurDays, dow],
                              });
                            }}
                            style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '50%',
                              fontWeight: 700,
                              fontSize: '14px',
                              cursor: 'pointer',
                              backgroundColor: selected ? 'var(--ag-accent)' : '#FFFFFF',
                              color: selected ? '#FFFFFF' : 'var(--ag-text-soft)',
                              border: selected ? 'none' : '1px solid var(--ag-chip-border)',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* End condition — three mutually-exclusive modes. */}
                  <div>
                    <Label className="text-xs font-bold mb-2 block" style={{ color: '#555' }}>
                      תנאי סיום
                    </Label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px' }}>
                      {[
                        { key: 'date', label: 'עד תאריך' },
                        { key: 'count', label: 'מספר מפגשים' },
                        { key: 'package', label: 'עד שהחבילה נגמרת' },
                      ].map(opt => {
                        const selected = sessionForm.recurEndType === opt.key;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setSessionForm({ ...sessionForm, recurEndType: opt.key })}
                            style={{
                              padding: '8px',
                              borderRadius: '10px',
                              fontWeight: 700,
                              fontSize: '12px',
                              cursor: 'pointer',
                              backgroundColor: selected ? 'var(--ag-accent)' : '#FFFFFF',
                              color: selected ? '#FFFFFF' : 'var(--ag-text-soft)',
                              border: selected ? 'none' : '1px solid var(--ag-chip-border)',
                              transition: 'all 0.15s ease',
                              lineHeight: 1.3,
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {sessionForm.recurEndType === 'date' && (
                    <div>
                      <Label className="text-xs font-bold mb-1 block" style={{ color: '#555' }}>
                        תאריך סיום
                      </Label>
                      <Input
                        type="date"
                        value={sessionForm.recurEndDate}
                        onChange={(e) => setSessionForm({ ...sessionForm, recurEndDate: e.target.value })}
                        className="rounded-xl"
                        style={{ border: '1px solid var(--ag-chip-border)' }}
                      />
                    </div>
                  )}
                  {sessionForm.recurEndType === 'count' && (
                    <div>
                      <Label className="text-xs font-bold mb-1 block" style={{ color: '#555' }}>
                        מספר מפגשים
                      </Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={sessionForm.recurEndCount}
                        onChange={(e) => setSessionForm({ ...sessionForm, recurEndCount: Number(e.target.value) || 0 })}
                        placeholder="למשל 12"
                        className="rounded-xl"
                        style={{ border: '1px solid var(--ag-chip-border)' }}
                      />
                    </div>
                  )}
                  {sessionForm.recurEndType === 'package' && (
                    <p className="text-xs p-2 rounded-lg" style={{ color: 'var(--ag-accent)', backgroundColor: '#FFF8F3' }}>
                      💡 ייווצרו מפגשים עד גמר המפגשים שנותרו בחבילה שתבחר למטה.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Session Type with Quick Buttons */}
          <div>
            <Label className="text-sm font-bold mb-3 block" style={{ color: '#000000' }}>
              🏋️ סוג אימון *
            </Label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => {
                  if (sessionForm.participants.length > 1) {
                    setSessionForm({ ...sessionForm, session_type: 'אישי', participants: [] });
                    toast.info("אימון אישי מוגבל למשתתף אחד");
                  } else {
                    setSessionForm({ ...sessionForm, session_type: 'אישי' });
                  }
                }}
                className="p-4 rounded-xl font-bold text-center transition-all"
                style={{
                  backgroundColor: sessionForm.session_type === 'אישי' ? 'var(--ag-accent)' : '#FFFFFF',
                  color: sessionForm.session_type === 'אישי' ? 'white' : '#000000',
                  border: sessionForm.session_type === 'אישי' ? 'none' : '2px solid #E0E0E0'
                }}
              >
                <div className="text-2xl mb-1">🧍‍♂️</div>
                <div className="text-sm">אישי</div>
              </button>
              <button
                type="button"
                onClick={() => setSessionForm({ ...sessionForm, session_type: 'קבוצתי' })}
                className="p-4 rounded-xl font-bold text-center transition-all"
                style={{
                  backgroundColor: sessionForm.session_type === 'קבוצתי' ? '#2196F3' : '#FFFFFF',
                  color: sessionForm.session_type === 'קבוצתי' ? 'white' : '#000000',
                  border: sessionForm.session_type === 'קבוצתי' ? 'none' : '2px solid #E0E0E0'
                }}
              >
                <div className="text-2xl mb-1">👥</div>
                <div className="text-sm">קבוצתי</div>
              </button>
              <button
                type="button"
                onClick={() => setSessionForm({ ...sessionForm, session_type: 'אונליין' })}
                className="p-4 rounded-xl font-bold text-center transition-all"
                style={{
                  backgroundColor: sessionForm.session_type === 'אונליין' ? '#9C27B0' : '#FFFFFF',
                  color: sessionForm.session_type === 'אונליין' ? 'white' : '#000000',
                  border: sessionForm.session_type === 'אונליין' ? 'none' : '2px solid #E0E0E0'
                }}
              >
                <div className="text-2xl mb-1">💻</div>
                <div className="text-sm">אונליין</div>
              </button>
            </div>
            {sessionForm.session_type === 'אישי' && (
              <p className="text-xs mt-3 p-2 rounded-lg" style={{ color: 'var(--ag-accent)', backgroundColor: '#FFF8F3' }}>
                💡 אימון אישי מוגבל למשתתף אחד בלבד
              </p>
            )}
          </div>

          <div>
            <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
              מיקום
            </Label>
            <Input
              value={sessionForm.location}
              onChange={(e) => setSessionForm({ ...sessionForm, location: e.target.value })}
              placeholder={sessionForm.session_type === 'אונליין' ? "לינק לזום / וואטסאפ" : "כתובת המועדון / מיקום"}
              className="rounded-xl"
              style={{ border: '1px solid #E0E0E0' }}
            />
          </div>

          {/* Price — optional. When set, the trainee's session card
              shows a "שלם 💳" CTA that runs through payment-create
              (Grow integration). Empty = free session. */}
          <div>
            <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
              מחיר (₪) <span className="text-xs font-normal text-gray-400">(אופציונלי)</span>
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              value={sessionForm.price}
              onChange={(e) => setSessionForm({ ...sessionForm, price: e.target.value })}
              placeholder="200"
              className="rounded-xl"
              style={{ border: '1px solid #E0E0E0' }}
            />
            <p className="text-xs text-gray-500 mt-1">
              אם תזין מחיר — המתאמן/ת יראה כפתור "שלם" באישור המפגש.
            </p>
          </div>

          {/* Trainee picker — order:-1 lifts it directly under the
              status pills (order:-2) so it is the first field the coach
              sees / types into when creating a session. */}
          <div style={{ order: -1 }}>
            <Label className="text-sm font-bold mb-3 block" style={{ color: '#000000' }}>
              👥 בחר משתתפים * ({sessionForm.participants.length} נבחרו)
            </Label>
            <div className="flex justify-between items-center mb-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowGuestForm(!showGuestForm)}
                    className="text-xs"
                >
                    <UserPlus className="w-3 h-3 ml-1" />
                    {showGuestForm ? 'סגור הוספת אורח' : 'הוסף אורח חד-פעמי'}
                </Button>
            </div>

            {showGuestForm && (
                <div className="mb-4 p-4 rounded-xl bg-blue-50 border border-blue-100">
                    <h4 className="text-sm font-bold mb-3 text-blue-800">פרטי אורח</h4>
                    <div className="space-y-3">
                        <Input 
                            placeholder="שם מלא (חובה)" 
                            value={guestForm.full_name} 
                            onChange={e => setGuestForm({...guestForm, full_name: e.target.value})}
                            className="bg-white"
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <Input 
                                placeholder="טלפון *" 
                                value={guestForm.phone} 
                                onChange={e => setGuestForm({...guestForm, phone: e.target.value})}
                                className="bg-white"
                            />
                            <Input 
                                placeholder="אימייל (אופציונלי)" 
                                value={guestForm.email} 
                                onChange={e => setGuestForm({...guestForm, email: e.target.value})}
                                className="bg-white"
                            />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label className="text-xs text-gray-500 mb-1">תאריך לידה *</Label>
                                <Input 
                                    type="date"
                                    value={guestForm.birth_date} 
                                    onChange={e => setGuestForm({...guestForm, birth_date: e.target.value})}
                                    className="bg-white"
                                />
                            </div>
                            {calculateAge(guestForm.birth_date) !== null && calculateAge(guestForm.birth_date) < 18 && (
                                <div>
                                    <Label className="text-xs text-gray-500 mb-1">שם הורה/אפוטרופוס *</Label>
                                    <Input 
                                        placeholder="חובה למלא"
                                        value={guestForm.parent_name} 
                                        onChange={e => setGuestForm({...guestForm, parent_name: e.target.value})}
                                        className="bg-white border-red-200"
                                    />
                                </div>
                            )}
                        </div>

                        <Input 
                            placeholder="הערות (אופציונלי)" 
                            value={guestForm.notes} 
                            onChange={e => setGuestForm({...guestForm, notes: e.target.value})}
                            className="bg-white"
                        />

                        <div className="flex items-start gap-2 p-2 bg-white rounded-lg border border-gray-200">
                            <input 
                                type="checkbox" 
                                id="health_decl" 
                                checked={guestForm.health_declaration}
                                onChange={e => setGuestForm({...guestForm, health_declaration: e.target.checked})}
                                className="mt-1"
                            />
                            <label htmlFor="health_decl" className="text-xs text-gray-700 cursor-pointer">
                                אני מאשר/ת שהמשתתף כשיר בריאותית לאימון והצהיר על כך בפניי. *
                            </label>
                        </div>

                        <Button 
                            type="button" 
                            onClick={handleAddGuest} 
                            disabled={creatingGuest}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {creatingGuest ? <Loader2 className="w-4 h-4 animate-spin" /> : 'הוסף משתתף חדש'}
                        </Button>
                    </div>
                </div>
            )}

            {sessionForm.participants.length > 0 && (
              <div className="mb-3 p-3 rounded-xl" style={{ backgroundColor: '#E8F5E9', border: '2px solid #4CAF50' }}>
                <p className="text-xs font-bold mb-2" style={{ color: '#2E7D32' }}>נבחרו:</p>
                <div className="flex flex-wrap gap-2">
                  {sessionForm.participants.map(p => (
                    <div key={p.trainee_id} className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1" style={{ backgroundColor: '#4CAF50', color: 'white' }}>
                      {p.trainee_name} 
                      {p.is_guest && ' (אורח)'}
                      <button 
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleParticipant(p.trainee_id, p.trainee_name);
                        }}
                        className="hover:bg-red-500 rounded-full p-0.5 ml-1 transition-colors"
                      >
                          ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Recent trainees — one-tap chips for the people the coach
                booked most recently. Hidden while searching so the full
                results take over. */}
            {!searchQuery && recentTrainees.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-bold mb-2" style={{ color: '#7D7D7D' }}>⏱️ אחרונים</p>
                <div className="flex flex-wrap gap-2">
                  {recentTrainees.map((t) => {
                    const isSelected = sessionForm.participants.some(p => p.trainee_id === t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleParticipant(t.id, t.full_name)}
                        className="flex items-center gap-2 px-3 py-2 rounded-full text-sm font-bold transition-all"
                        style={{
                          backgroundColor: isSelected ? 'var(--ag-accent)' : '#FFFFFF',
                          color: isSelected ? 'white' : '#000000',
                          border: isSelected ? 'none' : '2px solid #E0E0E0',
                        }}
                      >
                        <span
                          className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs"
                          style={{
                            backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : '#FFF8F3',
                            color: isSelected ? 'white' : 'var(--ag-accent)',
                          }}
                        >
                          {t.full_name?.[0] || '?'}
                        </span>
                        {t.full_name || 'ללא שם'}
                        {isSelected && <Check className="w-4 h-4" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <Input
              ref={searchInputRef}
              type="search"
              placeholder="חפש לפי שם, אימייל או טלפון..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-xl mb-2"
              style={{ border: '1px solid #E0E0E0', direction: 'rtl' }}
            />
            <div className="p-4 rounded-xl overflow-y-auto" style={{ backgroundColor: '#FAFAFA', border: '2px solid #E0E0E0', maxHeight: '40vh', minHeight: 120 }}>
              {isLoadingUsers ? (
                <div className="flex flex-col items-center justify-center gap-2 py-6" style={{ color: '#7D7D7D' }}>
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--ag-accent)' }} />
                  <p className="text-sm">טוען מתאמנים...</p>
                </div>
              ) : usersError ? (
                <div className="flex flex-col items-center justify-center gap-2 py-6">
                  <p className="text-sm text-center" style={{ color: '#B71C1C' }}>
                    שגיאה בטעינת מתאמנים
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => refetchUsers()}
                    className="text-xs font-bold text-white"
                    style={{ backgroundColor: 'var(--ag-accent)' }}
                  >
                    נסה שוב
                  </Button>
                </div>
              ) : filteredTrainees.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: '#7D7D7D' }}>
                  {searchQuery ? 'לא נמצאו תוצאות' : 'אין משתמשים במערכת'}
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredTrainees.map((trainee) => {
                    const isSelected = sessionForm.participants.some(p => p.trainee_id === trainee.id);
                    return (
                      <button
                        key={trainee.id}
                        type="button"
                        onClick={() => toggleParticipant(trainee.id, trainee.full_name)}
                        className="w-full p-3 rounded-xl cursor-pointer transition-all text-right"
                        style={{
                          backgroundColor: isSelected ? 'var(--ag-accent)' : '#FFFFFF',
                          color: isSelected ? 'white' : '#000000',
                          border: isSelected ? 'none' : '2px solid #E0E0E0'
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-base"
                              style={{
                                backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : '#FFF8F3',
                                color: isSelected ? 'white' : 'var(--ag-accent)'
                              }}
                            >
                              {trainee.full_name?.[0] || '?'}
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-base">{trainee.full_name || 'ללא שם'}</div>
                              {(trainee.email || trainee.phone) && (
                                <div className="text-xs" style={{ color: isSelected ? 'rgba(255,255,255,0.85)' : 'var(--ag-text-soft)' }}>
                                  {trainee.email || trainee.phone}
                                </div>
                              )}
                            </div>
                          </div>
                          {isSelected && <Check className="w-6 h-6" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Package selection */}
          {availableServices.length > 0 && (
            <div>
              <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
                שייך לחבילה (אופציונלי)
              </Label>
              <div className="space-y-1.5">
                <button type="button"
                  onClick={() => setSessionForm({ ...sessionForm, service_id: null })}
                  className={`w-full p-2.5 rounded-lg text-sm text-right transition-all ${!sessionForm.service_id ? 'bg-gray-100 border-2 border-gray-300 font-bold' : 'bg-white border border-gray-200'}`}>
                  ללא חבילה
                </button>
                {availableServices.map(svc => {
                  const remaining = (svc.total_sessions || 0) - (svc.used_sessions || 0);
                  const isSelected = sessionForm.service_id === svc.id;
                  return (
                    <button key={svc.id} type="button"
                      onClick={() => setSessionForm({ ...sessionForm, service_id: svc.id })}
                      className={`w-full p-2.5 rounded-lg text-sm text-right transition-all ${isSelected ? 'bg-[var(--ag-accent)] text-white border-2 border-[var(--ag-accent)]' : 'bg-white border border-gray-200 hover:border-gray-300'}`}>
                      <div className="flex justify-between items-center">
                        <span className="font-bold">{svc.package_name || svc.service_type || 'חבילה'}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${isSelected ? 'bg-white/20' : 'bg-orange-50 text-[var(--ag-accent)]'}`}>
                          נותרו {remaining}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Additional participants — per-row package picker that
              drives the session_participants table. Independent of
              the JSONB participants above so a coach can deduct
              from a guest's package without listing them as a main
              attendee. */}
          <div>
            <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
              👥 משתתפים נוספים — קיזוז חבילה אוטומטי
            </Label>
            <div className="space-y-2">
              {additionalParticipants.map((p, idx) => {
                const pkgs = packagesByTrainee[p.trainee_id] || [];
                const isDeducted = p.deducted;
                // Saved rows whose trainee hasn't been re-fetched
                // yet: kick off the lazy load so the package
                // dropdown can populate.
                if (p.trainee_id && !packagesByTrainee[p.trainee_id]) {
                  ensurePackagesForTrainee(p.trainee_id);
                }
                return (
                  <div
                    key={p.id || `new-${idx}`}
                    className="flex flex-wrap gap-2 items-center p-2 rounded-xl border"
                    style={{
                      borderColor: isDeducted ? 'var(--ag-success)' : '#E0E0E0',
                      background: isDeducted ? '#F0FDF4' : '#FAFAFA',
                    }}
                  >
                    <select
                      value={p.trainee_id || ''}
                      disabled={isDeducted}
                      onChange={(e) => {
                        const t = effectiveTrainees.find(x => x.id === e.target.value);
                        updateAdditionalParticipant(idx, {
                          trainee_id: e.target.value || '',
                          trainee_name: t?.full_name || '',
                          package_id: null,
                          package_name: null,
                          package_remaining: null,
                        });
                      }}
                      className="flex-1 min-w-[140px] rounded-lg border p-2 text-sm bg-white"
                      style={{ borderColor: '#E0E0E0' }}
                    >
                      <option value="">בחר מתאמן</option>
                      {effectiveTrainees.map(t => (
                        <option key={t.id} value={t.id}>{t.full_name}</option>
                      ))}
                    </select>
                    <select
                      value={p.package_id || ''}
                      disabled={isDeducted || !p.trainee_id}
                      onChange={(e) => {
                        const pkg = pkgs.find(x => x.id === e.target.value);
                        updateAdditionalParticipant(idx, {
                          package_id: e.target.value || null,
                          package_name: pkg ? (pkg.package_name || pkg.service_type || null) : null,
                          package_remaining: pkg ? Math.max(0, (pkg.total_sessions || 0) - (pkg.used_sessions || 0)) : null,
                        });
                      }}
                      className="flex-1 min-w-[140px] rounded-lg border p-2 text-sm bg-white"
                      style={{ borderColor: '#E0E0E0' }}
                    >
                      <option value="">בחר חבילה (אופציונלי)</option>
                      {pkgs.map(pkg => {
                        const remaining = Math.max(0, (pkg.total_sessions || 0) - (pkg.used_sessions || 0));
                        return (
                          <option key={pkg.id} value={pkg.id}>
                            {pkg.package_name || pkg.service_type || 'חבילה'} · נותרו {remaining}
                          </option>
                        );
                      })}
                    </select>
                    {isDeducted ? (
                      <span
                        className="text-xs font-bold px-2 py-1 rounded-full"
                        style={{ background: 'var(--ag-success)', color: 'white' }}
                      >
                        קוזז ✓
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeAdditionalParticipant(idx)}
                        className="px-2 py-1 rounded-full text-red-500 hover:bg-red-50"
                        aria-label="הסר משתתף"
                      >×</button>
                    )}
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                onClick={addAdditionalParticipant}
                className="w-full text-sm"
              >
                + הוסף משתתף לקיזוז
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              כשהמפגש יסומן "הושלם" — הקיזוז ירוץ אוטומטית לכל משתתף ברשימה לפי החבילה שנבחרה. ללא חבילה: ייבחר אוטומטית הכרטיסייה הפעילה הוותיקה ביותר של המשתתף.
            </p>
          </div>

          <div>
            <Label className="text-sm font-bold mb-2 block" style={{ color: '#000000' }}>
              הערות
            </Label>
            <Textarea
              value={sessionForm.coach_notes}
              onChange={(e) => setSessionForm({ ...sessionForm, coach_notes: e.target.value })}
              placeholder="הערות נוספות למפגש..."
              className="rounded-xl min-h-[100px]"
              style={{ border: '1px solid #E0E0E0' }}
            />
          </div>

          {/* Private coach-only notes — separate column, never
              included in trainee-facing SELECTs (see
              SESSION_FIELDS_TRAINEE in src/lib/sessionHelpers.js).
              Orange-tinted so the coach can tell at a glance this
              block isn't shared. */}
          <div>
            <Label className="text-sm font-bold mb-2 block" style={{ color: 'var(--ag-accent)' }}>
              🔒 הערות פרטיות (גלויות רק לך)
            </Label>
            <Textarea
              value={sessionForm.coach_private_notes}
              onChange={(e) => setSessionForm({ ...sessionForm, coach_private_notes: e.target.value })}
              placeholder="הערות לעצמך — המתאמן לא רואה את התוכן הזה"
              className="rounded-xl min-h-[80px]"
              style={{ border: '1px solid var(--ag-accent)', background: '#FFF5EE' }}
            />
          </div>

          <div className="flex gap-3 pt-4 border-t" style={{ borderColor: '#E0E0E0' }}>
            <Button
              onClick={() => {
                clearDraft();
                onClose();
              }}
              variant="outline"
              className="flex-1 rounded-xl py-6 font-bold text-base"
              style={{ border: '2px solid #E0E0E0', color: '#000000' }}
            >
              ביטול
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!sessionForm.date || !sessionForm.time || isLoading || saving}
              className="flex-1 rounded-xl py-6 font-bold text-white text-base"
              style={{ backgroundColor: 'var(--ag-accent)' }}
            >
              {(isLoading || saving) ? (
                <>
                  <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                  שומר...
                </>
              ) : (
                <>
                  <Calendar className="w-5 h-5 ml-2" />
                  {editingSession ? '💾 שמור שינויים' : '✅ צור מפגש'}
                </>
              )}
            </Button>
          </div>
        </div>
        </DialogContent>
      </Dialog>

      {/* Override gate — fires when the inline status pills above
          flip to 'הושלם' on a paid-but-unpaid row. The dialog owns
          the DB write; we just refresh visible lists on confirm. */}
      <PaymentOverrideDialog
        session={overrideTarget}
        isOpen={!!overrideTarget}
        onCancel={() => setOverrideTarget(null)}
        onConfirm={() => {
          setSessionForm(prev => ({ ...prev, status: 'הושלם' }));
          queryClient.invalidateQueries({ queryKey: ['sessions'] });
          queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
          queryClient.invalidateQueries({ queryKey: ['trainee-today-session'] });
          setOverrideTarget(null);
        }}
      />
    </>
  );
}