import React, { useContext, useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AuthContext } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  LIFEOS_COLORS,
  EXPENSE_CATEGORIES,
  ATHLETIGO_PRODUCTS,
  LEAD_INTERESTED_IN,
  CONTENT_TYPES,
} from '@/lib/lifeos/lifeos-constants';
import {
  addExpense, addIncome, addLead, addContentItem,
} from '@/lib/lifeos/lifeos-api';

const todayISO = () => new Date().toISOString().slice(0, 10);

const ACTIONS = [
  { key: 'expense',  emoji: '💸', label: 'הוצאה מהירה' },
  { key: 'income',   emoji: '💰', label: 'הכנסה מהירה' },
  { key: 'lead',     emoji: '👥', label: 'דיווח ליד' },
  { key: 'content',  emoji: '🎬', label: 'תוכן פורסם' },
  { key: 'workshop', emoji: '🎪', label: 'סדנה חדשה' },
];

export default function QuickActionFAB({ onSaved }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState(null);

  const handlePick = (key) => {
    setMenuOpen(false);
    setActive(key);
  };

  return (
    <>
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1070 }}
        />
      )}

      {/* Menu */}
      {menuOpen && (
        <div style={{
          position: 'fixed', bottom: 150, left: 16,
          zIndex: 1071,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {ACTIONS.map(a => (
            <button
              key={a.key}
              onClick={() => handlePick(a.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 12, border: 'none',
                backgroundColor: '#FFFFFF', color: LIFEOS_COLORS.textPrimary,
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 18 }}>{a.emoji}</span>
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setMenuOpen(v => !v)}
        aria-label="פעולה מהירה"
        style={{
          position: 'fixed', bottom: 90, left: 16, zIndex: 1072,
          width: 56, height: 56, borderRadius: 999, border: 'none',
          backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
          boxShadow: '0 6px 18px rgba(255,111,32,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          transform: menuOpen ? 'rotate(45deg)' : 'rotate(0deg)',
          transition: 'transform 0.25s ease',
        }}
      >
        <Plus size={28} />
      </button>

      {/* Quick forms */}
      <QuickDialog
        action={active}
        onClose={() => setActive(null)}
        onSaved={() => { onSaved?.(); setActive(null); }}
      />
    </>
  );
}

function QuickDialog({ action, onClose, onSaved }) {
  if (!action) return null;
  return (
    <Dialog open={!!action} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-sm" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle style={{ fontSize: 18, fontWeight: 800, textAlign: 'right' }}>
            {ACTIONS.find(a => a.key === action)?.label}
          </DialogTitle>
        </DialogHeader>
        {action === 'expense'  && <QExpense onSaved={onSaved} onClose={onClose} />}
        {action === 'income'   && <QIncome  onSaved={onSaved} onClose={onClose} />}
        {action === 'lead'     && <QLead    onSaved={onSaved} onClose={onClose} />}
        {action === 'content'  && <QContent onSaved={onSaved} onClose={onClose} />}
        {action === 'workshop' && <QWorkshop onSaved={onSaved} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

// ─── Mini forms (3-4 fields each) ────────────────────────────────

function useUserId() {
  const { user } = useContext(AuthContext);
  return user?.id;
}

function QExpense({ onSaved, onClose }) {
  const userId = useUserId();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const a = parseFloat(amount);
    if (!a || a <= 0) { toast.error('סכום לא תקין'); return; }
    if (!category) { toast.error('בחר קטגוריה'); return; }
    setSaving(true);
    try {
      await addExpense(userId, { amount: a, category, date: todayISO() });
      toast.success('נשמר ✓');
      onSaved();
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
      <input type="number" inputMode="decimal" placeholder="כמה שילמת?" autoFocus
             value={amount} onChange={e => setAmount(e.target.value)}
             style={{ ...bigInput, textAlign: 'center' }} />
      <CatChipGrid value={category} onChange={setCategory} />
      <SaveBtns onClose={onClose} onSave={save} saving={saving} />
    </div>
  );
}

function QIncome({ onSaved, onClose }) {
  const userId = useUserId();
  const [amount, setAmount] = useState('');
  const [product, setProduct] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const a = parseFloat(amount);
    if (!a || a <= 0) { toast.error('סכום לא תקין'); return; }
    setSaving(true);
    const source = product === 'online_coaching' ? 'online_coaching'
                 : product === 'workshop' ? 'workshop'
                 : product === 'digital_course' ? 'course'
                 : product === 'personal_training' ? 'training'
                 : 'product_sale';
    try {
      await addIncome(userId, { amount: a, product: product || null, source, date: todayISO() });
      toast.success('נשמר ✓');
      onSaved();
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
      <input type="number" inputMode="decimal" placeholder="כמה נכנס?" autoFocus
             value={amount} onChange={e => setAmount(e.target.value)}
             style={{ ...bigInput, textAlign: 'center', color: LIFEOS_COLORS.success }} />
      <select value={product} onChange={e => {
        const k = e.target.value;
        const p = ATHLETIGO_PRODUCTS.find(x => x.key === k);
        setProduct(k);
        if (p && !amount) setAmount(String(p.price));
      }} style={textInput}>
        <option value="">— מוצר/שירות —</option>
        {ATHLETIGO_PRODUCTS.map(p => (
          <option key={p.key} value={p.key}>{p.label} {p.price ? `(₪${p.price})` : ''}</option>
        ))}
      </select>
      <SaveBtns onClose={onClose} onSave={save} saving={saving} saveColor={LIFEOS_COLORS.success} />
    </div>
  );
}

function QLead({ onSaved, onClose }) {
  const userId = useUserId();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [interestedIn, setInterestedIn] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    // Name only — phone optional so a coach can dump a screenshot
    // contact in one tap and fill the rest later.
    if (!name.trim()) { toast.error('הכנס שם'); return; }
    setSaving(true);
    try {
      await addLead(userId, {
        name: name.trim(),
        phone: phone.trim() || null,
        interested_in: interestedIn || null,
        status: 'new', source: 'other',
      });
      toast.success('נשמר ✓');
      onSaved();
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
      <input type="text" placeholder="שם" autoFocus value={name}
             onChange={e => setName(e.target.value)} style={textInput} />
      <input type="tel" placeholder="טלפון" value={phone}
             onChange={e => setPhone(e.target.value)} style={textInput} />
      <select value={interestedIn} onChange={e => setInterestedIn(e.target.value)} style={textInput}>
        <option value="">— מעוניין ב- —</option>
        {LEAD_INTERESTED_IN.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
      </select>
      <SaveBtns onClose={onClose} onSave={save} saving={saving} />
    </div>
  );
}

function QContent({ onSaved, onClose }) {
  const userId = useUserId();
  const [title, setTitle] = useState('');
  const [contentType, setContentType] = useState('reel');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!title.trim()) { toast.error('הכנס כותרת'); return; }
    setSaving(true);
    try {
      await addContentItem(userId, {
        title: title.trim(),
        content_type: contentType,
        platform: 'instagram',
        status: 'published',
        scheduled_date: todayISO(),
      });
      toast.success('נשמר ✓');
      onSaved();
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
      <input type="text" placeholder="כותרת / תיאור קצר" autoFocus value={title}
             onChange={e => setTitle(e.target.value)} style={textInput} />
      <select value={contentType} onChange={e => setContentType(e.target.value)} style={textInput}>
        {CONTENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>)}
      </select>
      <SaveBtns onClose={onClose} onSave={save} saving={saving} />
    </div>
  );
}

function QWorkshop({ onSaved, onClose }) {
  const userId = useUserId();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayISO());
  const [price, setPrice] = useState('200');
  const [participants, setParticipants] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!title.trim()) { toast.error('הכנס נושא'); return; }
    const p = parseFloat(price);
    const n = parseInt(participants || '0', 10);
    if (!p || p <= 0) { toast.error('מחיר לא תקין'); return; }
    setSaving(true);
    try {
      // If participants given, log income as price × participants.
      if (n > 0) {
        await addIncome(userId, {
          amount: p * n,
          source: 'workshop',
          product: 'workshop',
          description: `סדנה: ${title.trim()} (${n} משתתפים)`,
          date,
        });
      }
      toast.success(n > 0 ? `הסדנה נרשמה + ${n * p}₪ הכנסה` : 'נשמר ✓');
      onSaved();
    } catch (e) { toast.error('שגיאה: ' + (e?.message || '')); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
      <input type="text" placeholder="נושא הסדנה" autoFocus value={title}
             onChange={e => setTitle(e.target.value)} style={textInput} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={textInput} />
        <input type="number" inputMode="decimal" placeholder="מחיר לאדם"
               value={price} onChange={e => setPrice(e.target.value)} style={textInput} />
      </div>
      <input type="number" inputMode="numeric" placeholder="כמה משתתפים? (אופציונלי)"
             value={participants} onChange={e => setParticipants(e.target.value)} style={textInput} />
      <SaveBtns onClose={onClose} onSave={save} saving={saving} />
    </div>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────

function CatChipGrid({ value, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
      {EXPENSE_CATEGORIES.map(c => {
        const active = value === c.key;
        return (
          <button key={c.key} onClick={() => onChange(c.key)}
                  style={{
                    padding: '8px 6px', borderRadius: 10,
                    border: `1px solid ${active ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`,
                    backgroundColor: active ? LIFEOS_COLORS.primary : '#FFFFFF',
                    color: active ? '#FFFFFF' : LIFEOS_COLORS.textPrimary,
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  }}>
            <span style={{ fontSize: 16 }}>{c.emoji}</span>
            <span>{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SaveBtns({ onClose, onSave, saving, saveColor = LIFEOS_COLORS.primary }) {
  return (
    <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
      <button onClick={onClose} disabled={saving} style={{
        flex: 1, padding: '10px 14px', borderRadius: 10,
        border: `1px solid ${LIFEOS_COLORS.border}`, backgroundColor: '#FFFFFF',
        color: LIFEOS_COLORS.textPrimary, fontSize: 14, fontWeight: 700, cursor: 'pointer',
      }}>ביטול</button>
      <button onClick={onSave} disabled={saving} style={{
        flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none',
        backgroundColor: saveColor, color: '#FFFFFF',
        fontSize: 14, fontWeight: 700, cursor: 'pointer',
      }}>
        {saving ? <Loader2 size={18} className="animate-spin" style={{ margin: '0 auto' }} /> : 'שמור'}
      </button>
    </div>
  );
}

const textInput = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: `1px solid ${LIFEOS_COLORS.border}`, backgroundColor: '#FFFFFF',
  fontSize: 14, color: LIFEOS_COLORS.textPrimary,
  fontFamily: "'Heebo', 'Assistant', sans-serif", outline: 'none', boxSizing: 'border-box',
};
const bigInput = { ...textInput, fontSize: 24, fontWeight: 800 };
