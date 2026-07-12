import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { addLead, updateLead } from '@/lib/lifeos/lifeos-api';
import { isoInDays } from '@/lib/lifeos/lead-helpers';
import FollowupChips from '@/components/lifeos/FollowupChips';
import { toast } from 'sonner';

// ── Quick lead intake ("קליטה מהירה") ───────────────────────────────
// A single-page, no-steps form for INBOUND calls where the lead drives
// the conversation (esp. business / existing-group leads). Complements
// the 9-step wizard (GuidedLeadFlow) — does not replace it.
//
// Reuses existing columns where they exist: name, phone, notes, source,
// status. New columns: lead_type, contact_role, organization,
// preferred_channel, group_size, group_location, frequency_per_week,
// proposed_price, payer (offer fields our_offer/offer_status live on the
// lead card, not here). base44's 42703 retry strips columns that don't
// exist yet, so saving is safe before the SQL migration runs.

const ORANGE = '#FF6F20';

const ROLE_CHIPS = ['מארגן הקבוצה', 'רכז/ת', 'מנהל/ת', 'הורה', 'המתאמן עצמו', 'אחר'];
const CHANNELS = [{ key: 'whatsapp', label: 'וואטסאפ' }, { key: 'phone', label: 'טלפון' }];
const TYPES = [
  { key: 'private',  label: 'פרטי' },
  { key: 'group',    label: 'קבוצה קיימת' },
  { key: 'business', label: 'עסק-ארגון' },
];
const PAYERS = ['המשתתפים', 'הארגון'];
const SOURCES = ['שיחה נכנסת', 'הפניה', 'אחר'];

// A quick lead "needs completion" until its type is classified.
export const needsCompletion = (l) => !!(l?.preferred_channel) && !l?.lead_type;
export const isBusinessLead = (l) => l?.lead_type === 'group' || l?.lead_type === 'business';
export const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.key, t.label]));

const blank = () => ({
  name: '', phone: '', notes: '',
  contact_role: '', organization: '',
  preferred_channel: 'whatsapp',
  lead_type: '',
  group_size: '', group_location: '', frequency_per_week: '', proposed_price: '', payer: '',
  source: 'שיחה נכנסת',
  follow_up: isoInDays(1), // when to call back — default tomorrow
});

const fromLead = (l) => {
  if (!l) return blank();
  return {
    ...blank(),
    name: l.name || '', phone: l.phone || '', notes: l.notes || '',
    contact_role: l.contact_role || '', organization: l.organization || '',
    preferred_channel: l.preferred_channel || 'whatsapp',
    lead_type: l.lead_type || '',
    group_size: l.group_size || '', group_location: l.group_location || '',
    frequency_per_week: l.frequency_per_week || '', proposed_price: l.proposed_price || '',
    payer: l.payer || '',
    source: l.source || 'שיחה נכנסת',
    follow_up: l.next_follow_up ? String(l.next_follow_up).slice(0, 10) : isoInDays(1),
  };
};

export default function QuickIntakeForm({ isOpen, userId, lead, onClose, onSaved }) {
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const notesRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setF(fromLead(lead));
    // Auto-focus the free-notes field ("מה הוא אמר") on open.
    setTimeout(() => { try { notesRef.current && notesRef.current.focus(); } catch {} }, 60);
  }, [isOpen, lead]);

  if (!isOpen) return null;

  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const showGroup = f.lead_type === 'group' || f.lead_type === 'business';

  const save = async () => {
    if (!f.name.trim() || !f.phone.trim() || !f.notes.trim()) {
      toast.error('חסר שם, טלפון או הערות');
      return;
    }
    setBusy(true);
    const payload = {
      name: f.name.trim(),
      phone: f.phone.trim(),
      notes: f.notes,
      contact_role: f.contact_role || null,
      organization: f.organization.trim() || null,
      preferred_channel: f.preferred_channel || 'whatsapp',
      lead_type: f.lead_type || null,
      group_size: showGroup ? (f.group_size.trim() || null) : null,
      group_location: showGroup ? (f.group_location.trim() || null) : null,
      frequency_per_week: showGroup ? (f.frequency_per_week.trim() || null) : null,
      proposed_price: showGroup ? (f.proposed_price.trim() || null) : null,
      payer: showGroup ? (f.payer || null) : null,
      source: f.source || 'שיחה נכנסת',
      next_follow_up: f.follow_up || null,
    };
    try {
      if (lead?.id) await updateLead(lead.id, payload);
      else await addLead(userId, { ...payload, status: 'new' });
      toast.success(lead?.id ? 'הליד עודכן' : 'הליד נשמר');
      onSaved?.();
      onClose?.();
    } catch (e) {
      console.error('[QuickIntake] save error', e);
      toast.error('שגיאה בשמירה: ' + (e?.message || ''));
    } finally { setBusy(false); }
  };

  return (
    <div dir="rtl" style={{
      position: 'fixed', inset: 0, background: 'var(--cream, #FBF3EA)', zIndex: 1600,
      display: 'flex', flexDirection: 'column', fontFamily: "'Rubik', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)', paddingInline: 14, paddingBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button type="button" onClick={onClose} aria-label="סגור" style={iconBtn}><X size={22} color="#5C4A3A" /></button>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 800, color: '#1A1A1A' }}>קליטה מהירה</div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 1. Name + phone (side by side, first) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="שם איש הקשר *"><input style={inp} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="שם" /></Field>
          <Field label="טלפון *"><input style={{ ...inp, direction: 'ltr', textAlign: 'left' }} type="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="050-0000000" /></Field>
        </div>

        {/* 2. Free notes — the focus of the form */}
        <Field label="מה הוא אמר? *">
          <textarea ref={notesRef} style={{ ...inp, height: 'auto', minHeight: 120, lineHeight: 1.5 }} rows={5}
            value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="כתוב חופשי מה הוא אמר בשיחה..." />
        </Field>

        {/* 3. Role */}
        <Field label="תפקיד">
          <Chips options={ROLE_CHIPS} value={f.contact_role} onPick={(v) => set({ contact_role: f.contact_role === v ? '' : v })} />
        </Field>

        {/* 4. Organization / town */}
        <Field label="ארגון / יישוב"><input style={inp} value={f.organization} onChange={(e) => set({ organization: e.target.value })} placeholder="לא חובה" /></Field>

        {/* 5. Preferred channel */}
        <Field label="ערוץ קשר מועדף">
          <Chips options={CHANNELS.map((c) => c.label)} value={CHANNELS.find((c) => c.key === f.preferred_channel)?.label}
            onPick={(lbl) => set({ preferred_channel: CHANNELS.find((c) => c.label === lbl)?.key })} />
        </Field>

        {/* 6. Lead type */}
        <Field label="סוג ליד">
          <Chips options={TYPES.map((t) => t.label)} value={TYPE_LABEL[f.lead_type]}
            onPick={(lbl) => set({ lead_type: TYPES.find((t) => t.label === lbl)?.key })} />
        </Field>

        {/* 7. Group/business details — only when relevant */}
        {showGroup && (
          <div style={{ background: '#FFF4E6', border: `1px solid ${ORANGE}`, borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#C24A0A' }}>פרטי קבוצה / עסק</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="גודל קבוצה"><input style={inp} value={f.group_size} onChange={(e) => set({ group_size: e.target.value })} placeholder="למשל 8-10" /></Field>
              <Field label="תדירות בשבוע"><input style={inp} value={f.frequency_per_week} onChange={(e) => set({ frequency_per_week: e.target.value })} placeholder="למשל 2" /></Field>
            </div>
            <Field label="מיקום הפעילות"><input style={inp} value={f.group_location} onChange={(e) => set({ group_location: e.target.value })} placeholder="איפה מתאמנים" /></Field>
            <Field label="מחיר שהוצע"><input style={inp} value={f.proposed_price} onChange={(e) => set({ proposed_price: e.target.value })} placeholder="₪" /></Field>
            <Field label="מי מממן">
              <Chips options={PAYERS} value={f.payer} onPick={(v) => set({ payer: f.payer === v ? '' : v })} />
            </Field>
          </div>
        )}

        {/* 8. Source */}
        <Field label="מקור">
          <Chips options={SOURCES} value={f.source} onPick={(v) => set({ source: v })} />
        </Field>

        {/* Follow-up — when to call back (default tomorrow) */}
        <Field label="מתי לחזור אליו">
          <FollowupChips value={f.follow_up} onChange={(d) => set({ follow_up: d })} />
        </Field>
      </div>

      {/* Save — always available, pinned */}
      <div style={{ flexShrink: 0, padding: '8px 14px', paddingBottom: 'max(env(safe-area-inset-bottom), 10px)', borderTop: '1px solid #F0E4D0', background: '#fff' }}>
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

function Chips({ options, value, onPick }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => {
        const on = value === o;
        return (
          <button key={o} type="button" onClick={() => onPick(o)} style={{
            minHeight: 36, padding: '0 13px', borderRadius: 999, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: on ? `2px solid ${ORANGE}` : '1px solid #F0E4D0',
            background: on ? ORANGE : '#fff', color: on ? '#fff' : '#3a3a3a',
            fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
          }}>{o}</button>
        );
      })}
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

const iconBtn = { background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, display: 'flex' };
const inp = {
  width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 10,
  border: '1px solid #F0E4D0', background: '#fff', fontSize: 14, color: '#1A1A1A',
  outline: 'none', boxSizing: 'border-box', resize: 'none',
  fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
};
