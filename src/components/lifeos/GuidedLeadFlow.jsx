import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  LEAD_SOURCE_CHIPS, SPORTS_EXPERIENCE, LADDER_MATCHES, ladderForExperience,
  LADDER_CORE_MESSAGES, LADDER_CONTENT, LADDER_EQUIPMENT, LADDER_COURSE_OPTIONS,
  LEAD_CLOSE_RESULTS, LEAD_PAYMENT_METHODS, statusForDetail, closedDetailForLadder, productNameForLadder,
} from '@/lib/lifeos/lifeos-constants';
import { addLead, updateLead } from '@/lib/lifeos/lifeos-api';
import { waLink } from '@/lib/lifeos/lead-helpers';
import { useSalesScripts } from '@/lib/lifeos/sales-scripts-api';

const ORANGE = '#FF6F20';
const TOTAL_STEPS = 8;
const STEP_TITLES = ['היכרות', 'הבנת הצורך', 'שאלות הכן', 'ההתאמה', 'ההצעה', 'התנגדויות', 'סגירה ותשלום', 'סיכום'];

const todayISO = () => new Date().toISOString().slice(0, 10);
const deriveLadder = (f) => f.ladder_match || ladderForExperience(f.sports_experience);

const blankForm = () => ({
  name: '', phone: '', email: '', age: '', source: 'instagram',
  sports_experience: '', current_training: '', fitness_goal: '', fear_barrier: '',
  ladder_match: '',
  yes_answers: [], yes_map: {},
  session_price: '', package_sessions: '', package_price: '',
  offered_discount: false, discount_deadline: '', family_deal: false,
  equipment: [], course: '',
  objections: '', close_result: '',
  payment_method: '', payment_amount: '', product_sold: '', receipt_issued: false,
  lead_status_detail: '',
  conversation_summary: '', next_follow_up: '', notes: '',
  content_sent: [],
});

function fromLead(lead) {
  if (!lead) return blankForm();
  const yesAns = Array.isArray(lead.yes_answers) ? lead.yes_answers : [];
  return {
    ...blankForm(),
    name: lead.name || '', phone: lead.phone || '', email: lead.email || '',
    age: lead.age ? String(lead.age) : '', source: lead.source || 'instagram',
    sports_experience: lead.sports_experience || '',
    current_training: lead.current_training || '', fitness_goal: lead.fitness_goal || '',
    fear_barrier: lead.fear_barrier || '', ladder_match: lead.ladder_match || '',
    yes_answers: yesAns, yes_map: Object.fromEntries(yesAns.map((k) => [k, 'yes'])),
    session_price: lead.session_price != null ? String(lead.session_price) : '',
    package_sessions: lead.package_sessions != null ? String(lead.package_sessions) : '',
    package_price: lead.package_price != null ? String(lead.package_price) : '',
    offered_discount: !!lead.offered_discount, discount_deadline: lead.discount_deadline || '',
    objections: lead.objections || '', close_result: lead.close_result || '',
    payment_method: lead.payment_method || '', payment_amount: lead.payment_amount != null ? String(lead.payment_amount) : '',
    product_sold: lead.product_sold || '', receipt_issued: !!lead.receipt_issued,
    lead_status_detail: lead.lead_status_detail || '',
    conversation_summary: lead.conversation_summary || '',
    next_follow_up: lead.next_follow_up || '', notes: lead.notes || '',
    content_sent: Array.isArray(lead.content_sent) ? lead.content_sent : [],
  };
}

// Full-screen 6-step guided sales flow. Each step is one no-scroll
// screen; advancing auto-saves the lead.
export default function GuidedLeadFlow({ isOpen, onClose, userId, lead, onSaved }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(blankForm());
  const [leadId, setLeadId] = useState(null);
  const [busy, setBusy] = useState(false);
  const sc = useSalesScripts(userId);

  useEffect(() => {
    if (!isOpen) return;
    setForm(fromLead(lead));
    setLeadId(lead?.id || null);
    setStep(1);
  }, [isOpen, lead]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const ladder = useMemo(
    () => form.ladder_match || ladderForExperience(form.sports_experience),
    [form.ladder_match, form.sports_experience],
  );

  if (!isOpen) return null;

  // ── Build the DB payload from a form snapshot. applyStatus maps
  //    lead_status_detail → lead.status (+ income) and is set ONLY by
  //    the step-7 close actions so the converted income sync fires once. ──
  const buildPayload = (f, applyStatus) => {
    const num = (v) => (v === '' || v == null ? null : Number(v));
    const lad = deriveLadder(f);
    const advancedTotal = (f.equipment || []).reduce((s, k) => {
      const e = LADDER_EQUIPMENT.find((x) => x.key === k); return s + (e ? e.price : 0);
    }, 0);

    const payload = {
      name: f.name.trim(),
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
      age: f.age ? parseInt(f.age, 10) : null,
      source: f.source || null,
      sports_experience: f.sports_experience || null,
      current_training: f.current_training || null,
      fitness_goal: f.fitness_goal || null,
      fear_barrier: f.fear_barrier || null,
      ladder_match: lad || null,
      yes_answers: Array.isArray(f.yes_answers) ? f.yes_answers : [],
      session_price: num(f.session_price),
      package_sessions: num(f.package_sessions),
      package_price: lad === 'advanced' ? (advancedTotal || null) : num(f.package_price),
      offered_discount: !!f.offered_discount,
      discount_deadline: f.offered_discount ? (String(f.discount_deadline).slice(0, 10) || todayISO()) : null,
      objections: f.objections || null,
      close_result: f.close_result || null,
      payment_method: f.payment_method || null,
      payment_amount: num(f.payment_amount),
      product_sold: f.product_sold || null,
      receipt_issued: !!f.receipt_issued,
      lead_status_detail: f.lead_status_detail || null,
      conversation_summary: f.conversation_summary || null,
      next_follow_up: f.next_follow_up || null,
      notes: f.notes || null,
      content_sent: f.content_sent,
      last_contact_date: new Date().toISOString(),
    };
    // Derive interested_in so the legacy list/score + income sync stay useful.
    if (lad === 'advanced') {
      payload.interested_in = (f.equipment || []).includes('dream_machine') ? 'dream_machine'
        : f.course ? 'course' : ((f.equipment || [])[0] || 'other');
    } else if (lad === '3month') {
      payload.interested_in = 'online_coaching';
    } else {
      payload.interested_in = 'workshop';
    }
    if (applyStatus && f.lead_status_detail) {
      const st = statusForDetail(f.lead_status_detail);
      if (st) payload.status = st;
      const amount = num(f.payment_amount);
      if (st === 'converted' && amount > 0) {
        payload.revenue_if_converted = amount;
        payload.converted_at = new Date().toISOString();
      }
    }
    return payload;
  };

  // Save and return the lead id (creating on first save).
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
      if (step === TOTAL_STEPS) {
        toast.success(lead ? 'הליד עודכן' : 'הליד נשמר');
        onSaved?.();
        onClose();
      } else {
        setStep((s) => s + 1);
      }
    } catch (e) {
      console.error('[GuidedLeadFlow] save error', e);
      toast.error('שגיאה בשמירה: ' + (e?.message || ''));
    } finally {
      setBusy(false);
    }
  };

  // Step 7 → step 8 with a close/not-close patch. Persists with status
  // mapping applied so a closed deal records income exactly once.
  const finishStep7 = async (patch) => {
    const merged = { ...form, ...patch };
    setForm(merged);
    setBusy(true);
    try {
      await persist(true, merged);
      setStep(8);
    } catch (e) {
      console.error('[GuidedLeadFlow] close save error', e);
      toast.error('שגיאה בשמירה: ' + (e?.message || ''));
    } finally {
      setBusy(false);
    }
  };

  const back = () => setStep((s) => Math.max(1, s - 1));

  // Send a content item over WhatsApp + record it on the lead.
  const sendContent = async (item) => {
    const url = waLink(form.phone, `${item.message}\n${item.url}`);
    window.open(url, '_blank');
    if (form.content_sent.includes(item.label)) return;
    const nextSent = [...form.content_sent, item.label];
    set({ content_sent: nextSent });
    try {
      const id = leadId || await persist(false);
      await updateLead(id, { content_sent: nextSent });
    } catch (e) { console.warn('[GuidedLeadFlow] content_sent save failed', e); }
  };

  return (
    <div dir="rtl" style={{
      position: 'fixed', inset: 0, background: 'var(--cream, #FBF3EA)', zIndex: 1600,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header — close + progress dots + step title */}
      <div style={{
        paddingTop: 'max(env(safe-area-inset-top), 12px)', paddingInline: 14, paddingBottom: 8,
        display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" onClick={onClose} aria-label="סגור" style={iconBtn}>
            <X size={22} color="#5C4A3A" />
          </button>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A' }}>
            {step}/{TOTAL_STEPS} · {STEP_TITLES[step - 1]}
          </div>
          <div style={{ width: 34 }} />
        </div>
        <Dots step={step} />
      </div>

      {/* Step body — compact, single safety scroll if a device is tiny */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '4px 14px 10px' }}>
        {step === 1 && <Step1 form={form} set={set} sc={sc} />}
        {step === 2 && <Step2 form={form} set={set} sc={sc} />}
        {step === 3 && <StepYesLadder form={form} set={set} ladder={ladder} sc={sc} />}
        {step === 4 && <Step3 form={form} ladder={ladder} onSend={sendContent} sc={sc} />}
        {step === 5 && <Step4 form={form} set={set} ladder={ladder} sc={sc} />}
        {step === 6 && <Step5 form={form} set={set} ladder={ladder} sc={sc} />}
        {step === 7 && <StepPayment form={form} set={set} ladder={ladder} sc={sc} busy={busy} onFinish={finishStep7} />}
        {step === 8 && <Step6 form={form} set={set} ladder={ladder} sc={sc} />}
      </div>

      {/* Footer nav */}
      <div style={{
        flexShrink: 0, padding: '8px 14px', paddingBottom: 'max(env(safe-area-inset-bottom), 10px)',
        display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid #F0E4D0', background: '#fff',
      }}>
        {/* Step 7 (payment) drives its own advance via close/not-close. */}
        {step !== 7 && (
          <button type="button" onClick={next} disabled={busy} style={{
            width: '100%', height: 48, borderRadius: 14, border: 'none', cursor: 'pointer',
            background: ORANGE, color: '#fff', fontSize: 16, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: busy ? 0.6 : 1,
          }}>
            {busy && <Loader2 size={18} className="animate-spin" />}
            {step === TOTAL_STEPS ? 'שמור' : 'הבא →'}
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

function Step1({ form, set, sc }) {
  return (
    <div style={col}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="שם *"><input style={inp} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="שם מלא" autoFocus /></Field>
        <Field label="גיל"><input style={inp} type="number" inputMode="numeric" value={form.age} onChange={(e) => set({ age: e.target.value })} placeholder="גיל" /></Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="טלפון"><input style={inp} type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="050-0000000" /></Field>
        <Field label="אימייל"><input style={inp} type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="אופציונלי" /></Field>
      </div>
      <Field label="מקור">
        <ChipRow options={LEAD_SOURCE_CHIPS} value={form.source} onPick={(k) => set({ source: k })} />
      </Field>
      <SmartTip>{sc.getScript('step1_tip', 'first_impression')}</SmartTip>
    </div>
  );
}

function Step2({ form, set, sc }) {
  return (
    <div style={col}>
      <Field label="ניסיון ספורטיבי">
        <ChipRow options={SPORTS_EXPERIENCE} value={form.sports_experience} onPick={(k) => set({ sports_experience: k })} wrap />
      </Field>
      <Field label="מה אתה עושה היום?">
        <textarea style={{ ...inp, height: 'auto' }} rows={2} value={form.current_training} onChange={(e) => set({ current_training: e.target.value })} placeholder="האימון הנוכחי..." />
      </Field>
      <Field label="מה היית רוצה להשיג?">
        <textarea style={{ ...inp, height: 'auto' }} rows={2} value={form.fitness_goal} onChange={(e) => set({ fitness_goal: e.target.value })} placeholder="המטרה..." />
      </Field>
      <Field label="מה עצר אותך עד עכשיו?">
        <textarea style={{ ...inp, height: 'auto' }} rows={2} value={form.fear_barrier} onChange={(e) => set({ fear_barrier: e.target.value })} placeholder="החסם..." />
      </Field>
      <SmartTip small>{sc.getScript('step2_tip', 'deep_listening')}</SmartTip>
    </div>
  );
}

function Step3({ form, ladder, onSend, sc }) {
  const m = LADDER_MATCHES[ladder];
  const content = LADDER_CONTENT[ladder] || [];
  const body = sc.getScript(`pitch_${ladder}`, 'main') || m.body;
  const recommended = sc.getScript(`pitch_${ladder}`, 'recommended') || m.recommended;
  const coreRows = sc.getSection('core_messages');
  const core = coreRows.length ? coreRows.map((r) => `✦ ${r.content}`) : LADDER_CORE_MESSAGES;
  return (
    <div style={col}>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1A1A' }}>ככה אתלטיגו יכול לעזור לך</div>
      <div style={{ background: '#fff', borderRadius: 14, padding: 14, border: `2px solid ${m.color}` }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: m.color, marginBottom: 6 }}>{m.title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: '#3a3a3a', whiteSpace: 'pre-wrap' }}>{body}</div>
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 10, background: m.color, color: '#fff', fontSize: 13, fontWeight: 800, whiteSpace: 'pre-wrap' }}>
          {recommended}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {core.map((t, i) => (
          <div key={i} style={{ fontSize: 12, color: '#9A8F82' }}>{t}</div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1A1A', marginBottom: 6 }}>שלח תוכן רלוונטי</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {content.map((c) => {
            const sent = form.content_sent.includes(c.label);
            return (
              <div key={c.label} style={{
                display: 'flex', alignItems: 'center', gap: 8, background: '#fff',
                borderRadius: 10, padding: '8px 10px', border: '1px solid #F0E4D0',
              }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#3a3a3a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sent ? '✓ ' : ''}{c.label}
                </div>
                <button type="button" onClick={() => onSend(c)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px',
                  borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: sent ? '#E7E0D5' : '#25D366', color: sent ? '#5C4A3A' : '#fff',
                  fontSize: 12, fontWeight: 700,
                }}>
                  <Send size={12} /> {sent ? 'נשלח' : 'שלח בוואטסאפ'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <SmartTip small>{sc.getScript('step3_tip', 'matching')}</SmartTip>
    </div>
  );
}

function Step4({ form, set, ladder, sc }) {
  const m = LADDER_MATCHES[ladder];
  const advancedTotal = form.equipment.reduce((s, k) => {
    const e = LADDER_EQUIPMENT.find((x) => x.key === k); return s + (e ? e.price : 0);
  }, 0);
  const base = ladder === 'advanced' ? advancedTotal : Number(form.package_price || 0);
  const discounted = Math.max(0, base - (form.offered_discount ? 50 : 0));
  const perSession = (Number(form.package_price) && Number(form.package_sessions))
    ? Math.round(Number(form.package_price) / Number(form.package_sessions)) : null;

  const toggleEquip = (k) => set({
    equipment: form.equipment.includes(k) ? form.equipment.filter((x) => x !== k) : [...form.equipment, k],
  });
  const toggleDiscount = () => set({
    offered_discount: !form.offered_discount,
    discount_deadline: !form.offered_discount ? `${todayISO()}T23:59:00` : '',
  });

  return (
    <div style={col}>
      <div style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: m.color, color: '#fff', fontSize: 13, fontWeight: 800 }}>
        {m.title}
      </div>

      {ladder === 'breakthrough' && (
        <>
          <Field label="מחיר מוצר פריצה (₪)">
            <input style={inp} type="number" inputMode="decimal"
              value={form.package_price || (form.family_deal ? '79' : '49')}
              onChange={(e) => set({ package_price: e.target.value })} placeholder="49" />
          </Field>
          <Toggle on={form.family_deal} onClick={() => set({ family_deal: !form.family_deal, package_price: !form.family_deal ? '79' : '49' })}
            label="חבילה משפחתית — 79₪ לשניים" />
        </>
      )}

      {ladder === '3month' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="מחיר למפגש (₪)"><input style={inp} type="number" inputMode="decimal" value={form.session_price} onChange={(e) => set({ session_price: e.target.value })} placeholder="₪" /></Field>
            <Field label="מס׳ מפגשים"><input style={inp} type="number" inputMode="numeric" value={form.package_sessions} onChange={(e) => set({ package_sessions: e.target.value })} placeholder="12" /></Field>
          </div>
          <Field label="מחיר חבילה (₪)"><input style={inp} type="number" inputMode="decimal" value={form.package_price} onChange={(e) => set({ package_price: e.target.value })} placeholder="900" /></Field>
          {perSession != null && <div style={{ fontSize: 12, color: '#9A8F82' }}>≈ {perSession}₪ למפגש</div>}
        </>
      )}

      {ladder === 'advanced' && (
        <>
          <Field label="ציוד">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {LADDER_EQUIPMENT.map((e) => {
                const on = form.equipment.includes(e.key);
                return (
                  <button key={e.key} type="button" onClick={() => toggleEquip(e.key)} style={{
                    padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    border: on ? `2px solid ${ORANGE}` : '1px solid #F0E4D0',
                    background: on ? ORANGE : '#fff', color: on ? '#fff' : '#3a3a3a',
                  }}>{e.label} · {e.price}₪</button>
                );
              })}
            </div>
          </Field>
          <Field label="קורס">
            <select style={inp} value={form.course} onChange={(e) => set({ course: e.target.value })}>
              <option value="">— ללא —</option>
              {LADDER_COURSE_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </>
      )}

      <Toggle on={form.offered_discount} onClick={toggleDiscount} label="הטבת סגירה — 50₪ הנחה אם סוגר היום" />

      <div style={{ background: '#fff', borderRadius: 12, padding: 12, border: '1px solid #F0E4D0', textAlign: 'center' }}>
        {form.offered_discount && base > 0 && (
          <span style={{ fontSize: 14, color: '#9A8F82', textDecoration: 'line-through', marginInlineEnd: 8 }}>{base}₪</span>
        )}
        <span style={{ fontSize: 24, fontWeight: 900, color: ORANGE }}>{discounted || base || 0}₪</span>
      </div>

      <SmartTip small>{sc.getScript('step4_tip', 'pricing')}</SmartTip>
    </div>
  );
}

function Step5({ form, set, ladder, sc }) {
  const objections = sc.getSection(`objections_${ladder}`);
  const [open, setOpen] = useState(null);
  return (
    <div style={col}>
      <Field label="תוצאת סגירה">
        <ChipRow options={LEAD_CLOSE_RESULTS} value={form.close_result} onPick={(k) => set({ close_result: k })} wrap colored />
      </Field>
      <Field label="התנגדויות שעלו">
        <textarea style={{ ...inp, height: 'auto' }} rows={2} value={form.objections} onChange={(e) => set({ objections: e.target.value })} placeholder="מה עצר אותו מלסגור..." />
      </Field>

      {/* Scenario-specific objection scripts for this ladder match. */}
      {objections.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {objections.map((o) => {
            const expanded = open === o.key;
            const title = (o.content || '').split('\n')[0];
            const rest = (o.content || '').split('\n').slice(1).join('\n');
            return (
              <div key={o.id || o.key} style={{ background: '#fff', borderRadius: 12, border: '1px solid #F0E4D0', overflow: 'hidden' }}>
                <button type="button" onClick={() => setOpen(expanded ? null : o.key)} style={{
                  width: '100%', textAlign: 'right', padding: '10px 12px', border: 'none', cursor: 'pointer',
                  background: expanded ? '#FFF8F0' : '#fff', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: '#1A1A1A' }}>{title}</span>
                  <span style={{ fontSize: 12, color: '#FF6F20', fontWeight: 700 }}>{expanded ? '−' : '+'}</span>
                </button>
                {expanded && (
                  <div style={{ padding: '0 12px 12px', fontSize: 13, lineHeight: 1.6, color: '#5C4A3A', whiteSpace: 'pre-wrap' }}>{rest}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <SmartTip small>{sc.getScript('step5_tip', 'general')}</SmartTip>
    </div>
  );
}

function Step6({ form, set, ladder, sc }) {
  const closed = (form.lead_status_detail || '').startsWith('closed');
  const questions = sc.getSection(`yes_ladder_${ladder}`);
  const yesCount = (form.yes_answers || []).length;
  const methodLabel = (LEAD_PAYMENT_METHODS.find((m) => m.key === form.payment_method) || {}).label;
  return (
    <div style={col}>
      {/* Deal outcome summary */}
      {(closed || form.product_sold || form.payment_amount) && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 12, border: '1px solid #F0E4D0' }}>
          {form.product_sold && <SumRow label="מוצר" value={form.product_sold} />}
          {form.payment_amount && <SumRow label="שולם" value={`${form.payment_amount}₪`} />}
          {methodLabel && <SumRow label="אמצעי תשלום" value={methodLabel} />}
          <SumRow label="קבלה" value={form.receipt_issued
            ? <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ הוצאה</span>
            : <span style={{ color: '#dc2626', fontWeight: 800 }}>⚠️ לא הוצאה קבלה!</span>} />
        </div>
      )}

      {questions.length > 0 && (
        <div style={{ fontSize: 13, fontWeight: 700, color: '#5C4A3A' }}>
          ענה כן על {yesCount}/{questions.length} שאלות
        </div>
      )}

      <Field label="סיכום השיחה">
        <textarea style={{ ...inp, height: 'auto' }} rows={4} value={form.conversation_summary} onChange={(e) => set({ conversation_summary: e.target.value })} placeholder="ספר לעצמך מה קרה בשיחה..." />
      </Field>
      {form.content_sent.length > 0 && (
        <Field label="תוכן שנשלח">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {form.content_sent.map((c) => (
              <span key={c} style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: '#E7E0D5', color: '#5C4A3A' }}>✓ {c}</span>
            ))}
          </div>
        </Field>
      )}
      {!closed && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="מעקב הבא"><input style={inp} type="date" value={form.next_follow_up ? String(form.next_follow_up).slice(0, 10) : ''} onChange={(e) => set({ next_follow_up: e.target.value })} /></Field>
          <Field label="הערות"><input style={inp} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="הערות..." /></Field>
        </div>
      )}
      <SmartTip small>{sc.getScript('step6_tip', 'summary')}</SmartTip>
    </div>
  );
}

// ── Step 3: Yes-ladder ──
function StepYesLadder({ form, set, ladder, sc }) {
  const questions = sc.getSection(`yes_ladder_${ladder}`);
  const map = form.yes_map || {};
  const answer = (key, val) => {
    const nm = { ...map, [key]: val };
    const yes = Object.keys(nm).filter((k) => nm[k] === 'yes');
    set({ yes_map: nm, yes_answers: yes });
  };
  const total = questions.length;
  const yesCount = questions.filter((q) => map[q.key] === 'yes').length;
  return (
    <div style={col}>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1A1A' }}>בוא נוודא שאנחנו מבינים אותך</div>
      {questions.map((q) => {
        const a = map[q.key];
        return (
          <div key={q.key} style={{ background: '#fff', borderRadius: 12, padding: 12, border: '1px solid #F0E4D0' }}>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: '#1A1A1A', marginBottom: 8 }}>{q.content}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => answer(q.key, 'yes')} style={{
                flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800,
                border: a === 'yes' ? '2px solid #16a34a' : '1px solid #F0E4D0',
                background: a === 'yes' ? '#16a34a' : '#fff', color: a === 'yes' ? '#fff' : '#16a34a',
              }}>כן ✓</button>
              <button type="button" onClick={() => answer(q.key, 'no')} style={{
                flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 800,
                border: a === 'no' ? '2px solid #9ca3af' : '1px solid #F0E4D0',
                background: a === 'no' ? '#9ca3af' : '#fff', color: a === 'no' ? '#fff' : '#9ca3af',
              }}>לא ✗</button>
            </div>
          </div>
        );
      })}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
        <Ring value={yesCount} total={total} />
        <div style={{ fontSize: 14, fontWeight: 800, color: yesCount >= 3 ? '#16a34a' : '#5C4A3A' }}>
          {yesCount}/{total} שאלות — כן
        </div>
      </div>
    </div>
  );
}

function Ring({ value, total }) {
  const r = 16, c = 2 * Math.PI * r;
  const pct = total ? value / total : 0;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r={r} fill="none" stroke="#E7E0D5" strokeWidth="4" />
      <circle cx="20" cy="20" r={r} fill="none" stroke={value >= 3 ? '#16a34a' : ORANGE} strokeWidth="4"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"
        transform="rotate(-90 20 20)" />
      <text x="20" y="24" textAnchor="middle" fontSize="13" fontWeight="800" fill="#1A1A1A">{value}</text>
    </svg>
  );
}

// ── Step 7: Closing + payment ──
function StepPayment({ form, set, ladder, sc, busy, onFinish }) {
  const num = (v) => (v === '' || v == null ? 0 : Number(v));
  const advancedTotal = (form.equipment || []).reduce((s, k) => {
    const e = LADDER_EQUIPMENT.find((x) => x.key === k); return s + (e ? e.price : 0);
  }, 0);
  const base = ladder === 'advanced' ? advancedTotal : num(form.package_price);
  const discounted = Math.max(0, base - (form.offered_discount ? 50 : 0));
  const productName = form.product_sold || productNameForLadder(ladder, form);

  // Local, NEVER-persisted card fields.
  const [card, setCard] = useState({ number: '', exp: '', cvv: '' });
  const [cashAmount, setCashAmount] = useState(form.payment_amount || String(discounted || ''));
  const [paid, setPaid] = useState(false);

  const method = form.payment_method;
  const pick = (k) => set({ payment_method: k });
  const amount = method === 'cash' ? num(cashAmount) : discounted;

  const bitMsg = (sc.getScript('payment', 'bit_message') || 'AthletiGo — [product]').replace('[product]', productName);
  const bankDetails = sc.getScript('payment', 'bank_details');

  const closeDeal = () => onFinish({
    product_sold: productName,
    payment_amount: amount,
    payment_method: method || null,
    receipt_issued: !!form.receipt_issued,
    lead_status_detail: closedDetailForLadder(ladder, form),
  });
  const notClose = (detail) => onFinish({ lead_status_detail: detail });

  return (
    <div style={col}>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1A1A' }}>סגירת עסקה</div>

      {/* Summary card */}
      <div style={{ background: ORANGE, color: '#fff', borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{productName}</div>
        <div style={{ marginTop: 4 }}>
          {form.offered_discount && base > 0 && (
            <span style={{ fontSize: 14, opacity: 0.8, textDecoration: 'line-through', marginInlineEnd: 8 }}>{base}₪</span>
          )}
          <span style={{ fontSize: 22, fontWeight: 900 }}>{discounted || base || 0}₪</span>
        </div>
      </div>

      {/* Payment method */}
      <ChipRow options={LEAD_PAYMENT_METHODS} value={method} onPick={pick} wrap />

      {method === 'credit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input style={inp} inputMode="numeric" placeholder="מספר כרטיס" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input style={inp} placeholder="תוקף MM/YY" value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} />
            <input style={inp} inputMode="numeric" maxLength={3} placeholder="CVV" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value })} />
          </div>
          <div style={{ fontSize: 12, color: '#9A8F82' }}>הקלד את פרטי הכרטיס תוך כדי שהלקוח מכתיב</div>
        </div>
      )}
      {method === 'bit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" onClick={() => window.open(waLink(form.phone, `${bitMsg}\nסכום: ${amount}₪`), '_blank')} style={greenBtn}>
            <Send size={16} /> שלח בקשת ביט
          </button>
          <Toggle on={paid} onClick={() => setPaid(!paid)} label="הלקוח שילם?" />
        </div>
      )}
      {method === 'cash' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Field label="סכום שהתקבל"><input style={inp} type="number" inputMode="decimal" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} placeholder="₪" /></Field>
          <Toggle on={paid} onClick={() => setPaid(!paid)} label="שולם במלואו?" />
        </div>
      )}
      {method === 'transfer' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ background: '#fff', border: '1px solid #F0E4D0', borderRadius: 10, padding: 10, fontSize: 13, lineHeight: 1.6, color: '#3a3a3a', whiteSpace: 'pre-wrap' }}>{bankDetails}</div>
          <Toggle on={paid} onClick={() => setPaid(!paid)} label="הלקוח העביר?" />
        </div>
      )}

      {/* Receipt */}
      <button type="button" onClick={() => set({ receipt_issued: !form.receipt_issued })} style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
        border: form.receipt_issued ? '2px solid #16a34a' : '1px solid #F0E4D0', background: form.receipt_issued ? '#ECFDF3' : '#fff', textAlign: 'right',
      }}>
        <span style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: form.receipt_issued ? 'none' : '2px solid #D9CDBB', background: form.receipt_issued ? '#16a34a' : '#fff', color: '#fff', fontSize: 14, fontWeight: 800,
        }}>{form.receipt_issued ? '✓' : ''}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>הוצאתי קבלה</div>
          <div style={{ fontSize: 11, color: '#dc2626' }}>חובה להוציא קבלה לכל תשלום</div>
        </div>
      </button>

      <button type="button" onClick={closeDeal} disabled={busy} style={{ ...greenBtn, height: 48, fontSize: 16, background: '#16a34a', opacity: busy ? 0.6 : 1 }}>
        {busy && <Loader2 size={18} className="animate-spin" />} סגור עסקה
      </button>

      <NotClosedSection onPick={notClose} />

      <SmartTip small>{sc.getScript('step7_tip', 'closing')}</SmartTip>
    </div>
  );
}

function NotClosedSection({ onPick }) {
  const [open, setOpen] = useState(false);
  const OPTS = [
    { key: 'thinking', label: 'צריך לחשוב' },
    { key: 'thinking', label: 'יקר' },
    { key: 'thinking', label: 'לא עכשיו' },
    { key: 'refused', label: 'סירוב' },
  ];
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{
        background: 'transparent', border: 'none', cursor: 'pointer', color: '#9A8F82', fontSize: 13, fontWeight: 700,
      }}>הלקוח לא סגר</button>
    );
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {OPTS.map((o) => (
        <button key={o.label} type="button" onClick={() => onPick(o.key)} style={{
          padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700,
          border: '1px solid #F0E4D0', background: '#fff', color: '#3a3a3a',
        }}>{o.label}</button>
      ))}
    </div>
  );
}

function SumRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 13 }}>
      <span style={{ color: '#9A8F82', fontWeight: 700 }}>{label}</span>
      <span style={{ color: '#1A1A1A', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// ─── Building blocks ────────────────────────────────────────────────

function Dots({ step }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
        const n = i + 1;
        const filled = n < step, current = n === step;
        return (
          <div key={i} style={{
            width: current ? 20 : 8, height: 8, borderRadius: 999,
            background: filled || current ? ORANGE : '#E7E0D5',
            transition: 'all .2s',
          }} />
        );
      })}
    </div>
  );
}

function SmartTip({ children, small }) {
  return (
    <div dir="rtl" style={{
      background: '#FFF8F0', borderRight: '3px solid #FF6F20', borderRadius: 12,
      padding: '12px 14px', fontSize: small ? 12 : 13, lineHeight: 1.6,
      color: '#5C4A3A', margin: '8px 0', whiteSpace: 'pre-wrap',
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

function ChipRow({ options, value, onPick, wrap, colored }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: wrap ? 'wrap' : 'nowrap', overflowX: wrap ? 'visible' : 'auto', scrollbarWidth: 'none' }}>
      {options.map((o) => {
        const active = value === o.key;
        const c = colored && o.color ? o.color : ORANGE;
        return (
          <button key={o.key} type="button" onClick={() => onPick(o.key)} style={{
            padding: '6px 12px', borderRadius: 8, cursor: 'pointer', flexShrink: 0,
            border: active ? `2px solid ${c}` : '1px solid #F0E4D0',
            background: active ? c : '#fff', color: active ? '#fff' : '#3a3a3a',
            fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

function Toggle({ on, onClick, label }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
      padding: '10px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'right',
      border: on ? `2px solid ${ORANGE}` : '1px solid #F0E4D0',
      background: on ? '#FFF0E4' : '#fff',
    }}>
      <span style={{
        width: 40, height: 24, borderRadius: 999, flexShrink: 0, position: 'relative',
        background: on ? ORANGE : '#D9CDBB', transition: 'background .2s',
      }}>
        <span style={{
          position: 'absolute', top: 2, insetInlineStart: on ? 18 : 2, width: 20, height: 20,
          borderRadius: 999, background: '#fff', transition: 'inset-inline-start .2s',
        }} />
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#3a3a3a' }}>{label}</span>
    </button>
  );
}

const col = { display: 'flex', flexDirection: 'column', gap: 10 };
const iconBtn = { background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, display: 'flex' };
const greenBtn = {
  width: '100%', height: 44, borderRadius: 12, border: 'none', cursor: 'pointer',
  background: '#25D366', color: '#fff', fontSize: 14, fontWeight: 800,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
};
const inp = {
  width: '100%', height: 36, padding: '6px 10px', borderRadius: 10,
  border: '1px solid #F0E4D0', background: '#fff', fontSize: 14, color: '#1A1A1A',
  outline: 'none', boxSizing: 'border-box', resize: 'none',
  fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
};
