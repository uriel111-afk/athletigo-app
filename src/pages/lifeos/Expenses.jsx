import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, Pencil, Trash2 } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import ExpenseForm from '@/components/lifeos/ExpenseForm';
import {
  LIFEOS_COLORS, LIFEOS_CARD,
  EXPENSE_CATEGORIES, EXPENSE_CATEGORY_BY_KEY,
} from '@/lib/lifeos/lifeos-constants';
import {
  listExpensesForMonth, listExpenses, deleteExpense, addRecurring,
} from '@/lib/lifeos/lifeos-api';
import { toast } from 'sonner';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');
const monthLabel = (d) => d.toLocaleDateString('he-IL', { year: 'numeric', month: 'long' });
const sameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

// Stable color palette per category — reuses primary brand orange for
// the most common categories, falls back to grays for the long tail.
const CATEGORY_COLORS = {
  housing:       '#FF6F20',
  bills:         '#EAB308',
  transport:     '#3B82F6',
  insurance:     '#16a34a',
  food:          '#dc2626',
  subscriptions: '#8B5CF6',
  taxes:         '#6b7280',
  electronics:   '#06B6D4',
  cleaning:      '#84CC16',
  business:      '#1a1a1a',
  other:         '#9ca3af',
};

export default function Expenses() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [cursor, setCursor] = useState(new Date());
  const [rows, setRows] = useState([]);
  const [prevMonthRows, setPrevMonthRows] = useState([]);
  const [historyForRecurring, setHistoryForRecurring] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      const prev = new Date(cursor); prev.setMonth(prev.getMonth() - 1);
      // Load current month, previous month, and 4 months of history
      // for the recurring detector.
      const since = new Date(); since.setMonth(since.getMonth() - 4);
      const sinceISO = since.toISOString().slice(0, 10);
      const [data, prevData, history] = await Promise.all([
        listExpensesForMonth(userId, cursor),
        listExpensesForMonth(userId, prev),
        listExpenses(userId, { from: sinceISO }),
      ]);
      setRows(data || []);
      setPrevMonthRows(prevData || []);
      setHistoryForRecurring(history || []);
    } catch (err) {
      console.error('[Expenses] load error:', err);
      toast.error('שגיאה בטעינת הוצאות');
    } finally {
      setLoaded(true);
    }
  }, [userId, cursor]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => categoryFilter ? rows.filter(r => r.category === categoryFilter) : rows,
    [rows, categoryFilter]
  );
  const monthTotal = useMemo(
    () => filtered.reduce((s, r) => s + Number(r.amount || 0), 0),
    [filtered]
  );

  // ── Insights — top category, MoM delta, savings hint ────────────
  const insights = useMemo(() => {
    if (!rows.length) return null;
    const totals = {};
    rows.forEach(r => {
      const k = r.category || 'other';
      totals[k] = (totals[k] || 0) + Number(r.amount || 0);
    });
    const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
    const monthSum = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const prevSum = prevMonthRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const delta = prevSum > 0 ? ((monthSum - prevSum) / prevSum) * 100 : null;
    return {
      topKey: top[0], topValue: top[1],
      delta,
      savings20: top ? Math.round(top[1] * 0.2 * 12) : 0,
    };
  }, [rows, prevMonthRows]);

  // ── Pie data ───────────────────────────────────────────────────
  const pieData = useMemo(() => {
    const totals = {};
    rows.forEach(r => {
      const k = r.category || 'other';
      totals[k] = (totals[k] || 0) + Number(r.amount || 0);
    });
    return Object.entries(totals)
      .map(([key, value]) => ({
        key, value,
        name: EXPENSE_CATEGORY_BY_KEY[key]?.label || key,
        color: CATEGORY_COLORS[key] || '#9ca3af',
      }))
      .sort((a, b) => b.value - a.value);
  }, [rows]);

  // ── Recurring detector — same description+amount, 3+ months ─────
  const recurringSuggestion = useMemo(() => {
    if (historyForRecurring.length < 3) return null;
    const groups = new Map();
    historyForRecurring.forEach(r => {
      const desc = (r.description || r.subcategory || '').trim();
      if (!desc) return;
      const k = `${desc}|${Math.round(Number(r.amount || 0))}|${r.category || ''}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    });
    for (const [k, items] of groups) {
      const monthsHit = new Set(items.map(x => (x.date || '').slice(0, 7)));
      if (monthsHit.size >= 3) {
        const [desc, amount, category] = k.split('|');
        return { desc, amount: Number(amount), category };
      }
    }
    return null;
  }, [historyForRecurring]);

  const [dismissedRecurring, setDismissedRecurring] = useState(false);

  const prevMonth = () => { const d = new Date(cursor); d.setMonth(d.getMonth() - 1); setCursor(d); };
  const nextMonth = () => { const d = new Date(cursor); d.setMonth(d.getMonth() + 1); setCursor(d); };
  const isCurrentMonth = sameMonth(cursor, new Date());

  const openNew = () => { setEditingExpense(null); setShowForm(true); };
  const openEdit = (e, row) => { e.stopPropagation(); setEditingExpense(row); setShowForm(true); };
  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm('בטוח שאתה רוצה למחוק את ההוצאה?')) return;
    try {
      await deleteExpense(id);
      toast.success('נמחק');
      load();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const promoteToRecurring = async () => {
    if (!recurringSuggestion) return;
    try {
      await addRecurring(userId, {
        name: recurringSuggestion.desc,
        amount: recurringSuggestion.amount,
        category: recurringSuggestion.category || 'other',
        frequency: 'monthly',
        start_date: new Date().toISOString().slice(0, 10),
        is_active: true,
      });
      toast.success('נוסף להוצאות קבועות');
      setDismissedRecurring(true);
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  return (
    <LifeOSLayout title="הוצאות" onQuickSaved={load}>
      <button
        onClick={openNew}
        style={{
          width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none',
          backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
          fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 14,
          boxShadow: '0 2px 8px rgba(255,111,32,0.2)',
        }}
      >+ הוצאה חדשה</button>

      {/* Spending Insights */}
      {insights && (
        <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, marginBottom: 8 }}>
            תובנות
          </div>
          <InsightRow emoji="🏆" text={`הקטגוריה הכי גדולה: ${EXPENSE_CATEGORY_BY_KEY[insights.topKey]?.label || insights.topKey} — ${fmt(insights.topValue)}₪`} />
          {insights.delta !== null && (
            <InsightRow
              emoji={insights.delta > 0 ? '📈' : '📉'}
              text={`${insights.delta > 0 ? 'עלייה' : 'ירידה'} של ${Math.abs(Math.round(insights.delta))}% לעומת חודש שעבר`}
              color={insights.delta > 20 ? LIFEOS_COLORS.error : insights.delta < -10 ? LIFEOS_COLORS.success : LIFEOS_COLORS.textSecondary}
            />
          )}
          {insights.savings20 > 0 && (
            <InsightRow emoji="💡" text={`חסכון אפשרי: הורד ${EXPENSE_CATEGORY_BY_KEY[insights.topKey]?.label} ב-20% = ${fmt(insights.savings20)}₪/שנה`} />
          )}
        </div>
      )}

      {/* Recurring warning */}
      {recurringSuggestion && !dismissedRecurring && (
        <div style={{
          ...LIFEOS_CARD, marginBottom: 12,
          backgroundColor: '#FFF4E6', border: `1px solid ${LIFEOS_COLORS.primary}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.primary, marginBottom: 4 }}>
            🔁 נראה שזו הוצאה קבועה
          </div>
          <div style={{ fontSize: 13, color: LIFEOS_COLORS.textPrimary, marginBottom: 8 }}>
            {recurringSuggestion.desc} — {fmt(recurringSuggestion.amount)}₪ חוזר 3+ חודשים
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={promoteToRecurring} style={smallBtnPrimary}>
              להוסיף לקבועות
            </button>
            <button onClick={() => setDismissedRecurring(true)} style={smallBtnSecondary}>
              לא, תודה
            </button>
          </div>
        </div>
      )}

      {/* Pie chart */}
      {pieData.length > 0 && (
        <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, marginBottom: 8 }}>
            פילוח לפי קטגוריה
          </div>
          <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name"
                     cx="50%" cy="50%" outerRadius={70} innerRadius={36}
                     onClick={(slice) => setCategoryFilter(slice.key)}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} cursor="pointer" />)}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: `1px solid ${LIFEOS_COLORS.border}`, fontSize: 12 }}
                  formatter={(v) => `${fmt(v)}₪`}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Month nav */}
      <div style={{
        ...LIFEOS_CARD, marginBottom: 12, padding: '10px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button onClick={nextMonth} disabled={isCurrentMonth} style={navBtnStyle(isCurrentMonth)}>
          <ChevronRight size={18} />
        </button>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{monthLabel(cursor)}</div>
        <button onClick={prevMonth} style={navBtnStyle(false)}>
          <ChevronLeft size={18} />
        </button>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '4px 0 10px', scrollbarWidth: 'none' }}>
        <FilterChip active={categoryFilter === null} onClick={() => setCategoryFilter(null)} label="הכל" />
        {EXPENSE_CATEGORIES.map(cat => (
          <FilterChip key={cat.key} active={categoryFilter === cat.key} onClick={() => setCategoryFilter(cat.key)} label={`${cat.emoji} ${cat.label}`} />
        ))}
      </div>

      {/* List */}
      <div style={{ ...LIFEOS_CARD, padding: 0, overflow: 'hidden' }}>
        {!loaded ? (
          <EmptyRow text="טוען..." />
        ) : filtered.length === 0 ? (
          <EmptyRow text={categoryFilter ? 'אין הוצאות בקטגוריה זו' : 'אין הוצאות החודש'} />
        ) : (
          filtered.map((row, idx) => (
            <ExpenseRow
              key={row.id}
              row={row}
              isLast={idx === filtered.length - 1}
              onEdit={(e) => openEdit(e, row)}
              onDelete={(e) => handleDelete(e, row.id)}
            />
          ))
        )}
      </div>

      {/* Total */}
      {loaded && filtered.length > 0 && (
        <div style={{ ...LIFEOS_CARD, marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: LIFEOS_COLORS.textSecondary }}>סה"כ החודש</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{fmt(monthTotal)}₪</div>
        </div>
      )}

      <ExpenseForm
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditingExpense(null); }}
        userId={userId}
        expense={editingExpense}
        onSaved={load}
      />
    </LifeOSLayout>
  );
}

function ExpenseRow({ row, isLast, onEdit, onDelete }) {
  const cat = EXPENSE_CATEGORY_BY_KEY[row.category] || { label: row.category, emoji: '📦' };
  const dateStr = new Date(row.date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 14px',
      borderBottom: isLast ? 'none' : `0.5px solid ${LIFEOS_COLORS.border}`,
    }}>
      <div style={{ fontSize: 22 }}>{cat.emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: LIFEOS_COLORS.textPrimary,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          {row.description || row.subcategory || cat.label}
          {row.receipt_url && (
            <a href={row.receipt_url} target="_blank" rel="noopener noreferrer"
               onClick={(e) => e.stopPropagation()}
               aria-label="קבלה" title="צפה בקבלה"
               style={{ textDecoration: 'none', fontSize: 13 }}>📎</a>
          )}
        </div>
        <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
          {dateStr} • {cat.label}
        </div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: LIFEOS_COLORS.textPrimary, whiteSpace: 'nowrap' }}>
        {fmt(Number(row.amount || 0))}₪
      </div>
      <button onClick={onEdit} style={iconBtn} aria-label="עריכה">
        <Pencil size={14} />
      </button>
      <button onClick={onDelete} style={{ ...iconBtn, color: LIFEOS_COLORS.error }} aria-label="מחיקה">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function InsightRow({ emoji, text, color = LIFEOS_COLORS.textPrimary }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      fontSize: 12, lineHeight: 1.5, padding: '4px 0', color,
    }}>
      <span>{emoji}</span>
      <span style={{ flex: 1 }}>{text}</span>
    </div>
  );
}

function FilterChip({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', borderRadius: 999,
      border: `1px solid ${active ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`,
      backgroundColor: active ? LIFEOS_COLORS.primary : '#FFFFFF',
      color: active ? '#FFFFFF' : LIFEOS_COLORS.textPrimary,
      fontSize: 12, fontWeight: 600, cursor: 'pointer',
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>{label}</button>
  );
}

function EmptyRow({ text }) {
  return (
    <div style={{ padding: '26px 14px', textAlign: 'center', fontSize: 13, color: LIFEOS_COLORS.textSecondary }}>{text}</div>
  );
}

function navBtnStyle(disabled) {
  return {
    width: 32, height: 32, borderRadius: 10, border: 'none',
    backgroundColor: disabled ? '#F7F3EC' : '#FFFFFF',
    color: disabled ? LIFEOS_COLORS.textMuted : LIFEOS_COLORS.textPrimary,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
  };
}

const iconBtn = {
  width: 28, height: 28, borderRadius: 8, border: 'none',
  background: 'transparent', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: LIFEOS_COLORS.textSecondary,
};
const smallBtnPrimary = {
  flex: 1, padding: '8px 12px', borderRadius: 10, border: 'none',
  backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
  fontSize: 12, fontWeight: 700, cursor: 'pointer',
};
const smallBtnSecondary = {
  flex: 1, padding: '8px 12px', borderRadius: 10,
  border: `1px solid ${LIFEOS_COLORS.border}`, backgroundColor: '#FFFFFF',
  color: LIFEOS_COLORS.textSecondary, fontSize: 12, fontWeight: 700, cursor: 'pointer',
};
