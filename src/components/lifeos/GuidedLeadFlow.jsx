import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2, Copy, Check, MessageCircle, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { statusForDetail, OBJECTION_BANK_BY_STEP, SALES_SUPPORT_BY_STEP, LEAD_PERSONAS, PRESCRIPTION_TRACKS, PRESCRIPTION_LINES, PRESCRIPTION_DIGITAL, OBJECTION_PREAMBLE } from '@/lib/lifeos/lifeos-constants';
import { addLead, updateLead } from '@/lib/lifeos/lifeos-api';
import { waLink, normalizePhone } from '@/lib/lifeos/lead-helpers';
import { supabase } from '@/lib/supabaseClient';

const ORANGE = '#FF6F20';
const TOTAL_STEPS = 9;
const STEP_TITLES = [
  'פתיחה', 'למה עכשיו', 'החסם', 'רקע ופציעות', 'חזון',
  'מסגרת', 'שיקוף', 'מפגש היכרות', 'סגירה',
];
const INTRO_PRICE = 49; // non-personal path now = the 49₪ digital product
const PERSONAL_INTRO_PRICE = 350;

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
// Second-row sub-detail per source (flyer + landing page share one set).
const FLYER_SUB_CHIPS = [
  { key: 'תנועה בכיף', label: 'תנועה בכיף' },
  { key: 'כללי',       label: 'כללי' },
  { key: 'אחר',        label: 'אחר' },
];
const INSTAGRAM_SUB_CHIPS = [
  { key: 'פוסט אורגני',  label: 'פוסט אורגני' },
  { key: 'מודעה ממומנת', label: 'מודעה ממומנת' },
];

// Combine the source chip + its sub-detail into one readable `source`
// string (e.g. "פלייר · תנועה בכיף", "המלצה · דנה כהן").
function composeSource(f) {
  const s = f.source;
  if (!s) return null;
  if (s === 'אחר') return (f.source_other || '').trim() || 'אחר';
  if (s === 'המלצה') {
    const who = (f.source_sub_text || '').trim();
    return who ? `המלצה · ${who}` : 'המלצה';
  }
  if (s === 'פלייר' || s === 'דף נחיתה') {
    if (f.source_sub === 'אחר') {
      const t = (f.source_sub_text || '').trim();
      return `${s} · ${t || 'אחר'}`;
    }
    return f.source_sub ? `${s} · ${f.source_sub}` : s;
  }
  if (s === 'אינסטגרם') return f.source_sub ? `אינסטגרם · ${f.source_sub}` : 'אינסטגרם';
  return s;
}

// Parse a saved `source` string back into chip + sub-detail for editing.
function parseSource(raw) {
  if (!raw) return { source: 'אינסטגרם', source_other: '', source_sub: '', source_sub_text: '' };
  const idx = raw.indexOf(' · ');
  const top = idx >= 0 ? raw.slice(0, idx) : raw;
  const detail = idx >= 0 ? raw.slice(idx + 3) : '';
  const isPreset = SOURCE_CHIPS.some((c) => c.key === top) && top !== 'אחר';
  if (!isPreset) return { source: 'אחר', source_other: raw, source_sub: '', source_sub_text: '' };
  const out = { source: top, source_other: '', source_sub: '', source_sub_text: '' };
  if (top === 'המלצה') out.source_sub_text = detail;
  else if (top === 'פלייר' || top === 'דף נחיתה') {
    if (detail === 'תנועה בכיף' || detail === 'כללי') out.source_sub = detail;
    else if (detail) { out.source_sub = 'אחר'; out.source_sub_text = detail; }
  } else if (top === 'אינסטגרם') {
    if (detail === 'פוסט אורגני' || detail === 'מודעה ממומנת') out.source_sub = detail;
  }
  return out;
}
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
const PAST_FRAMEWORK_CHIPS = [
  { key: 'לא ניסיתי',      label: 'לא ניסיתי' },
  { key: 'חדר כושר',       label: 'חדר כושר' },
  { key: 'סטודיו או חוג',  label: 'סטודיו או חוג' },
  { key: 'מאמן אישי',      label: 'מאמן אישי' },
  { key: 'אונליין',        label: 'אונליין' },
];
const ENERGY_CHIPS = [
  { key: 'נשארה גבוהה', label: 'נשארה גבוהה' },
  { key: 'ירדה באמצע',  label: 'ירדה באמצע' },
  { key: 'ירדה בסוף',   label: 'ירדה בסוף' },
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
  source: 'אינסטגרם', source_other: '', source_sub: '', source_sub_text: '',
  persona: '',
  recommended_track: '',
  digital_offered: '',
  referrals: [], // call-scoped list; each becomes a NEW lead on save
  why_now: '',
  objections: '', barrier_type: '',
  background_level: '', sports_experience: '', injury_level: '', injuries: '',
  fitness_goal: '',
  past_framework: '', past_framework_gap: '',
  interested_in: '',
  conversation_summary: '',
  meeting_day: '', meeting_hour: '',
  call_energy: '', energy_drop_note: '',
  close_result: '', lead_status_detail: '', next_follow_up: '', notes: '',
});

function fromLead(lead) {
  if (!lead) return blankForm();
  // Parse the saved single-string source back into chip + sub-detail.
  const ps = parseSource(lead.source);
  return {
    ...blankForm(),
    for_whom: lead.for_whom || '',
    name: lead.name || '', phone: lead.phone || '', email: lead.email || '',
    trainee_name: lead.trainee_name || '',
    age: lead.age != null ? String(lead.age) : '',
    source: ps.source, source_other: ps.source_other,
    source_sub: ps.source_sub, source_sub_text: ps.source_sub_text,
    persona: lead.persona || '',
    recommended_track: lead.recommended_track || '',
    digital_offered: lead.digital_offered || '',
    why_now: lead.why_now || '',
    objections: lead.objections || '', barrier_type: lead.barrier_type || '',
    background_level: lead.background_level || '',
    sports_experience: lead.sports_experience || '',
    injury_level: lead.injury_level || '', injuries: lead.injuries || '',
    fitness_goal: lead.fitness_goal || '',
    past_framework: lead.past_framework || '', past_framework_gap: lead.past_framework_gap || '',
    interested_in: lead.interested_in || '',
    conversation_summary: lead.conversation_summary || '',
    meeting_day: lead.meeting_day || '', meeting_hour: lead.meeting_hour || '',
    call_energy: lead.call_energy || '', energy_drop_note: lead.energy_drop_note || '',
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
  if ((f.past_framework_gap || '').trim()) {
    out += `סיפרת שב${f.past_framework || 'מסגרת קודמת'} הרגשת ש${f.past_framework_gap.trim()} — אצלנו בנינו את זה בדיוק הפוך. `;
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
  const [objHelp, setObjHelp] = useState(false);
  const [objOpen, setObjOpen] = useState(null);
  const [objAll, setObjAll] = useState(false);
  // Sales-support layer: yes-counter (call-scoped, no DB) + phrases-panel
  // expanded state. Quiet by default — collapsed on open; the open/closed
  // choice is ONE shared state for the whole wizard session (persists
  // across steps, not per-step).
  const [yesCount, setYesCount] = useState(0);
  const [salesOpen, setSalesOpen] = useState(false);
  const mirroredRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(fromLead(lead));
    setLeadId(lead?.id || null);
    setStep(1);
    setObjHelp(false);
    setObjOpen(null);
    setObjAll(false);
    setYesCount(0);
    setSalesOpen(false);
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
      source: composeSource(f),
      persona: f.persona || null,
      recommended_track: f.recommended_track || null,
      digital_offered: f.digital_offered || null,
      why_now: f.why_now || null,
      objections: f.objections || null,
      barrier_type: f.barrier_type || null,
      background_level: f.background_level || null,
      sports_experience: f.sports_experience || null,
      injury_level: f.injury_level || null,
      injuries: f.injuries || null,
      fitness_goal: f.fitness_goal || null,
      past_framework: f.past_framework || null,
      past_framework_gap: f.past_framework_gap || null,
      interested_in: f.interested_in || null,
      conversation_summary: f.conversation_summary || null,
      meeting_day: f.meeting_day || null,
      meeting_hour: f.meeting_hour || null,
      call_energy: f.call_energy || null,
      energy_drop_note: f.energy_drop_note || null,
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

  // Create one NEW lead per captured referral (step 9). Source is
  // tagged back to the referring lead; status = 'new'. Best-effort:
  // a single failure never blocks the close. Runs once at close.
  const createReferralLeads = async (f) => {
    const refs = Array.isArray(f.referrals) ? f.referrals : [];
    const fromName = (f.name || '').trim() || 'ליד';
    for (const r of refs) {
      const name = (r?.name || '').trim();
      if (!name) continue;
      try {
        await addLead(userId, {
          name,
          phone: (r?.phone || '').trim() || null,
          source: `הפניה מ-${fromName}`,
          status: 'new',
        });
      } catch (e) { console.warn('[GuidedLeadFlow] referral lead failed:', e?.message); }
    }
  };

  // Step-9 outcome: merge a close patch, persist with status mapping,
  // then spin up any referral leads.
  const applyOutcome = async (patch) => {
    const merged = { ...form, ...patch };
    setForm(merged);
    setBusy(true);
    try {
      await persist(true, merged);
      await createReferralLeads(merged);
      return merged;
    }
    catch (e) { toast.error('שגיאה בשמירה: ' + (e?.message || '')); return null; }
    finally { setBusy(false); }
  };
  const finishAll = () => { onSaved?.(); onClose(); };

  // Objection helper: current step's objections by default, or the full
  // cross-step list when "הצג הכל" is on. {source} in a line is filled
  // with the lead's source so it reads naturally.
  const srcLabel = form.source === 'אחר'
    ? ((form.source_other || '').trim() || 'הפרסום')
    : (form.source || 'הפרסום');
  const objList = objAll
    ? Object.entries(OBJECTION_BANK_BY_STEP).flatMap(([st, items]) => items.map((it, i) => ({ ...it, _key: `${st}-${i}` })))
    : (OBJECTION_BANK_BY_STEP[step] || []).map((it, i) => ({ ...it, _key: `${step}-${i}` }));

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
          {/* Yes-counter — tap each time the lead agrees. Call-scoped
              only (no DB). */}
          <button
            type="button"
            onClick={() => setYesCount((c) => c + 1)}
            title="אסוף כן קטנים לאורך הדרך"
            aria-label="מונה כן"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              border: '1.5px solid #16a34a', background: yesCount > 0 ? '#16a34a' : '#fff',
              color: yesCount > 0 ? '#fff' : '#16a34a', borderRadius: 999,
              padding: '4px 10px', fontSize: 13, fontWeight: 800, cursor: 'pointer',
            }}
          >כן ✓ {yesCount}</button>
        </div>
        <Dots step={step} />
      </div>

      {/* Step body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '4px 14px 10px' }}>
        {step === 8 && <PrescriptionCard form={form} set={set} />}
        <SalesPanel step={step} persona={form.persona} srcLabel={srcLabel} open={salesOpen} onToggle={() => setSalesOpen((v) => !v)} />
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

      {/* Floating objection-handling helper — visible on every step */}
      <div style={{ position: 'relative' }}>
        {objHelp && (
          <>
            <div onClick={() => setObjHelp(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 1 }} />
            <div dir="rtl" style={{
              position: 'absolute', bottom: 52, insetInlineStart: 14, insetInlineEnd: 14,
              background: '#fff', border: '1px solid #34C759', borderRadius: 14,
              boxShadow: '0 8px 24px rgba(0,0,0,0.16)', zIndex: 2,
              maxHeight: '52vh', overflowY: 'auto', padding: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 8px' }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 800, color: '#1B5E36' }}>
                  עזרה בהתנגדות{objAll ? '' : ` · שלב ${step}`}
                </div>
                <button type="button" onClick={() => { setObjAll((v) => !v); setObjOpen(null); }} style={{
                  padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
                  border: `1px solid ${objAll ? '#34C759' : '#D9CDBB'}`,
                  background: objAll ? '#34C759' : '#fff', color: objAll ? '#fff' : '#5C4A3A',
                  fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap',
                }}>{objAll ? 'רק לשלב זה' : 'הצג הכל'}</button>
              </div>
              {/* Always-visible instruction — diagnose the objection first */}
              <div style={{
                fontSize: 11, fontStyle: 'italic', color: '#9A8F82', lineHeight: 1.45,
                padding: '0 6px 8px', marginBottom: 4, borderBottom: '1px solid #F0E4D0',
              }}>
                💡 {OBJECTION_PREAMBLE}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {objList.length === 0 ? (
                  <div style={{ padding: '18px 8px', textAlign: 'center', fontSize: 13, color: '#9A8F82' }}>
                    אין התנגדויות נפוצות לשלב זה — לחצ/י "הצג הכל"
                  </div>
                ) : objList.map((o) => {
                  const open = objOpen === o._key;
                  return (
                    <div key={o._key} style={{ background: '#F7F3EC', borderRadius: 10, overflow: 'hidden', border: '1px solid #F0E4D0' }}>
                      <button type="button" onClick={() => setObjOpen(open ? null : o._key)} style={{
                        width: '100%', textAlign: 'right', padding: '10px 12px', border: 'none', cursor: 'pointer',
                        background: open ? '#EAF7EF' : 'transparent', display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: '#1A1A1A' }}>{o.q}</span>
                        <span style={{ fontSize: 13, color: '#34C759', fontWeight: 800 }}>{open ? '−' : '+'}</span>
                      </button>
                      {open && (
                        <div style={{ padding: '2px 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {o.responses.map((r, ri) => (
                            <div key={ri}>
                              {/* Spoken line — bold, dark, selectable */}
                              <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.55, color: '#1a1a1a', whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                                {r.line.replace(/\{source\}/g, srcLabel)}
                              </div>
                              {/* Delivery hint — muted italic, NOT read aloud */}
                              {r.note && (
                                <div style={{ fontSize: 11, fontStyle: 'italic', color: '#9A8F82', lineHeight: 1.45, marginTop: 3 }}>
                                  💡 {r.note}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
        <button type="button" onClick={() => setObjHelp((v) => !v)} style={{
          position: 'absolute', bottom: 8, insetInlineStart: 14, zIndex: 2,
          padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
          border: '1px solid #34C759', background: objHelp ? '#34C759' : '#fff',
          color: objHelp ? '#fff' : '#1B5E36', fontSize: 12, fontWeight: 800,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>🛟 עזרה בהתנגדות</button>
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: GAP }}>
        <Field label="שם *"><input style={inp} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="שם המתקשר/ת" autoFocus /></Field>
        <Field label="גיל"><input style={inp} type="number" inputMode="numeric" value={form.age} onChange={(e) => set({ age: e.target.value })} placeholder="גיל" /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: GAP }}>
        <Field label="טלפון"><input style={inp} type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="050-0000000" /></Field>
        <Field label="שם המתאמן/ת (אם שונה)"><input style={inp} value={form.trainee_name} onChange={(e) => set({ trainee_name: e.target.value })} placeholder="אופציונלי" /></Field>
      </div>
      <Field label="מקור">
        <ChipRow options={SOURCE_CHIPS} value={form.source}
          onPick={(k) => set({ source: k, source_sub: '', source_sub_text: '', ...(k === 'אחר' ? {} : { source_other: '' }) })} wrap />
      </Field>
      {/* Source sub-detail (optional — never blocks Next) */}
      {form.source === 'אחר' && (
        <input style={inp} value={form.source_other} onChange={(e) => set({ source_other: e.target.value })} placeholder="מאיפה הגיע/ה?" />
      )}
      {(form.source === 'פלייר' || form.source === 'דף נחיתה') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
          <ChipRow small options={FLYER_SUB_CHIPS} value={form.source_sub}
            onPick={(k) => set({ source_sub: k, ...(k === 'אחר' ? {} : { source_sub_text: '' }) })} wrap />
          {form.source_sub === 'אחר' && (
            <input style={inp} value={form.source_sub_text} onChange={(e) => set({ source_sub_text: e.target.value })} placeholder={`איזה ${form.source}?`} />
          )}
        </div>
      )}
      {form.source === 'המלצה' && (
        <input style={inp} value={form.source_sub_text} onChange={(e) => set({ source_sub_text: e.target.value })} placeholder="ממי?" />
      )}
      {form.source === 'אינסטגרם' && (
        <ChipRow small options={INSTAGRAM_SUB_CHIPS} value={form.source_sub} onPick={(k) => set({ source_sub: k })} wrap />
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
      {/* Persona picker — drives the tailored sales phrases from here on.
          Single-select, persists on the lead (persona column). */}
      <Field label="פרסונה (בחר/י אחת)">
        <ChipRow options={LEAD_PERSONAS} value={form.persona} onPick={(k) => set({ persona: form.persona === k ? '' : k })} wrap />
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
      <ScriptBox>ניסית בעבר איזושהי מסגרת — חדר כושר, סטודיו, מאמן? ומה היה חסר לך שם?</ScriptBox>
      <Field label="מסגרת בעבר">
        <ChipRow options={PAST_FRAMEWORK_CHIPS} value={form.past_framework} onPick={(k) => set({ past_framework: k })} wrap />
      </Field>
      <Field label="מה לא עבד שם">
        <textarea style={{ ...inp, height: 'auto' }} rows={2} value={form.past_framework_gap} onChange={(e) => set({ past_framework_gap: e.target.value })} placeholder="מה לא עבד שם — במילים שלו..." />
      </Field>
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
      <ScriptBox label="מה להגיד">שיקוף — קרא/י ללקוח, וערוך/כי לפי הצורך:</ScriptBox>
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

  // Dual path: personal → 350₪ paid diagnostic (unchanged); every other
  // track → the 49₪ digital product.
  const isPersonal = form.interested_in === 'personal';
  const amount = isPersonal ? PERSONAL_INTRO_PRICE : INTRO_PRICE;
  const payTitle = isPersonal
    ? `מפגש אבחון אישי · ${PERSONAL_INTRO_PRICE} ₪ · מתקזז במלואו בהמשך לליווי`
    : `הדרכה דיגיטלית · ${INTRO_PRICE} ₪ · 7 ימים של תנועה ראשונה`;
  const payScript = isPersonal
    ? 'מפגש אבחון אישי מלא — נבדוק את הגוף, נבנה נקודת פתיחה ותצא/י עם תוכנית. 350 שקלים, והסכום מתקזז במלואו אם ממשיכים לליווי.'
    : PRESCRIPTION_DIGITAL.line;

  const genLink = async () => {
    setPayBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('payment-create', {
        body: {
          amount, // matches the selected path at click time
          // Personal path description unchanged; non-personal = digital product.
          description: isPersonal ? 'מפגש אבחון אישי · AthletiGo' : 'הדרכה דיגיטלית — 7 ימים של תנועה ראשונה',
          trainee_name: form.name || form.trainee_name || '',
          trainee_email: form.email || '',
          trainee_phone: form.phone || '',
          // No 'digital_product' type exists in the payments flow — every
          // caller uses 'single_session', so we keep it here too.
          payment_type: 'single_session',
        },
      });
      if (error) throw error;
      const url = data?.url || data?.checkoutUrl;
      if (!url) throw new Error(data?.error || 'לא התקבל קישור תשלום');
      setPayUrl(url);
      // Generating a digital (non-personal) link means the digital add-on
      // was offered — record it on the lead.
      if (!isPersonal) set({ digital_offered: 'yes' });
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
    const msg = `היי! הנה הקישור לתשלום (${amount} ₪):\n${payUrl}`;
    window.open(waLink(form.phone, msg), '_blank');
  };

  return (
    <div style={col}>
      <ScriptBox>מתי בדרך כלל נוח לך להתאמן — בוקר או ערב?</ScriptBox>
      <Field label="שעה">
        <ChipRow options={HOUR_CHIPS} value={form.meeting_hour} onPick={(k) => set({ meeting_hour: k })} wrap />
      </Field>
      <ScriptBox>ואיזה יום הכי מסתדר השבוע?</ScriptBox>
      <Field label="יום">
        <ChipRow options={DAY_CHIPS} value={form.meeting_day} onPick={(k) => set({ meeting_day: k })} wrap />
      </Field>

      {/* Intro-session payment block — dual pricing by framework */}
      <div style={{ ...CARD_PROMPT, display: 'flex', flexDirection: 'column', gap: GAP }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A' }}>{payTitle}</div>
        <ScriptBox label="מה להגיד">{payScript}</ScriptBox>
        {!payUrl ? (
          <button type="button" onClick={genLink} disabled={payBusy} style={{
            width: '100%', height: 44, borderRadius: 12, border: 'none', cursor: 'pointer',
            background: ORANGE, color: '#fff', fontSize: 14, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: payBusy ? 0.6 : 1,
          }}>
            {payBusy ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
            {isPersonal ? 'יצירת קישור תשלום' : 'יצירת קישור תשלום — 49 ₪'}
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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

      {/* Call-energy read — optional, never blocks the outcome. */}
      <Field label="אנרגיית השיחה">
        <ChipRow options={ENERGY_CHIPS} value={form.call_energy} onPick={(k) => set({ call_energy: k })} wrap />
      </Field>
      {(form.call_energy === 'ירדה באמצע' || form.call_energy === 'ירדה בסוף') && (
        <Field label="איפה ירדה ולמה">
          <textarea style={{ ...inp, height: 'auto' }} rows={2} value={form.energy_drop_note} onChange={(e) => set({ energy_drop_note: e.target.value })} placeholder="איפה ירדה ולמה, לדעתך..." />
        </Field>
      )}

      {/* Referral capture — each becomes a NEW lead on save. */}
      <ReferralSection form={form} set={set} />

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
        <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: GAP }}>
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
    ['מקור', composeSource(form)],
    ['למה עכשיו', form.why_now],
    ['החסם', form.objections],
    ['סוג חסם', form.barrier_type],
    ['רקע', form.background_level],
    ['פירוט רקע', form.sports_experience],
    ['פציעות', form.injury_level],
    ['פירוט פציעות', form.injuries],
    ['חזון', form.fitness_goal],
    ['מסגרת בעבר', form.past_framework],
    ['מה לא עבד', form.past_framework_gap],
    ['מסגרת', (FORMAT_CHIPS.find((x) => x.key === form.interested_in) || {}).label],
    ['מפגש', [form.meeting_day, form.meeting_hour].filter(Boolean).join(' · ')],
    ['אנרגיית שיחה', form.call_energy],
    ['ירידת אנרגיה', form.energy_drop_note],
    ['שיקוף', form.conversation_summary],
    ['מעקב הבא', form.next_follow_up ? String(form.next_follow_up).slice(0, 10) : ''],
    ['הערות', form.notes],
  ].filter(([, v]) => v != null && String(v).trim() !== '');

  return (
    <div style={col}>
      <div style={{ fontSize: 18, fontWeight: 900, color: '#16a34a', textAlign: 'center', padding: '6px 0' }}>✓ הליד נשמר</div>
      <div style={{ ...CARD }}>
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

// Sales-support phrases for a step = general + (if a persona is chosen)
// that persona's phrases for the step.
function salesPhrasesFor(step, persona) {
  const cfg = SALES_SUPPORT_BY_STEP[step];
  if (!cfg) return [];
  const out = [...(cfg.general || [])];
  if (persona && cfg.byPersona && cfg.byPersona[persona]) out.push(...cfg.byPersona[persona]);
  return out;
}

// Quiet-by-default carousel: fold every 'guide' card INTO the preceding
// speak/confirm card as a small muted hint line (they no longer stand
// alone). A step that has ONLY guide content keeps one compact card so
// the guidance isn't lost. Phrase CONTENT is untouched — guide text is
// just re-hosted as a `_hints` line on the neighbouring card.
const isGuideCard = (p) => p.type === 'guide' || !p.line;
function buildDisplayCards(phrases) {
  if (!phrases.length) return [];
  if (phrases.every(isGuideCard)) {
    // Only-guide step → one compact card combining the guide text.
    const note = phrases.map((p) => p.note || p.line || '').filter(Boolean).join('\n');
    return [{ type: 'guide', note }];
  }
  const out = [];
  let pending = []; // leading guides before any speak/confirm card
  for (const p of phrases) {
    if (isGuideCard(p)) {
      const text = p.note || p.line || '';
      if (!text) continue;
      if (out.length) out[out.length - 1]._hints = [...(out[out.length - 1]._hints || []), text];
      else pending.push(text);
    } else {
      out.push({ ...p, _hints: pending.slice() });
      pending = [];
    }
  }
  return out;
}

// Card colour language (3 types). RTL: 4px accent bar on the right,
// radius only on the left corners. Lumen-ish hex where no token exists.
const SALES_CARD_STYLE = {
  speak:   { bg: '#FAECE7', border: '#F0997B', accent: '#D85A30', tag: '🎤 להקריא',              tagColor: '#993C1D', lineColor: '#4A1B0C', lineWeight: 500, noteColor: '#993C1D', dot: '#D85A30' },
  confirm: { bg: '#EAF3DE', border: '#97C459', accent: '#639922', tag: '✓ שאלת אישור — לאסוף כן', tagColor: '#3B6D11', lineColor: '#173404', lineWeight: 600, noteColor: '#3B6D11', dot: '#639922' },
  guide:   { bg: 'var(--ag-bg, #FBF3EA)', border: '#E0DCD3', accent: '#888780', tag: 'הנחיה — לא להקריא', tagColor: '#7A756B', lineColor: '#7A756B', lineWeight: 500, noteColor: '#7A756B', dot: '#888780' },
};

function PhraseCard({ p, index, total, srcLabel, stacked }) {
  const s = SALES_CARD_STYLE[p.type] || SALES_CARD_STYLE.speak;
  const isGuide = p.type === 'guide' || !p.line;
  return (
    <div style={{
      flex: stacked ? '0 0 auto' : '0 0 88%',
      width: stacked ? '100%' : undefined,
      scrollSnapAlign: stacked ? undefined : 'start',
      boxSizing: 'border-box',
      background: s.bg,
      border: `0.5px solid ${s.border}`,
      borderRight: `4px solid ${s.accent}`,
      borderTopLeftRadius: 12, borderBottomLeftRadius: 12,
      borderTopRightRadius: 0, borderBottomRightRadius: 0,
      padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, fontSize: 11, fontWeight: 800, color: s.tagColor }}>{s.tag}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: s.tagColor, opacity: 0.75 }}>{index + 1} מתוך {total}</span>
      </div>
      {isGuide ? (
        <div style={{ fontSize: 13.5, fontStyle: 'italic', color: s.lineColor, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {p.note || p.line || ''}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 17, fontWeight: s.lineWeight, color: s.lineColor, lineHeight: 1.5, whiteSpace: 'pre-wrap', userSelect: 'text' }}>
            {(p.line || '').replace(/\{source\}/g, srcLabel || 'הפרסום')}
          </div>
          {p.note && (
            <div style={{ fontSize: 11.5, fontStyle: 'italic', color: s.noteColor, lineHeight: 1.45 }}>💡 {p.note}</div>
          )}
        </>
      )}
      {/* Folded-in guide cards — small muted hint lines below the note. */}
      {Array.isArray(p._hints) && p._hints.map((h, hi) => (
        <div key={hi} style={{ fontSize: 11, fontStyle: 'italic', color: '#7A756B', lineHeight: 1.4 }}>· {h}</div>
      ))}
    </div>
  );
}

// Collapsible "משפטי עזר לשלב" — an effortless swipe carousel for live
// calls: peek + scroll-snap, dots (coloured by card type), a "N מתוך N"
// tag per card, and a 500ms long-press to toggle "מבט־על" (stacked
// list). Native touch scroll only — no arrows, no nav click handlers.
function SalesPanel({ step, persona, srcLabel, open, onToggle }) {
  const phrases = salesPhrasesFor(step, persona);
  const cards = buildDisplayCards(phrases); // guide cards folded into neighbours
  const scrollRef = useRef(null);
  const lpTimer = useRef(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [overview, setOverview] = useState(false);

  // Reset the carousel to the first card on every step change.
  useEffect(() => {
    setActiveIdx(0);
    setOverview(false);
    const el = scrollRef.current;
    if (el) el.scrollLeft = 0;
  }, [step]);

  if (cards.length === 0) return null;

  // Active card = the one whose right edge (RTL start) is nearest the
  // container's right edge. RTL-safe regardless of scrollLeft sign.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const cont = el.getBoundingClientRect();
    let best = 0, bestDist = Infinity;
    Array.from(el.children).forEach((c, i) => {
      const dist = Math.abs(c.getBoundingClientRect().right - cont.right);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    setActiveIdx(best);
  };

  const startLP = () => { clearTimeout(lpTimer.current); lpTimer.current = setTimeout(() => setOverview((v) => !v), 500); };
  const cancelLP = () => clearTimeout(lpTimer.current);

  return (
    <div dir="rtl" style={{
      background: '#FFFFFF', border: `2px solid ${ORANGE}`, borderRadius: 14,
      marginBottom: GAP, overflow: 'hidden',
    }}>
      <button type="button" onClick={onToggle} style={{
        width: '100%', textAlign: 'right', border: 'none', cursor: 'pointer',
        background: 'transparent', padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: '#FF6F20' }}>משפטי עזר ({cards.length})</span>
        <span style={{ fontSize: 13, color: '#FF6F20', fontWeight: 800, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>⌄</span>
      </button>
      {open && (
        <div
          onPointerDown={startLP}
          onPointerUp={cancelLP}
          onPointerMove={cancelLP}
          onPointerCancel={cancelLP}
          onPointerLeave={cancelLP}
          style={{ padding: '0 12px 12px' }}
        >
          <style>{`.sales-carousel::-webkit-scrollbar{display:none}`}</style>
          {/* Reminder (step 1 only) + overview toggle chip. On later
              steps only the toggle chip remains (right-aligned). */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 8px' }}>
            <div style={{ flex: 1, fontSize: 11, fontStyle: 'italic', color: '#9A8F82', lineHeight: 1.45 }}>
              {step === 1 ? 'פחות לדבר, יותר לשאול — תן לליד לדבר' : ''}
            </div>
            <button type="button" onClick={() => setOverview((v) => !v)} style={{
              flexShrink: 0, border: '1px solid #F0E4D0', background: '#fff', color: '#5C4A3A',
              borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>{overview ? 'קרוסלה' : 'מבט־על'}</button>
          </div>

          {overview ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cards.map((p, i) => (
                <PhraseCard key={i} p={p} index={i} total={cards.length} srcLabel={srcLabel} stacked />
              ))}
            </div>
          ) : (
            <>
              <div ref={scrollRef} onScroll={onScroll} className="sales-carousel" style={{
                display: 'flex', gap: 8, overflowX: 'auto', scrollSnapType: 'x mandatory',
                WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', paddingBottom: 2,
              }}>
                {cards.map((p, i) => (
                  <PhraseCard key={i} p={p} index={i} total={cards.length} srcLabel={srcLabel} />
                ))}
              </div>
              {/* Dots — coloured by each card's type; active dot elongated. */}
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 8 }}>
                {cards.map((p, i) => {
                  const s = SALES_CARD_STYLE[p.type] || SALES_CARD_STYLE.speak;
                  const active = i === activeIdx;
                  return <div key={i} style={{ width: active ? 18 : 7, height: 7, borderRadius: 999, background: active ? s.dot : '#E0D6C7', transition: 'all .2s' }} />;
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// A 'speak'-styled block (color language) for the prescription card's
// composed line + the digital add-on.
function SpeakBlock({ tagSuffix, line, note }) {
  const s = SALES_CARD_STYLE.speak;
  return (
    <div style={{
      background: s.bg, border: `0.5px solid ${s.border}`, borderRight: `4px solid ${s.accent}`,
      borderTopLeftRadius: 12, borderBottomLeftRadius: 12, padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: s.tagColor }}>{s.tag}{tagSuffix || ''}</span>
      <div style={{ fontSize: 17, fontWeight: s.lineWeight, color: s.lineColor, lineHeight: 1.5, whiteSpace: 'pre-wrap', userSelect: 'text' }}>{line}</div>
      {note && <div style={{ fontSize: 11.5, fontStyle: 'italic', color: s.noteColor, lineHeight: 1.45 }}>💡 {note}</div>}
    </div>
  );
}

// Prescription card (offer step) — pick one of the four-offer ladder
// options and read the composed line aloud; a fixed digital add-on
// shown to everyone with a "הוצעה?" checkbox. Persists
// recommended_track (offer key) + digital_offered ('yes').
function PrescriptionCard({ form, set }) {
  const track = form.recommended_track;
  const composed = PRESCRIPTION_LINES[track];
  const digitalOn = form.digital_offered === 'yes';
  return (
    <div dir="rtl" style={{
      ...CARD_PROMPT, marginBottom: GAP, display: 'flex', flexDirection: 'column', gap: GAP,
    }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#FF6F20' }}>בניית המלצה</div>
      <Field label="מסלול מומלץ">
        <ChipRow options={PRESCRIPTION_TRACKS} value={track}
          onPick={(k) => set({ recommended_track: track === k ? '' : k })} wrap />
      </Field>
      {composed && (
        <SpeakBlock line={composed} note="להוסיף את הסיבה במילים של הליד עצמו" />
      )}

      {/* Digital add-on — compact, folded into this card (was a full
          always-open speak block). Content (line + note) unchanged. */}
      <div style={{ border: '1px solid #F0E4D0', background: '#FBF3EA', borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ flex: 1, fontSize: 11.5, fontWeight: 800, color: '#7A756B' }}>תוספת דיגיטלית · {INTRO_PRICE} ₪</span>
          <button type="button" onClick={() => set({ digital_offered: digitalOn ? '' : 'yes' })} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
          }}>
            <span style={{
              width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: digitalOn ? 'none' : '2px solid #D9CDBB', background: digitalOn ? '#639922' : '#fff', color: '#fff', fontSize: 12, fontWeight: 800,
            }}>{digitalOn ? '✓' : ''}</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#4A1B0C' }}>הוצעה?</span>
          </button>
        </div>
        <div style={{ fontSize: 12.5, color: '#4A1B0C', lineHeight: 1.45, whiteSpace: 'pre-wrap', userSelect: 'text' }}>{PRESCRIPTION_DIGITAL.line}</div>
        {PRESCRIPTION_DIGITAL.note && <div style={{ fontSize: 11, fontStyle: 'italic', color: '#7A756B', lineHeight: 1.4 }}>💡 {PRESCRIPTION_DIGITAL.note}</div>}
      </div>
    </div>
  );
}

// Referral capture (closing step) — name + phone, add to a chip list.
// The list lives on form.referrals; each entry becomes a new lead on
// save (see createReferralLeads).
function ReferralSection({ form, set }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const list = Array.isArray(form.referrals) ? form.referrals : [];
  const add = () => {
    const n = name.trim();
    if (!n) return;
    set({ referrals: [...list, { name: n, phone: phone.trim() }] });
    setName(''); setPhone('');
  };
  const remove = (i) => set({ referrals: list.filter((_, idx) => idx !== i) });
  return (
    <div dir="rtl" style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: GAP }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1A1A' }}>הפניות</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input style={{ ...inp, flex: 2 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="שם" />
        <input style={{ ...inp, flex: 2, direction: 'ltr', textAlign: 'left' }} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="טלפון" />
        <button type="button" onClick={add} style={{
          flexShrink: 0, minWidth: 44, borderRadius: 10, border: 'none', cursor: 'pointer',
          background: ORANGE, color: '#fff', fontSize: 20, fontWeight: 800,
        }}>+</button>
      </div>
      {list.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {list.map((r, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
              background: '#F7F3EC', border: '1px solid #F0E4D0', color: '#5C4A3A',
              borderRadius: 999, padding: '4px 6px 4px 10px',
            }}>
              {r.name}{r.phone ? ` · ${r.phone}` : ''}
              <button type="button" onClick={() => remove(i)} aria-label="הסר" style={{
                border: 'none', background: 'transparent', cursor: 'pointer', color: '#9A8F82', fontSize: 15, lineHeight: 1, padding: 0,
              }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Script box — the shared "say / ask this" pattern for the wizard.
// White card with an orange border so it stands out from the cream page.
function ScriptBox({ children, label = 'מה לשאול' }) {
  return (
    <div dir="rtl" style={{ ...CARD_PROMPT }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#FF6F20', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: '#1a1a1a', whiteSpace: 'pre-wrap' }}>{children}</div>
    </div>
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

function ChipRow({ options, value, onPick, wrap, small }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: wrap ? 'wrap' : 'nowrap', overflowX: wrap ? 'visible' : 'auto', scrollbarWidth: 'none' }}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button key={o.key} type="button" onClick={() => onPick(o.key)} style={{
            minHeight: small ? 30 : 36, padding: small ? '0 10px' : '0 13px', borderRadius: 999, cursor: 'pointer', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: active ? `2px solid ${ORANGE}` : '1px solid #F0E4D0',
            background: active ? ORANGE : '#fff', color: active ? '#fff' : '#3a3a3a',
            fontSize: small ? 12 : 13, fontWeight: 600, whiteSpace: 'nowrap',
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

// ── Unified grid tokens (symmetry pass) ──────────────────────────────
// GAP is the single vertical rhythm between blocks on every step.
// CARD (neutral) / CARD_PROMPT (orange-branded) share one geometry —
// same radius + padding — so every card feels built on the same grid.
const GAP = 12;
const CARD = { background: '#FFFFFF', border: '1px solid #F0E4D0', borderRadius: 14, padding: 14 };
const CARD_PROMPT = { background: '#FFFFFF', border: `2px solid ${ORANGE}`, borderRadius: 14, padding: 14 };
const col = { display: 'flex', flexDirection: 'column', gap: GAP };
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
