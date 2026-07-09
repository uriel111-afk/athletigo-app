import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2, Copy, Check, MessageCircle, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { statusForDetail } from '@/lib/lifeos/lifeos-constants';
import { addLead, updateLead } from '@/lib/lifeos/lifeos-api';
import { waLink, normalizePhone } from '@/lib/lifeos/lead-helpers';
import { supabase } from '@/lib/supabaseClient';

const ORANGE = '#FF6F20';
const TOTAL_STEPS = 9;
const STEP_TITLES = [
  'פתיחה', 'למה עכשיו', 'החסם', 'רקע ופציעות', 'חזון',
  'מסגרת', 'שיקוף', 'מפגש היכרות', 'סגירה',
];
const INTRO_PRICE = 39;

// ── Chip option sets (values stored verbatim in the DB) ──────────────
const FOR_WHOM = [
  { key: 'self',   label: 'לעצמי' },
  { key: 'child',  label: 'לילד/ה שלי' },
  { key: 'parent', label: 'להורה שלי' },
  { key: 'other',  label: 'אחר' },
];
const SOURCE_CHIPS = [
  { key: 'פלייר',     label: 'פלייר' },
  { key: 'דף נחיתה',  label: 'דף נחיתה' },
  { key: 'המלצה',     label: 'המלצה' },
  { key: 'אינסטגרם',  label: 'אינסטגרם' },
  { key: 'אחר',       label: 'אחר' },
];
const BARRIER_CHIPS = [
  { key: 'זמן',    label: 'זמן' },
  { key: 'כסף',    label: 'כסף' },
  { key: 'ביטחון', label: 'ביטחון' },
  { key: 'פציעה',  label: 'פציעה' },
  { key: 'לא ידע מאיפה להתחיל', label: 'לא ידע מאיפה להתחיל' },
];
const BACKGROUND_CHIPS = [
  { key: 'אין רקע',      label: 'אין רקע' },
  { key: 'התאמן בעבר',   label: 'התאמן בעבר' },
  { key: 'מתאמן כיום',   label: 'מתאמן כיום' },
  { key: 'ספורטאי רציני', label: 'ספורטאי רציני' },
];
const INJURY_CHIPS = [
  { key: 'אין',       label: 'אין' },
  { key: 'פציעת עבר', label: 'פציעת עבר' },
  { key: 'כאב פעיל',  label: 'כאב פעיל' },
];
const FORMAT_CHIPS = [
  { key: 'personal', label: 'אישית' },
  { key: 'group',    label: 'קבוצתית' },
  { key: 'online',   label: 'אונליין' },
  { key: 'unsure',   label: 'לא בטוח — שנתאים יחד' },
];
const DAY_CHIPS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי'].map((d) => ({ key: d, label: d }));
const HOUR_CHIPS = ['בוקר', 'צהריים', 'ערב'].map((h) => ({ key: h, label: h }));

// Neutralizer sentence appended to the mirror per barrier type (step 7).
const BARRIER_NEUTRALIZER = {
  'זמן':    ' — ולכן בנינו מסגרת קצרה וקבועה שנכנסת ללוז בלי להפוך את השבוע. ',
  'כסף':    ' — ולכן מתחילים בקטן, מפגש היכרות בלי התחייבות גדולה מראש. ',
  'ביטחון': ' — ולכן מתחילים בדיוק מנקודת הפתיחה שלך, צעד אחרי צעד. ',
  'פציעה':  ' — וזה בדיוק הסיפור שלנו: אנחנו מלמדים להתאמן נכון כדי שלא נפצעים מלכתחילה. ',
  'לא ידע מאיפה להתחיל': ' — ולכן יש לנו מסלול מסודר, לא צריך לנחש, רק להגיע. ',
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const tomorrowISO = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

const blankForm = () => ({
  for_whom: '', name: '', phone: '', email: '', trainee_name: '', age: '',
  source: 'אינסטגרם', source_other: '',
  why_now: '',
  objections: '', barrier_type: '',
  background_level: '', sports_experience: '', injury_level: '', injuries: '',
  fitness_goal: '',
  interested_in: '',
  conversation_summary: '',
  meeting_day: '', meeting_hour: '',
  close_result: '', lead_status_detail: '', next_follow_up: '', notes: '',
});

function fromLead(lead) {
  if (!lead) return blankForm();
  // A saved source that isn't one of the preset chips is a free-text
  // "אחר" value — show it in the reveal input and keep the chip on אחר.
  const preset = SOURCE_CHIPS.some((c) => c.key === lead.source);
  return {
    ...blankForm(),
    for_whom: lead.for_whom || '',
    name: lead.name || '', phone: lead.phone || '', email: lead.email || '',
    trainee_name: lead.trainee_name || '',
    age: lead.age != null ? String(lead.age) : '',
    source: preset ? (lead.source || 'אינסטגרם') : 'אחר',
    source_other: preset ? '' : (lead.source || ''),
    why_now: lead.why_now || '',
    objections: lead.objections || '', barrier_type: lead.barrier_type || '',
    background_level: lead.background_level || '',
    sports_experience: lead.sports_experience || '',
    injury_level: lead.injury_level || '', injuries: lead.injuries || '',
    fitness_goal: lead.fitness_goal || '',
    interested_in: lead.interested_in || '',
    conversation_summary: lead.conversation_summary || '',
    meeting_day: lead.meeting_day || '', meeting_hour: lead.meeting_hour || '',
    close_result: lead.close_result || '', lead_status_detail: lead.lead_status_detail || '',
    next_follow_up: lead.next_follow_up || '', notes: lead.notes || '',
  };
}

// Compose the editable "mirror" text (step 7) from the captured answers.
export function composeMirror(f) {
  const thirdPerson = (f.for_whom === 'child' || f.for_whom === 'parent') && (f.trainee_name || '').trim();
  const who = thirdPerson ? f.trainee_name.trim() : null;
  let out = '';
  if ((f.why_now || '').trim()) out += `אמרת ש${f.why_now.trim()} — בדיוק בשביל זה אנחנו כאן. `;
  if ((f.objections || '').trim()) {
    out += `סיפרת שמה שעצר עד עכשיו זה ${f.objections.trim()}`;
    out += BARRIER_NEUTRALIZER[f.barrier_type] || '. ';
  }
  if ((f.injury_level && f.injury_level !== 'אין') || (f.injuries || '').trim()) {
    out += 'נעבוד בצורה שמכבדת את הגוף ומתחשבת במה שסיפרת. ';
  }
  out += who
    ? `ואני אגיד לך משהו — אנחנו מכירים את הנקודה הזאת מצוין. אנשים שהתחילו בדיוק מאיפה ש${who} נמצא/ת היום כבר עושים אצלנו דברים שלא האמינו שיעשו. יש לנו דרך סדורה, והצעד הראשון פשוט: מפגש היכרות. נבדוק יחד את נקודת הפתיחה, ותצאו ממנו עם תוכנית ברורה ותחושה שסוף סוף יש כיוון.`
    : 'ואני אגיד לך משהו — אנחנו מכירים את הנקודה הזאת מצוין. אנשים שהתחילו בדיוק מאיפה שאת/ה נמצא/ת היום כבר עושים אצלנו דברים שלא האמינו שיעשו. יש לנו דרך סדורה, והצעד הראשון פשוט: מפגש היכרות. נבדוק יחד את נקודת הפתיחה, ותצא/י ממנו עם תוכנית ברורה ותחושה שסוף סוף יש כיוון.';
  return out;
}

// Full-screen 9-step guided intake wizard. Each "next" auto-saves the lead.
export default function GuidedLeadFlow({ isOpen, onClose, userId, lead, onSaved }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(blankForm());
  const [leadId, setLeadId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [priceHelp, setPriceHelp] = useState(false);
  const mirroredRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(fromLead(lead));
    setLeadId(lead?.id || null);
    setStep(1);
    setPriceHelp(false);
    mirroredRef.current = false;
  }, [isOpen, lead]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // Auto-compose the mirror once, when the user first reaches step 7 and
  // hasn't already got a summary (existing edit / prior compose).
  useEffect(() => {
    if (!isOpen) return;
    if (step === 7 && !mirroredRef.current && !(form.conversation_summary || '').trim()) {
      setForm((f) => ({ ...f, conversation_summary: composeMirror(f) }));
      mirroredRef.current = true;
    }
  }, [step, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  // Map the form snapshot → DB columns. applyStatus flips lead.status
  // (only the step-9 close actions pass true).
  const buildPayload = (f, applyStatus) => {
    const payload = {
      for_whom: f.for_whom || null,
      name: f.name.trim(),
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
      trainee_name: (f.trainee_name || '').trim() || null,
      age: f.age ? parseInt(f.age, 10) : null,
      source: (f.source === 'אחר' ? ((f.source_other || '').trim() || 'אחר') : f.source) || null,
      why_now: f.why_now || null,
      objections: f.objections || null,
      barrier_type: f.barrier_type || null,
      background_level: f.background_level || null,
      sports_experience: f.sports_experience || null,
      injury_level: f.injury_level || null,
      injuries: f.injuries || null,
      fitness_goal: f.fitness_goal || null,
      interested_in: f.interested_in || null,
      conversation_summary: f.conversation_summary || null,
      meeting_day: f.meeting_day || null,
      meeting_hour: f.meeting_hour || null,
      close_result: f.close_result || null,
      lead_status_detail: f.lead_status_detail || null,
      next_follow_up: f.next_follow_up ? String(f.next_follow_up).slice(0, 10) : null,
      notes: f.notes || null,
      last_contact_date: new Date().toISOString(),
    };
    if (applyStatus && f.lead_status_detail) {
      const st = statusForDetail(f.lead_status_detail);
      if (st) payload.status = st;
      if (st === 'converted') payload.converted_at = new Date().toISOString();
    }
    return payload;
  };

  const persist = async (applyStatus = false, f = form) => {
    const payload = buildPayload(f, applyStatus);
    if (leadId) {
      await updateLead(leadId, payload);
      return leadId;
    }
    const created = await addLead(userId, payload);
    setLeadId(created.id);
    return created.id;
  };

  const next = async () => {
    if (step === 1 && !form.name.trim()) { toast.error('הכנס שם'); return; }
    setBusy(true);
    try {
      await persist(false, form);
      if (step === TOTAL_STEPS) { toast.success(lead ? 'הליד עודכן' : 'הליד נשמר'); onSaved?.(); onClose(); }
      else setStep((s) => s + 1);
    } catch (e) {
      console.error('[GuidedLeadFlow] save error', e);
      toast.error('שגיאה בשמירה: ' + (e?.message || ''));
    } finally { setBusy(false); }
  };

  const back = () => setStep((s) => Math.max(1, s - 1));

  const handleClose = () => { if (leadId) onSaved?.(); onClose(); };

  // Step-9 outcome: merge a close patch, persist with status mapping.
  const applyOutcome = async (patch) => {
    const merged = { ...form, ...patch };
    setForm(merged);
    setBusy(true);
    try { await persist(true, merged); return merged; }
    catch (e) { toast.error('שגיאה בשמירה: ' + (e?.message || '')); return null; }
    finally { setBusy(false); }
  };
  const finishAll = () => { onSaved?.(); onClose(); };

  return (
    <div dir="rtl" style={{
      position: 'fixed', inset: 0, background: 'var(--cream, #FBF3EA)', zIndex: 1600,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header — close + progress + step title */}
      <div style={{
        paddingTop: 'max(env(safe-area-inset-top), 12px)', paddingInline: 14, paddingBottom: 8,
        display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" onClick={handleClose} aria-label="סגור" style={iconBtn}>
            <X size={22} color="#5C4A3A" />
          </button>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A' }}>
            {step}/{TOTAL_STEPS} · {STEP_TITLES[step - 1]}
          </div>
          <div style={{ width: 34 }} />
        </div>
        <Dots step={step} />
      </div>

      {/* Step body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '4px 14px 10px' }}>
        {step === 1 && <Step1 form={form} set={set} />}
        {step === 2 && <Step2 form={form} set={set} />}
        {step === 3 && <Step3 form={form} set={set} />}
        {step === 4 && <Step4 form={form} set={set} />}
        {step === 5 && <Step5 form={form} set={set} />}
        {step === 6 && <Step6 form={form} set={set} />}
        {step === 7 && <Step7 form={form} set={set} />}
        {step === 8 && <Step8 form={form} set={set} />}
        {step === 9 && <Step9 form={form} set={set} busy={busy} onOutcome={applyOutcome} onDone={finishAll} />}
      </div>

      {/* Floating price-question helper — visible on every step */}
      <div style={{ position: 'relative' }}>
        {priceHelp && (
          <div dir="rtl" style={{
            position: 'absolute', bottom: 52, insetInlineStart: 14, insetInlineEnd: 14,
            background: '#E8F7EE', border: '1px solid #34C759', borderRadius: 12,
            padding: '12px 14px', fontSize: 13, lineHeight: 1.6, color: '#1B5E36',
            boxShadow: '0 6px 20px rgba(0,0,0,0.12)', zIndex: 2,
          }}>
            תלוי במסגרת שנתאים לך — בדיוק בשביל זה אני שואלת כמה שאלות קצרות, בסדר?
          </div>
        )}
        <button type="button" onClick={() => setPriceHelp((v) => !v)} style={{
          position: 'absolute', bottom: 8, insetInlineStart: 14, zIndex: 2,
          padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
          border: '1px solid #34C759', background: priceHelp ? '#34C759' : '#fff',
          color: priceHelp ? '#fff' : '#1B5E36', fontSize: 12, fontWeight: 800,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>💬 שאל על מחיר?</button>
      </div>

      {/* Footer nav */}
      <div style={{
        flexShrink: 0, padding: '8px 14px', paddingBottom: 'max(env(safe-area-inset-bottom), 10px)',
        display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid #F0E4D0', background: '#fff',
      }}>
        {/* Step 9 (close) drives its own advance via the outcome buttons. */}
        {step !== 9 && (
          <button type="button" onClick={next} disabled={busy} style={{
            width: '100%', height: 48, borderRadius: 14, border: 'none', cursor: 'pointer',
            background: ORANGE, color: '#fff', fontSize: 16, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: busy ? 0.6 : 1,
          }}>
            {busy && <Loader2 size={18} className="animate-spin" />}
            הבא →
          </button>
        )}
        {step > 1 && (
          <button type="button" onClick={back} disabled={busy} style={{
            width: '100%', height: 32, border: 'none', background: 'transparent', cursor: 'pointer',
            color: '#9A8F82', fontSize: 14, fontWeight: 600,
          }}>← חזרה</button>
        )}
      </div>
    </div>
  );
}

// ─── Steps ──────────────────────────────────────────────────────────

function Step1({ form, set }) {
  return (
    <div style={col}>
      <ScriptBox>היי, איזה כיף שהתקשרת! ספר/י לי — האימון בשבילך או בשביל מישהו קרוב?</ScriptBox>
      <Field label="בשביל מי">
        <ChipRow options={FOR_WHOM} value={form.for_whom} onPick={(k) => set({ for_whom: k })} wrap />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="שם *"><input style={inp} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="שם המתקשר/ת" autoFocus /></Field>
        <Field label="גיל"><input style={inp} type="number" inputMode="numeric" value={form.age} onChange={(e) => set({ age: e.target.value })} placeholder="גיל" /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="טלפון"><input style={inp} type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="050-0000000" /></Field>
        <Field label="שם המתאמן/ת (אם שונה)"><input style={inp} value={form.trainee_name} onChange={(e) => set({ trainee_name: e.target.value })} placeholder="אופציונלי" /></Field>
      </div>
      <Field label="מקור">
        <ChipRow options={SOURCE_CHIPS} value={form.source} onPick={(k) => set({ source: k })} wrap />
      </Field>
      {form.source === 'אחר' && (
        <input style={inp} value={form.source_other} onChange={(e) => set({ source_other: e.target.value })} placeholder="מאיפה הגיע/ה?" />
      )}
    </div>
  );
}

function Step2({ form, set }) {
  return (
    <div style={col}>
      <ScriptBox>ספר/י לי, מה גרם לך להתקשר דווקא עכשיו?</ScriptBox>
      <Field label="במילים שלו/ה">
        <textarea style={{ ...inp, height: 'auto' }} rows={4} value={form.why_now} onChange={(e) => set({ why_now: e.target.value })} placeholder="מה גרם להתקשר עכשיו..." />
      </Field>
    </div>
  );
}

function Step3({ form, set }) {
  return (
    <div style={col}>
      <ScriptBox>ומה עצר אותך עד עכשיו?</ScriptBox>
      <Field label="במילים שלו/ה">
        <textarea style={{ ...inp, height: 'auto' }} rows={3} value={form.objections} onChange={(e) => set({ objections: e.target.value })} placeholder="מה עצר עד עכשיו..." />
      </Field>
      <Field label="סוג החסם">
        <ChipRow options={BARRIER_CHIPS} value={form.barrier_type} onPick={(k) => set({ barrier_type: k })} wrap />
      </Field>
    </div>
  );
}

function Step4({ form, set }) {
  return (
    <div style={col}>
      <ScriptBox>מה עשית בעבר מבחינת ספורט? ויש משהו שחשוב שנדע, כמו פציעות או כאבים?</ScriptBox>
      <Field label="רקע ספורטיבי">
        <ChipRow options={BACKGROUND_CHIPS} value={form.background_level} onPick={(k) => set({ background_level: k })} wrap />
      </Field>
      <Field label="פירוט הרקע">
        <textarea style={{ ...inp, height: 'auto' }} rows={2} value={form.sports_experience} onChange={(e) => set({ sports_experience: e.target.value })} placeholder="מה עשה/תה בעבר..." />
      </Field>
      <Field label="פציעות / כאבים">
        <ChipRow options={INJURY_CHIPS} value={form.injury_level} onPick={(k) => set({ injury_level: k })} wrap />
      </Field>
      <Field label="פירוט פציעות">
        <textarea style={{ ...inp, height: 'auto' }} rows={2} value={form.injuries} onChange={(e) => set({ injuries: e.target.value })} placeholder="פירוט (אופציונלי)..." />
      </Field>
    </div>
  );
}

function Step5({ form, set }) {
  return (
    <div style={col}>
      <ScriptBox>מה היית רוצה שיקרה בעוד חצי שנה?</ScriptBox>
      <Field label="החזון">
        <textarea style={{ ...inp, height: 'auto' }} rows={4} value={form.fitness_goal} onChange={(e) => set({ fitness_goal: e.target.value })} placeholder="החזון לחצי שנה..." />
      </Field>
    </div>
  );
}

function Step6({ form, set }) {
  return (
    <div style={col}>
      <ScriptBox>איזו מסגרת הכי מדברת אליך — אישית, קבוצתית או אונליין?</ScriptBox>
      <Field label="מסגרת מועדפת">
        <ChipRow options={FORMAT_CHIPS} value={form.interested_in} onPick={(k) => set({ interested_in: k })} wrap />
      </Field>
    </div>
  );
}

function Step7({ form, set }) {
  return (
    <div style={col}>
      <ScriptBox>שיקוף — קרא/י ללקוח, וערוך/כי לפי הצורך:</ScriptBox>
      <Field label="שיקוף (ניתן לעריכה)">
        <textarea style={{ ...inp, height: 'auto' }} rows={10} value={form.conversation_summary} onChange={(e) => set({ conversation_summary: e.target.value })} placeholder="השיקוף נבנה אוטומטית מהתשובות..." />
      </Field>
    </div>
  );
}

function Step8({ form, set }) {
  const [payBusy, setPayBusy] = useState(false);
  const [payUrl, setPayUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const hasPhone = !!normalizePhone(form.phone);

  const genLink = async () => {
    setPayBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('payment-create', {
        body: {
          amount: INTRO_PRICE,
          description: 'מפגש היכרות · AthletiGo',
          trainee_name: form.name || form.trainee_name || '',
          trainee_email: form.email || '',
          trainee_phone: form.phone || '',
          payment_type: 'single_session',
        },
      });
      if (error) throw error;
      const url = data?.url || data?.checkoutUrl;
      if (!url) throw new Error(data?.error || 'לא התקבל קישור תשלום');
      setPayUrl(url);
      toast.success('נוצר קישור תשלום');
    } catch (e) {
      console.error('[GuidedLeadFlow] payment-create error', e);
      toast.error('שגיאה ביצירת קישור: ' + (e?.message || ''));
    } finally { setPayBusy(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(payUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { toast.error('לא ניתן להעתיק'); }
  };
  const waShare = () => {
    const msg = `היי! הנה הקישור לתשלום על מפגש ההיכרות (${INTRO_PRICE} ₪, מתקזז ברכישה):\n${payUrl}`;
    window.open(waLink(form.phone, msg), '_blank');
  };

  return (
    <div style={col}>
      <ScriptBox>מתי נוח לך השבוע?</ScriptBox>
      <Field label="יום">
        <ChipRow options={DAY_CHIPS} value={form.meeting_day} onPick={(k) => set({ meeting_day: k })} wrap />
      </Field>
      <Field label="שעה">
        <ChipRow options={HOUR_CHIPS} value={form.meeting_hour} onPick={(k) => set({ meeting_hour: k })} wrap />
      </Field>

      {/* Intro-session payment block */}
      <div style={{ background: '#fff', borderRadius: 14, padding: 14, border: `2px solid ${ORANGE}` }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A' }}>מפגש היכרות · {INTRO_PRICE} ₪ · מתקזז ברכישה</div>
        {!payUrl ? (
          <button type="button" onClick={genLink} disabled={payBusy} style={{
            marginTop: 10, width: '100%', height: 44, borderRadius: 12, border: 'none', cursor: 'pointer',
            background: ORANGE, color: '#fff', fontSize: 14, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: payBusy ? 0.6 : 1,
          }}>
            {payBusy ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
            יצירת קישור תשלום
          </button>
        ) : (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              fontSize: 12, color: '#3a3a3a', background: '#FBF3EA', borderRadius: 8, padding: '8px 10px',
              wordBreak: 'break-all', border: '1px solid #F0E4D0',
            }}>{payUrl}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={copy} style={{
                flex: 1, height: 40, borderRadius: 10, cursor: 'pointer', border: '1px solid #F0E4D0', background: '#fff',
                color: '#3a3a3a', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                {copied ? <Check size={15} color="#16a34a" /> : <Copy size={15} />} {copied ? 'הועתק' : 'העתק'}
              </button>
              <button type="button" onClick={waShare} disabled={!hasPhone} title={hasPhone ? '' : 'אין מספר טלפון'} style={{
                flex: 1, height: 40, borderRadius: 10, cursor: hasPhone ? 'pointer' : 'not-allowed', border: 'none',
                background: hasPhone ? '#25D366' : '#C7E9D2', color: '#fff', fontSize: 13, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <MessageCircle size={15} /> וואטסאפ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Step9({ form, set, busy, onOutcome, onDone }) {
  const [done, setDone] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [savedForm, setSavedForm] = useState(null);

  const finish = async (patch) => {
    const merged = await onOutcome(patch);
    if (merged) { setSavedForm(merged); setDone(true); }
  };

  const closeWon = () => finish({
    close_result: 'closed_now',
    lead_status_detail: 'closed_intro',
  });
  const undecided = async () => {
    const merged = await onOutcome({
      close_result: 'needs_followup',
      lead_status_detail: 'thinking',
      next_follow_up: tomorrowISO(),
    });
    if (merged) {
      setSavedForm(merged); setDone(true);
      const msg = `סיכום שיחה:\n${merged.conversation_summary || ''}\nנדבר מחר להמשך :)`;
      window.open(waLink(merged.phone, msg), '_blank');
    }
  };
  const wantsCoach = () => finish({
    close_result: 'needs_followup',
    lead_status_detail: 'wants_coach',
  });
  const notRelevant = () => {
    const note = (reason || '').trim();
    const mergedNotes = [form.notes, note ? `לא רלוונטי: ${note}` : ''].filter(Boolean).join(' · ');
    finish({
      close_result: 'not_now',
      lead_status_detail: 'refused',
      notes: mergedNotes,
    });
  };

  if (done && savedForm) return <SavedSummary form={savedForm} onDone={onDone} />;

  return (
    <div style={col}>
      <ScriptBox>סיכום השיחה — איך נסגר?</ScriptBox>
      <button type="button" onClick={closeWon} disabled={busy} style={outcomeBtn('#16a34a', '#fff')}>
        ✅ נסגר — נקבע מפגש היכרות
      </button>
      <button type="button" onClick={undecided} disabled={busy} style={outcomeBtn('#fff', '#1A1A1A', '#EAB308')}>
        🤔 מתלבט — סיכום ותזכורת מחר
      </button>
      <button type="button" onClick={wantsCoach} disabled={busy} style={outcomeBtn('#fff', '#1A1A1A', '#3B82F6')}>
        📞 ביקש לדבר עם המאמן
      </button>
      {!reasonOpen ? (
        <button type="button" onClick={() => setReasonOpen(true)} disabled={busy} style={outcomeBtn('#fff', '#9A8F82', '#E0C9A8')}>
          ✖️ לא רלוונטי
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#fff', border: '1px solid #F0E4D0', borderRadius: 12, padding: 12 }}>
          <input style={inp} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="סיבה קצרה (אופציונלי)" autoFocus />
          <button type="button" onClick={notRelevant} disabled={busy} style={outcomeBtn('#4b5563', '#fff')}>
            {busy && <Loader2 size={16} className="animate-spin" />} שמור כלא רלוונטי
          </button>
        </div>
      )}
    </div>
  );
}

function SavedSummary({ form, onDone }) {
  const rows = [
    ['בשביל מי', (FOR_WHOM.find((x) => x.key === form.for_whom) || {}).label],
    ['שם', form.name],
    ['שם המתאמן/ת', form.trainee_name],
    ['טלפון', form.phone],
    ['גיל', form.age],
    ['מקור', form.source === 'אחר' ? form.source_other : form.source],
    ['למה עכשיו', form.why_now],
    ['החסם', form.objections],
    ['סוג חסם', form.barrier_type],
    ['רקע', form.background_level],
    ['פירוט רקע', form.sports_experience],
    ['פציעות', form.injury_level],
    ['פירוט פציעות', form.injuries],
    ['חזון', form.fitness_goal],
    ['מסגרת', (FORMAT_CHIPS.find((x) => x.key === form.interested_in) || {}).label],
    ['מפגש', [form.meeting_day, form.meeting_hour].filter(Boolean).join(' · ')],
    ['שיקוף', form.conversation_summary],
    ['מעקב הבא', form.next_follow_up ? String(form.next_follow_up).slice(0, 10) : ''],
    ['הערות', form.notes],
  ].filter(([, v]) => v != null && String(v).trim() !== '');

  return (
    <div style={col}>
      <div style={{ fontSize: 18, fontWeight: 900, color: '#16a34a', textAlign: 'center', padding: '6px 0' }}>✓ הליד נשמר</div>
      <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #F0E4D0' }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: '0.5px solid #F5EFE5', fontSize: 13 }}>
            <span style={{ color: '#9A8F82', fontWeight: 700, minWidth: 92, flexShrink: 0 }}>{label}</span>
            <span style={{ color: '#1A1A1A', whiteSpace: 'pre-wrap' }}>{String(value)}</span>
          </div>
        ))}
      </div>
      <button type="button" onClick={onDone} style={{
        width: '100%', height: 48, borderRadius: 14, border: 'none', cursor: 'pointer',
        background: ORANGE, color: '#fff', fontSize: 16, fontWeight: 800,
      }}>סיום</button>
    </div>
  );
}

// ─── Building blocks ────────────────────────────────────────────────

function Dots({ step }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
        const n = i + 1;
        const filled = n < step, current = n === step;
        return (
          <div key={i} style={{
            width: current ? 20 : 8, height: 8, borderRadius: 999,
            background: filled || current ? ORANGE : '#E7E0D5', transition: 'all .2s',
          }} />
        );
      })}
    </div>
  );
}

// Orange "say this" script box — the shared visual pattern for the wizard.
function ScriptBox({ children }) {
  return (
    <div dir="rtl" style={{
      background: '#FAECE7', borderRadius: 12, padding: '13px 15px',
      fontSize: 14, lineHeight: 1.6, color: '#5C3A28', fontWeight: 600,
      whiteSpace: 'pre-wrap',
    }}>{children}</div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#9A8F82', marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  );
}

function ChipRow({ options, value, onPick, wrap }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: wrap ? 'wrap' : 'nowrap', overflowX: wrap ? 'visible' : 'auto', scrollbarWidth: 'none' }}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button key={o.key} type="button" onClick={() => onPick(o.key)} style={{
            padding: '7px 13px', borderRadius: 999, cursor: 'pointer', flexShrink: 0,
            border: active ? `2px solid ${ORANGE}` : '1px solid #F0E4D0',
            background: active ? ORANGE : '#fff', color: active ? '#fff' : '#3a3a3a',
            fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

const col = { display: 'flex', flexDirection: 'column', gap: 10 };
const iconBtn = { background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, display: 'flex' };
const inp = {
  width: '100%', minHeight: 40, padding: '9px 11px', borderRadius: 10,
  border: '1px solid #F0E4D0', background: '#fff', fontSize: 14, color: '#1A1A1A',
  outline: 'none', boxSizing: 'border-box', resize: 'none',
  fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
};
function outcomeBtn(bg, color, border) {
  return {
    width: '100%', minHeight: 50, borderRadius: 14, cursor: 'pointer',
    border: border ? `2px solid ${border}` : 'none', background: bg, color,
    fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  };
}
