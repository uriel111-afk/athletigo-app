import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import RecurringForm from '@/components/lifeos/RecurringForm';
import {
  LIFEOS_COLORS, LIFEOS_CARD,
  EXPENSE_CATEGORY_BY_KEY, RECURRING_FREQUENCIES,
} from '@/lib/lifeos/lifeos-constants';
import { listRecurring, updateRecurring } from '@/lib/lifeos/lifeos-api';
import { toast } from 'sonner';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');
const FREQ_BY_KEY = Object.fromEntries(RECURRING_FREQUENCIES.map(f => [f.key, f]));

// Normalize payment amount to a monthly figure so the total makes sense.
const toMonthly = (amount, frequency) => {
  const a = Number(amount || 0);
  switch (frequency) {
    case 'weekly':    return a * 4.33;
    case 'quarterly': return a / 3;
    case 'yearly':    return a / 12;
    default:          return a; // monthly
  }
};

export default function RecurringPayments() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      const data = await listRecurring(userId, { onlyActive: false });
      setRows(data || []);
    } catch (err) {
      console.error('[RecurringPayments] load error:', err);
      toast.error('שגיאה בטעינה');
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => showInactive ? rows : rows.filter(r => r.is_active),
    [rows, showInactive]
  );

  const grouped = useMemo(() => {
    const m = {};
    filtered.forEach(r => {
      const k = r.category || 'other';
      (m[k] = m[k] || []).push(r);
    });
    return m;
  }, [filtered]);

  const monthlyTotal = useMemo(
    () => filtered.filter(r => r.is_active).reduce(
      (s, r) => s + toMonthly(r.amount, r.frequency), 0
    ),
    [filtered]
  );

  const toggleActive = async (row) => {
    try {
      await updateRecurring(row.id, { is_active: !row.is_active });
      load();
    } catch (err) {
      toast.error('שגיאה: ' + (err?.message || ''));
    }
  };

  return (
    <LifeOSLayout title="הוצאות קבועות">
      <button
        onClick={() => setShowForm(true)}
        style={{
          width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none',
          backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
          fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 14,
          boxShadow: '0 2px 8px rgba(255,111,32,0.2)',
        }}
      >
        + הוצאה קבועה חדשה
      </button>

      {/* Monthly total hero */}
      <div style={{ ...LIFEOS_CARD, marginBottom: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: LIFEOS_COLORS.textSecondary, marginBottom: 4 }}>
          סה"כ הוצאות קבועות חודשיות
        </div>
        <div style={{ fontSize: 32, fontWeight: 800, color: LIFEOS_COLORS.textPrimary }}>
          {fmt(monthlyTotal)}₪
        </div>
      </div>

      {/* Toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
        <button
          onClick={() => setShowInactive(v => !v)}
          style={{
            padding: '6px 12px', borderRadius: 999,
            border: `1px solid ${LIFEOS_COLORS.border}`,
            backgroundColor: showInactive ? LIFEOS_COLORS.primary : '#FFFFFF',
            color: showInactive ? '#FFFFFF' : LIFEOS_COLORS.textSecondary,
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {showInactive ? 'הסתר לא פעילים' : 'הצג גם לא פעילים'}
        </button>
      </div>

      {/* Grouped list */}
      {!loaded ? (
        <EmptyCard text="טוען..." />
      ) : filtered.length === 0 ? (
        <EmptyCard text={showInactive ? 'אין הוצאות קבועות' : 'אין הוצאות קבועות פעילות. לחץ + להוספה'} />
      ) : (
        Object.entries(grouped).map(([catKey, items]) => {
          const cat = EXPENSE_CATEGORY_BY_KEY[catKey] || { label: catKey, emoji: '📦' };
          const groupTotal = items.filter(r => r.is_active)
            .reduce((s, r) => s + toMonthly(r.amount, r.frequency), 0);
          return (
            <div key={catKey} style={{ ...LIFEOS_CARD, padding: 0, marginBottom: 10, overflow: 'hidden' }}>
              <div style={{
                padding: '10px 14px',
                borderBottom: `1px solid ${LIFEOS_COLORS.border}`,
                backgroundColor: '#F7F3EC',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{cat.emoji}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
                    {cat.label}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textSecondary }}>
                  {fmt(groupTotal)}₪/חודש
                </div>
              </div>
              {items.map((r, idx) => (
                <RecurringRow
                  key={r.id}
                  row={r}
                  isLast={idx === items.length - 1}
                  onToggle={() => toggleActive(r)}
                />
              ))}
            </div>
          );
        })
      )}

      <RecurringForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        userId={userId}
        onSaved={load}
      />
    </LifeOSLayout>
  );
}

function RecurringRow({ row, isLast, onToggle }) {
  const freq = FREQ_BY_KEY[row.frequency]?.label || row.frequency;
  const dueLabel = row.due_day ? `ב-${row.due_day} בחודש` : '';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 14px',
      borderBottom: isLast ? 'none' : `0.5px solid ${LIFEOS_COLORS.border}`,
      opacity: row.is_active ? 1 : 0.5,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: LIFEOS_COLORS.textPrimary }}>
          {row.name}
        </div>
        <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
          {freq}{dueLabel ? ` • ${dueLabel}` : ''}
        </div>
      </div>
      <div style={{
        fontSize: 14, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, whiteSpace: 'nowrap',
      }}>
        {fmt(Number(row.amount || 0))}₪
      </div>
      <button
        onClick={onToggle}
        style={{
          padding: '6px 10px', borderRadius: 8, border: `1px solid ${LIFEOS_COLORS.border}`,
          backgroundColor: '#FFFFFF', fontSize: 11, fontWeight: 600,
          color: row.is_active ? LIFEOS_COLORS.error : LIFEOS_COLORS.success,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {row.is_active ? 'השבת' : 'הפעל'}
      </button>
    </div>
  );
}

function EmptyCard({ text }) {
  return (
    <div style={{ ...LIFEOS_CARD, textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: LIFEOS_COLORS.textSecondary, padding: '14px 0' }}>{text}</div>
    </div>
  );
}
