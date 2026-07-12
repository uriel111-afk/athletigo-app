import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2, Copy, Check, MessageCircle, Flag } from 'lucide-react';
import { toast } from 'sonner';
import { addLead, updateLead, addInteraction } from '@/lib/lifeos/lifeos-api';
import { isoInDays, waLink, normalizePhone } from '@/lib/lifeos/lead-helpers';
import { statusForDetail } from '@/lib/lifeos/lifeos-constants';
import { SERVICE_LABEL, FORWHOM_LABEL } from '@/components/lifeos/QuickIntakeForm';
import FollowupChips from '@/components/lifeos/FollowupChips';
import {
  NEED_PERSONAS, NEEDS_BY_PERSONA, buildNeedResponse, smartNextStep,
  HESITATION_REASONS, hesitationResponse,
} from '@/lib/lifeos/need-response-bank';
import {
  groupPricing, monthlyFrame, offerSentence, compareOffer, nis, PRIVATE_PRICES,
} from '@/lib/lifeos/pricing-engine';
import {
  ROLE_TO_PERSONA, activityGoalsFor, diagnosisFor, selfIntroScript,
  PRESENT_LADDER_LINE, tracksFor, valueIncludesFor, CLOSE_INCENTIVES,
  COMPARE_RESPONSE, APPROACH_FLAG, ASK_NOW, fitSuggest, buildMirror,
  OPEN_SCRIPT, PHONE_GATE_LINE,
  BACKGROUND_CHIPS, INJURY_CHIPS, backgroundCopy, backgroundFocus,
} from '@/lib/lifeos/sales-playbook';

const ORANGE = '#FF6F20';

// Chip option lists — service / for-whom reuse the label maps from the
// quick form as the single source of truth (same keys, same order).
const SERVICE_TYPES = Object.entries(SERVICE_LABEL).map(([key, label]) => ({ key, label }));
const FOR_WHOM = Object.entries(FORWHOM_LABEL).map(([key, label]) => ({ key, label }));
const ROLE_CHIPS = ['פונה לעצמו', 'הורה', 'מארגן קבוצה', 'רכז/ת', 'מנהל/ת', 'אחר'];
const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'שבת'];
const HOURS = ['בוקר', 'צהריים', 'אחר הצהריים', 'ערב'];
const START_OPTS = [{ key: 'asap', label: 'בהקדם' }, { key: 'next_month', label: 'חודש הבא' }];
const SCHEDULED = ['personal', 'group', 'online', 'movement65'];

// Lead-type classification (mirrors the quick form's deriveLeadType).
const deriveLeadType = (f) => {
  if (f.for_whom === 'org') return 'business';
  if (f.for_whom === 'group' || ['group', 'workshop', 'movement65'].includes(f.service_type)) return 'group';
  if (f.for_whom || f.service_type) return 'private';
  return '';
};
const groupishOf = (f) => f.service_type === 'group' || (!f.service_type && f.for_whom === 'group') || f.for_whom === 'org';

// People in the (primary) group — sum of the groups editor, else group_size.
const groupSizeNum = (f) => {
  const gd = (f.groups || []).filter((g) => (g.size || '').trim());
  if (gd.length) { const sum = gd.reduce((s, g) => s + (parseInt(g.size, 10) || 0), 0); if (sum > 0) return sum; }
  const n = parseInt(f.group_size, 10);
  return Number.isFinite(n) && n > 0 ? n : '';
};

// ── Adaptive step map: canonical order, irrelevant steps are hidden.
const STEP_DEFS = [
  { id: 'open',     title: 'פתיחה',    show: () => true },
  { id: 'who',      title: 'מי מדבר',  show: () => true },
  { id: 'what',     title: 'מה מחפשים', show: () => true },
  { id: 'diagnose', title: 'אבחון',    show: (f) => !!f.service_type || groupishOf(f) },
  { id: 'background', title: 'רקע',    show: (f) => !!f.service_type || groupishOf(f) },
  { id: 'goal',     title: 'מטרה',     show: (f) => !!f.service_type || groupishOf(f) },
  { id: 'mirror',   title: 'שיקוף',    show: () => true },
  { id: 'intro',    title: 'הצגה',     show: () => true },
  { id: 'ladder',   title: 'מסלולים',  show: (f) => !!f.service_type || groupishOf(f) },
  { id: 'offer',    title: 'הצעה',     show: () => true },
  { id: 'summary',  title: 'סיכום',    show: () => true },
];

const blank = () => ({
  name: '', phone: '', source: 'שיחה נכנסת', transcript: '',
  contact_role: '',
  service_type: '', for_whom: '',
  training_location: '', frequency_per_week: '', group_location: '',
  groups: [{ size: '', ages: '' }], workshop_topic: '', target_date: '', main_goal: '',
  payer: '',
  persona: '', need_type: '',
  diagnosis: {},
  background_level: '', sports_experience: '', injury_level: '', injuries: '',
  activity_goals: '',
  preferred_days: '', preferred_hours: '', hours_exact: '', start_date_pref: '', constraints_note: '',
  conversation_summary: '',
  intro_version: 'first',
  recommended_track: '',
  proposed_price: '', close_incentive: '',
  next_step: '', follow_up: isoInDays(1),
  close_result: '', lead_status_detail: '', hesitation_reason: '', call_energy: '',
});

// Inbound-call adaptive generator. Sits alongside the 9-step wizard
// (proactive) and the quick form (silent). Chips are shortcuts — free
// writing in the transcript is always available and never blocks Next.
export default function GuidedIntakeFlow({ isOpen, onClose, userId, lead, onSaved }) {
  const [form, setForm] = useState(blank());
  const [stepId, setStepId] = useState('open');
  const [leadId, setLeadId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [phoneGate, setPhoneGate] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [saved, setSaved] = useState(null);
  const [anim, setAnim] = useState(0);           // bump to replay the fade
  const mirroredRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    const f = fromLead(lead);
    setForm(f);
    setLeadId(lead?.id || null);
    // Fresh inbound call → open at the greeting. Re-entering an existing
    // lead ("המשך שיחה מודרכת") → skip everything already known and land
    // on the first unanswered open question, so a lead captured on ANY
    // path still gets the full leadership (mirror → ladder → offer).
    setStepId(lead?.id ? firstOpenStep(f) : 'open');
    setPhoneGate(false);
    setFlagOpen(false);
    setSaved(null);
    setAnim((a) => a + 1);
    mirroredRef.current = false;
  }, [isOpen, lead]);

  const activeSteps = useMemo(() => STEP_DEFS.filter((d) => d.show(form)), [form]);
  const idx = Math.max(0, activeSteps.findIndex((s) => s.id === stepId));
  const cur = activeSteps[idx] || activeSteps[0];

  // Auto-compose the mirror once, the first time we land on it.
  useEffect(() => {
    if (!isOpen || stepId !== 'mirror' || mirroredRef.current) return;
    if (!(form.conversation_summary || '').trim()) {
      setForm((f) => ({ ...f, conversation_summary: composeMirror(f) }));
    }
    mirroredRef.current = true;
  }, [stepId, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const goTo = (id) => { setStepId(id); setAnim((a) => a + 1); };

  const persist = async (applyStatus = false, f = form) => {
    if (!f.name.trim()) return leadId;               // need a name to create/update
    const payload = buildPayload(f, applyStatus);
    if (leadId) { await updateLead(leadId, payload); return leadId; }
    const created = await addLead(userId, { ...payload, status: payload.status || 'new' });
    setLeadId(created.id);
    return created.id;
  };
  const persistSafe = async (f = form) => {
    try { await persist(false, f); } catch (e) { console.warn('[GuidedIntake] save', e?.message); }
  };

  const goNext = async () => {
    const target = activeSteps[idx + 1];
    if (!target) return;
    // Phone gate — never reach the offer without a number.
    if (target.id === 'offer' && !form.phone.trim()) { setPhoneGate(true); persistSafe(); return; }
    persistSafe();
    goTo(target.id);
  };
  const goBack = () => { const prev = activeSteps[idx - 1]; if (prev) goTo(prev.id); };

  // Role pick → derive the default diagnosis persona, then auto-advance.
  const pickRole = (role) => {
    const persona = ROLE_TO_PERSONA[role] || '';
    setForm((f) => ({ ...f, contact_role: f.contact_role === role ? '' : role, ...(persona ? { persona } : {}) }));
    setTimeout(() => { const t = activeSteps[idx + 1]; if (t) { persistSafe(); goTo(t.id); } }, 170);
  };

  const clearPhoneGate = () => {
    if (!form.phone.trim()) { toast.error('צריך מספר טלפון'); return; }
    setPhoneGate(false); persistSafe(); goTo('offer');
  };

  // Final save (summary outcomes) — validates name + phone.
  const finishOutcome = async (patch) => {
    const merged = { ...form, ...patch };
    if (!merged.name.trim() || !merged.phone.trim()) { toast.error('צריך שם וטלפון כדי לשמור'); return; }
    setForm(merged); setBusy(true);
    try {
      const id = await persist(true, merged);
      if (id) { try { await addInteraction(id, { type: 'שיחה נכנסת', summary: journalSummary(merged) }); } catch (e) { console.warn('[GuidedIntake] interaction', e?.message); } }
      setSaved(merged);
    } catch (e) { toast.error('שגיאה בשמירה: ' + (e?.message || '')); }
    finally { setBusy(false); }
  };
  const handleClose = () => { if (leadId) onSaved?.(); onClose(); };
  const finishAll = () => { onSaved?.(); onClose(); };

  const leadType = deriveLeadType(form);

  return (
    <div dir="rtl" style={{
      position: 'fixed', inset: 0, background: 'var(--cream, #FBF3EA)', zIndex: 1600,
      display: 'flex', flexDirection: 'column', fontFamily: "'Rubik', system-ui, sans-serif",
    }}>
      <style>{`@keyframes agFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>

      {/* ── Header — close · progress · persistent name|phone bar ── */}
      <div style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)', paddingInline: 14, paddingBottom: 8, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" onClick={handleClose} aria-label="סגור" style={iconBtn}><X size={22} color="#5C4A3A" /></button>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A' }}>
            📞 {cur?.title}{!saved ? ` · ${idx + 1}/${activeSteps.length}` : ''}
          </div>
          <button type="button" onClick={() => setFlagOpen((v) => !v)} aria-label="גישה בעייתית" title="דגל גישה בעייתית"
            style={{ ...iconBtn, color: flagOpen ? '#dc2626' : '#B08A6A' }}>
            <Flag size={18} color={flagOpen ? '#dc2626' : '#B08A6A'} />
          </button>
        </div>
        {!saved && <ProgressBar steps={activeSteps} idx={idx} />}
        {/* Persistent top bar — name | phone, editable from any step. */}
        {!saved && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <TopField label="שם" value={form.name} onChange={(v) => set({ name: v })} placeholder="שם המתקשר" />
            <TopField label="טלפון" ltr value={form.phone} onChange={(v) => set({ phone: v })} placeholder="050-0000000" />
          </div>
        )}
        {/* Approach-flag release card — dismissible, any step. */}
        {flagOpen && !saved && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 12, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#dc2626' }}>🚩 משפט שחרור מכובד</div>
            {APPROACH_FLAG.lines.map((l, i) => (
              <div key={i} style={{ fontSize: 14, fontWeight: 700, color: '#7F1D1D', lineHeight: 1.5, userSelect: 'text' }}>{l}</div>
            ))}
            <div style={{ fontSize: 11, fontStyle: 'italic', color: '#B45454' }}>💡 {APPROACH_FLAG.note}</div>
            <button type="button" onClick={() => finishOutcome({ close_result: 'not_now', lead_status_detail: 'refused' })} disabled={busy}
              style={{ marginTop: 2, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', borderRadius: 10, padding: '7px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
              סמן כלא רלוונטי ושמור
            </button>
          </div>
        )}
      </div>

      {/* ── Body — the ONE scroll region (block flow, no inner scroll) ── */}
      <div key={anim} onFocusCapture={(e) => { const t = e.target; setTimeout(() => { try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {} }, 250); }}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '6px 14px 16px', display: 'block', animation: 'agFade .18s ease' }}>

        {saved ? (
          <SavedSummary form={saved} onDone={finishAll} />
        ) : phoneGate ? (
          <PhoneGate form={form} set={set} onContinue={clearPhoneGate} />
        ) : (
          <>
            {/* "שאל עכשיו" — the key open question for this step. */}
            {ASK_NOW[stepId] && (
              <div style={{ fontSize: 12, fontStyle: 'italic', color: '#C2743A', lineHeight: 1.45, padding: '2px 2px 8px' }}>
                🗣 שאל/י עכשיו: {ASK_NOW[stepId]}
              </div>
            )}
            {/* Quiet fit meter — leading service + a worthy alternative. */}
            <FitMeter form={form} />

            {stepId === 'open' && <StepOpen form={form} set={set} />}
            {stepId === 'who' && <StepWho form={form} pickRole={pickRole} />}
            {stepId === 'what' && <StepWhat form={form} set={set} />}
            {stepId === 'diagnose' && <StepDiagnose form={form} set={set} />}
            {stepId === 'background' && <StepBackground form={form} set={set} />}
            {stepId === 'goal' && <StepGoal form={form} set={set} leadType={leadType} />}
            {stepId === 'mirror' && <StepMirror form={form} set={set} />}
            {stepId === 'intro' && <StepIntro form={form} set={set} leadType={leadType} />}
            {stepId === 'ladder' && <StepLadder form={form} set={set} />}
            {stepId === 'offer' && <StepOffer form={form} set={set} leadType={leadType} />}
            {stepId === 'summary' && <StepSummary form={form} set={set} busy={busy} onOutcome={finishOutcome} />}

            {/* Persistent transcript — accumulates across the whole flow,
                auto-grows (no inner scroll), saved to the lead's notes. */}
            <div style={{ marginTop: GAP }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#9A8F82', marginBottom: 4 }}>📝 מה הוא אומר? <span style={{ fontWeight: 600 }}>(מצטבר · נשמר להערות)</span></div>
              <AutoTextarea value={form.transcript} onChange={(v) => set({ transcript: v })}
                placeholder="כתוב/כתבי חופשי כל מה שנאמר — נשמר ומצטבר לאורך כל הזרימה, אפשר לעבור שלב גם בלי צ'יפים" minHeight={92} />
            </div>
          </>
        )}
      </div>

      {/* ── Footer nav ── */}
      {!saved && !phoneGate && (
        <div style={{ flexShrink: 0, padding: '8px 14px', paddingBottom: 'max(env(safe-area-inset-bottom), 10px)', borderTop: '1px solid #F0E4D0', background: '#fff', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {stepId !== 'summary' && (
            <button type="button" onClick={goNext} disabled={busy} style={{
              width: '100%', height: 48, borderRadius: 14, border: 'none', cursor: 'pointer',
              background: ORANGE, color: '#fff', fontSize: 16, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.6 : 1,
            }}>{busy && <Loader2 size={18} className="animate-spin" />} הבא →</button>
          )}
          {idx > 0 && (
            <button type="button" onClick={goBack} disabled={busy} style={{ width: '100%', height: 32, border: 'none', background: 'transparent', cursor: 'pointer', color: '#9A8F82', fontSize: 14, fontWeight: 600 }}>← חזרה</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Steps ──────────────────────────────────────────────────────────

function StepOpen({ form, set }) {
  return (
    <div style={col}>
      <ScriptBox>{OPEN_SCRIPT}</ScriptBox>
      <Field label="מקור">
        <Chips options={['שיחה נכנסת', 'הפניה', 'אחר']} value={form.source} onPick={(v) => set({ source: v })} />
      </Field>
    </div>
  );
}

function StepWho({ form, pickRole }) {
  return (
    <div style={col}>
      <ScriptBox>מי הולך להתאמן — אתה עצמך, מישהו קרוב, או שאתה מארגן קבוצה?</ScriptBox>
      <Field label="תפקיד המתקשר (הקשה מתקדמת אוטומטית)">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: GAP_CHIP }}>
          {ROLE_CHIPS.map((r) => <button key={r} type="button" onClick={() => pickRole(r)} style={chipStyle(form.contact_role === r)}>{r}</button>)}
        </div>
      </Field>
    </div>
  );
}

function StepWhat({ form, set }) {
  const st = form.service_type;
  const groupish = groupishOf(form);
  const payerHere = form.for_whom === 'org' || form.for_whom === 'group';
  const setGroup = (i, patch) => set({ groups: form.groups.map((g, idx) => (idx === i ? { ...g, ...patch } : g)) });
  const addGroup = () => set({ groups: [...form.groups, { size: '', ages: '' }] });
  const removeGroup = (i) => set({ groups: form.groups.length > 1 ? form.groups.filter((_, idx) => idx !== i) : form.groups });
  return (
    <div style={col}>
      <ScriptBox>מה חיפשת — אימון אישי, קבוצה, ליווי אונליין, או משהו אחר?</ScriptBox>
      <Field label="סוג שירות">
        <Chips options={SERVICE_TYPES.map((t) => t.label)} value={SERVICE_LABEL[st]}
          onPick={(lbl) => set({ service_type: SERVICE_TYPES.find((t) => t.label === lbl)?.key })} />
      </Field>

      {st === 'personal' && (<>
        <Field label="מיקום"><Chips options={['הסטודיו שלנו', 'אצל הלקוח', 'אונליין']} value={form.training_location} onPick={(v) => set({ training_location: form.training_location === v ? '' : v })} /></Field>
        <Field label="תדירות בשבוע"><input style={inp} value={form.frequency_per_week} onChange={(e) => set({ frequency_per_week: e.target.value })} placeholder="למשל 2" /></Field>
      </>)}
      {groupish && (<>
        <div>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 800, color: '#C24A0A', marginBottom: GAP_LABEL }}>כמה אנשים?</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {form.groups.map((g, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input style={{ ...inp, flex: 1, minHeight: 56, fontSize: 18, fontWeight: 800, textAlign: 'center' }} inputMode="numeric" value={g.size} onChange={(e) => setGroup(i, { size: e.target.value })} placeholder="מספר אנשים" />
                <input style={{ ...inp, flex: 1 }} value={g.ages} onChange={(e) => setGroup(i, { ages: e.target.value })} placeholder="טווח גילאים" />
                {form.groups.length > 1 && <button type="button" onClick={() => removeGroup(i)} style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 10, border: '1px solid #F0E4D0', background: '#fff', color: '#dc2626', fontSize: 18, cursor: 'pointer' }}>×</button>}
              </div>
            ))}
          </div>
          <button type="button" onClick={addGroup} style={{ marginTop: 8, border: `1px dashed ${ORANGE}`, background: '#FFF7ED', color: '#C24A0A', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ הוסף קבוצה</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: GAP_COL }}>
          <Field label="תדירות בשבוע"><input style={inp} value={form.frequency_per_week} onChange={(e) => set({ frequency_per_week: e.target.value })} placeholder="2" /></Field>
          <Field label="מיקום"><input style={inp} value={form.group_location} onChange={(e) => set({ group_location: e.target.value })} placeholder="איפה" /></Field>
        </div>
      </>)}
      {st === 'online' && (<>
        <Field label="תדירות מפגשי וידאו"><input style={inp} value={form.frequency_per_week} onChange={(e) => set({ frequency_per_week: e.target.value })} placeholder="בשבוע" /></Field>
        <Field label="מטרה עיקרית"><input style={inp} value={form.main_goal} onChange={(e) => set({ main_goal: e.target.value })} placeholder="במשפט קצר" /></Field>
      </>)}
      {st === 'workshop' && (<>
        <Field label="נושא מבוקש"><input style={inp} value={form.workshop_topic} onChange={(e) => set({ workshop_topic: e.target.value })} placeholder="נושא הסדנה" /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: GAP_COL }}>
          <Field label="משתתפים משוער"><input style={inp} value={form.group_size} onChange={(e) => set({ group_size: e.target.value })} placeholder="מספר" /></Field>
          <Field label="תאריך יעד"><input style={inp} type="date" value={form.target_date} onChange={(e) => set({ target_date: e.target.value })} /></Field>
        </div>
      </>)}
      {st === 'movement65' && (<>
        <Field label="מיקום"><input style={inp} value={form.group_location} onChange={(e) => set({ group_location: e.target.value })} placeholder="איפה" /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: GAP_COL }}>
          <Field label="משתתפים משוער"><input style={inp} value={form.group_size} onChange={(e) => set({ group_size: e.target.value })} placeholder="מספר" /></Field>
          <Field label="תדירות בשבוע"><input style={inp} value={form.frequency_per_week} onChange={(e) => set({ frequency_per_week: e.target.value })} placeholder="2" /></Field>
        </div>
      </>)}
      {st === 'other' && <Field label="תיאור השירות"><AutoTextarea value={form.main_goal} onChange={(v) => set({ main_goal: v })} placeholder="איזה שירות הם מבקשים?" minHeight={70} /></Field>}

      <Field label="עבור מי">
        <Chips options={FOR_WHOM.map((t) => t.label)} value={FORWHOM_LABEL[form.for_whom]}
          onPick={(lbl) => set({ for_whom: FOR_WHOM.find((t) => t.label === lbl)?.key })} />
      </Field>
      {payerHere && <Field label="מי מממן"><Chips options={['המשתתפים', 'הארגון', 'ההורה']} value={form.payer} onPick={(v) => set({ payer: form.payer === v ? '' : v })} /></Field>}
    </div>
  );
}

function StepDiagnose({ form, set }) {
  const service = form.service_type || (groupishOf(form) ? 'group' : '');
  const questions = diagnosisFor(service);
  const setDiag = (k, v) => set({ diagnosis: { ...form.diagnosis, [k]: form.diagnosis?.[k] === v ? '' : v } });
  const needs = form.need_type ? form.need_type.split(',').filter(Boolean) : [];
  const stdNeeds = NEEDS_BY_PERSONA[form.persona] || [];
  const customNeed = needs.find((n) => !stdNeeds.includes(n)) || '';
  const toggleNeed = (n) => {
    if (needs.includes(n)) set({ need_type: needs.filter((x) => x !== n).join(',') });
    else if (needs.length < 2) set({ need_type: [...needs, n].join(',') });
  };
  const toggleOther = () => {
    if (customNeed) set({ need_type: needs.filter((n) => n !== customNeed).join(',') });
    else if (needs.length < 2) set({ need_type: [...needs, 'אחר'].join(',') });
  };
  const setOther = (t) => set({ need_type: [...needs.filter((n) => n !== customNeed), t.trim() || 'אחר'].join(',') });
  const response = form.persona ? buildNeedResponse({ persona: form.persona, needs, serviceType: form.service_type }) : null;
  const csvSel = (field) => (form[field] ? form[field].split(',').filter(Boolean) : []);
  const toggleCsv = (field, v) => { const a = csvSel(field); set({ [field]: (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]).join(',') }); };
  const scheduled = SCHEDULED.includes(service) || groupishOf(form);

  return (
    <div style={col}>
      <ScriptBox>בוא נדייק — כמה שאלות קצרות שיעזרו לי להתאים לכם בדיוק.</ScriptBox>

      <Field label="פרסונה">
        <Chips options={NEED_PERSONAS.map((p) => p.label)} value={NEED_PERSONAS.find((p) => p.key === form.persona)?.label}
          onPick={(lbl) => { const k = NEED_PERSONAS.find((p) => p.label === lbl)?.key; set({ persona: form.persona === k ? '' : k, need_type: '' }); }} />
      </Field>
      {form.persona && (
        <Field label="הצורך המרכזי (עד שניים)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: GAP_CHIP }}>
            {stdNeeds.map((o) => <button key={o} type="button" onClick={() => toggleNeed(o)} style={chipStyle(needs.includes(o))}>{o}</button>)}
            <button type="button" onClick={toggleOther} style={chipStyle(!!customNeed)}>אחר</button>
          </div>
          {customNeed && <input style={{ ...inp, marginTop: 8 }} value={customNeed === 'אחר' ? '' : customNeed} onChange={(e) => setOther(e.target.value)} placeholder="מה הצורך?" />}
        </Field>
      )}
      {response && (
        <div style={{ ...CARD_PROMPT, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#C24A0A' }}>🎯 המענה שלנו</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#4A1B0C', lineHeight: 1.5, userSelect: 'text' }}>{response.connection}</div>
          <div style={{ fontSize: 12.5, fontStyle: 'italic', color: '#8A4A1E', lineHeight: 1.45 }}>לשאול עכשיו: {response.question}</div>
        </div>
      )}

      {questions.map((q) => (
        <Field key={q.key} label={q.key}>
          <Chips options={q.chips} value={form.diagnosis?.[q.key]} onPick={(v) => setDiag(q.key, v)} />
        </Field>
      ))}

      {/* When — days / hours / start / limits (folded here, not a step). */}
      {scheduled && (<>
        <Field label="ימים מועדפים"><MultiChips options={DAYS} selected={csvSel('preferred_days')} onToggle={(d) => toggleCsv('preferred_days', d)} /></Field>
        <Field label="שעות מועדפות">
          <MultiChips options={HOURS} selected={csvSel('preferred_hours')} onToggle={(h) => toggleCsv('preferred_hours', h)} />
          <input style={{ ...inp, marginTop: 6 }} value={form.hours_exact} onChange={(e) => set({ hours_exact: e.target.value })} placeholder="שעות מדויקות (לא חובה)" />
        </Field>
      </>)}
      <Field label="תאריך התחלה רצוי">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: GAP_CHIP }}>
          {START_OPTS.map((o) => <button key={o.key} type="button" onClick={() => set({ start_date_pref: form.start_date_pref === o.key ? '' : o.key })} style={chipStyle(form.start_date_pref === o.key)}>{o.label}</button>)}
        </div>
      </Field>
      <Field label="מגבלות לוגיסטיות / הערה"><input style={inp} value={form.constraints_note} onChange={(e) => set({ constraints_note: e.target.value })} placeholder="נגישות, ציוד, אילוצי מקום..." /></Field>
    </div>
  );
}

// Sport background + injuries. Adaptive: private phrasing vs group
// ("most participants"). Writes the SAME columns the proactive flow uses
// (background_level / sports_experience / injury_level / injuries) and
// surfaces the playbook focus (injury story · personal-first · advanced
// track · start-from-zero) the moment a signal is picked.
function StepBackground({ form, set }) {
  const isGroup = groupishOf(form);
  const c = backgroundCopy(isGroup);
  const focus = backgroundFocus(form);
  return (
    <div style={col}>
      <ScriptBox>{c.ask}</ScriptBox>

      <Field label={c.levelLabel}>
        <Chips options={BACKGROUND_CHIPS.map((o) => o.label)} value={form.background_level}
          onPick={(v) => set({ background_level: form.background_level === v ? '' : v })} />
      </Field>
      <Field label={c.levelDetail}>
        <input style={inp} value={form.sports_experience} onChange={(e) => set({ sports_experience: e.target.value })} placeholder={c.levelDetail} />
      </Field>

      <Field label={c.injuryLabel}>
        <Chips options={INJURY_CHIPS.map((o) => o.label)} value={form.injury_level}
          onPick={(v) => set({ injury_level: form.injury_level === v ? '' : v })} />
      </Field>
      {form.injury_level && form.injury_level !== 'אין' && (
        <Field label={c.injuryDetail}>
          <input style={inp} value={form.injuries} onChange={(e) => set({ injuries: e.target.value })} placeholder={c.injuryDetail} />
        </Field>
      )}

      {focus && (
        <div style={{ ...CARD_PROMPT, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#C24A0A' }}>🎯 לאן לכוון עכשיו</div>
          {focus.tips.map((t, i) => (
            <div key={i} style={{ fontSize: 14, fontWeight: 700, color: '#4A1B0C', lineHeight: 1.5, userSelect: 'text' }}>· {t}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function StepGoal({ form, set, leadType }) {
  const options = activityGoalsFor(leadType);
  const goals = form.activity_goals ? form.activity_goals.split(',').filter(Boolean) : [];
  const std = options.filter((o) => o !== 'אחר');
  const custom = goals.find((g) => !std.includes(g)) || '';
  const toggle = (g) => {
    if (goals.includes(g)) set({ activity_goals: goals.filter((x) => x !== g).join(',') });
    else if (goals.length < 2) set({ activity_goals: [...goals, g].join(',') });
  };
  const toggleOther = () => { if (custom) set({ activity_goals: goals.filter((g) => g !== custom).join(',') }); else if (goals.length < 2) set({ activity_goals: [...goals, 'אחר'].join(',') }); };
  const setOther = (t) => set({ activity_goals: [...goals.filter((g) => g !== custom), t.trim() || 'אחר'].join(',') });
  return (
    <div style={col}>
      <ScriptBox>מה המטרה העיקרית של הפעילות — מה תרצו להשיג ממנה? (עד שתיים)</ScriptBox>
      <Field label="מטרת הפעילות">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: GAP_CHIP }}>
          {std.map((o) => <button key={o} type="button" onClick={() => toggle(o)} style={chipStyle(goals.includes(o))}>{o}</button>)}
          <button type="button" onClick={toggleOther} style={chipStyle(!!custom)}>אחר</button>
        </div>
        {custom && <input style={{ ...inp, marginTop: 8 }} value={custom === 'אחר' ? '' : custom} onChange={(e) => setOther(e.target.value)} placeholder="מה המטרה?" />}
      </Field>
    </div>
  );
}

function StepMirror({ form, set }) {
  return (
    <div style={col}>
      <ScriptBox label="מה להקריא">שיקוף — קרא/י ללקוח, וערוך/כי לפי הצורך:</ScriptBox>
      <Field label="שיקוף (ניתן לעריכה)">
        <AutoTextarea value={form.conversation_summary} onChange={(v) => set({ conversation_summary: v })} placeholder="השיקוף נבנה אוטומטית מהתשובות..." minHeight={120} />
      </Field>
      <div style={{ fontSize: 12, color: '#7A756B', fontStyle: 'italic' }}>אישר/ה? המשך/י ל"הבא". צריך לתקן? חזור/חזרי לשלב הרלוונטי.</div>
    </div>
  );
}

function StepIntro({ form, set, leadType }) {
  const [copied, setCopied] = useState(false);
  const version = form.intro_version || 'first';
  const script = selfIntroScript(version, leadType);
  const copy = async () => { try { await navigator.clipboard.writeText(script.copyText); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };
  const focus = backgroundFocus(form);
  return (
    <div style={col}>
      <ScriptBox label="מה להקריא">ספר לי עליך — 30 שניות שמסבירות למה השיטה עובדת:</ScriptBox>
      {focus?.leadWithInjuryStory && (
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#C24A0A', background: '#FFF4E6', border: '1px solid #F0B892', borderRadius: 10, padding: '8px 10px', lineHeight: 1.45 }}>
          🎯 יש כאב/מגבלה פעילים — פתח/י דווקא בסיפור הפציעות (גרסת "גוף ראשון"). זה הליד שהסיפור נבנה בשבילו.
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        {[{ k: 'first', l: 'גוף ראשון' }, { k: 'coord', l: 'רכז/ת' }].map((v) => (
          <button key={v.k} type="button" onClick={() => set({ intro_version: v.k })} style={{ ...chipStyle(version === v.k), flex: 1 }}>{v.l}</button>
        ))}
      </div>
      <div style={{ ...CARD_PROMPT, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {script.lines.map((l, i) => (
          <div key={i} style={{ fontSize: 15, fontWeight: i === script.lines.length - 2 ? 800 : 600, color: '#4A1B0C', lineHeight: 1.5, userSelect: 'text' }}>{l}</div>
        ))}
        <div style={{ borderTop: '1px solid #F0D9C6', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#9A8F82' }}>דוגמאות חיות להזכיר:</div>
          {script.examples.map((e, i) => <div key={i} style={{ fontSize: 13, color: '#5C4A3A', lineHeight: 1.4 }}>· {e}</div>)}
        </div>
        <button type="button" onClick={copy} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #F0E4D0', background: '#fff', color: '#3a3a3a', borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
          {copied ? <Check size={14} color="#16a34a" /> : <Copy size={14} />} {copied ? 'הועתק' : 'העתק תסריט'}
        </button>
      </div>
    </div>
  );
}

function StepLadder({ form, set }) {
  const service = form.service_type || (groupishOf(form) ? 'group' : '_default');
  const tracks = tracksFor(service);
  return (
    <div style={col}>
      <ScriptBox>{PRESENT_LADDER_LINE}</ScriptBox>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tracks.map((t) => {
          const on = form.recommended_track === t.key;
          return (
            <button key={t.key} type="button" onClick={() => set({ recommended_track: on ? '' : t.key })} style={{
              textAlign: 'right', border: `${on ? 2 : 1}px solid ${on ? ORANGE : '#E4D8C6'}`, background: on ? '#FFF4E6' : '#fff',
              borderRadius: 14, padding: '12px 14px', cursor: 'pointer', position: 'relative',
            }}>
              {t.recommended && <span style={{ position: 'absolute', top: -9, insetInlineStart: 12, background: ORANGE, color: '#fff', fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '2px 8px' }}>מומלץ</span>}
              <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A' }}>{t.label}</div>
              <div style={{ fontSize: 12.5, color: '#7A756B', marginTop: 2 }}>{t.tagline}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Private per-service offer lines (numbers pulled from pricing-engine).
function privateOfferLines(service) {
  const p = PRIVATE_PRICES;
  if (service === 'personal') return [`אימון אישי — ${nis(p.personal)} למפגש`, `מוצר פריצה דיגיטלי — ${nis(p.digital)}`];
  if (service === 'online') return [`ליווי 90 יום — ${nis(p.program_90)} לחודש`, `מוצר פריצה דיגיטלי — ${nis(p.digital)}`];
  return [`מנוי קבוצתי — ${nis(p.group_sub_1x)} (1×) / ${nis(p.group_sub_2x)} (2×) בשבוע`, `אימון אישי — ${nis(p.personal)} למפגש`, `מוצר פריצה דיגיטלי — ${nis(p.digital)}`];
}

function StepOffer({ form, set, leadType }) {
  const [copied, setCopied] = useState(false);
  const [compare, setCompare] = useState(false);
  const isGroup = leadType === 'group' || leadType === 'business';
  const size = groupSizeNum(form);
  const gp = groupPricing(size);
  const mf = monthlyFrame(gp.anchor, form.frequency_per_week);
  const line = isGroup && mf.sessions > 0 ? offerSentence({ sessions: mf.sessions, total: mf.total }) : '';
  const cmp = isGroup ? compareOffer(form.proposed_price, gp) : null;
  const includes = valueIncludesFor(form.service_type || (isGroup ? 'group' : '_default'));
  const copyLine = async () => { try { await navigator.clipboard.writeText(line || includes.join(' · ')); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };

  return (
    <div style={col}>
      <ScriptBox>הנה מה שאני מציע — בוא נראה שזה מתאים לך.</ScriptBox>

      {isGroup ? (
        <div style={{ ...CARD_PROMPT, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#C24A0A' }}>💰 הצעה לקבוצה</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="גודל קבוצה"><input style={inp} inputMode="numeric" value={form.group_size || (form.groups?.[0]?.size ?? '')} onChange={(e) => set({ group_size: e.target.value, groups: [{ ...(form.groups?.[0] || {}), size: e.target.value }, ...(form.groups || []).slice(1)] })} placeholder="מספר" /></Field>
            <Field label="תדירות בשבוע"><input style={inp} inputMode="numeric" value={form.frequency_per_week} onChange={(e) => set({ frequency_per_week: e.target.value })} placeholder="למשל 2" /></Field>
          </div>
          <div style={{ fontSize: 13, color: '#8A4A1E' }}>טווח: {nis(gp.rangeLow)}–{nis(gp.rangeHigh)} למפגש</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#4A1B0C' }}>עוגן מומלץ: {nis(gp.anchor)} למפגש</div>
          {mf.sessions > 0 && (
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A', background: '#fff', borderRadius: 8, padding: '8px 10px', border: '1px solid #F0D9C6' }}>
              {mf.sessions} מפגשים בחודש = <b>{nis(mf.total)}</b>{mf.discountPct > 0 ? ` (אחרי הנחת מסגרת ${Math.round(mf.discountPct * 100)}%)` : ''}
            </div>
          )}
          {line && (<>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1E1B4B', lineHeight: 1.5, background: '#fff', borderRadius: 8, padding: '8px 10px', border: '1px solid #F0D9C6' }}>{line}</div>
            <button type="button" onClick={copyLine} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: ORANGE, color: '#fff', borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{copied ? '✓ הועתק' : 'העתק הצעה'}</button>
          </>)}
          <Field label={'מחיר שהוצע ע"י הלקוח (להשוואה)'}><input style={inp} inputMode="numeric" value={form.proposed_price} onChange={(e) => set({ proposed_price: e.target.value })} placeholder="₪ למפגש (לא חובה)" /></Field>
          {cmp && (
            <div style={{ borderRadius: 8, padding: '7px 10px', background: '#fff', border: `1px solid ${cmp.color}` }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: cmp.color }}>ההצעה שלו: {nis(cmp.proposed)} · {cmp.label}</div>
              {cmp.note && <div style={{ fontSize: 11, color: cmp.color, marginTop: 2 }}>⚠️ {cmp.note}</div>}
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...CARD_PROMPT, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#C24A0A' }}>💰 מחירון</div>
          {privateOfferLines(form.service_type).map((l, i) => <div key={i} style={{ fontSize: 14, fontWeight: 700, color: '#4A1B0C', lineHeight: 1.5 }}>· {l}</div>)}
        </div>
      )}

      {/* What's included */}
      <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#5C4A3A' }}>מה כלול</div>
        {includes.map((l, i) => <div key={i} style={{ fontSize: 13, color: '#3a3a3a', lineHeight: 1.45 }}>✓ {l}</div>)}
      </div>

      {/* Close-in-place incentive */}
      <Field label="סגירה במקום">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CLOSE_INCENTIVES.map((c) => {
            const on = form.close_incentive === c.key;
            return (
              <button key={c.key} type="button" onClick={() => set({ close_incentive: on ? '' : c.key })} style={{ textAlign: 'right', border: `${on ? 2 : 1}px solid ${on ? '#16a34a' : '#E4D8C6'}`, background: on ? '#EAF7EF' : '#fff', borderRadius: 12, padding: '10px 12px', cursor: 'pointer' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: on ? '#16803D' : '#1A1A1A' }}>{c.label}</div>
                <div style={{ fontSize: 12.5, color: '#5C4A3A', marginTop: 2, lineHeight: 1.4 }}>{c.line}</div>
              </button>
            );
          })}
        </div>
      </Field>

      {/* Compare-offers rebuttal */}
      <button type="button" onClick={() => setCompare((v) => !v)} style={{ border: '1px solid #E4D8C6', background: '#fff', color: '#5C4A3A', borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
        {compare ? 'הסתר' : 'רוצה להשוות הצעות?'}
      </button>
      {compare && (
        <div style={{ ...CARD, borderColor: '#C7D2FE', background: '#EEF2FF' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1E1B4B', lineHeight: 1.5, userSelect: 'text' }}>{COMPARE_RESPONSE.line}</div>
          <div style={{ fontSize: 11, fontStyle: 'italic', color: '#4338CA', marginTop: 4 }}>💡 {COMPARE_RESPONSE.note}</div>
        </div>
      )}
    </div>
  );
}

function StepSummary({ form, set, busy, onOutcome }) {
  const [reasonOpen, setReasonOpen] = useState(false);
  const gaps = [];
  if (!form.service_type && !groupishOf(form)) gaps.push('סוג שירות');
  if (!form.persona) gaps.push('אבחון צורך');
  if (!form.background_level) gaps.push('רקע ספורטיבי');
  if (!form.injury_level) gaps.push('פציעות/מגבלות');
  if (!form.activity_goals) gaps.push('מטרת פעילות');
  if (!form.recommended_track) gaps.push('מסלול מומלץ');
  if (!(form.conversation_summary || '').trim()) gaps.push('שיקוף');
  const hesResp = hesitationResponse(form.hesitation_reason);
  return (
    <div style={col}>
      <ScriptBox>סיכום — איך נסגרה השיחה?</ScriptBox>

      {gaps.length > 0 && (
        <div style={{ background: '#FFF7ED', border: '1px solid #F5C9A8', borderRadius: 12, padding: '10px 12px' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#C24A0A', marginBottom: 4 }}>מה עוד כדאי לברר</div>
          <div style={{ fontSize: 13, color: '#7A4A1E', lineHeight: 1.5 }}>{gaps.join(' · ')}</div>
        </div>
      )}

      <Field label="מתי לחזור"><FollowupChips value={form.follow_up} onChange={(d) => set({ follow_up: d })} /></Field>

      <button type="button" onClick={() => onOutcome({ close_result: 'closed_now', lead_status_detail: 'closed_intro', next_step: 'לקבוע פגישת היכרות' })} disabled={busy} style={outcomeBtn('#16a34a', '#fff')}>✅ נסגר — נקבע מפגש</button>
      <button type="button" onClick={() => onOutcome({ close_result: 'needs_followup', lead_status_detail: 'thinking', next_step: 'לקבוע שיעור ניסיון' })} disabled={busy} style={outcomeBtn('#fff', '#1A1A1A', '#3B82F6')}>🎟 לקבוע שיעור ניסיון</button>
      <button type="button" onClick={() => onOutcome({ close_result: 'needs_followup', lead_status_detail: 'thinking', next_step: 'לשלוח הצעה' })} disabled={busy} style={outcomeBtn('#fff', '#1A1A1A', '#8B5CF6')}>📄 לשלוח הצעה כתובה</button>

      {!reasonOpen ? (
        <button type="button" onClick={() => setReasonOpen(true)} disabled={busy} style={outcomeBtn('#fff', '#1A1A1A', '#EAB308')}>🤔 מתלבט — למה?</button>
      ) : (
        <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: GAP }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#9A8F82' }}>סיבת ההתלבטות</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: GAP_CHIP }}>
            {HESITATION_REASONS.map((r) => <button key={r} type="button" onClick={() => set({ hesitation_reason: form.hesitation_reason === r ? '' : r })} style={chipStyle(form.hesitation_reason === r)}>{r}</button>)}
          </div>
          {hesResp && (
            <div style={{ ...CARD_PROMPT }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#4A1B0C', lineHeight: 1.5, userSelect: 'text' }}>{hesResp.answer}</div>
              {hesResp.bridge && <div style={{ fontSize: 12, fontStyle: 'italic', color: '#8A4A1E', marginTop: 6 }}>🌉 {hesResp.bridge}</div>}
            </div>
          )}
          <button type="button" onClick={() => onOutcome({ close_result: 'needs_followup', lead_status_detail: 'thinking' })} disabled={busy} style={outcomeBtn('#EAB308', '#fff')}>
            {busy && <Loader2 size={16} className="animate-spin" />} שמור כמתלבט
          </button>
        </div>
      )}
    </div>
  );
}

function SavedSummary({ form, onDone }) {
  const waMsg = `סיכום שיחה:\n${form.conversation_summary || ''}${form.next_step ? `\nצעד הבא: ${form.next_step}` : ''}\nנשמח להמשיך :)`;
  const rows = [
    ['שם', form.name], ['טלפון', form.phone],
    ['שירות', SERVICE_LABEL[form.service_type]], ['עבור מי', FORWHOM_LABEL[form.for_whom]],
    ['מסלול', form.recommended_track], ['מטרה', form.activity_goals],
    ['רקע', [form.background_level, form.sports_experience].filter(Boolean).join(' · ')],
    ['פציעות', [form.injury_level, form.injuries].filter(Boolean).join(' · ')],
    ['שיקוף', form.conversation_summary], ['הצעד הבא', form.next_step],
    ['מעקב הבא', form.follow_up], ['תמליל', form.transcript],
  ].filter(([, v]) => v != null && String(v).trim() !== '');
  return (
    <div style={col}>
      <div style={{ fontSize: 18, fontWeight: 900, color: '#16a34a', textAlign: 'center', padding: '6px 0' }}>✓ הליד נשמר</div>
      <div style={{ ...CARD }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: '0.5px solid #F5EFE5', fontSize: 13 }}>
            <span style={{ color: '#9A8F82', fontWeight: 700, minWidth: 80, flexShrink: 0 }}>{label}</span>
            <span style={{ color: '#1A1A1A', whiteSpace: 'pre-wrap' }}>{String(value)}</span>
          </div>
        ))}
      </div>
      {normalizePhone(form.phone) && (
        <button type="button" onClick={() => window.open(waLink(form.phone, waMsg), '_blank')} style={{ width: '100%', height: 44, borderRadius: 12, border: 'none', cursor: 'pointer', background: '#25D366', color: '#fff', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <MessageCircle size={16} /> שלח סיכום בוואטסאפ
        </button>
      )}
      <button type="button" onClick={onDone} style={{ width: '100%', height: 48, borderRadius: 14, border: 'none', cursor: 'pointer', background: ORANGE, color: '#fff', fontSize: 16, fontWeight: 800 }}>סיום</button>
    </div>
  );
}

function PhoneGate({ form, set, onContinue }) {
  return (
    <div style={col}>
      <div style={{ ...CARD_PROMPT, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#C24A0A' }}>📞 רגע לפני ההצעה</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#4A1B0C', lineHeight: 1.5, userSelect: 'text' }}>{PHONE_GATE_LINE}</div>
        <input style={{ ...inp, direction: 'ltr', textAlign: 'left' }} type="tel" inputMode="tel" autoFocus value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="050-0000000" />
        <button type="button" onClick={onContinue} style={{ width: '100%', height: 46, borderRadius: 12, border: 'none', cursor: 'pointer', background: ORANGE, color: '#fff', fontSize: 15, fontWeight: 800 }}>המשך להצעה →</button>
      </div>
    </div>
  );
}

// ─── Building blocks ────────────────────────────────────────────────

function ProgressBar({ steps, idx }) {
  return (
    <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
      {steps.map((s, i) => (
        <div key={s.id} style={{ width: i === idx ? 20 : 8, height: 7, borderRadius: 999, background: i <= idx ? ORANGE : '#E7E0D5', transition: 'all .2s' }} />
      ))}
    </div>
  );
}

function TopField({ label, value, onChange, placeholder, ltr }) {
  const empty = !value.trim();
  return (
    <div style={{ position: 'relative' }}>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        type={ltr ? 'tel' : 'text'} inputMode={ltr ? 'tel' : undefined}
        style={{ ...inp, minHeight: 38, padding: '6px 10px', fontSize: 13, border: `1px solid ${empty ? '#F0C89A' : '#E4D8C6'}`, background: empty ? '#FFFBF5' : '#fff', direction: ltr ? 'ltr' : 'rtl', textAlign: ltr ? 'left' : 'right' }} />
      <span style={{ position: 'absolute', top: -7, insetInlineStart: 8, background: 'var(--cream, #FBF3EA)', padding: '0 4px', fontSize: 9, fontWeight: 700, color: empty ? '#C24A0A' : '#9A8F82' }}>{label}{empty ? ' ·' : ''}</span>
    </div>
  );
}

function FitMeter({ form }) {
  const fit = fitSuggest(form);
  if (!fit) return null;
  return (
    <div style={{ fontSize: 11.5, color: '#7A756B', padding: '0 2px 8px' }}>
      🎯 מוביל: <b style={{ color: '#C24A0A' }}>{fit.lead}</b>{fit.alt ? <> · גם שווה: {fit.alt}</> : null}
    </div>
  );
}

function AutoTextarea({ value, onChange, placeholder, minHeight = 80 }) {
  const ref = useRef(null);
  const resize = () => { const el = ref.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.max(minHeight, el.scrollHeight) + 'px'; };
  useEffect(() => { resize(); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <textarea ref={ref} value={value} onChange={(e) => { onChange(e.target.value); resize(); }} placeholder={placeholder}
      style={{ ...inp, height: 'auto', minHeight, overflow: 'hidden', resize: 'none', lineHeight: 1.5 }} />
  );
}

function ScriptBox({ children, label = 'מה לשאול' }) {
  return (
    <div dir="rtl" style={{ ...CARD_PROMPT }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: ORANGE, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: '#1a1a1a', whiteSpace: 'pre-wrap' }}>{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#9A8F82', marginBottom: GAP_LABEL }}>{label}</label>
      {children}
    </div>
  );
}

function Chips({ options, value, onPick }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: GAP_CHIP }}>
      {options.map((o) => <button key={o} type="button" onClick={() => onPick(o)} style={chipStyle(value === o)}>{o}</button>)}
    </div>
  );
}
function MultiChips({ options, selected, onToggle }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: GAP_CHIP }}>
      {options.map((o) => <button key={o} type="button" onClick={() => onToggle(o)} style={chipStyle(selected.includes(o))}>{o}</button>)}
    </div>
  );
}

// ── Payload + helpers ────────────────────────────────────────────────

// First open question still missing an answer — the entry point when
// continuing an existing lead. Falls back to the mirror so a fully-known
// lead still runs the closing leadership (mirror → ladder → offer).
function firstOpenStep(f) {
  const complete = {
    who: !!f.contact_role,
    what: !!f.service_type || groupishOf(f),
    diagnose: !!f.persona,
    background: !!f.background_level,
    goal: !!f.activity_goals,
  };
  return ['who', 'what', 'diagnose', 'background', 'goal'].find((id) => !complete[id]) || 'mirror';
}

function fromLead(l) {
  if (!l) return blank();
  const parseGroups = (raw) => { try { const a = typeof raw === 'string' ? JSON.parse(raw) : raw; if (Array.isArray(a) && a.length) return a.map((g) => ({ size: g.size || '', ages: g.ages || '' })); } catch {} return [{ size: '', ages: '' }]; };
  return {
    ...blank(),
    name: l.name || '', phone: l.phone || '', source: l.source || 'שיחה נכנסת', transcript: l.notes || '',
    contact_role: l.contact_role || '',
    service_type: l.service_type || '', for_whom: l.for_whom || '',
    training_location: l.training_location || '', frequency_per_week: l.frequency_per_week || '', group_location: l.group_location || '',
    groups: parseGroups(l.groups_detail), workshop_topic: l.workshop_topic || '', target_date: l.target_date || '', main_goal: l.fitness_goal || '',
    payer: l.payer || '', persona: l.persona || '', need_type: l.need_type || '',
    background_level: l.background_level || '', sports_experience: l.sports_experience || '',
    injury_level: l.injury_level || '', injuries: l.injuries || '',
    preferred_days: l.preferred_days || '',
    preferred_hours: (l.preferred_hours || '').split('|')[0] || '', hours_exact: (l.preferred_hours || '').split('|')[1] || '',
    start_date_pref: l.start_date_pref || '', constraints_note: l.constraints_note || '',
    conversation_summary: l.conversation_summary || '', recommended_track: l.recommended_track || '',
    proposed_price: l.proposed_price || '',
    follow_up: l.next_follow_up ? String(l.next_follow_up).slice(0, 10) : isoInDays(1),
  };
}

function composeMirror(f) {
  const needs = f.need_type ? f.need_type.split(',').filter(Boolean) : [];
  return buildMirror({
    name: f.name,
    needLabel: needs[0] || '',
    groupSize: groupSizeNum(f) || '',
    freq: (f.frequency_per_week || '').trim(),
    goals: (f.activity_goals || '').replace(/,/g, ' ו'),
    forWhomLabel: FORWHOM_LABEL[f.for_whom] || '',
    serviceLabel: SERVICE_LABEL[f.service_type] || '',
  });
}

function buildExtras(f) {
  const out = [];
  Object.entries(f.diagnosis || {}).forEach(([k, v]) => { if (v) out.push({ label: k, value: v }); });
  if (f.activity_goals) out.push({ label: 'מטרת פעילות', value: f.activity_goals });
  if (f.recommended_track) { const t = tracksFor(f.service_type || 'group').find((x) => x.key === f.recommended_track); if (t) out.push({ label: 'מסלול מומלץ', value: t.label }); }
  if (f.close_incentive) { const c = CLOSE_INCENTIVES.find((x) => x.key === f.close_incentive); if (c) out.push({ label: 'תמריץ סגירה', value: c.label }); }
  return out;
}

function buildPayload(f, applyStatus) {
  const groupish = groupishOf(f);
  const gd = (f.groups || []).filter((g) => (g.size || '').trim() || (g.ages || '').trim());
  const payload = {
    name: f.name.trim(), phone: f.phone.trim() || null, notes: f.transcript || null, source: f.source || 'שיחה נכנסת',
    contact_role: f.contact_role || null,
    service_type: f.service_type || null, for_whom: f.for_whom || null,
    persona: f.persona || null, need_type: f.need_type || null,
    background_level: f.background_level || null,
    sports_experience: (f.sports_experience || '').trim() || null,
    injury_level: f.injury_level || null,
    injuries: (f.injuries || '').trim() || null,
    lead_type: deriveLeadType(f) || null,
    training_location: f.training_location || null,
    frequency_per_week: (f.frequency_per_week || '').trim() || null,
    group_location: (f.group_location || '').trim() || null,
    group_size: groupish ? ((f.groups?.[0]?.size || '').trim() || null) : ((f.group_size || '').trim() || null),
    age_range: groupish ? ((f.groups?.[0]?.ages || '').trim() || null) : null,
    groups_detail: groupish && gd.length ? JSON.stringify(gd) : null,
    workshop_topic: (f.workshop_topic || '').trim() || null,
    target_date: f.target_date || null,
    fitness_goal: (f.main_goal || '').trim() || f.activity_goals || null,
    preferred_days: f.preferred_days || null,
    preferred_hours: (f.hours_exact.trim() ? `${f.preferred_hours}|${f.hours_exact.trim()}` : f.preferred_hours) || null,
    start_date_pref: f.start_date_pref || null,
    constraints_note: (f.constraints_note || '').trim() || null,
    proposed_price: (f.proposed_price || '').trim() || null,
    payer: (f.for_whom === 'org' || f.for_whom === 'group') ? (f.payer || null) : null,
    recommended_track: f.recommended_track || null,
    conversation_summary: f.conversation_summary || null,
    next_step: f.next_step || null,
    next_follow_up: f.follow_up || null,
    extra_details: (() => { const e = buildExtras(f); return e.length ? JSON.stringify(e) : null; })(),
    last_contact_date: new Date().toISOString(),
  };
  if (applyStatus && f.lead_status_detail) {
    payload.lead_status_detail = f.lead_status_detail;
    payload.close_result = f.close_result || null;
    const st = statusForDetail(f.lead_status_detail);
    if (st) payload.status = st;
    if (st === 'converted') payload.converted_at = new Date().toISOString();
  }
  return payload;
}

function journalSummary(f) {
  const bits = [];
  if (f.service_type) bits.push(SERVICE_LABEL[f.service_type]);
  const sz = groupSizeNum(f); if (sz) bits.push(`קבוצה ${sz}`);
  if (f.activity_goals) bits.push(`מטרה: ${f.activity_goals}`);
  if (f.recommended_track) { const t = tracksFor(f.service_type || 'group').find((x) => x.key === f.recommended_track); if (t) bits.push(`מסלול: ${t.label}`); }
  if (f.close_result) bits.push(`תוצאה: ${f.close_result}`);
  if (f.hesitation_reason) bits.push(`התלבטות: ${f.hesitation_reason}`);
  const head = bits.length ? bits.join(' · ') : 'שיחה נכנסת';
  return `${head}${f.transcript ? `\n${f.transcript}` : ''}`;
}

// ── Design tokens (match the wizard's language) ──────────────────────
const GAP = 12;
const GAP_CHIP = 8;
const GAP_COL = 12;
const GAP_LABEL = 6;
const CARD = { background: '#FFFFFF', border: '1px solid #F0E4D0', borderRadius: 14, padding: 14 };
const CARD_PROMPT = { background: '#FFFFFF', border: `2px solid ${ORANGE}`, borderRadius: 14, padding: 14 };
const col = { display: 'flex', flexDirection: 'column', gap: GAP };
const iconBtn = { background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, display: 'flex' };
const inp = {
  width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 10,
  border: '1px solid #F0E4D0', background: '#fff', fontSize: 14, color: '#1A1A1A',
  outline: 'none', boxSizing: 'border-box', resize: 'none', textAlign: 'right',
  fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
};
const chipStyle = (on) => ({
  minHeight: 40, padding: '0 14px', borderRadius: 999, cursor: 'pointer', boxSizing: 'border-box',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: `1px solid ${on ? ORANGE : '#E4D8C6'}`, background: on ? ORANGE : '#fff', color: on ? '#fff' : '#3a3a3a',
  fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
});
function outcomeBtn(bg, color, border) {
  return { width: '100%', minHeight: 50, borderRadius: 14, cursor: 'pointer', border: border ? `2px solid ${border}` : 'none', background: bg, color, fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 };
}
