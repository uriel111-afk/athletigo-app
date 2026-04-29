import React, { useState, useEffect, useContext } from "react";
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
import SessionStatusPicker from "@/components/sessions/SessionStatusPicker";
import { useQueryClient } from "@tanstack/react-query";
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
};

export default function SessionFormDialog({
  isOpen,
  onClose,
  onSubmit,
  trainees = [],
  editingSession = null,
  isLoading = false
}) {
  const { user: currentCoach } = useContext(AuthContext);
  const queryClient = useQueryClient();

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
      coach_id: currentCoach?.id || null,
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl md:text-2xl font-black mb-2" style={{ color: '#000000' }}>
              {editingSession ? '✏️ ערוך מפגש' : '➕ צור מפגש חדש'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
          {/* Status pills — when editing an existing row, switching the
              chip writes to the DB immediately AND mirrors into the
              local form state so a later "save" of other fields
              persists the new status too. For new sessions there's no
              row yet → only the local form state is touched and the
              create flow picks up the chosen status on submit. */}
          {editingSession?.id && (
            <div>
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
                        await supabase.from('notifications').insert({
                          user_id: editingSession.trainee_id,
                          type: 'session_status_changed',
                          title: '📅 סטטוס המפגש שונה',
                          message: `הסטטוס של המפגש ב-${dateLabel} שונה ל-${newStatus}`,
                          is_read: false,
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
              תאריך
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
                    backgroundColor: sessionForm.time === time ? '#FF6F20' : '#FFFFFF',
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
                  backgroundColor: sessionForm.session_type === 'אישי' ? '#FF6F20' : '#FFFFFF',
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
              <p className="text-xs mt-3 p-2 rounded-lg" style={{ color: '#FF6F20', backgroundColor: '#FFF8F3' }}>
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

          <div>
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
            <div className="p-4 rounded-xl overflow-y-auto" style={{ backgroundColor: '#FAFAFA', border: '2px solid #E0E0E0', maxHeight: '40vh', minHeight: 120 }}>
              {trainees.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: '#7D7D7D' }}>
                  אין מתאמנים זמינים
                </p>
              ) : (
                <div className="space-y-2">
                  {trainees.map((trainee) => {
                    const isSelected = sessionForm.participants.some(p => p.trainee_id === trainee.id);
                    return (
                      <button
                        key={trainee.id}
                        type="button"
                        onClick={() => toggleParticipant(trainee.id, trainee.full_name)}
                        className="w-full p-3 rounded-xl cursor-pointer transition-all text-right"
                        style={{
                          backgroundColor: isSelected ? '#FF6F20' : '#FFFFFF',
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
                                color: isSelected ? 'white' : '#FF6F20'
                              }}
                            >
                              {trainee.full_name?.[0]}
                            </div>
                            <span className="font-bold text-base">{trainee.full_name}</span>
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
                      className={`w-full p-2.5 rounded-lg text-sm text-right transition-all ${isSelected ? 'bg-[#FF6F20] text-white border-2 border-[#FF6F20]' : 'bg-white border border-gray-200 hover:border-gray-300'}`}>
                      <div className="flex justify-between items-center">
                        <span className="font-bold">{svc.package_name || svc.service_type || 'חבילה'}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${isSelected ? 'bg-white/20' : 'bg-orange-50 text-[#FF6F20]'}`}>
                          נותרו {remaining}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
            <Label className="text-sm font-bold mb-2 block" style={{ color: '#FF6F20' }}>
              🔒 הערות פרטיות (גלויות רק לך)
            </Label>
            <Textarea
              value={sessionForm.coach_private_notes}
              onChange={(e) => setSessionForm({ ...sessionForm, coach_private_notes: e.target.value })}
              placeholder="הערות לעצמך — המתאמן לא רואה את התוכן הזה"
              className="rounded-xl min-h-[80px]"
              style={{ border: '1px solid #FF6F20', background: '#FFF5EE' }}
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
              style={{ backgroundColor: '#FF6F20' }}
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