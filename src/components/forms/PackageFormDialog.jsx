import React, { useState, useContext, useEffect } from "react";
import { AuthContext } from "@/lib/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Package, User, Users, Monitor, ChevronLeft, Plus, Minus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { QUERY_KEYS } from "@/components/utils/queryKeys";
import { syncPackageToIncome } from "@/lib/lifeos/lifeos-api";
import { useFormDraft } from "@/hooks/useFormDraft";
import { useKeepScreenAwake } from "@/hooks/useKeepScreenAwake";
import DraftPrompt from "@/components/DraftPrompt";
import { PAYMENT_METHODS, toHebrewPaymentMethod } from "@/lib/paymentMethods";

const TYPES = [
  { id: "personal", label: "אישי", desc: "מפגשי 1-על-1", icon: User, color: "#FF6F20" },
  { id: "group", label: "קבוצתי", desc: "מנוי חודשי", icon: Users, color: "#4CAF50" },
  { id: "online", label: "אונליין", desc: "היברידי — מפגשים + זמן", icon: Monitor, color: "#2196F3" },
];

const INITIAL_DATA = {
  package_type: "",
  package_name: "",
  sessions_count: 10,
  frequency_per_week: 2,
  duration_months: 1,
  price: "",
  start_date: "",
  expires_at: "",
  payment_status: "ממתין לתשלום",
  payment_method: "אשראי",
  notes_internal: "",
  status: "active",
};

// Normalize legacy Hebrew status values from existing rows so the
// edit form's <select> shows the right option pre-selected. Anything
// we don't recognize is preserved as-is so the coach can still see
// it; saving will overwrite with the canonical English value they
// pick.
const normalizePackageStatus = (raw) => {
  if (!raw) return 'active';
  if (raw === 'פעיל')      return 'active';
  if (raw === 'מוקפא' || raw === 'הוקפא') return 'frozen';
  if (raw === 'בוטל')      return 'cancelled';
  if (raw === 'הסתיים')    return 'completed';
  return raw;
};

// Tap-to-select chip group — replaces broken mobile <select> /
// Radix Select dropdowns. Accepts either a string array (chip label
// IS the stored value) OR an array of {value, label} pairs (chip
// label is Hebrew but the stored value is English / preserved).
function ChipSelect({ label, options, value, onChange, required }) {
  const normalized = (options || []).map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o
  );
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: 'block',
        fontSize: 14,
        fontWeight: 600,
        color: '#1a1a1a',
        marginBottom: 8,
        textAlign: 'right',
      }}>
        {label}{required && ' *'}
      </label>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'flex-start',
        direction: 'rtl',
      }}>
        {normalized.map((opt) => {
          const isActive = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              style={{
                padding: '8px 16px',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                background: isActive ? '#FF6F20' : 'white',
                color: isActive ? 'white' : '#888',
                border: isActive ? '1px solid #FF6F20' : '1px solid #E8E0D8',
                cursor: 'pointer',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
                fontFamily: "'Heebo', 'Assistant', sans-serif",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const NumPicker = ({ value, onChange, min = 1, max = 99, label }) => {
  const v = parseInt(value) || min;
  return (
    <div className="flex flex-col items-center">
      {label && <span className="text-[10px] font-bold text-gray-400 mb-1">{label}</span>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(Math.max(min, v - 1))}
          className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-[#FF6F20] hover:border-[#FF6F20] active:scale-95">
          <Minus size={14} />
        </button>
        <span className="w-10 text-center text-xl font-black text-gray-900">{v}</span>
        <button type="button" onClick={() => onChange(Math.min(max, v + 1))}
          className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-[#FF6F20] hover:border-[#FF6F20] active:scale-95">
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
};

export default function PackageFormDialog({
  isOpen, onClose, traineeId, traineeName,
  editingPackage = null, isCoachView = true,
  // mode prop — 'edit' keeps the existing single-screen edit form
  // (back-compat — the user explicitly requires this not to break).
  // 'create' shows the 3-step wizard. When unset, derived from
  // editingPackage so existing call sites that don't pass `mode` keep
  // their previous behavior.
  mode,
}) {
  const queryClient = useQueryClient();
  const { user: coach } = useContext(AuthContext);

  const isEditMode = mode === 'edit' || (!mode && !!editingPackage);
  // Step layout:
  //   1 — pick trainee (CREATE only, no prefilled traineeId)
  //   2 — pick type (CREATE only)
  //   3 — fill details (BOTH modes)
  // Edit jumps straight to 3; create jumps straight to 2 if a
  // trainee was prefilled (TraineeProfile case).
  const initialStep = isEditMode ? 3 : (traineeId ? 2 : 1);
  const [step, setStep] = useState(initialStep);
  const [saving, setSaving] = useState(false);

  // Locally-picked trainee (only used in CREATE mode when no
  // traineeId was passed in). Hydrated from the prop so downstream
  // code can read a single `effectiveTraineeId` regardless of which
  // entry point opened the wizard.
  const [pickedTrainee, setPickedTrainee] = useState(null);
  const effectiveTraineeId = traineeId || pickedTrainee?.id || null;
  const effectiveTraineeName = traineeName || pickedTrainee?.full_name || null;

  // Reset internal step + trainee selection whenever the dialog opens
  // again — covers the case where the same component instance is
  // reused across different "+ הוסף חבילה" clicks.
  useEffect(() => {
    if (isOpen) {
      setStep(isEditMode ? 3 : (traineeId ? 2 : 1));
      setPickedTrainee(null);
      setSearchQuery('');
    }
  }, [isOpen, isEditMode, traineeId]);

  // Coach's trainees — step 1 picker. Loads EVERY user in the
  // system (excluding the coach themselves), no role / status /
  // coach_id filter. Reason: trainee rows in this app inconsistently
  // populate coach_id (NULL on most legacy rows), so a strict filter
  // surfaced "אין מתאמנים פעילים" even when the coach had dozens of
  // active trainees. The coach picks the right person from the full
  // list; the search box below trims the picker fast.
  const [searchQuery, setSearchQuery] = useState('');
  const { data: coachTrainees = [] } = useQuery({
    queryKey: ['package-wizard-trainees', coach?.id],
    queryFn: async () => {
      console.log('[loadAllTrainees] starting for coach:', coach?.id);
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, phone, role, coach_id, client_status, avatar_url')
        .order('full_name', { ascending: true });
      if (error) {
        console.error('[loadAllTrainees] error:', error);
        return [];
      }
      const filtered = (data || []).filter((u) => u.id !== coach?.id);
      console.log('[loadAllTrainees] total users:', data?.length);
      console.log('[loadAllTrainees] after filter (excluding coach):', filtered.length);
      return filtered;
    },
    enabled: isOpen && !isEditMode && !traineeId && !!coach?.id,
    initialData: [],
  });

  const filteredTrainees = (() => {
    if (!searchQuery) return coachTrainees;
    const q = searchQuery.toLowerCase();
    return coachTrainees.filter((t) => (
      t.full_name?.toLowerCase().includes(q) ||
      t.email?.toLowerCase().includes(q) ||
      t.phone?.includes(q)
    ));
  })();

  const initialData = editingPackage ? {
    package_type: editingPackage.package_type || "personal",
    package_name: editingPackage.package_name || "",
    sessions_count: editingPackage.sessions_count || editingPackage.total_sessions || 10,
    frequency_per_week: editingPackage.frequency_per_week || 2,
    duration_months: editingPackage.duration_months || 1,
    price: editingPackage.price?.toString() || editingPackage.final_price?.toString() || "",
    start_date: editingPackage.start_date?.split("T")[0] || new Date().toISOString().split("T")[0],
    expires_at: editingPackage.expires_at || "",
    payment_status: editingPackage.payment_status || "ממתין לתשלום",
    // Legacy English values get mapped to their Hebrew equivalent so
    // the dropdown always shows a selected option for old rows.
    payment_method: toHebrewPaymentMethod(editingPackage.payment_method) || "אשראי",
    notes_internal: editingPackage.notes_internal || "",
    status: normalizePackageStatus(editingPackage.status),
  } : { ...INITIAL_DATA, start_date: new Date().toISOString().split("T")[0] };

  // Draft scope: stable per (trainee + package) pair so an in-flight
  // create on one trainee doesn't leak into another. Edits use the
  // package id; new wizard sessions key off whichever trainee is
  // currently picked (or 'no-trainee' for the brand-new flow).
  const scopeKey = `${effectiveTraineeId ?? 'no-trainee'}_${editingPackage?.id ?? 'new'}`;
  const draftCtx = effectiveTraineeId ? { traineeId: effectiveTraineeId, traineeName: effectiveTraineeName } : null;
  const {
    data: form, setData: setForm,
    hasDraft, keepDraft, discardDraft, clearDraft,
    draftContext: savedCtx,
  } = useFormDraft('PackageEdit', scopeKey, isOpen, initialData, draftCtx);

  useKeepScreenAwake(isOpen);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const selectType = (type) => {
    const names = { personal: "חבילה אישית", group: "מנוי קבוצתי", online: "חבילה אונליין" };
    set("package_type", type);
    if (!form.package_name) set("package_name", names[type]);
    // Step 3 is the details form (was step 2 in the pre-wizard flow).
    setStep(3);
  };

  const selectTrainee = (id, name) => {
    // Two-stage selection (May 2026 spec): tap highlights, the
    // "המשך" CTA below the list advances to step 2. Lets the coach
    // visually confirm the right person before committing.
    setPickedTrainee({ id, full_name: name });
  };
  const advanceFromTraineeStep = () => {
    if (pickedTrainee?.id) setStep(2);
  };

  // Auto-calculate expiry for group/online
  const calcExpiry = () => {
    if (!form.start_date || !form.duration_months) return "";
    const d = new Date(form.start_date);
    d.setMonth(d.getMonth() + form.duration_months);
    return d.toISOString().split("T")[0];
  };

  const handleSave = async () => {
    // Wizard-side diagnostic logs — surface entry context + full
    // form snapshot so a coach reporting "save did nothing" can copy
    // the console straight to me without explaining the flow.
    console.log('[AddPackageWizard] entry:', {
      prefilledTraineeId: traineeId || null,
      mode: isEditMode ? 'edit' : 'create',
      effectiveTraineeId,
    });
    console.log('[AddPackageWizard] form data:', JSON.stringify(form, null, 2));
    console.log('[PackageForm] save clicked', { editingId: editingPackage?.id, form });

    if (!form.package_name) {
      toast.error("נא למלא שם חבילה");
      return;
    }
    if (!effectiveTraineeId && !isEditMode) {
      toast.error("יש לבחור מתאמן");
      return;
    }

    const isPersonal = form.package_type === "personal";
    const isGroup = form.package_type === "group";
    const isOnline = form.package_type === "online";
    const expiresAt = (isGroup || isOnline) ? (form.expires_at || calcExpiry()) : form.expires_at || null;

    // Single price input → write to all three legacy columns (price /
    // final_price / base_price) so historical UI that reads any of
    // them keeps rendering. discount_value is forced to 0 since the
    // unified wizard doesn't expose discounts (per May 2026 spec).
    const priceNum = form.price ? parseFloat(form.price) : null;

    const data = {
      trainee_id: effectiveTraineeId,
      trainee_name: effectiveTraineeName || null,
      coach_id: coach?.id || null,
      created_by: coach?.id || null,
      package_name: form.package_name,
      package_type: form.package_type,
      service_type: form.package_type,
      billing_model: isGroup ? "subscription" : "punch_card",
      sessions_count: (isPersonal || isOnline) ? form.sessions_count : null,
      total_sessions: (isPersonal || isOnline) ? form.sessions_count : null,
      used_sessions: editingPackage?.used_sessions || 0,
      sessions_remaining: (isPersonal || isOnline) ? form.sessions_count - (editingPackage?.used_sessions || 0) : null,
      frequency_per_week: form.frequency_per_week || null,
      duration_months: (isGroup || isOnline) ? form.duration_months : null,
      price: priceNum,
      final_price: priceNum,
      base_price: priceNum,
      discount_value: 0,
      payment_method: form.payment_method || null,
      payment_status: form.payment_status,
      start_date: form.start_date || null,
      end_date: expiresAt,
      expires_at: expiresAt,
      auto_deduct_enabled: !isGroup,
      unit_type: isGroup ? "months" : "sessions",
      notes_internal: form.notes_internal || null,
      // Coach picks the status explicitly from the form. New packages
      // default to 'active'; editing loads the existing value
      // (normalized from any legacy Hebrew variants) so the coach can
      // freeze / cancel / complete a package directly from this form.
      status: form.status || 'active',
    };

    setSaving(true);
    try {
      // Direct supabase call (not the base44 wrapper) so we can inspect the
      // raw error object — RLS rejections and CHECK-constraint violations
      // both surface here as { error }, not as throws.
      // Use .select() (not .single()) so a 0-row result is data=[] instead
      // of PGRST116 — lets us distinguish RLS-filtered writes from real errors.
      let result, error;
      if (editingPackage) {
        // Strip identity / ownership fields on UPDATE. They shouldn't change,
        // and including them re-asserts coach_id which can trip an RLS
        // WITH CHECK clause if coach?.id is briefly undefined or differs
        // (e.g. admin editing another coach's package).
        const { trainee_id, coach_id, created_by, ...updatable } = data;
        console.log('[PackageForm] UPDATE payload (id stripped):', updatable);
        ({ data: result, error } = await supabase
          .from('client_services')
          .update(updatable)
          .eq('id', editingPackage.id)
          .select());
      } else {
        console.log('[PackageForm] INSERT payload:', data);
        ({ data: result, error } = await supabase
          .from('client_services')
          .insert(data)
          .select());
      }

      console.log('[PackageForm] DB response:', { result, error });
      console.log('[AddPackageWizard] save result:', { data: result, error });

      if (error) {
        console.error('[PackageForm] supabase error:', error);
        const detail = error.message || error.details || error.hint || JSON.stringify(error);
        toast.error('השמירה נכשלה: ' + detail);
        return;
      }

      if (!result || result.length === 0) {
        // Update returned 0 rows: either the id doesn't exist, or RLS filtered
        // the write/select. Without this branch the caller would see a
        // success-shaped response and a closed dialog with no DB change.
        console.warn('[PackageForm] update returned 0 rows — RLS or wrong id');
        toast.error('לא עודכן — ייתכן שאין הרשאה (בדוק RLS)');
        return;
      }

      console.log('[PackageForm] saved row:', result[0]);
      toast.success(editingPackage ? "חבילה עודכנה" : "חבילה נוצרה בהצלחה");

      // Cross-app sync — only on CREATE (skip edits to avoid duplicate
      // income rows). Idempotent inside syncPackageToIncome via the
      // (user_id, client_name, date, amount) dup check, so even if
      // someone edits price soon after create, the original income
      // row stays put.
      if (!editingPackage && coach?.id) {
        try {
          await syncPackageToIncome(coach.id, {
            ...result[0],
            trainee_name: traineeName,
          });
        } catch (e) {
          console.warn('[PackageForm] syncPackageToIncome failed:', e?.message);
        }

        // Casual → Active onboarding flip. If the trainee this
        // package was sold to is currently 'casual', selling them
        // a package promotes them to 'active' and unlocks every
        // permission toggle (the casual seed only enabled
        // send_messages — see AddTraineeDialog).
        try {
          const traineeId = result[0]?.trainee_id;
          if (traineeId) {
            const { data: traineeRow } = await supabase
              .from('users')
              .select('id, full_name, client_status')
              .eq('id', traineeId)
              .maybeSingle();
            if (traineeRow?.client_status === 'casual') {
              await supabase
                .from('users')
                .update({ client_status: 'active', client_type: 'לקוח פעיל' })
                .eq('id', traineeId);
              await supabase.from('trainee_permissions').upsert({
                coach_id: coach.id,
                trainee_id: traineeId,
                view_baseline: true,
                view_plan: true,
                view_progress: true,
                view_documents: true,
                edit_metrics: true,
                send_videos: true,
                send_messages: true,
                view_training_plan: true,
                view_records: true,
              }, { onConflict: 'coach_id,trainee_id' });
              toast.success(`${traineeRow.full_name || 'המתאמן'} הפך ללקוח פעיל ✓`);
            }
          }
        } catch (e) {
          console.warn('[PackageForm] casual→active flip failed:', e?.message);
        }
      }

      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SERVICES });
      queryClient.invalidateQueries({ queryKey: ["trainee-services"] });
      queryClient.invalidateQueries({ queryKey: ["all-trainees"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      // Refresh financial dashboard counters too
      queryClient.invalidateQueries({ queryKey: ["lifeos-income"] });
      queryClient.invalidateQueries({ queryKey: ["lifeos-monthly-summary"] });
      clearDraft();
      onClose();
    } catch (e) {
      console.error('[PackageForm] exception:', e);
      toast.error('שגיאה בלתי צפויה: ' + (e?.message || 'נסה שוב'));
    } finally {
      setSaving(false);
    }
  };

  const typeConfig = TYPES.find(t => t.id === form.package_type);

  return (
    <>
      {isOpen && hasDraft && (
        <DraftPrompt
          traineeName={savedCtx?.traineeName || traineeName}
          formLabel="טופס חבילה"
          onResume={keepDraft}
          onNew={discardDraft}
          onDiscard={discardDraft}
        />
      )}
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Package className="w-5 h-5 text-[#FF6F20]" />
              {editingPackage ? "ערוך חבילה" : "חבילה חדשה"}
              {traineeName && <span className="text-sm font-normal text-gray-500">— {traineeName}</span>}
            </DialogTitle>
          </DialogHeader>

        {/* ── Step 1: Pick trainee (CREATE-only, no prefilled trainee) ─── */}
        {step === 1 && (
          <div className="space-y-3 mt-2" style={{ direction: 'rtl' }}>
            <div style={{ marginBottom: 4, textAlign: 'right' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#1a1a1a' }}>בחר מתאמן</h3>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                {coachTrainees.length} משתמשים במערכת
              </div>
            </div>
            <input
              type="search"
              placeholder="חפש לפי שם, אימייל או טלפון..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #E8E0D8',
                fontSize: 14,
                marginBottom: 10,
                direction: 'rtl',
                outline: 'none',
                fontFamily: "'Heebo', 'Assistant', sans-serif",
                boxSizing: 'border-box',
              }}
            />
            <div style={{ maxHeight: '60vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingLeft: 4 }}>
              {filteredTrainees.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#888', fontSize: 14 }}>
                  {searchQuery ? 'לא נמצאו תוצאות' : 'אין משתמשים במערכת'}
                </div>
              ) : (
                filteredTrainees.map((t) => {
                  const isSelected = pickedTrainee?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => selectTrainee(t.id, t.full_name)}
                      style={{
                        width: '100%',
                        padding: 12,
                        marginBottom: 6,
                        background: isSelected ? '#FFF0E4' : 'white',
                        border: isSelected ? '2px solid #FF6F20' : '1px solid #E8E0D8',
                        borderRadius: 10,
                        textAlign: 'right',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        flexDirection: 'row-reverse',
                        transition: 'all 0.15s',
                      }}
                      className="active:scale-[0.98]"
                    >
                      <div style={{
                        width: 42, height: 42,
                        borderRadius: '50%',
                        background: '#FFF0E4',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, fontWeight: 700, color: '#FF6F20',
                        flexShrink: 0, overflow: 'hidden',
                      }}>
                        {t.avatar_url ? (
                          <img
                            src={t.avatar_url}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : (
                          t.full_name?.[0] || '?'
                        )}
                      </div>
                      <div style={{ flex: 1, textAlign: 'right', minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.full_name || 'ללא שם'}
                        </div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.email || t.phone || 'ללא פרטי קשר'}
                        </div>
                      </div>
                      {isSelected && (
                        <div style={{
                          width: 24, height: 24,
                          borderRadius: '50%',
                          background: '#FF6F20', color: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 14, fontWeight: 700, flexShrink: 0,
                        }}>
                          ✓
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            {/* Continue CTA — disabled until a trainee is highlighted. */}
            <Button
              type="button"
              onClick={advanceFromTraineeStep}
              disabled={!pickedTrainee?.id}
              className="w-full h-12 rounded-xl font-bold text-white"
              style={{
                background: pickedTrainee?.id ? '#FF6F20' : '#E8E0D8',
                cursor: pickedTrainee?.id ? 'pointer' : 'not-allowed',
              }}
            >
              {pickedTrainee?.id ? `המשך — ${pickedTrainee.full_name}` : 'בחר מתאמן להמשך'}
            </Button>
          </div>
        )}

        {/* ── Step 2: Choose type ─────────────────────────── */}
        {step === 2 && (
          <div className="space-y-3 mt-2">
            {effectiveTraineeName && (
              <div className="flex items-center gap-2 mb-1">
                <button onClick={() => !traineeId && setStep(1)} className="text-[10px] font-bold text-gray-400 hover:text-[#FF6F20]">
                  {!traineeId && "← שנה מתאמן"}
                </button>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-50 text-[#FF6F20]">
                  {effectiveTraineeName}
                </span>
              </div>
            )}
            <p className="text-sm text-gray-500 text-center">בחר סוג חבילה</p>
            {TYPES.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.id} onClick={() => selectType(t.id)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 hover:border-current transition-all active:scale-[0.98]"
                  style={{ color: t.color }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: t.color + "15" }}>
                    <Icon size={24} />
                  </div>
                  <div className="text-right flex-1">
                    <div className="font-black text-base text-gray-900">{t.label}</div>
                    <div className="text-xs text-gray-500">{t.desc}</div>
                  </div>
                  <ChevronLeft size={18} className="text-gray-300" />
                </button>
              );
            })}
          </div>
        )}

        {/* ── Step 3: Details ─────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4 mt-2">
            {/* Type badge */}
            {typeConfig && (
              <div className="flex items-center gap-2 mb-1">
                <button onClick={() => !editingPackage && setStep(2)} className="text-[10px] font-bold text-gray-400 hover:text-[#FF6F20]">
                  {!editingPackage && "← שנה סוג"}
                </button>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: typeConfig.color + "15", color: typeConfig.color }}>
                  {typeConfig.label}
                </span>
              </div>
            )}

            {/* Name */}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">שם חבילה</Label>
              <Input value={form.package_name} onChange={e => set("package_name", e.target.value)} className="rounded-lg" />
            </div>

            {/* Type-specific fields */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-3">
              {(form.package_type === "personal" || form.package_type === "online") && (
                <div className="flex justify-around">
                  <NumPicker value={form.sessions_count} onChange={v => set("sessions_count", v)} label="מספר מפגשים" max={100} />
                  <NumPicker value={form.frequency_per_week} onChange={v => set("frequency_per_week", v)} label="פעמים בשבוע" max={7} />
                </div>
              )}
              {(form.package_type === "group" || form.package_type === "online") && (
                <div className="flex justify-around">
                  <NumPicker value={form.duration_months} onChange={v => set("duration_months", v)} label="חודשים" max={24} />
                  {form.package_type === "group" && (
                    <NumPicker value={form.frequency_per_week} onChange={v => set("frequency_per_week", v)} label="פעמים בשבוע" max={7} />
                  )}
                </div>
              )}
            </div>

            {/* Price */}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">מחיר (₪)</Label>
              <Input type="number" value={form.price} onChange={e => set("price", e.target.value)} placeholder="0" className="rounded-lg text-lg font-bold" />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">תאריך התחלה</Label>
                <Input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} className="rounded-lg" />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">
                  פקיעה {(form.package_type === "group" || form.package_type === "online") ? "(מחושב)" : "(אופציונלי)"}
                </Label>
                <Input type="date" value={form.expires_at || calcExpiry()} onChange={e => set("expires_at", e.target.value)} className="rounded-lg" />
              </div>
            </div>

            {/* Payment method + status — chip selectors. Replaced the
                Radix <Select> / native <select> dropdowns that failed
                to open on mobile in nested-dialog scopes. */}
            <ChipSelect
              label="שיטת תשלום"
              required
              value={form.payment_method}
              onChange={(v) => set("payment_method", v)}
              options={PAYMENT_METHODS}
            />

            <ChipSelect
              label="סטטוס תשלום"
              value={form.payment_status}
              onChange={(v) => set("payment_status", v)}
              // Stored value stays "ממתין לתשלום" for back-compat with
              // existing rows; the chip just shows the short "ממתין".
              options={[
                { value: 'שולם',           label: 'שולם' },
                { value: 'ממתין לתשלום',   label: 'ממתין' },
                { value: 'חלקי',           label: 'חלקי' },
              ]}
            />

            <ChipSelect
              label="סטטוס חבילה"
              value={form.status || 'active'}
              onChange={(v) => set('status', v)}
              // English values stored in DB (matches the existing
              // status taxonomy used by Reports / usePackageExpiry /
              // syncPackageStatus). Hebrew labels are display-only.
              options={[
                { value: 'active',    label: 'פעיל' },
                { value: 'frozen',    label: 'מוקפא' },
                { value: 'completed', label: 'הסתיים' },
                { value: 'cancelled', label: 'מבוטל' },
              ]}
            />

            {/* Notes — coach-only (stored in client_services.notes_internal; RLS masks from trainee) */}
            {isCoachView && (
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">הערות פרטיות (מאמן בלבד)</Label>
                <Textarea value={form.notes_internal} onChange={e => set("notes_internal", e.target.value)} placeholder="לא מוצג למתאמן..." className="rounded-lg resize-none min-h-[50px]" />
              </div>
            )}

            {/* Save */}
            <Button onClick={handleSave} disabled={saving || !form.package_name}
              className="w-full h-12 rounded-xl font-bold text-white bg-[#FF6F20] hover:bg-[#e65b12]">
              {saving ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר...</> : (editingPackage ? "עדכן חבילה" : "צור חבילה")}
            </Button>
          </div>
        )}
        </DialogContent>
      </Dialog>
    </>
  );
}
