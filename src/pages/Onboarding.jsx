import React, { useState, useEffect, useContext, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import HealthDeclarationForm from "@/components/forms/HealthDeclarationForm";
import WelcomeBlessingPopup from "@/components/WelcomeBlessingPopup";
import PageLoader from "@/components/PageLoader";
import { generateTraineeSummary } from "@/lib/onboardingSummary";
import { AuthContext } from "@/lib/AuthContext";

// 6-step onboarding wizard. Replaces the legacy 2-step flow.
//
// Language rule: every user-facing string is gender-neutral. No
// /ה /י suffixes, no "מתאמן" — talks in 1st-person plural ("נשמח",
// "אפשר") or 2nd-person without gender markers ("שלך", "לך").
//
// Save strategy: per-field fallback via safeUpdate(). The bulk
// supabase.from('users').update() either succeeds outright or, on
// failure, retries each field on its own so a missing column kills
// only itself instead of the whole step's save. Non-existent columns
// (body_type / goal_body_type / address / emergency_contact_*) will
// warn in console; every other field still lands.

const STEPS = [
  { id: 'details',      label: 'פרטים' },
  { id: 'measurements', label: 'מדידות' },
  { id: 'goals',        label: 'יעדים' },
  { id: 'about',        label: 'היכרות' },
  { id: 'health',       label: 'בריאות' },
  { id: 'confirm',      label: 'אישור' },
];

const BODY_TYPES_NOW = [
  { id: 'thin',       label: 'רזה',           emoji: '🏃' },
  { id: 'average',    label: 'ממוצע',         emoji: '🧍' },
  { id: 'athletic',   label: 'אתלטי',         emoji: '💪' },
  { id: 'overweight', label: 'עם עודף משקל',  emoji: '🐻' },
];

const BODY_TYPES_GOAL = [
  { id: 'lean',      label: 'רזה ומוגדר',  emoji: '🏊' },
  { id: 'athletic',  label: 'אתלטי וחזק',  emoji: '💪' },
  { id: 'muscular',  label: 'שרירי',       emoji: '🏋️' },
  { id: 'healthy',   label: 'בריא ומאוזן',  emoji: '🧘' },
];

const ALL_GOALS = [
  'חיזוק והתחשלות', 'ירידה במשקל', 'גמישות ותנועתיות',
  'סיבולת וכושר', 'מיומנות ספציפית', 'הנאה ותחושה טובה',
  'שיקום מפציעה', 'עליית מסת שריר', 'קליסטניקס ושליטה בגוף',
  'שיפור יציבה', 'כוח פונקציונלי', 'שיפור ביצועים ספורטיביים',
];

const FITNESS_LEVELS  = ['מתחילים', 'בינוני', 'מתקדם', 'ספורטיבי'];
const FREQUENCIES     = ['1-2', '3-4', '5-6', 'כל יום'];
const ALL_CHALLENGES  = ['חוסר זמן', 'חוסר מוטיבציה', 'חוסר ידע', 'כאבים או פציעות', 'חוסר ביטחון', 'אין ציוד'];
const ALL_PREFERENCES = ['אווירה טובה', 'תוצאות מדידות', 'למידת מיומנויות', 'אתגר גופני', 'הנאה', 'ליווי צמוד', 'גמישות בשעות'];
const REFERRAL_OPTIONS = [
  { id: 'friend',    label: 'חבר' },
  { id: 'instagram', label: 'אינסטגרם' },
  { id: 'google',    label: 'גוגל' },
  { id: 'other',     label: 'אחר' },
];
const RELATION_OPTIONS = ['הורה', 'אפוטרופוס', 'בן/בת זוג', 'אח/ות', 'חבר', 'אחר'];

// ── Styles ──
const COLORS = {
  bg:       '#FDF8F3',
  card:     '#FFFFFF',
  accent:   '#FF6F20',
  border:   '#F0E4D0',
  chipBg:   '#FFF5EE',
  chipBorder: '#FFD9C0',
  text:     '#1A1A1A',
  muted:    '#888',
};

const inputStyle = {
  width: '100%', padding: 10, borderRadius: 12,
  border: `1px solid ${COLORS.border}`, fontSize: 14,
  direction: 'rtl', boxSizing: 'border-box', outline: 'none',
};

const cardStyle = {
  background: COLORS.card, borderRadius: 14,
  border: `1px solid ${COLORS.border}`, padding: 16,
  marginBottom: 12,
};

// ── Helpers ──
const calcAge = (birthDate) => {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

// Strip blank values from a field map so re-entering onboarding
// (coach flips client_status active → onboarding) cannot overwrite
// existing DB values with empty inputs. Empty string / null /
// undefined → skipped; arrays kept (chip selectors require explicit
// deselection — that's intentional). The bootstrap useEffect
// prefilled every state from the existing row, so a blank field
// here means the user didn't touch it.
const buildPayload = (fields) => {
  const payload = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === '' || value === null || value === undefined) continue;
    payload[key] = value;
  }
  return payload;
};

const safeUpdate = async (userId, fields) => {
  const presentFields = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined)
  );
  console.log('[Onboarding] saving fields:', Object.keys(presentFields));
  const { error } = await supabase.from('users').update(presentFields).eq('id', userId);
  if (!error) {
    console.log('[Onboarding] all fields saved OK');
    return { ok: true, failed: [] };
  }
  console.warn('[Onboarding] bulk failed:', error.message, '— trying field by field');
  const failed = [];
  for (const [key, value] of Object.entries(presentFields)) {
    const { error: e } = await supabase.from('users').update({ [key]: value }).eq('id', userId);
    if (e) {
      console.warn(`[Onboarding] ${key} failed:`, e.message);
      failed.push(key);
    } else {
      console.log(`[Onboarding] ${key} saved OK`);
    }
  }
  return { ok: failed.length === 0, failed };
};

// ── Toggle button ──
function ChoiceButton({ active, onClick, children, fullWidth = false, emoji }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: emoji ? '12px 16px' : '10px 16px',
        borderRadius: 14,
        border: active ? `2px solid ${COLORS.accent}` : `1px solid ${COLORS.border}`,
        background: active ? COLORS.chipBg : COLORS.card,
        color: active ? COLORS.accent : COLORS.text,
        fontSize: 13, fontWeight: 500,
        cursor: 'pointer', textAlign: 'center',
        flex: fullWidth ? 1 : undefined, minWidth: emoji ? 75 : undefined,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 4,
        whiteSpace: 'nowrap',
      }}
    >
      {emoji && <span style={{ fontSize: 24 }}>{emoji}</span>}
      <span>{children}</span>
    </button>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 16px',
        borderRadius: 20,
        border: active ? `2px solid ${COLORS.accent}` : `1px solid ${COLORS.border}`,
        background: active ? COLORS.chipBg : COLORS.card,
        color: active ? COLORS.accent : COLORS.text,
        fontSize: 13, fontWeight: 500,
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

// ── Main ──
export default function Onboarding() {
  const navigate = useNavigate();
  const { checkAppState } = useContext(AuthContext) || {};
  const [user, setUser] = useState(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [step, setStep] = useState('details');
  const [showHealthForm, setShowHealthForm] = useState(false);
  const [healthSigned, setHealthSigned] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [savingStep, setSavingStep] = useState(false);

  // Step 1: details
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [referralSource, setReferralSource] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('');

  // Step 2: measurements
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [bodyType, setBodyType] = useState('');
  const [goalBodyType, setGoalBodyType] = useState('');

  // Step 3: goals
  const [selectedGoals, setSelectedGoals] = useState([]);
  const [goalsDescription, setGoalsDescription] = useState('');

  // Step 4: about
  const [sportsExperience, setSportsExperience] = useState('');
  const [fitnessLevel, setFitnessLevel] = useState('');
  const [frequency, setFrequency] = useState('');
  const [selectedChallenges, setSelectedChallenges] = useState([]);
  const [challengesDescription, setChallengesDescription] = useState('');
  const [selectedPreferences, setSelectedPreferences] = useState([]);
  const [preferencesDescription, setPreferencesDescription] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');

  // Step 5: health
  const [preHealthNote, setPreHealthNote] = useState('');

  // Step 6: pending session (auto-confirmed once paid)
  const [pendingSession, setPendingSession] = useState(null);

  // Bootstrap — load the auth user + existing row, prefill any prior
  // answers so a refresh mid-flow doesn't wipe progress.
  // bootstrapDoneRef belt-and-suspenders: even if the effect were to
  // re-fire (e.g. StrictMode double-invoke in dev, navigate-induced
  // remount), the body executes exactly once per mount cycle.
  const bootstrapDoneRef = useRef(false);
  useEffect(() => {
    if (bootstrapDoneRef.current) return;
    bootstrapDoneRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) {
          navigate('/login', { replace: true });
          return;
        }
        const { data: row } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();
        if (cancelled) return;
        const u = row || { id: authUser.id, email: authUser.email };
        setUser(u);

        // If they already finished onboarding, kick them home. Two
        // independent signals — `client_status` flipped off 'onboarding',
        // OR `onboarding_completed_at` is populated. Either is enough.
        const alreadyDone =
          (u.client_status && u.client_status !== 'onboarding')
          || u.onboarding_completed_at != null
          || u.onboarding_completed === true;
        if (alreadyDone) {
          console.log('[Onboarding] bootstrap: already complete', {
            clientStatus: u.client_status,
            onboardingCompletedAt: u.onboarding_completed_at,
            onboardingCompleted: u.onboarding_completed,
          });
          navigate('/trainee-home', { replace: true });
          return;
        }

        // Prefill
        setFullName(u.full_name || '');
        setPhone(u.phone || '');
        setEmail(u.email || authUser.email || '');
        setBirthDate(u.birth_date ? String(u.birth_date).slice(0, 10) : '');
        setAddress(u.address || '');
        setReferralSource(u.referral_source || '');
        setEmergencyName(u.emergency_contact_name || '');
        setEmergencyPhone(u.emergency_contact_phone || '');
        setEmergencyRelation(u.emergency_contact_relation || '');
        setHeightCm(u.height_cm ? String(u.height_cm) : '');
        setWeightKg(u.weight_kg ? String(u.weight_kg) : '');
        setBodyType(u.body_type || '');
        setGoalBodyType(u.goal_body_type || '');
        const tgRaw = u.training_goals;
        const tg = Array.isArray(tgRaw)
          ? tgRaw
          : (typeof tgRaw === 'string' && tgRaw.trim().startsWith('[')
              ? (() => { try { return JSON.parse(tgRaw); } catch { return []; } })()
              : []);
        setSelectedGoals(tg);
        setGoalsDescription(u.goals_description || '');
        setSportsExperience(u.fitness_background || '');
        setFitnessLevel(u.fitness_experience || '');
        setFrequency(u.preferred_frequency || '');
        const ch = Array.isArray(u.current_challenges) ? u.current_challenges
          : (typeof u.current_challenges === 'string' && u.current_challenges.trim().startsWith('[')
              ? (() => { try { return JSON.parse(u.current_challenges); } catch { return []; } })()
              : []);
        setSelectedChallenges(ch);
        setChallengesDescription(u.challenges_description || '');
        const pr = Array.isArray(u.training_preferences) ? u.training_preferences
          : (typeof u.training_preferences === 'string' && u.training_preferences.trim().startsWith('[')
              ? (() => { try { return JSON.parse(u.training_preferences); } catch { return []; } })()
              : []);
        setSelectedPreferences(pr);
        setPreferencesDescription(u.preferences_description || '');
        setAdditionalNotes(u.additional_notes || '');
        setPreHealthNote(u.pre_health_note || '');
        if (u.health_declaration_signed_at || u.health_declaration_id) setHealthSigned(true);
      } catch (e) {
        console.error('[Onboarding] bootstrap failed:', e);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  if (bootstrapping || !user) return <PageLoader fullHeight />;

  const userId = user.id;
  const coachId = user.coach_id || null;
  const currentStepIndex = STEPS.findIndex(s => s.id === step);

  const goNext = () => {
    const next = STEPS[currentStepIndex + 1];
    if (next) setStep(next.id);
  };
  const goBack = () => {
    const prev = STEPS[currentStepIndex - 1];
    if (prev) setStep(prev.id);
  };

  // Derive minor status from the typed birth date so the emergency
  // contact section can switch from "responsible contact (optional)"
  // to "guardian contact (required)" inline.
  const isMinor = (() => {
    if (!birthDate) return false;
    const d = new Date(birthDate);
    if (Number.isNaN(d.getTime())) return false;
    const today = new Date();
    let a = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) a--;
    return a < 18;
  })();

  // Step-1 validation: the four core identity fields are always
  // required. When the trainee is a minor, the emergency contact
  // name + phone become required too — no playing without a guardian
  // on file.
  const minorEmergencyValid = !isMinor || !!(emergencyName.trim() && emergencyPhone.trim());
  const step1Valid = !!(fullName.trim() && phone.trim() && email.trim() && birthDate)
    && minorEmergencyValid;

  // ── Per-step save handlers ──
  const saveStep1 = async () => {
    setSavingStep(true);
    try {
      // Sync email change to auth.users so the user can log in with
      // their new address. password isn't touched here.
      if (email && email !== user.email) {
        try { await supabase.auth.updateUser({ email }); } catch (e) { console.warn('[Onboarding] auth email update failed:', e?.message); }
      }
      await safeUpdate(userId, buildPayload({
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        birth_date: birthDate,
        address: address.trim(),
        referral_source: referralSource,
        emergency_contact_name: emergencyName.trim(),
        emergency_contact_phone: emergencyPhone.trim(),
        emergency_contact_relation: emergencyRelation,
      }));
      goNext();
    } finally { setSavingStep(false); }
  };

  const saveStep2 = async () => {
    setSavingStep(true);
    try {
      const heightNum = heightCm ? parseInt(heightCm, 10) : null;
      const weightNum = weightKg ? parseFloat(weightKg) : null;
      await safeUpdate(userId, buildPayload({
        height_cm: Number.isFinite(heightNum) ? heightNum : null,
        weight_kg: Number.isFinite(weightNum) ? weightNum : null,
        body_type: bodyType,
        goal_body_type: goalBodyType,
      }));
      // Seed measurements with the trainee's onboarding height/weight
      // so the metrics tab chart starts from this point. Build payload
      // conditionally — only include fields we have a value for, so a
      // null `height_cm` doesn't NOT NULL-violate, and we never send
      // `source` / `notes` (those columns may not exist on older installs).
      if (heightNum || weightNum) {
        try {
          const today = new Date().toISOString().split('T')[0];
          const measurePayload = { trainee_id: userId, date: today };
          if (Number.isFinite(heightNum)) measurePayload.height_cm = heightNum;
          if (Number.isFinite(weightNum)) measurePayload.weight_kg = weightNum;
          console.log('[Onboarding] measurements payload keys:', Object.keys(measurePayload));
          const { error: mErr } = await supabase.from('measurements').insert(measurePayload);
          if (mErr) {
            console.warn('[Onboarding] measurements insert failed:', mErr.message);
          } else {
            console.log('[Onboarding] measurements saved OK');
          }
        } catch (e) {
          console.warn('[Onboarding] measurements error:', e?.message);
        }
      }
      goNext();
    } finally { setSavingStep(false); }
  };

  const saveStep3 = async () => {
    setSavingStep(true);
    try {
      await safeUpdate(userId, buildPayload({
        // training_goals is an array — buildPayload keeps non-empty
        // arrays. An empty selection ([]) is also kept so a user
        // can explicitly clear chips. Same for current_challenges /
        // training_preferences below.
        training_goals: selectedGoals,
        goals_description: goalsDescription.trim(),
      }));
      goNext();
    } finally { setSavingStep(false); }
  };

  const saveStep4 = async () => {
    setSavingStep(true);
    try {
      await safeUpdate(userId, buildPayload({
        fitness_background: sportsExperience.trim(),
        fitness_experience: fitnessLevel,
        preferred_frequency: frequency,
        current_challenges: selectedChallenges,
        challenges_description: challengesDescription.trim(),
        training_preferences: selectedPreferences,
        preferences_description: preferencesDescription.trim(),
        additional_notes: additionalNotes.trim(),
      }));
      goNext();
    } finally { setSavingStep(false); }
  };

  const saveStep5PreHealth = async () => {
    setSavingStep(true);
    try {
      await safeUpdate(userId, buildPayload({
        pre_health_note: preHealthNote.trim(),
      }));
      // Open the formal HealthDeclarationForm. Step 5 only advances
      // to step 6 after the form's onSigned fires — there is no skip.
      setShowHealthForm(true);
    } finally { setSavingStep(false); }
  };

  const completeOnboarding = async () => {
    setSavingStep(true);
    try {
      // Pull the freshest row so generateTraineeSummary sees every
      // answer that landed (some columns might have failed earlier
      // and need to be excluded from the summary, but that's
      // automatic — empty fields generate empty narrative lines).
      const { data: fresh } = await supabase
        .from('users').select('*').eq('id', userId).maybeSingle();
      const summary = generateTraineeSummary(fresh || user);
      // client_status + onboarding_completed_at always need to be
      // written — they're the lifecycle signals the rest of the app
      // gates on. Skip buildPayload for those two so they always
      // land. Summary goes through buildPayload (empty summary
      // shouldn't overwrite a previous one).
      await safeUpdate(userId, {
        ...buildPayload({ onboarding_summary: summary }),
        onboarding_completed_at: new Date().toISOString(),
        client_status: 'casual',
      });
      console.log('[Onboarding] summary written:', summary);
      // Notify the coach — minimal columns only. `link` / `data` /
      // `status` may not exist on older installs and silently 400'd
      // the insert before. user_id + type + title + message + is_read
      // are the universal columns on every notifications schema.
      // The trainee_id is encoded into the title as [uuid] so the
      // popup can parse it back out for the "צפה בפרופיל" button —
      // works on every schema, no `link` column required.
      if (coachId) {
        let traineeName = (fresh?.full_name || fullName || '').trim();
        if (!traineeName) {
          const { data } = await supabase.from('users').select('full_name').eq('id', userId).maybeSingle();
          traineeName = (data?.full_name || '').trim();
        }
        console.log('[Onboarding] notification — trainee name:', traineeName);
        try {
          const titleText = `🎉 ${traineeName || 'מתאמן חדש'} השלים את תהליך ההרשמה [${userId}]`;
          const messageText = summary
            ? summary.substring(0, 300)
            : `${traineeName || 'המתאמן'} השלים את ההרשמה בהצלחה.`;
          const { error: nErr } = await supabase.from('notifications').insert({
            user_id: coachId,
            type: 'onboarding_complete',
            title: titleText,
            message: messageText,
            is_read: false,
          });
          if (nErr) throw nErr;
          console.log('[Onboarding] notification sent OK');
        } catch (e) {
          console.warn('[Onboarding] notification failed:', e?.message);
        }
      }
      // Refresh AuthContext so the in-memory user picks up the new
      // client_status/onboarding_completed_at BEFORE we navigate. Without
      // this, AuthContext's stale userProfile triggers a full-page reload
      // back to /onboarding → bootstrap sees casual → SPA-navigates to
      // /trainee-home → AuthContext fires again → infinite loop.
      try {
        await checkAppState?.();
        console.log('[Onboarding] auth context refreshed after completion');
      } catch (e) {
        console.warn('[Onboarding] checkAppState failed:', e?.message);
      }
      setShowWelcome(true);
    } finally { setSavingStep(false); }
  };

  const handleFinishWelcome = () => {
    setShowWelcome(false);
    // Small delay so AuthContext routing logic settles before navigation —
    // closes the last race window where stale state could cause a redirect.
    setTimeout(() => {
      navigate('/trainee-home', { replace: true });
    }, 500);
  };

  // ── Render ──
  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: COLORS.bg, paddingBottom: 80 }}>
      {/* Progress bar */}
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ height: 3, background: COLORS.border, borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{
            height: '100%', background: COLORS.accent,
            width: `${((currentStepIndex + 1) / STEPS.length) * 100}%`,
            transition: 'width 0.3s',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {STEPS.map((s, i) => {
            const reached = i <= currentStepIndex;
            const completed = i < currentStepIndex;
            return (
              <div key={s.id} style={{ textAlign: 'center', flex: 1 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', margin: '0 auto 3px',
                  background: reached ? COLORS.accent : COLORS.border,
                  color: reached ? '#fff' : COLORS.muted,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                }}>
                  {completed ? '✓' : i + 1}
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 600,
                  color: reached ? COLORS.accent : COLORS.muted,
                }}>
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '8px 16px' }}>

        {/* ───────────────────────────────────────────────────── */}
        {/* STEP 1 — DETAILS                                     */}
        {/* ───────────────────────────────────────────────────── */}
        {step === 'details' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>👋</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.text }}>נעים להכיר</div>
              <div style={{ fontSize: 14, color: COLORS.muted, marginTop: 6 }}>נשמח לקבל כמה פרטים בסיסיים</div>
            </div>

            <div style={cardStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 4 }}>שם מלא *</div>
                  <input value={fullName} onChange={e => setFullName(e.target.value)}
                    placeholder="השם המלא" style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 4 }}>טלפון *</div>
                  <input value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="מספר טלפון" inputMode="tel" style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 4 }}>אימייל *</div>
                  <input value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="כתובת אימייל" type="email" style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 4 }}>תאריך לידה *</div>
                  <input value={birthDate} onChange={e => setBirthDate(e.target.value)}
                    type="date" style={inputStyle} />
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: COLORS.border, margin: '16px 0' }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.muted, marginBottom: 8 }}>פרטים נוספים (לא חובה)</div>

            <div style={cardStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 4 }}>כתובת</div>
                  <input value={address} onChange={e => setAddress(e.target.value)}
                    placeholder="עיר / רחוב" style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 4 }}>איך הגעת אלינו?</div>
                  <select value={referralSource} onChange={e => setReferralSource(e.target.value)}
                    style={{ ...inputStyle, background: '#fff', appearance: 'auto' }}>
                    <option value="">בחר...</option>
                    {REFERRAL_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ ...cardStyle, background: COLORS.bg }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.accent, marginBottom: 10 }}>
                {isMinor ? '👨‍👩‍👧 איש קשר אחראי (נדרש אישור הורים)' : '📞 איש קשר אחראי'}
              </div>
              {isMinor && (
                <div style={{
                  background: '#FFF3E0', borderRadius: 10, padding: 10, marginBottom: 10,
                  fontSize: 12, color: '#E65100', lineHeight: 1.5,
                }}>
                  ⚠️ מכיוון שהגיל מתחת ל-18, נדרש פרטי הורה או אפוטרופוס לצורך אישור פעילות
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input value={emergencyName} onChange={e => setEmergencyName(e.target.value)}
                  placeholder={isMinor ? 'שם הורה / אפוטרופוס *' : 'שם איש הקשר'}
                  style={inputStyle} />
                <input value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)}
                  placeholder={isMinor ? 'טלפון *' : 'טלפון'}
                  inputMode="tel" style={inputStyle} />
                <select value={emergencyRelation} onChange={e => setEmergencyRelation(e.target.value)}
                  style={{ ...inputStyle, background: '#fff', appearance: 'auto' }}>
                  <option value="">קרבה...</option>
                  {RELATION_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <button onClick={saveStep1} disabled={!step1Valid || savingStep}
              style={primaryBtn(step1Valid && !savingStep)}>
              {savingStep ? 'שומר...' : 'המשך'}
            </button>
          </>
        )}

        {/* ───────────────────────────────────────────────────── */}
        {/* STEP 2 — MEASUREMENTS                                */}
        {/* ───────────────────────────────────────────────────── */}
        {step === 'measurements' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📏</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.text }}>נקודת ההתחלה</div>
              <div style={{ fontSize: 14, color: COLORS.muted, marginTop: 6, lineHeight: 1.5 }}>
                הנתונים האלה יעזרו לעקוב אחרי ההתקדמות.<br />הכל אופציונלי — נשמח לקבל מה שנוח.
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 4 }}>גובה (ס״מ)</div>
                  <input value={heightCm} onChange={e => setHeightCm(e.target.value.replace(/\D/g, ''))}
                    placeholder="170" inputMode="numeric" style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 4 }}>משקל (ק״ג)</div>
                  <input value={weightKg} onChange={e => setWeightKg(e.target.value.replace(/[^\d.]/g, ''))}
                    placeholder="70" inputMode="decimal" style={inputStyle} />
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 8 }}>איך הגוף מרגיש היום?</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {BODY_TYPES_NOW.map(b => (
                  <ChoiceButton key={b.id} active={bodyType === b.id} emoji={b.emoji}
                    onClick={() => setBodyType(b.id)}>
                    {b.label}
                  </ChoiceButton>
                ))}
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 8 }}>לאן שואפים להגיע?</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {BODY_TYPES_GOAL.map(b => (
                  <ChoiceButton key={b.id} active={goalBodyType === b.id} emoji={b.emoji}
                    onClick={() => setGoalBodyType(b.id)}>
                    {b.label}
                  </ChoiceButton>
                ))}
              </div>
            </div>

            <button onClick={saveStep2} disabled={savingStep} style={primaryBtn(!savingStep)}>
              {savingStep ? 'שומר...' : 'המשך'}
            </button>
            <button onClick={goNext} style={skipBtn}>דלג</button>
          </>
        )}

        {/* ───────────────────────────────────────────────────── */}
        {/* STEP 3 — GOALS                                       */}
        {/* ───────────────────────────────────────────────────── */}
        {step === 'goals' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.text }}>מה המטרה?</div>
              <div style={{ fontSize: 14, color: COLORS.muted, marginTop: 6 }}>
                אפשר לבחור כמה שרוצים — או לדלג ולהגדיר אחר כך.
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ALL_GOALS.map(g => (
                  <Chip key={g}
                    active={selectedGoals.includes(g)}
                    onClick={() => setSelectedGoals(prev =>
                      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
                    )}>
                    {g}
                  </Chip>
                ))}
              </div>
            </div>

            {selectedGoals.length > 0 && (
              <div style={cardStyle}>
                <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 4 }}>רוצים לפרט עוד?</div>
                <textarea value={goalsDescription} onChange={e => setGoalsDescription(e.target.value)}
                  placeholder="למשל: להגיע ל-10 עליות מתח, לרדת 5 קילו..."
                  rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }} />
              </div>
            )}

            <button onClick={saveStep3} disabled={savingStep} style={primaryBtn(!savingStep)}>
              {savingStep ? 'שומר...' : 'המשך'}
            </button>
            <button onClick={goNext} style={skipBtn}>דלג</button>
          </>
        )}

        {/* ───────────────────────────────────────────────────── */}
        {/* STEP 4 — ABOUT                                       */}
        {/* ───────────────────────────────────────────────────── */}
        {step === 'about' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.text }}>עוד קצת עלייך</div>
              <div style={{ fontSize: 14, color: COLORS.muted, marginTop: 6, lineHeight: 1.5 }}>
                ככל שנכיר יותר, נוכל להתאים תוכנית טובה יותר.<br />הכל אופציונלי.
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 8 }}>ניסיון ספורטיבי קודם</div>
              <input value={sportsExperience} onChange={e => setSportsExperience(e.target.value)}
                placeholder="למשל: שחייה 3 שנים, ריצה, חדר כושר..." style={inputStyle} />
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 8 }}>רמת הכושר הנוכחית</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {FITNESS_LEVELS.map(l => (
                  <ChoiceButton key={l} active={fitnessLevel === l} fullWidth
                    onClick={() => setFitnessLevel(l)}>
                    {l}
                  </ChoiceButton>
                ))}
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 8 }}>כמה פעמים בשבוע?</div>
              <select value={frequency} onChange={e => setFrequency(e.target.value)}
                style={{ ...inputStyle, background: '#fff', appearance: 'auto' }}>
                <option value="">בחר...</option>
                {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 8 }}>מה האתגר הכי גדול כרגע?</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {ALL_CHALLENGES.map(c => (
                  <Chip key={c}
                    active={selectedChallenges.includes(c)}
                    onClick={() => setSelectedChallenges(prev =>
                      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
                    )}>
                    {c}
                  </Chip>
                ))}
              </div>
              <textarea value={challengesDescription} onChange={e => setChallengesDescription(e.target.value)}
                placeholder="נשמח לשמוע עוד..." rows={2}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} />
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 8 }}>מה הדבר הכי חשוב באימון?</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {ALL_PREFERENCES.map(p => (
                  <Chip key={p}
                    active={selectedPreferences.includes(p)}
                    onClick={() => setSelectedPreferences(prev =>
                      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
                    )}>
                    {p}
                  </Chip>
                ))}
              </div>
              <textarea value={preferencesDescription} onChange={e => setPreferencesDescription(e.target.value)}
                placeholder="נשמח לשמוע עוד..." rows={2}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} />
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 8 }}>הערות</div>
              <textarea value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)}
                placeholder="משהו נוסף שחשוב לדעת?" rows={2}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} />
            </div>

            <button onClick={saveStep4} disabled={savingStep} style={primaryBtn(!savingStep)}>
              {savingStep ? 'שומר...' : 'המשך'}
            </button>
            <button onClick={goNext} style={skipBtn}>דלג</button>
          </>
        )}

        {/* ───────────────────────────────────────────────────── */}
        {/* STEP 5 — HEALTH                                      */}
        {/* No skip button — health declaration is mandatory.    */}
        {/* ───────────────────────────────────────────────────── */}
        {step === 'health' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🤝</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.text }}>לפני שמתחילים</div>
              <div style={{ fontSize: 14, color: COLORS.muted, marginTop: 6, lineHeight: 1.6 }}>
                הבריאות חשובה מעל הכל. נרצה לוודא שהגוף במצב שמאפשר פעילות גופנית — כדי לבנות תוכנית בטוחה שמותאמת בדיוק.
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 8 }}>
                יש כאב, פציעה או מגבלה שחשוב לדעת?
              </div>
              <textarea value={preHealthNote} onChange={e => setPreHealthNote(e.target.value)}
                placeholder="למשל: כאבי גב תחתון, פציעת ברך ישנה... או פשוט 'הכל תקין' 😊"
                rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }} />
            </div>

            <button onClick={saveStep5PreHealth} disabled={savingStep} style={primaryBtn(!savingStep)}>
              {savingStep ? 'שומר...' : 'המשך להצהרת בריאות 📋'}
            </button>
            <div style={{ textAlign: 'center', fontSize: 12, color: COLORS.muted, marginTop: 8 }}>
              טופס קצר — פחות מדקה
            </div>

            {/* HealthDeclarationForm: same component coach + trainee
                share. onSigned advances to step 6. */}
            {showHealthForm && (
              <HealthDeclarationForm
                isOpen={showHealthForm}
                onClose={() => setShowHealthForm(false)}
                trainee={{ id: userId, full_name: fullName, birth_date: birthDate }}
                coachId={coachId}
                autoConfirmSession={false}
                onSigned={() => {
                  setHealthSigned(true);
                  setShowHealthForm(false);
                  setStep('confirm');
                }}
              />
            )}
          </>
        )}

        {/* ───────────────────────────────────────────────────── */}
        {/* STEP 6 — CONFIRM                                     */}
        {/* ───────────────────────────────────────────────────── */}
        {step === 'confirm' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.text }}>כמעט סיימנו</div>
              <div style={{ fontSize: 14, color: COLORS.muted, marginTop: 6 }}>
                {healthSigned ? 'הצהרת הבריאות נשמרה. תכף סוגרים.' : 'נדרשת חתימה על הצהרת בריאות לפני הסיום.'}
              </div>
            </div>

            {!healthSigned && (
              <button onClick={() => setStep('health')} style={primaryBtn(true)}>
                חזרה להצהרת בריאות
              </button>
            )}

            {healthSigned && (
              <button onClick={completeOnboarding} disabled={savingStep} style={primaryBtn(!savingStep)}>
                {savingStep ? 'שומר...' : 'סיום ✓'}
              </button>
            )}
          </>
        )}

        {/* Back button — visible from step 2 onward, hidden during
            health-form modal so it doesn't compete with the modal's
            own close. */}
        {currentStepIndex > 0 && step !== 'health' && step !== 'confirm' && (
          <button onClick={goBack} style={{
            background: 'none', border: 'none', color: COLORS.muted,
            fontSize: 13, cursor: 'pointer', marginTop: 8,
            padding: '8px 16px', display: 'block', margin: '8px auto 0',
          }}>
            ← חזרה
          </button>
        )}
      </div>

      {/* Welcome popup — fires after the final save lands. */}
      <WelcomeBlessingPopup
        isOpen={showWelcome}
        onClose={handleFinishWelcome}
      />
    </div>
  );
}

const primaryBtn = (enabled) => ({
  width: '100%', padding: 14, borderRadius: 14, border: 'none',
  background: enabled ? COLORS.accent : '#ccc',
  color: '#fff', fontSize: 16, fontWeight: 600,
  cursor: enabled ? 'pointer' : 'default',
  marginTop: 12,
});

const skipBtn = {
  background: 'none', border: 'none', color: COLORS.muted,
  fontSize: 13, cursor: 'pointer', marginTop: 4,
  padding: '8px 16px', display: 'block', margin: '4px auto 0',
};
