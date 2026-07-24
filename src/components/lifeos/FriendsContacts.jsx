import React, { useEffect, useState } from 'react';
import { Users, Plus, X, Trash2, Check, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { FOCUS, isoDate, hexAlpha, listContacts, addContact, updateContact, deleteContact } from '@/lib/lifeos/focus-api';

const fmtDate = (iso) => {
  if (!iso) return '';
  try { return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' }).format(new Date(iso + 'T00:00:00')); }
  catch { return iso; }
};

// ─── Personal contact log for the חברים ומשפחה domain ──────────────
// Simple list: name · relationship/note · last-contacted. Add, mark-contacted
// (sets today), delete. Read-only-friendly: if the table isn't there yet the
// list is just empty. Not a CRM — no pipeline/stages.
export default function FriendsContacts({ userId }) {
  const [contacts, setContacts] = useState([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [last, setLast] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!userId) return;
    listContacts(userId).then(setContacts).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userId]);

  const save = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      const created = await addContact(userId, { name: n, relation: relation.trim() || null, last_contacted: last || null });
      setContacts(c => [...c, created]);
      setName(''); setRelation(''); setLast(''); setAdding(false);
      toast.success('נוסף איש קשר ✓');
    } catch { toast.error('שגיאה בהוספה'); }
    finally { setBusy(false); }
  };

  const markContacted = async (c) => {
    const today = isoDate();
    setContacts(list => list.map(x => x.id === c.id ? { ...x, last_contacted: today } : x));
    try { await updateContact(c.id, { last_contacted: today }); } catch { toast.error('שגיאה'); load(); }
  };
  const remove = async (c) => {
    setContacts(list => list.filter(x => x.id !== c.id));
    try { await deleteContact(c.id); toast('נמחק'); } catch { toast.error('שגיאה'); load(); }
  };

  return (
    <div style={{ margin: '8px 12px 4px', background: FOCUS.card, border: `1px solid ${FOCUS.border}`, borderRadius: 14, boxShadow: FOCUS.neu, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: '#EEF3FB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Users size={17} color="#0C447C" />
        </div>
        <div style={{ flex: 1, textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: FOCUS.ink }}>אנשי קשר · חברים ומשפחה</div>
          <div style={{ fontSize: 11, color: FOCUS.muted, marginTop: 1 }}>{contacts.length ? `${contacts.length} אנשי קשר` : 'הוסף אנשים חשובים'}</div>
        </div>
        <ChevronDown size={18} color={FOCUS.muted} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{ padding: '0 12px 12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {contacts.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 11, border: `1px solid ${FOCUS.border}`, background: '#FFFDFA' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: FOCUS.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: FOCUS.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.relation || 'ללא תיאור'}{c.last_contacted ? ` · דובר ${fmtDate(c.last_contacted)}` : ''}
                  </div>
                </div>
                <button onClick={() => markContacted(c)} title="סמן שדיברתם היום"
                  style={{ flexShrink: 0, minHeight: 34, padding: '0 10px', borderRadius: 9, border: 'none', background: hexAlpha(FOCUS.orange, 0.14), color: '#B4531A', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Check size={13} /> דיברנו
                </button>
                <button onClick={() => remove(c)} aria-label="מחק" style={{ flexShrink: 0, width: 30, height: 34, borderRadius: 9, border: 'none', background: '#FCEBEB', color: '#C0392B', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          {adding ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="שם" style={inp} />
              <input value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="קשר / הערה (למשל: אח, חבר מהצבא)" style={inp} />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: FOCUS.muted, flexShrink: 0 }}>דובר לאחרונה</span>
                <input type="date" value={last} onChange={(e) => setLast(e.target.value)} style={{ ...inp, flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={save} disabled={!name.trim() || busy} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: name.trim() ? FOCUS.orangeGrad : '#E6D8C6', color: '#fff', fontSize: 13.5, fontWeight: 800, cursor: name.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>{busy ? 'שומר…' : 'שמור'}</button>
                <button onClick={() => { setAdding(false); setName(''); setRelation(''); setLast(''); }} style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${FOCUS.border}`, background: '#fff', color: FOCUS.muted, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}><X size={16} /></button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 11, border: `1px dashed ${FOCUS.border}`, background: '#fff', color: FOCUS.orange, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Plus size={16} /> הוסף איש קשר
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const inp = { width: '100%', border: `1px solid ${FOCUS.border}`, borderRadius: 10, padding: '9px 11px', fontSize: 13.5, fontFamily: 'inherit', color: FOCUS.ink, background: '#FFFDFA', outline: 'none', boxSizing: 'border-box' };
