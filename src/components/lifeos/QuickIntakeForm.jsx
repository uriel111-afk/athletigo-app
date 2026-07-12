import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2, ChevronDown } from 'lucide-react';
import { addLead, updateLead } from '@/lib/lifeos/lifeos-api';
import { isoInDays } from '@/lib/lifeos/lead-helpers';
import FollowupChips from '@/components/lifeos/FollowupChips';
import { NEED_PERSONAS, NEEDS_BY_PERSONA, buildNeedResponse, smartNextStep } from '@/lib/lifeos/need-response-bank';
import { BACKGROUND_CHIPS, INJURY_CHIPS, backgroundCopy, backgroundFocus, ASK_NOW } from '@/lib/lifeos/sales-playbook';
import { toast } from 'sonner';

// ── Quick lead intake ("קליטה מהירה") — unified request hierarchy ────
// One page, 5 fixed sections, section 3 swaps dynamically by service
// type. Complements the 9-step wizard (GuidedLeadFlow). Minimum to save
// = name + phone + notes; everything else is optional. `lead_type` is
// derived (private / group / business) so the existing tags + "pending"
// logic keep working. Reuses columns where they exist (name, phone,
// notes, source, status, for_whom, fitness_goal, group_size,
// group_location, frequency_per_week, proposed_price, payer,
// preferred_channel, contact_role, organization) and adds a few new ones.

const ORANGE = '#FF6F20';

const ROLE_CHIPS = ['פונה לעצמו', 'הורה', 'מארגן קבוצה', 'רכז/ת', 'מנהל/ת', 'אחר'];
const CHANNELS = [{ key: 'whatsapp', label: 'וואטסאפ' }, { key: 'phone', label: 'טלפון' }];
const SERVICE_TYPES = [
  { key: 'personal',   label: 'אימון אישי' },
  { key: 'group',      label: 'קבוצה' },
  { key: 'online',     label: 'ליווי אונליין' },
  { key: 'workshop',   label: 'סדנה' },
  { key: 'movement65', label: 'תנועה בכיף 65+' },
  { key: 'other',      label: 'אחר' },
];
const FOR_WHOM = [
  { key: 'self',  label: 'לעצמו' },
  { key: 'child', label: 'לילד/ה' },
  { key: 'group', label: 'לקבוצה קיימת' },
  { key: 'org',   label: 'לארגון' },
];
const LOCATIONS = ['הסטודיו שלנו', 'אצל הלקוח', 'אונליין'];
const PAYERS = ['המשתתפים', 'הארגון', 'ההורה'];
const SOURCES = ['שיחה נכנסת', 'הפניה', 'אחר'];
const NEXT_STEPS = ['לקבוע שיעור ניסיון', 'לקבוע פגישת היכרות', 'לשלוח הצעה', 'לחזור בטלפון', 'לשלוח פרטים בוואטסאפ'];
const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'שבת'];
const HOURS = ['בוקר', 'צהריים', 'אחר הצהריים', 'ערב'];
const START_OPTS = [{ key: 'asap', label: 'בהקדם' }, { key: 'next_month', label: 'חודש הבא' }];
const SCHEDULED = ['personal', 'group', 'online', 'movement65']; // services with day/hour prefs

export const SERVICE_LABEL = Object.fromEntries(SERVICE_TYPES.map((t) => [t.key, t.label]));
export const FORWHOM_LABEL = Object.fromEntries(FOR_WHOM.map((t) => [t.key, t.label]));

// Business/group classification drives the existing tags. Derived from
// the request so a lead is "pending" until it's classified.
const deriveLeadType = (f) => {
  if (f.for_whom === 'org') return 'business';
  if (f.for_whom === 'group' || ['group', 'workshop', 'movement65'].includes(f.service_type)) return 'group';
  if (f.for_whom || f.service_type) return 'private';
  return '';
};

const TYPES = [
  { key: 'private',  label: 'פרטי' },
  { key: 'group',    label: 'קבוצה' },
  { key: 'business', label: 'עסק-ארגון' },
];
export const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.key, t.label]));
export const needsCompletion = (l) => !!(l?.preferred_channel) && !l?.lead_type;
export const isBusinessLead = (l) => l?.lead_type === 'group' || l?.lead_type === 'business';

// People in a group lead — sum of groups_detail sizes, else group_size.
// Returns a number, or a raw string (e.g. "8-10"), or null.
export const groupPeopleCount = (l) => {
  try {
    const gd = typeof l?.groups_detail === 'string' ? JSON.parse(l.groups_detail) : l?.groups_detail;
    if (Array.isArray(gd) && gd.length) {
      const sum = gd.reduce((s, g) => s + (parseInt(g.size, 10) || 0), 0);
      if (sum > 0) return sum;
    }
  } catch {}
  const n = parseInt(l?.group_size, 10);
  if (Number.isFinite(n) && n > 0) return n;
  return (l?.group_size || '').toString().trim() || null;
};

const blank = () => ({
  name: '', phone: '', notes: '',
  contact_role: '', organization: '', preferred_channel: 'whatsapp',
  service_type: '', for_whom: '',
  // section 2b — diagnosis
  persona: '', need_type: '',
  // section 2c — sport background + injuries (same columns as the flows)
  background_level: '', sports_experience: '', injury_level: '', injuries: '',
  // section 3 (dynamic)
  training_location: '', frequency_per_week: '', age_range: '',
  group_size: '', group_location: '', main_goal: '', workshop_topic: '', target_date: '',
  // section 3 — shared logistics
  preferred_days: '', preferred_hours: '', hours_exact: '',
  start_date_pref: '', constraints_note: '',
  groups: [{ size: '', ages: '' }],
  // section 4
  proposed_price: '', payer: '',
  // section 5
  next_step: '', follow_up: isoInDays(1), source: 'שיחה נכנסת',
});

const parseGroups = (raw) => {
  try { const a = typeof raw === 'string' ? JSON.parse(raw) : raw; if (Array.isArray(a) && a.length) return a.map((g) => ({ size: g.size || '', ages: g.ages || '' })); } catch {}
  return [{ size: '', ages: '' }];
};

const fromLead = (l) => {
  if (!l) return blank();
  return {
    ...blank(),
    name: l.name || '', phone: l.phone || '', notes: l.notes || '',
    contact_role: l.contact_role || '', organization: l.organization || '',
    preferred_channel: l.preferred_channel || 'whatsapp',
    service_type: l.service_type || '', for_whom: l.for_whom || '',
    persona: l.persona || '', need_type: l.need_type || '',
    background_level: l.background_level || '', sports_experience: l.sports_experience || '',
    injury_level: l.injury_level || '', injuries: l.injuries || '',
    training_location: l.training_location || '',
    frequency_per_week: l.frequency_per_week || '', age_range: l.age_range || '',
    group_size: l.group_size || '', group_location: l.group_location || '',
    main_goal: l.fitness_goal || '', workshop_topic: l.workshop_topic || '', target_date: l.target_date || '',
    preferred_days: l.preferred_days || '',
    preferred_hours: (l.preferred_hours || '').split('|')[0] || '',
    hours_exact: (l.preferred_hours || '').split('|')[1] || '',
    start_date_pref: l.start_date_pref || '',
    constraints_note: l.constraints_note || '',
    groups: parseGroups(l.groups_detail),
    proposed_price: l.proposed_price || '', payer: l.payer || '',
    next_step: l.next_step || '',
    follow_up: l.next_follow_up ? String(l.next_follow_up).slice(0, 10) : isoInDays(1),
    source: l.source || 'שיחה נכנסת',
  };
};

export default function QuickIntakeForm({ isOpen, userId, lead, onClose, onSaved }) {
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [moneyOpen, setMoneyOpen] = useState(false);
  const [nextStepTouched, setNextStepTouched] = useState(false);
  const notesRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setF(fromLead(lead));
    setMoneyOpen(!!lead?.proposed_price);
    setNextStepTouched(!!lead?.next_step);
    setTimeout(() => { try { notesRef.current && notesRef.current.focus(); } catch {} }, 60);
  }, [isOpen, lead]);

  if (!isOpen) return null;

  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const st = f.service_type;
  // Group precision fields show when the service IS group, or when
  // "for whom = existing group" and no other service type is chosen —
  // so they never duplicate another service's fields.
  const groupish = st === 'group' || (!st && f.for_whom === 'group');
  const payerHere = f.for_whom === 'org' || f.for_whom === 'group';
  // Multi-select CSV helpers for days / hours.
  const csvSel = (field) => (f[field] ? f[field].split(',').filter(Boolean) : []);
  const toggleCsv = (field, v) => {
    const arr = csvSel(field);
    set({ [field]: (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]).join(',') });
  };
  const days = csvSel('preferred_days');
  const hours = csvSel('preferred_hours');
  // Multi-group editor (group leads).
  const setGroup = (i, patch) => set({ groups: f.groups.map((g, idx) => (idx === i ? { ...g, ...patch } : g)) });
  const addGroup = () => set({ groups: [...f.groups, { size: '', ages: '' }] });
  const removeGroup = (i) => set({ groups: f.groups.length > 1 ? f.groups.filter((_, idx) => idx !== i) : f.groups });

  // Diagnosis (2b): persona drives needs + the response card + a smart
  // "next step" default (until the coach overrides it manually).
  const needs = f.need_type ? f.need_type.split(',').filter(Boolean) : [];
  const pickPersona = (key) => {
    setF((p) => {
      const persona = p.persona === key ? '' : key;
      return {
        ...p, persona, need_type: '', // needs are persona-specific
        ...(nextStepTouched || !persona ? {} : { next_step: smartNextStep(persona, p.service_type) }),
      };
    });
  };
  const toggleNeed = (n) => {
    if (needs.includes(n)) set({ need_type: needs.filter((x) => x !== n).join(',') });
    else if (needs.length < 2) set({ need_type: [...needs, n].join(',') }); // up to two
  };
  // Needs "אחר" — the free-text need is stored IN need_type (replacing the
  // literal "אחר"). customNeed = the entry not in the persona's standard list.
  const stdNeeds = NEEDS_BY_PERSONA[f.persona] || [];
  const customNeed = needs.find((n) => !stdNeeds.includes(n)) || '';
  const toggleOtherNeed = () => {
    if (customNeed) set({ need_type: needs.filter((n) => n !== customNeed).join(',') });
    else if (needs.length < 2) set({ need_type: [...needs, 'אחר'].join(',') });
  };
  const setOtherNeed = (text) => {
    const base = needs.filter((n) => n !== customNeed);
    set({ need_type: [...base, text.trim() || 'אחר'].join(',') });
  };
  const response = f.persona ? buildNeedResponse({ persona: f.persona, needs, serviceType: f.service_type }) : null;
  // Sport-background precision layer (2c) — same copy + focus the flows use.
  const bgCopy = backgroundCopy(groupish);
  const bgFocus = backgroundFocus(f);

  const save = async () => {
    if (!f.name.trim() || !f.phone.trim() || !f.notes.trim()) {
      toast.error('חסר שם, טלפון או הערות');
      return;
    }
    setBusy(true);
    // Section-3 columns — only the ones the active service type uses.
    const sec3 = {
      training_location: null, frequency_per_week: null, age_range: null,
      group_size: null, group_location: null, fitness_goal: null, workshop_topic: null, target_date: null, groups_detail: null,
    };
    if (st === 'personal') { sec3.training_location = f.training_location || null; sec3.frequency_per_week = f.frequency_per_week.trim() || null; }
    else if (st === 'online') { sec3.frequency_per_week = f.frequency_per_week.trim() || null; sec3.fitness_goal = f.main_goal.trim() || null; }
    else if (st === 'workshop') { sec3.workshop_topic = f.workshop_topic.trim() || null; sec3.group_size = f.group_size.trim() || null; sec3.target_date = f.target_date || null; sec3.group_location = f.group_location.trim() || null; }
    else if (st === 'movement65') { sec3.group_location = f.group_location.trim() || null; sec3.group_size = f.group_size.trim() || null; sec3.frequency_per_week = f.frequency_per_week.trim() || null; }
    else if (st === 'other') { sec3.fitness_goal = f.main_goal.trim() || null; }
    // Group data persists whenever it's a group lead (service type OR
    // for_whom = existing group). Primary group's size → group_size for
    // the summary/kanban; full list → groups_detail.
    if (groupish) {
      const gd = f.groups.filter((g) => (g.size || '').trim() || (g.ages || '').trim());
      sec3.groups_detail = gd.length ? JSON.stringify(gd) : null;
      sec3.group_size = (f.groups[0]?.size || '').trim() || null;
      sec3.age_range = (f.groups[0]?.ages || '').trim() || null;
      sec3.group_location = f.group_location.trim() || null;
      sec3.frequency_per_week = f.frequency_per_week.trim() || null;
    }

    // Shared logistics (days/hours for scheduled services; start/constraints for any).
    const logistics = {
      preferred_days: SCHEDULED.includes(st) ? (f.preferred_days || null) : null,
      preferred_hours: SCHEDULED.includes(st) ? ((f.hours_exact.trim() ? `${f.preferred_hours}|${f.hours_exact.trim()}` : f.preferred_hours) || null) : null,
      start_date_pref: st ? (f.start_date_pref || null) : null,
      constraints_note: st ? (f.constraints_note.trim() || null) : null,
    };

    const payload = {
      name: f.name.trim(), phone: f.phone.trim(), notes: f.notes,
      contact_role: f.contact_role || null, organization: f.organization.trim() || null,
      preferred_channel: f.preferred_channel || 'whatsapp',
      service_type: f.service_type || null, for_whom: f.for_whom || null,
      persona: f.persona || null, need_type: f.need_type || null,
      background_level: f.background_level || null,
      sports_experience: f.sports_experience.trim() || null,
      injury_level: f.injury_level || null,
      injuries: f.injuries.trim() || null,
      lead_type: deriveLeadType(f) || null,
      ...sec3, ...logistics,
      proposed_price: f.proposed_price.trim() || null, payer: payerHere ? (f.payer || null) : null,
      next_step: f.next_step || null,
      source: f.source || 'שיחה נכנסת',
      next_follow_up: f.follow_up || null,
    };
    try {
      if (lead?.id) await updateLead(lead.id, payload);
      else await addLead(userId, { ...payload, status: 'new' });
      toast.success(lead?.id ? 'הליד עודכן' : 'הליד נשמר');
      onSaved?.(); onClose?.();
    } catch (e) {
      console.error('[QuickIntake] save error', e);
      toast.error('שגיאה בשמירה: ' + (e?.message || ''));
    } finally { setBusy(false); }
  };

  return (
    <div dir="rtl" style={{
      // Match the working overlays (GuidedLeadFlow / LeadDetailView): fill
      // the viewport with `inset:0` ONLY. The previous `height:100dvh`
      // mis-resolved in the Android WebView, handing the flex scroll body
      // a wrong height that clipped every section. inset:0 (top/bottom:0)
      // sizes the overlay from the viewport offsets — reliable everywhere.
      position: 'fixed', inset: 0,
      background: 'var(--cream, #FBF3EA)', zIndex: 1600,
      display: 'flex', flexDirection: 'column', fontFamily: "'Rubik', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)', paddingInline: SIDE, paddingBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button type="button" onClick={onClose} aria-label="סגור" style={iconBtn}><X size={22} color="#5C4A3A" /></button>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 800, color: '#1A1A1A' }}>קליטה מהירה</div>
      </div>

      {/* Body — the ONE scroll region. Each section grows to its content
          (no hard heights). onFocusCapture keeps the active field visible
          above the keyboard / sticky Save. */}
      <div onFocusCapture={(e) => { const t = e.target; setTimeout(() => { try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {} }, 300); }}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `8px ${SIDE}px 20px`, display: 'block' }}>

        {/* ═══ 1 — מי מתקשר ═══ */}
        <Section title="1 · מי מתקשר">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: GAP_COL }}>
            <Field label="שם *"><input style={inp} enterKeyHint="next" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="שם" /></Field>
            <Field label="טלפון *"><input style={{ ...inp, direction: 'ltr', textAlign: 'left' }} type="tel" inputMode="tel" enterKeyHint="next" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="050-0000000" /></Field>
          </div>
          <Field label="מה הוא אמר? *">
            <textarea ref={notesRef} style={{ ...inp, height: 'auto', minHeight: 120, lineHeight: 1.5 }} rows={5}
              value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="כתוב חופשי מה הוא אמר בשיחה..." />
          </Field>
          <Field label="תפקיד"><ChipsOther options={ROLE_CHIPS} value={f.contact_role} onChange={(v) => set({ contact_role: v })} hint="מה התפקיד? (למשל: מנהלת קהילה, רכז נוער)" /></Field>
          <Field label="ארגון / יישוב"><input style={inp} value={f.organization} onChange={(e) => set({ organization: e.target.value })} placeholder="לא חובה" /></Field>
          <Field label="ערוץ מועדף">
            <Chips options={CHANNELS.map((c) => c.label)} value={CHANNELS.find((c) => c.key === f.preferred_channel)?.label}
              onPick={(lbl) => set({ preferred_channel: CHANNELS.find((c) => c.label === lbl)?.key })} />
          </Field>
        </Section>

        {/* ═══ 2 — מה מבקשים (precision fields live directly UNDER the
              chip they refine — each datum appears once) ═══ */}
        <Section title="2 · מה מבקשים">
          <Field label="סוג שירות">
            <Chips options={SERVICE_TYPES.map((t) => t.label)} value={SERVICE_LABEL[f.service_type]}
              onPick={(lbl) => set({ service_type: SERVICE_TYPES.find((t) => t.label === lbl)?.key })} />
          </Field>

          {/* Service-type precision — under the chip */}
          {st === 'personal' && (<>
            <Field label="מיקום"><Chips options={LOCATIONS} value={f.training_location} onPick={(v) => set({ training_location: f.training_location === v ? '' : v })} /></Field>
            <Field label="תדירות בשבוע"><input style={inp} value={f.frequency_per_week} onChange={(e) => set({ frequency_per_week: e.target.value })} placeholder="למשל 2" /></Field>
          </>)}
          {groupish && (<>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 800, color: '#C24A0A', marginBottom: GAP_LABEL, textAlign: 'right' }}>כמה אנשים?</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {f.groups.map((g, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input style={{ ...inp, flex: 1, minHeight: 56, fontSize: 18, fontWeight: 800, textAlign: 'center' }} inputMode="numeric" enterKeyHint="next" value={g.size} onChange={(e) => setGroup(i, { size: e.target.value })} placeholder="מספר אנשים" />
                    <input style={{ ...inp, flex: 1 }} value={g.ages} onChange={(e) => setGroup(i, { ages: e.target.value })} placeholder="טווח גילאים" />
                    {f.groups.length > 1 && (<button type="button" onClick={() => removeGroup(i)} aria-label="הסר קבוצה" style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 10, border: '1px solid #F0E4D0', background: '#fff', color: '#dc2626', fontSize: 18, cursor: 'pointer' }}>×</button>)}
                  </div>
                ))}
              </div>
              <button type="button" onClick={addGroup} style={{ marginTop: 8, border: `1px dashed ${ORANGE}`, background: '#FFF7ED', color: '#C24A0A', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>+ הוסף קבוצה</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: GAP_COL }}>
              <Field label="תדירות בשבוע"><input style={inp} value={f.frequency_per_week} onChange={(e) => set({ frequency_per_week: e.target.value })} placeholder="2" /></Field>
              <Field label="מיקום הפעילות"><input style={inp} value={f.group_location} onChange={(e) => set({ group_location: e.target.value })} placeholder="איפה" /></Field>
            </div>
          </>)}
          {st === 'online' && (<>
            <Field label="תדירות מפגשי וידאו"><input style={inp} value={f.frequency_per_week} onChange={(e) => set({ frequency_per_week: e.target.value })} placeholder="בשבוע" /></Field>
            <Field label="מטרה עיקרית"><input style={inp} value={f.main_goal} onChange={(e) => set({ main_goal: e.target.value })} placeholder="במשפט קצר" /></Field>
          </>)}
          {st === 'workshop' && (<>
            <Field label="נושא מבוקש"><input style={inp} value={f.workshop_topic} onChange={(e) => set({ workshop_topic: e.target.value })} placeholder="נושא הסדנה" /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: GAP_COL }}>
              <Field label="משתתפים משוער"><input style={inp} value={f.group_size} onChange={(e) => set({ group_size: e.target.value })} placeholder="מספר" /></Field>
              <Field label="תאריך יעד"><input style={inp} type="date" value={f.target_date} onChange={(e) => set({ target_date: e.target.value })} /></Field>
            </div>
            <Field label="מיקום"><input style={inp} value={f.group_location} onChange={(e) => set({ group_location: e.target.value })} placeholder="איפה" /></Field>
          </>)}
          {st === 'movement65' && (<>
            <Field label="מיקום"><input style={inp} value={f.group_location} onChange={(e) => set({ group_location: e.target.value })} placeholder="איפה" /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: GAP_COL }}>
              <Field label="משתתפים משוער"><input style={inp} value={f.group_size} onChange={(e) => set({ group_size: e.target.value })} placeholder="מספר" /></Field>
              <Field label="תדירות בשבוע"><input style={inp} value={f.frequency_per_week} onChange={(e) => set({ frequency_per_week: e.target.value })} placeholder="2" /></Field>
            </div>
          </>)}
          {/* Service type "אחר" — description already captured here (item 2).
              The chip value stays the key 'other'; the text lives in its
              own detail field (fitness_goal) since service_type must remain
              a key for the app's logic. */}
          {st === 'other' && (<Field label="תיאור השירות המבוקש"><textarea style={{ ...inp, height: 'auto', minHeight: 70 }} rows={3} value={f.main_goal} onChange={(e) => set({ main_goal: e.target.value })} placeholder="איזה שירות הם מבקשים?" /></Field>)}

          <Field label="עבור מי">
            <Chips options={FOR_WHOM.map((t) => t.label)} value={FORWHOM_LABEL[f.for_whom]}
              onPick={(lbl) => set({ for_whom: FOR_WHOM.find((t) => t.label === lbl)?.key })} />
          </Field>
          {/* "for whom" precision — who pays (org / existing group). Lives
              here ONLY, not in the money section. */}
          {payerHere && (
            <Field label="מי מממן"><Chips options={PAYERS} value={f.payer} onPick={(v) => set({ payer: f.payer === v ? '' : v })} /></Field>
          )}
        </Section>

        {/* ═══ 2b — אבחון צורך ומענה (after a service type is chosen) ═══ */}
        {st && (
          <Section title="2ב · אבחון צורך">
            <Field label="פרסונה">
              <Chips options={NEED_PERSONAS.map((p) => p.label)} value={NEED_PERSONAS.find((p) => p.key === f.persona)?.label}
                onPick={(lbl) => pickPersona(NEED_PERSONAS.find((p) => p.label === lbl)?.key)} />
            </Field>
            {f.persona && (
              <Field label="הצורך המרכזי (עד שניים)">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: GAP_CHIP }}>
                  {stdNeeds.map((o) => <button key={o} type="button" onClick={() => toggleNeed(o)} style={chipStyle(needs.includes(o))}>{o}</button>)}
                  <button type="button" onClick={toggleOtherNeed} style={chipStyle(!!customNeed)}>אחר</button>
                </div>
                {customNeed && (
                  <input style={{ ...inp, marginTop: 8 }} value={customNeed === 'אחר' ? '' : customNeed}
                    onChange={(e) => setOtherNeed(e.target.value)} placeholder="מה הצורך?" />
                )}
              </Field>
            )}
            {/* Our-answer card — connection line + matching offer + one question */}
            {response && (
              <div style={{ background: '#FFF4E6', border: `1px solid ${ORANGE}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#C24A0A' }}>🎯 המענה שלנו</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#4A1B0C', lineHeight: 1.5, userSelect: 'text' }}>{response.connection}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A', background: '#fff', borderRadius: 8, padding: '7px 10px', border: '1px solid #F0D9C6' }}>💡 {response.offer}</div>
                <div style={{ fontSize: 12.5, fontStyle: 'italic', color: '#8A4A1E', lineHeight: 1.45 }}>לשאול עכשיו: {response.question}</div>
              </div>
            )}
          </Section>
        )}

        {/* ═══ 2ג — רקע ופציעות (same chips/fields/columns as the guided
              flows — one brain across every intake path) ═══ */}
        {(st || groupish) && (
          <Section title="2ג · רקע ופציעות">
            <div style={{ fontSize: 12, fontStyle: 'italic', color: '#C2743A', lineHeight: 1.45 }}>🗣 {ASK_NOW.background}</div>
            <Field label={bgCopy.levelLabel}>
              <Chips options={BACKGROUND_CHIPS.map((o) => o.label)} value={f.background_level}
                onPick={(v) => set({ background_level: f.background_level === v ? '' : v })} />
            </Field>
            <Field label={bgCopy.levelDetail}>
              <input style={inp} value={f.sports_experience} onChange={(e) => set({ sports_experience: e.target.value })} placeholder={bgCopy.levelDetail} />
            </Field>
            <Field label={bgCopy.injuryLabel}>
              <Chips options={INJURY_CHIPS.map((o) => o.label)} value={f.injury_level}
                onPick={(v) => set({ injury_level: f.injury_level === v ? '' : v })} />
            </Field>
            {f.injury_level && f.injury_level !== 'אין' && (
              <Field label={bgCopy.injuryDetail}>
                <input style={inp} value={f.injuries} onChange={(e) => set({ injuries: e.target.value })} placeholder={bgCopy.injuryDetail} />
              </Field>
            )}
            {bgFocus && (
              <div style={{ background: '#FFF4E6', border: `1px solid ${ORANGE}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#C24A0A' }}>🎯 לאן לכוון</div>
                {bgFocus.tips.map((t, i) => (
                  <div key={i} style={{ fontSize: 14, fontWeight: 700, color: '#4A1B0C', lineHeight: 1.5 }}>· {t}</div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* ═══ 3 — איפה ומתי — ONLY the shared logistics not already shown
              in the precision layers above (days / hours / start / limits).
              Hidden entirely until a service type / group is chosen. ═══ */}
        {(st || groupish) && (
          <Section title="3 · איפה ומתי">
            {(SCHEDULED.includes(st) || groupish) && (<>
              <Field label="ימים מועדפים"><MultiChips options={DAYS} selected={days} onToggle={(d) => toggleCsv('preferred_days', d)} /></Field>
              <Field label="שעות מועדפות">
                <MultiChips options={HOURS} selected={hours} onToggle={(h) => toggleCsv('preferred_hours', h)} />
                <input style={{ ...inp, marginTop: 6 }} value={f.hours_exact} onChange={(e) => set({ hours_exact: e.target.value })} placeholder="שעות מדויקות (לא חובה)" />
              </Field>
            </>)}
            <Field label="תאריך התחלה רצוי">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: GAP_CHIP, alignItems: 'center' }}>
                {START_OPTS.map((o) => (
                  <button key={o.key} type="button" onClick={() => set({ start_date_pref: f.start_date_pref === o.key ? '' : o.key })} style={chipStyle(f.start_date_pref === o.key)}>{o.label}</button>
                ))}
                {(() => {
                  const custom = f.start_date_pref && !START_OPTS.some((o) => o.key === f.start_date_pref);
                  return (
                    <label style={{ ...chipStyle(custom), cursor: 'pointer', position: 'relative' }}>
                      {custom ? f.start_date_pref : 'תאריך מותאם'}
                      <input type="date" value={custom ? f.start_date_pref : ''} onChange={(e) => set({ start_date_pref: e.target.value })} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
                    </label>
                  );
                })()}
              </div>
            </Field>
            <Field label="מגבלות / הערה"><input style={inp} value={f.constraints_note} onChange={(e) => set({ constraints_note: e.target.value })} placeholder="פציעות, נגישות, ציוד במקום..." /></Field>
          </Section>
        )}

        {/* ═══ 4 — כסף (collapsed by default) ═══ */}
        <div style={sectionCard}>
          <button type="button" onClick={() => setMoneyOpen((v) => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span style={{ flex: 1, textAlign: 'right', fontSize: 13, fontWeight: 800, color: '#5C4A3A' }}>4 · כסף</span>
            <ChevronDown size={18} color="#9A8F82" style={{ transform: moneyOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </button>
          {moneyOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: GAP_FIELD, marginTop: 10 }}>
              {/* מי מממן moved up under "עבור מי" — not duplicated here. */}
              <Field label="מחיר שהוצע / תקציב"><input style={inp} inputMode="numeric" value={f.proposed_price} onChange={(e) => set({ proposed_price: e.target.value })} placeholder="₪ (לא חובה)" /></Field>
            </div>
          )}
        </div>

        {/* ═══ 5 — מה הלאה ═══ */}
        <Section title="5 · מה הלאה">
          <Field label="הצעד הבא"><Chips options={NEXT_STEPS} value={f.next_step} onPick={(v) => { setNextStepTouched(true); set({ next_step: f.next_step === v ? '' : v }); }} /></Field>
          <Field label="מתי לחזור"><FollowupChips value={f.follow_up} onChange={(d) => set({ follow_up: d })} /></Field>
          <Field label="מקור"><ChipsOther options={SOURCES} value={f.source} onChange={(v) => set({ source: v })} hint="מאיפה הגיע?" /></Field>
        </Section>
      </div>

      {/* Save — sticky at the bottom, always visible (outside the scroll). */}
      <div style={{ flexShrink: 0, padding: `10px ${SIDE}px`, paddingBottom: 'max(env(safe-area-inset-bottom), 12px)', borderTop: '1px solid #F0E4D0', background: '#fff' }}>
        <button type="button" onClick={save} disabled={busy} style={{
          width: '100%', minHeight: 54, borderRadius: 14, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg,#FF6F20,#FF8A42)', color: '#fff', fontSize: 18, fontWeight: 900,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.6 : 1,
        }}>
          {busy && <Loader2 size={18} className="animate-spin" />} שמור ליד
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={sectionCard}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#C24A0A', marginBottom: 10, textAlign: 'right' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: GAP_FIELD }}>{children}</div>
    </div>
  );
}

function Chips({ options, value, onPick }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: GAP_CHIP }}>
      {options.map((o) => {
        const on = value === o;
        return <button key={o} type="button" onClick={() => onPick(o)} style={chipStyle(on)}>{o}</button>;
      })}
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
// Single-select chips whose last option is "אחר": choosing it opens a
// short detail field, and the FREE TEXT becomes the value (stored to the
// same column, replacing the word "אחר"). A bare 'אחר' is the sentinel
// while the field is still empty.
function ChipsOther({ options, value, onChange, hint }) {
  const std = options.filter((o) => o !== 'אחר');
  const isOther = value === 'אחר' || (!!value && !std.includes(value));
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: GAP_CHIP }}>
        {options.map((o) => {
          const on = o === 'אחר' ? isOther : value === o;
          const onClick = () => onChange(o === 'אחר' ? (isOther ? '' : 'אחר') : (value === o ? '' : o));
          return <button key={o} type="button" onClick={onClick} style={chipStyle(on)}>{o}</button>;
        })}
      </div>
      {isOther && (
        <input style={{ ...inp, marginTop: 8 }} value={value === 'אחר' ? '' : value}
          onChange={(e) => onChange(e.target.value.trim() ? e.target.value : 'אחר')} placeholder={hint} />
      )}
    </>
  );
}
// Uniform chip: same height/padding in both states. Selected = full orange
// fill + white text; unselected = subtle outline. 1px border in BOTH states
// (box-sizing:border-box) so a selection never nudges the row height.
const chipStyle = (on) => ({
  minHeight: CHIP_H, padding: '0 14px', borderRadius: 999, cursor: 'pointer', boxSizing: 'border-box',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: `1px solid ${on ? ORANGE : '#E4D8C6'}`,
  background: on ? ORANGE : '#fff', color: on ? '#fff' : '#3a3a3a',
  fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
});

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#9A8F82', marginBottom: GAP_LABEL, textAlign: 'right' }}>{label}</label>
      {children}
    </div>
  );
}

// ── Shared layout tokens — one value each, used across the whole form ──
const SIDE = 16;          // horizontal margins (every section / field / button)
const GAP_SECTION = 16;   // vertical gap between section cards
const GAP_FIELD = 12;     // vertical gap between fields inside a section
const GAP_COL = 12;       // gap between the two equal columns (name/phone …)
const GAP_CHIP = 8;       // gap between chips (wrap to next line, never clipped)
const GAP_LABEL = 6;      // label → its field
const INPUT_H = 48;       // finger-friendly input height
const CHIP_H = 40;        // uniform chip height (all chip rows)

const iconBtn = { background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, display: 'flex' };
// Every direct child of the (now block-flow) scroll body is a sectionCard.
// marginBottom replaces the old flex `gap`. Block flow means a section can
// NEVER be compressed to fit — it takes its full content height and the
// body scrolls. flexShrink:0 is a belt-and-suspenders guard in case a
// parent ever re-introduces a flex context.
const sectionCard = { background: '#fff', border: '1px solid #F0E4D0', borderRadius: 14, padding: 12, marginBottom: GAP_SECTION, flexShrink: 0 };
const inp = {
  width: '100%', minHeight: INPUT_H, padding: '10px 12px', borderRadius: 10,
  border: '1px solid #F0E4D0', background: '#fff', fontSize: 14, color: '#1A1A1A',
  outline: 'none', boxSizing: 'border-box', resize: 'none', textAlign: 'right',
  fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
};
