import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import IncomeForm from '@/components/lifeos/IncomeForm';
import {
  LIFEOS_COLORS, LIFEOS_CARD, ATHLETIGO_PRODUCTS,
} from '@/lib/lifeos/lifeos-constants';
import { listIncomeForMonth, deleteIncome } from '@/lib/lifeos/lifeos-api';
import { toast } from 'sonner';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');

const monthLabel = (date) => date.toLocaleDateString('he-IL', { year: 'numeric', month: 'long' });

const sameMonth = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

const PRODUCT_BY_KEY = Object.fromEntries(ATHLETIGO_PRODUCTS.map(p => [p.key, p]));

export default function Income() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [cursor, setCursor] = useState(new Date());
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      const data = await listIncomeForMonth(userId, cursor);
      setRows(data || []);
    } catch (err) {
      console.error('[Income] load error:', err);
      toast.error('שגיאה בטעינת הכנסות');
    } finally {
      setLoaded(true);
    }
  }, [userId, cursor]);

  useEffect(() => { load(); }, [load]);

  const monthTotal = useMemo(
    () => rows.reduce((s, r) => s + Number(r.amount || 0), 0),
    [rows]
  );

  const countByProduct = useMemo(() => {
    const m = {};
    rows.forEach(r => {
      const key = r.product || 'other';
      m[key] = (m[key] || 0) + 1;
    });
    return m;
  }, [rows]);

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
    if (!confirm('למחוק את ההכנסה?')) return;
    try {
      await deleteIncome(id);
      toast.success('ההכנסה נמחקה');
      load();
    } catch (err) {
      toast.error('שגיאה במחיקה: ' + (err?.message || ''));
    }
  };

  return (
    <LifeOSLayout title="הכנסות">
      {/* Add button */}
      <button
        onClick={() => setShowForm(true)}
        style={{
          width: '100%',
          padding: '14px 16px',
          borderRadius: 12,
          border: 'none',
          backgroundColor: LIFEOS_COLORS.success,
          color: '#FFFFFF',
          fontSize: 15,
          fontWeight: 700,
          cursor: 'pointer',
          marginBottom: 14,
          boxShadow: '0 2px 8px rgba(22,163,74,0.2)',
        }}
      >
        + הכנסה חדשה
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

      {/* Hero total */}
      <div style={{
        ...LIFEOS_CARD,
        marginBottom: 12,
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: LIFEOS_COLORS.textSecondary, marginBottom: 4,
        }}>
          סה"כ הכנסות החודש
        </div>
        <div style={{
          fontSize: 32, fontWeight: 800, color: LIFEOS_COLORS.success,
        }}>
          {fmt(monthTotal)}₪
        </div>
        {rows.length > 0 && (
          <div style={{
            fontSize: 12, color: LIFEOS_COLORS.textSecondary, marginTop: 4,
          }}>
            מ-{rows.length} מכירות
          </div>
        )}
      </div>

      {/* List */}
      <div style={{ ...LIFEOS_CARD, padding: 0, overflow: 'hidden' }}>
        {!loaded ? (
          <EmptyRow text="טוען..." />
        ) : rows.length === 0 ? (
          <EmptyRow text="עדיין אין הכנסות החודש" />
        ) : (
          rows.map((row, idx) => (
            <IncomeRow
              key={row.id}
              row={row}
              isLast={idx === rows.length - 1}
              onDelete={() => handleDelete(row.id)}
            />
          ))
        )}
      </div>

      {/* Product breakdown */}
      {loaded && Object.keys(countByProduct).length > 0 && (
        <div style={{ ...LIFEOS_CARD, marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: LIFEOS_COLORS.textSecondary, marginBottom: 10 }}>
            פילוח לפי מוצר
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(countByProduct).map(([key, count]) => {
              const p = PRODUCT_BY_KEY[key];
              const label = p?.label || 'אחר';
              const emoji = p?.emoji || '📦';
              return (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: 10,
                    backgroundColor: '#F7F3EC',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{emoji}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: LIFEOS_COLORS.textPrimary }}>
                      {label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: LIFEOS_COLORS.textSecondary }}>
                    {count} מכירות
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <IncomeForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        userId={userId}
        onSaved={load}
      />
    </LifeOSLayout>
  );
}

// ─── Row ─────────────────────────────────────────────────────────

function IncomeRow({ row, isLast, onDelete }) {
  const p = row.product ? PRODUCT_BY_KEY[row.product] : null;
  const emoji = p?.emoji || '💰';
  const label = row.description || p?.label || row.source || 'הכנסה';
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
      <div style={{ fontSize: 22 }}>{emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: LIFEOS_COLORS.textPrimary,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
          {dateStr}
          {row.client_name ? ` • ${row.client_name}` : ''}
          {p?.label && label !== p.label ? ` • ${p.label}` : ''}
        </div>
      </div>
      <div style={{
        fontSize: 15, fontWeight: 800, color: LIFEOS_COLORS.success,
        whiteSpace: 'nowrap',
      }}>
        +{fmt(Number(row.amount || 0))}₪
      </div>
    </div>
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
