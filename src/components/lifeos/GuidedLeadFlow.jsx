import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  LEAD_SOURCE_CHIPS, SPORTS_EXPERIENCE, LADDER_MATCHES, ladderForExperience,
  LADDER_CORE_MESSAGES, LADDER_CONTENT, LADDER_EQUIPMENT, LADDER_COURSE_OPTIONS,
  LEAD_CLOSE_RESULTS, statusForCloseResult,
} from '@/lib/lifeos/lifeos-constants';
import { addLead, updateLead } from '@/lib/lifeos/lifeos-api';
import { waLink } from '@/lib/lifeos/lead-helpers';

const ORANGE = '#FF6F20';
const TOTAL_STEPS = 6;
const STEP_TITLES = ['היכרות', 'הבנת הצורך', 'ההתאמה', 'ההצעה', 'התנגדויות', 'סיכום'];

const todayISO = () => new Date().toISOString().slice(0, 10);

const blankForm = () => ({
  name: '', phone: '', email: '', age: '', source: 'instagram',
  sports_experience: '', current_training: '', fitness_goal: '', fear_barrier: '',
  ladder_match: '',
  session_price: '', package_sessions: '', package_price: '',
  offered_discount: false, discount_deadline: '', family_deal: false,
  equipment: [], course: '',
  objections: '', close_result: '',
  conversation_summary: '', next_follow_up: '', notes: '',
  content_sent: [],
});

function fromLead(lead) {
  if (!lead) return blankForm();
  return {
    ...blankForm(),
    name: lead.name || '', phone: lead.phone || '', email: lead.email || '',
    age: lead.age ? String(lead.age) : '', source: lead.source || 'instagram',
    sports_experience: lead.sports_experience || '',
    current_training: lead.current_training || '', fitness_goal: lead.fitness_goal || '',
    fear_barrier: lead.fear_barrier || '', ladder_match: lead.ladder_match || '',
    session_price: lead.session_price != null ? String(lead.session_price) : '',
    package_sessions: lead.package_sessions != null ? String(lead.package_sessions) : '',
    package_price: lead.package_price != null ? String(lead.package_price) : '',
    offered_discount: !!lead.offered_discount, discount_deadline: lead.discount_deadline || '',
    objections: lead.objections || '', close_result: lead.close_result || '',
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

  // ── Persist current state. isFinal adds the status/revenue mapping. ──
  const buildPayload = (isFinal) => {
    const num = (v) => (v === '' || v == null ? null : Number(v));
    const advancedTotal = form.equipment.reduce((s, k) => {
      const e = LADDER_EQUIPMENT.find((x) => x.key === k); return s + (e ? e.price : 0);
    }, 0);
    const basePrice = ladder === 'advanced' ? advancedTotal : num(form.package_price);
    const discounted = (basePrice || 0) - (form.offered_discount ? 50 : 0);

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      age: form.age ? parseInt(form.age, 10) : null,
      source: form.source || null,
      sports_experience: form.sports_experience || null,
      current_training: form.current_training || null,
      fitness_goal: form.fitness_goal || null,
      fear_barrier: form.fear_barrier || null,
      ladder_match: ladder || null,
      session_price: num(form.session_price),
      package_sessions: num(form.package_sessions),
      package_price: ladder === 'advanced' ? (advancedTotal || null) : num(form.package_price),
      offered_discount: !!form.offered_discount,
      // Plain date (today) — valid for both `date` and `timestamp`
      // columns. A type mismatch here would block the whole save.
      discount_deadline: form.offered_discount ? (String(form.discount_deadline).slice(0, 10) || todayISO()) : null,
      objections: form.objections || null,
      close_result: form.close_result || null,
      conversation_summary: form.conversation_summary || null,
      next_follow_up: form.next_follow_up || null,
      notes: form.notes || null,
      content_sent: form.content_sent,
      last_contact_date: new Date().toISOString(),
    };
    // Derive interested_in so the legacy list/score + income sync stay useful.
    if (ladder === 'advanced') {
      payload.interested_in = form.equipment.includes('dream_machine') ? 'dream_machine'
        : form.course ? 'course' : (form.equipment[0] || 'other');
    } else if (ladder === '3month') {
      payload.interested_in = 'online_coaching';
    } else {
      payload.interested_in = 'workshop';
    }
    if (isFinal && form.close_result) {
      const st = statusForCloseResult(form.close_result);
      if (st) payload.status = st;
      if (st === 'converted' && (discounted > 0)) payload.revenue_if_converted = discounted;
      if (st === 'converted') payload.converted_at = new Date().toISOString();
    }
    return payload;
  };

  // Save and return the lead id (creating on first save).
  const persist = async (isFinal = false) => {
    const payload = buildPayload(isFinal);
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
      await persist(step === TOTAL_STEPS);
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
        {step === 1 && <Step1 form={form} set={set} />}
        {step === 2 && <Step2 form={form} set={set} />}
        {step === 3 && <Step3 form={form} ladder={ladder} onSend={sendContent} />}
        {step === 4 && <Step4 form={form} set={set} ladder={ladder} />}
        {step === 5 && <Step5 form={form} set={set} />}
        {step === 6 && <Step6 form={form} set={set} />}
      </div>

      {/* Footer nav */}
      <div style={{
        flexShrink: 0, padding: '8px 14px', paddingBottom: 'max(env(safe-area-inset-bottom), 10px)',
        display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid #F0E4D0', background: '#fff',
      }}>
        <button type="button" onClick={next} disabled={busy} style={{
          width: '100%', height: 48, borderRadius: 14, border: 'none', cursor: 'pointer',
          background: ORANGE, color: '#fff', fontSize: 16, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: busy ? 0.6 : 1,
        }}>
          {busy && <Loader2 size={18} className="animate-spin" />}
          {step === TOTAL_STEPS ? 'שמור' : 'הבא →'}
        </button>
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
      <SmartTip>{`🔑 הרושם הראשוני
חייך. הצג את עצמך בשם.
׳היי, אני אוריאל מאתלטיגו. ספר לי קצת על עצמך — מה הביא אותך אלינו?׳
תקשיב. אל תמכור כלום בשלב הזה.`}</SmartTip>
    </div>
  );
}

function Step2({ form, set }) {
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
      <SmartTip small>{`👂 שאלות שפותחות אנשים
׳מה הדבר שהכי מתסכל אותך באימונים — או בזה שאתה לא מתאמן?׳
׳אם הייתי נותן לך שרביט — מה היית רוצה שהגוף שלך ידע לעשות?׳
׳מה ניסית בעבר ולמה הפסקת?׳

אל תציע פתרון עדיין. תן לו לדבר.`}</SmartTip>
    </div>
  );
}

function Step3({ form, ladder, onSend }) {
  const m = LADDER_MATCHES[ladder];
  const content = LADDER_CONTENT[ladder] || [];
  return (
    <div style={col}>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1A1A' }}>ככה אתלטיגו יכול לעזור לך</div>
      <div style={{ background: '#fff', borderRadius: 14, padding: 14, border: `2px solid ${m.color}` }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: m.color, marginBottom: 6 }}>{m.title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: '#3a3a3a', whiteSpace: 'pre-wrap' }}>{m.body}</div>
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 10, background: m.color, color: '#fff', fontSize: 13, fontWeight: 800 }}>
          {m.recommended}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {LADDER_CORE_MESSAGES.map((t, i) => (
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
      <SmartTip small>{`💡 הצגת ההתאמה
קרא את הטקסט בכרטיס — הוא כתוב בדיוק בשביל המצב הזה.
אחרי שהצגת, שאל: ׳איך זה נשמע לך? יש שאלות?׳
אם הוא מתלהב — עבור להצעת מחיר.
אם הוא מהסס — שלח תוכן רלוונטי ותחזור אליו מחר.
אף ליד לא הולך ריק. תמיד יש מוצר שמתאים.`}</SmartTip>
    </div>
  );
}

function Step4({ form, set, ladder }) {
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

      <SmartTip small>{`💡 סדר הצגת המחיר
1. קודם הערך: ׳הנה מה כלול...׳
2. אחר כך הסיפור: ׳אנשים שהתחילו ככה הגיעו ל...׳
3. רק אז המחיר.
4. אם מהסס: ׳אני נותן 50₪ הנחה למי שמתחיל היום.׳
אם לא סוגר ליווי — תמיד הצע מוצר פריצה ב-49₪. אף שיחה לא נגמרת בלי הצעה.`}</SmartTip>
    </div>
  );
}

function Step5({ form, set }) {
  return (
    <div style={col}>
      <Field label="התנגדויות">
        <textarea style={{ ...inp, height: 'auto' }} rows={3} value={form.objections} onChange={(e) => set({ objections: e.target.value })} placeholder="מה עצר אותו מלסגור..." />
      </Field>
      <Field label="תוצאת סגירה">
        <ChipRow options={LEAD_CLOSE_RESULTS} value={form.close_result} onPick={(k) => set({ close_result: k })} wrap colored />
      </Field>
      <SmartTip small>{`🛡️ התנגדויות ותגובות
׳יקר לי׳ → ׳X מפגשים יוצא Y למפגש — פחות מחדר כושר, ותוכנית בדיוק בשבילך.׳ ואם עדיין: ׳יש 49₪ — 7 ימים לטעום את השיטה, בלי התחייבות.׳
׳אני צריך לחשוב׳ → ׳מה הכי חשוב לך לבדוק?׳ + שלח תוכן ופולואפ מחר.
׳לא בטוח שזה בשבילי׳ → ׳בדיוק בשביל זה יש 7 ימים — 49₪, בסלון, בלי ציוד.׳
׳אחזור אליך׳ → ׳אני שולח לך קליפ קצר שרלוונטי למה שדיברנו.׳`}</SmartTip>
    </div>
  );
}

function Step6({ form, set }) {
  return (
    <div style={col}>
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="מעקב הבא"><input style={inp} type="date" value={form.next_follow_up ? String(form.next_follow_up).slice(0, 10) : ''} onChange={(e) => set({ next_follow_up: e.target.value })} /></Field>
        <Field label="הערות"><input style={inp} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="הערות..." /></Field>
      </div>
      <SmartTip small>{`📝 כתוב כאילו אתה מספר לעצמך בעוד שבוע.
׳דיברתי עם X, בן Y, אף פעם לא התאמן, מפחד להתחיל. הצעתי מוצר פריצה, שלחתי קליפ Z, אמר שיחשוב. פולואפ ביום ראשון.׳`}</SmartTip>
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
const inp = {
  width: '100%', height: 36, padding: '6px 10px', borderRadius: 10,
  border: '1px solid #F0E4D0', background: '#fff', fontSize: 14, color: '#1A1A1A',
  outline: 'none', boxSizing: 'border-box', resize: 'none',
  fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
};
