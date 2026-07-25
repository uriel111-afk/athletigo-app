import React, { useMemo, useState } from 'react';
import { X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { FOCUS, hexAlpha, BANK_TAG, INSPIRATION_TAG, PERSONAL_ARM_TITLE, indexNodes } from '@/lib/lifeos/focus-api';
import { addMode } from '@/lib/lifeos/personal-day-api';
import { isPassive, netMinutes } from '@/lib/lifeos/priority-engine';

// ─── הוסף מצב ──────────────────────────────────────────────────────
// A mode = a name + one MAIN task + an ordered ramp of small things that get
// you into it. Ramp entries may be habits or bank items; the main task must be
// a habit. Passive nodes (net_minutes 0) are offered nowhere here — same
// contract the priority engine enforces.
export default function ModeFormSheet({ userId, nodes = [], sortOrder = 100, onSaved, onClose }) {
  const [name, setName] = useState('');
  const [mainId, setMainId] = useState('');
  const [ramp, setRamp] = useState([]);      // ordered node ids
  const [busy, setBusy] = useState(false);

  const { children } = useMemo(() => indexNodes(nodes), [nodes]);
  const arm = useMemo(() => nodes.find(n => n.node_type !== 'task' && n.title === PERSONAL_ARM_TITLE), [nodes]);
  const branches = useMemo(() => (arm ? (children[arm.id] || []).filter(b => b.node_type === 'branch') : []), [arm, children]);

  const habits = useMemo(() => branches.flatMap(b => (children[b.id] || [])
    .filter(t => t.node_type === 'task' && !(t.tags || []).includes(BANK_TAG) && !(t.tags || []).includes(INSPIRATION_TAG) && !isPassive(t))
    .map(t => ({ ...t, __branch: b.title }))), [branches, children]);

  const rampChoices = useMemo(() => {
    const out = [];
    habits.forEach(h => {
      out.push({ id: h.id, title: h.title, sub: h.__branch, kind: 'habit' });
      (children[h.id] || [])
        .filter(k => (k.tags || []).includes(BANK_TAG))
        .forEach(k => out.push({ id: k.id, title: k.title, sub: h.title, kind: 'bank' }));
    });
    return out;
  }, [habits, children]);

  const toggleRamp = (id) => setRamp(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await addMode(userId, { name, main_node_id: mainId || null, ramp_node_ids: ramp, sort_order: sortOrder });
      toast.success('מצב נוסף ✓');
      onSaved && onSaved();
      onClose();
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); setBusy(false); }
  };

  return (
    <div dir="rtl" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1430, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '16px 16px calc(env(safe-area-inset-bottom,0px) + 20px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.15)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: FOCUS.ink }}>מצב חדש</div>
          <button onClick={onClose} aria-label="סגור" style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted }}><X size={20} /></button>
        </div>

        <div style={lbl}>שם המצב</div>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: מצב צילום" style={inp} />

        <div style={lbl}>המשימה המרכזית</div>
        <select value={mainId} onChange={(e) => setMainId(e.target.value)} style={inp}>
          <option value="">— בחר —</option>
          {habits.map(h => <option key={h.id} value={h.id}>{h.__branch} · {h.title}</option>)}
        </select>

        <div style={lbl}>רמפה — מה מכניס אותך למצב, לפי הסדר ({ramp.length})</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 260, overflowY: 'auto', border: `1px solid ${FOCUS.border}`, borderRadius: 12, padding: 6, background: '#FFFDFA' }}>
          {rampChoices.map(c => {
            const idx = ramp.indexOf(c.id);
            const on = idx >= 0;
            return (
              <button key={c.id} onClick={() => toggleRamp(c.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'right', fontFamily: 'inherit',
                  border: `1px solid ${on ? FOCUS.orange : 'transparent'}`, background: on ? hexAlpha(FOCUS.orange, 0.1) : '#fff' }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800,
                  border: on ? 'none' : `1.5px solid ${FOCUS.border}`, background: on ? FOCUS.orange : '#fff', color: '#fff' }}>
                  {on ? idx + 1 : ''}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: FOCUS.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                <span style={{ fontSize: 9.5, color: FOCUS.muted, flexShrink: 0 }}>{c.kind === 'bank' ? `בנק · ${c.sub}` : c.sub}</span>
              </button>
            );
          })}
        </div>

        <button onClick={save} disabled={!name.trim() || busy}
          style={{ width: '100%', marginTop: 16, padding: '13px', borderRadius: 14, border: 'none', background: !name.trim() ? FOCUS.border : FOCUS.orangeGrad, color: '#fff', fontSize: 15, fontWeight: 800, cursor: !name.trim() ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Check size={17} /> {busy ? 'שומר…' : 'שמור מצב'}
        </button>
      </div>
    </div>
  );
}

const lbl = { fontSize: 11, fontWeight: 700, color: FOCUS.muted, margin: '12px 0 5px' };
const inp = { width: '100%', boxSizing: 'border-box', border: `1px solid ${FOCUS.border}`, borderRadius: 11, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: FOCUS.ink, background: '#FFFDFA', outline: 'none' };
