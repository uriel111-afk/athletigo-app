import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AuthContext } from '@/lib/AuthContext';
import PersonalLayout from '@/components/personal/PersonalLayout';
import ContactCard from '@/components/personal/ContactCard';
import {
  PERSONAL_COLORS, PERSONAL_CARD,
  CONTACT_CATEGORIES, CONTACT_FREQUENCIES,
} from '@/lib/personal/personal-constants';
import {
  listContacts, addContact, deleteContact, updateContact,
  logInteraction, listInteractions,
} from '@/lib/personal/personal-api';

const daysBetween = (a, b) => Math.floor((a.getTime() - b.getTime()) / 86_400_000);

export default function People() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const [contacts, setContacts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try { setContacts(await listContacts(userId) || []); }
    catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
    finally { setLoaded(true); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const reminders = useMemo(() => {
    const now = new Date();
    const out = [];
    contacts.forEach(c => {
      if (c.birthday) {
        const b = new Date(c.birthday); b.setFullYear(now.getFullYear());
        const diff = daysBetween(b, now);
        if (diff === 0) out.push(`🎂 יום הולדת של ${c.name} היום!`);
        else if (diff > 0 && diff <= 3) out.push(`🎂 יום הולדת של ${c.name} בעוד ${diff} ימים`);
      }
    });
    return out;
  }, [contacts]);

  const monthSummary = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const interacted = contacts.filter(c =>
      c.last_contact_date && new Date(c.last_contact_date) >= monthStart
    );
    const missing = contacts.filter(c => !interacted.find(x => x.id === c.id));
    return { interacted: interacted.length, total: contacts.length, missing };
  }, [contacts]);

  const handleLogCall = async (contact) => {
    try {
      await logInteraction(userId, contact.id, { type: 'call' });
      toast.success(`✓ דיברת עם ${contact.name}`);
      load();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const handleDelete = async (id) => {
    if (!confirm('בטוח שאתה רוצה למחוק את האדם?')) return;
    try { await deleteContact(id); toast.success('נמחק'); setSelected(null); load(); }
    catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  return (
    <PersonalLayout title="קשרים">
      <button onClick={() => setShowNew(true)} style={{
        width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none',
        backgroundColor: PERSONAL_COLORS.primary, color: '#FFFFFF',
        fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 14,
        boxShadow: '0 2px 8px rgba(255,111,32,0.2)',
      }}>+ אדם חדש</button>

      {reminders.length > 0 && (
        <div style={{
          ...PERSONAL_CARD, marginBottom: 12,
          backgroundColor: '#FFF4E6', border: `1px solid ${PERSONAL_COLORS.primary}`,
        }}>
          {reminders.map((r, i) => (
            <div key={i} style={{ fontSize: 13, color: PERSONAL_COLORS.textPrimary, padding: '4px 0' }}>{r}</div>
          ))}
        </div>
      )}

      {loaded && contacts.length > 0 && (
        <div style={{ ...PERSONAL_CARD, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: PERSONAL_COLORS.textPrimary, marginBottom: 4 }}>
            החודש דיברת עם {monthSummary.interacted}/{monthSummary.total} אנשים
          </div>
          {monthSummary.missing.length > 0 && monthSummary.missing.length <= 5 && (
            <div style={{ fontSize: 11, color: PERSONAL_COLORS.textSecondary }}>
              חסרים: {monthSummary.missing.map(c => c.name).join(', ')}
            </div>
          )}
        </div>
      )}

      {!loaded ? (
        <Empty text="טוען..." />
      ) : contacts.length === 0 ? (
        <Empty text="אין אנשי קשר. לחץ + כדי להתחיל" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {contacts.map(c => (
            <ContactCard key={c.id} contact={c}
              onLogCall={handleLogCall}
              onClick={() => setSelected(c)} />
          ))}
        </div>
      )}

      {showNew && <NewContactDialog isOpen={showNew} onClose={() => setShowNew(false)} userId={userId} onSaved={load} />}
      {selected && (
        <ContactDetailDialog
          isOpen={!!selected}
          onClose={() => setSelected(null)}
          userId={userId}
          contact={selected}
          onChanged={load}
          onDelete={() => handleDelete(selected.id)}
        />
      )}
    </PersonalLayout>
  );
}

function NewContactDialog({ isOpen, onClose, userId, onSaved, contact = null }) {
  const [name, setName] = useState(contact?.name || '');
  const [category, setCategory] = useState(contact?.category || 'friend');
  const [phone, setPhone] = useState(contact?.phone || '');
  const [birthday, setBirthday] = useState(contact?.birthday || '');
  const [frequency, setFrequency] = useState(contact?.contact_frequency || 'monthly');
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!name.trim()) { toast.error('הכנס שם'); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(), category, phone: phone || null,
        birthday: birthday || null, contact_frequency: frequency,
      };
      if (contact?.id) await updateContact(contact.id, payload);
      else             await addContact(userId, payload);
      toast.success(contact ? 'עודכן' : 'נוסף');
      onSaved?.(); onClose?.();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose?.(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 700, textAlign: 'right' }}>
            {contact ? 'עריכת איש קשר' : 'אדם חדש'}
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
          <input type="text" placeholder="שם" autoFocus
            value={name} onChange={e => setName(e.target.value)} style={textInput} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>קטגוריה</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={textInput}>
                {CONTACT_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>תדירות רצויה</label>
              <select value={frequency} onChange={e => setFrequency(e.target.value)} style={textInput}>
                {CONTACT_FREQUENCIES.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>טלפון</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={textInput} />
            </div>
            <div>
              <label style={lbl}>יום הולדת</label>
              <input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} style={textInput} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button onClick={onClose} disabled={saving} style={btnSecondary}>ביטול</button>
            <button onClick={handleSave} disabled={saving} style={btnPrimary}>
              {saving ? <Loader2 size={18} className="animate-spin" style={{ margin: '0 auto' }} /> : 'שמור'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContactDetailDialog({ isOpen, onClose, userId, contact, onChanged, onDelete }) {
  const [interactions, setInteractions] = useState([]);
  const [showEdit, setShowEdit] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    listInteractions(userId, contact.id).then(setInteractions).catch(() => setInteractions([]));
  }, [isOpen, contact.id, userId]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 700, textAlign: 'right' }}>
            {contact.name}
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {contact.phone && (
            <div style={{ fontSize: 13, color: PERSONAL_COLORS.textSecondary }}>📞 {contact.phone}</div>
          )}
          {contact.birthday && (
            <div style={{ fontSize: 13, color: PERSONAL_COLORS.textSecondary }}>
              🎂 {new Date(contact.birthday).toLocaleDateString('he-IL')}
            </div>
          )}
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>היסטוריית אינטראקציות</div>
          {interactions.length === 0 ? (
            <div style={{ fontSize: 12, color: PERSONAL_COLORS.textSecondary }}>עדיין לא נרשמו</div>
          ) : interactions.slice(0, 10).map(i => (
            <div key={i.id} style={{
              padding: '8px 10px', borderRadius: 10, backgroundColor: '#F7F3EC',
              fontSize: 12,
            }}>
              {new Date(i.date).toLocaleDateString('he-IL')} · {i.type}
              {i.notes ? ` — ${i.notes}` : ''}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
            <button onClick={() => setShowEdit(true)} style={btnSecondary}>ערוך</button>
            <button onClick={onDelete} style={{
              ...btnSecondary, color: PERSONAL_COLORS.error,
              borderColor: PERSONAL_COLORS.error,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
              <Trash2 size={14} /> מחק
            </button>
          </div>
        </div>
        {showEdit && (
          <NewContactDialog
            isOpen={showEdit}
            onClose={() => setShowEdit(false)}
            userId={userId}
            contact={contact}
            onSaved={() => { setShowEdit(false); onChanged?.(); onClose?.(); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Empty({ text }) {
  return <div style={{
    padding: 30, textAlign: 'center', fontSize: 13, color: PERSONAL_COLORS.textSecondary,
    backgroundColor: '#FFFFFF', borderRadius: 14,
    border: `1px solid ${PERSONAL_COLORS.border}`,
  }}>{text}</div>;
}

const lbl = { display: 'block', fontSize: 12, fontWeight: 700, color: PERSONAL_COLORS.textSecondary, marginBottom: 6 };
const textInput = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: `1px solid ${PERSONAL_COLORS.border}`, backgroundColor: '#FFFFFF',
  fontSize: 14, color: PERSONAL_COLORS.textPrimary,
  fontFamily: "'Heebo', 'Assistant', sans-serif", outline: 'none', boxSizing: 'border-box',
};
const btnPrimary = {
  flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none',
  backgroundColor: PERSONAL_COLORS.primary, color: '#FFFFFF',
  fontSize: 14, fontWeight: 700, cursor: 'pointer',
};
const btnSecondary = {
  flex: 1, padding: '12px 16px', borderRadius: 12,
  border: `1px solid ${PERSONAL_COLORS.border}`, backgroundColor: '#FFFFFF',
  color: PERSONAL_COLORS.textPrimary, fontSize: 14, fontWeight: 700, cursor: 'pointer',
};
