import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import ExpenseForm from '@/components/lifeos/ExpenseForm';
import {
  LIFEOS_COLORS, LIFEOS_CARD,
  EXPENSE_CATEGORIES, EXPENSE_CATEGORY_BY_KEY,
} from '@/lib/lifeos/lifeos-constants';
import { listExpensesForMonth, deleteExpense } from '@/lib/lifeos/lifeos-api';
import { toast } from 'sonner';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');

const monthLabel = (date) => date.toLocaleDateString('he-IL', { year: 'numeric', month: 'long' });

const sameMonth = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

export default function Expenses() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  // `cursor` points to any date inside the selected month.
  const [cursor, setCursor] = useState(new Date());
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      const data = await listExpensesForMonth(userId, cursor);
      setRows(data || []);
    } catch (err) {
      console.error('[Expenses] load error:', err);
      toast.error('שגיאה בטעינת הוצאות');
    } finally {
      setLoaded(true);
    }
  }, [userId, cursor]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return categoryFilter ? rows.filter(r => r.category === categoryFilter) : rows;
  }, [rows, categoryFilter]);

  const monthTotal = useMemo(
    () => filtered.reduce((s, r) => s + Number(r.amount || 0), 0),
    [filtered]
  );

  const prevMonth = () => {
    const d = new Date(cursor);
    d.setMonth(d.getMonth() - 1);
    setCursor(d);
  };
  const nextMonth = () => {
    const d = new Date(cursor);
    d.setMonth(d.getMonth() + 1);
    setCursor(d);
  };
  const isCurrentMonth = sameMonth(cursor, new Date());

  const handleDelete = async (id) => {
    if (!confirm('למחוק את ההוצאה?')) return;
    try {
      await deleteExpense(id);
      toast.success('ההוצאה נמחקה');
      load();
    } catch (err) {
      toast.error('שגיאה במחיקה: ' + (err?.message || ''));
    }
  };

  return (
    <LifeOSLayout title="הוצאות">
      {/* Add button */}
      <button
        onClick={() => setShowForm(true)}
        style={{
          width: '100%',
          padding: '14px 16px',
          borderRadius: 12,
          border: 'none',
          backgroundColor: LIFEOS_COLORS.primary,
          color: '#FFFFFF',
          fontSize: 15,
          fontWeight: 700,
          cursor: 'pointer',
          marginBottom: 14,
          boxShadow: '0 2px 8px rgba(255,111,32,0.2)',
        }}
      >
        + הוצאה חדשה
      </button>

      {/* Month navigator */}
      <div style={{
        ...LIFEOS_CARD,
        marginBottom: 12,
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <button onClick={nextMonth} disabled={isCurrentMonth} style={navBtnStyle(isCurrentMonth)}>
          <ChevronRight size={18} />
        </button>
        <div style={{
          fontSize: 14, fontWeight: 700, color: LIFEOS_COLORS.textPrimary,
        }}>
          {monthLabel(cursor)}
        </div>
        <button onClick={prevMonth} style={navBtnStyle(false)}>
          <ChevronLeft size={18} />
        </button>
      </div>

      {/* Category filter */}
      <div style={{
        display: 'flex', gap: 6,
        overflowX: 'auto',
        padding: '4px 0 10px',
        marginBottom: 8,
        scrollbarWidth: 'none',
      }}>
        <FilterChip
          active={categoryFilter === null}
          onClick={() => setCategoryFilter(null)}
          label="הכל"
        />
        {EXPENSE_CATEGORIES.map(cat => (
          <FilterChip
            key={cat.key}
            active={categoryFilter === cat.key}
            onClick={() => setCategoryFilter(cat.key)}
            label={`${cat.emoji} ${cat.label}`}
          />
        ))}
      </div>

      {/* List */}
      <div style={{ ...LIFEOS_CARD, padding: 0, overflow: 'hidden' }}>
        {!loaded ? (
          <EmptyRow text="טוען..." />
        ) : filtered.length === 0 ? (
          <EmptyRow text={categoryFilter ? 'אין הוצאות בקטגוריה זו החודש' : 'אין הוצאות החודש'} />
        ) : (
          filtered.map((row, idx) => (
            <ExpenseRow
              key={row.id}
              row={row}
              isLast={idx === filtered.length - 1}
              onDelete={() => handleDelete(row.id)}
            />
          ))
        )}
      </div>

      {/* Total */}
      {loaded && filtered.length > 0 && (
        <div style={{
          ...LIFEOS_CARD,
          marginTop: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: LIFEOS_COLORS.textSecondary }}>
            סה"כ החודש
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: LIFEOS_COLORS.textPrimary }}>
            {fmt(monthTotal)}₪
          </div>
        </div>
      )}

      <ExpenseForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        userId={userId}
        onSaved={load}
      />
    </LifeOSLayout>
  );
}

// ─── Row ─────────────────────────────────────────────────────────

function ExpenseRow({ row, isLast, onDelete }) {
  const cat = EXPENSE_CATEGORY_BY_KEY[row.category] || { label: row.category, emoji: '📦' };
  const dateStr = new Date(row.date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });

  return (
    <div
      onDoubleClick={onDelete}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 14px',
        borderBottom: isLast ? 'none' : `0.5px solid ${LIFEOS_COLORS.border}`,
      }}
    >
      <div style={{ fontSize: 22 }}>{cat.emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: LIFEOS_COLORS.textPrimary,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {row.description || row.subcategory || cat.label}
        </div>
        <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
          {dateStr} • {cat.label}
          {row.subcategory && row.description ? ` • ${row.subcategory}` : ''}
        </div>
      </div>
      <div style={{
        fontSize: 15, fontWeight: 800, color: LIFEOS_COLORS.textPrimary,
        whiteSpace: 'nowrap',
      }}>
        {fmt(Number(row.amount || 0))}₪
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 999,
        border: `1px solid ${active ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`,
        backgroundColor: active ? LIFEOS_COLORS.primary : '#FFFFFF',
        color: active ? '#FFFFFF' : LIFEOS_COLORS.textPrimary,
        fontSize: 12, fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}

function EmptyRow({ text }) {
  return (
    <div style={{
      padding: '26px 14px',
      textAlign: 'center',
      fontSize: 13,
      color: LIFEOS_COLORS.textSecondary,
    }}>
      {text}
    </div>
  );
}

function navBtnStyle(disabled) {
  return {
    width: 32, height: 32,
    borderRadius: 10,
    border: 'none',
    backgroundColor: disabled ? '#F7F3EC' : '#FFFFFF',
    color: disabled ? LIFEOS_COLORS.textMuted : LIFEOS_COLORS.textPrimary,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}
