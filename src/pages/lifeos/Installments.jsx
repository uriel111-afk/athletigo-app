import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import InstallmentForm from '@/components/lifeos/InstallmentForm';
import { LIFEOS_COLORS, LIFEOS_CARD } from '@/lib/lifeos/lifeos-constants';
import { listInstallments, updateInstallment } from '@/lib/lifeos/lifeos-api';
import { toast } from 'sonner';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');

export default function Installments() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      const data = await listInstallments(userId);
      setRows(data || []);
    } catch (err) {
      console.error('[Installments] load error:', err);
      toast.error('שגיאה בטעינה');
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const active = useMemo(
    () => rows.filter(r => (r.payments_made || 0) < (r.total_payments || 0)),
    [rows]
  );

  const monthlyTotal = useMemo(
    () => active.reduce((s, r) => s + Number(r.monthly_amount || 0), 0),
    [active]
  );

  const remainingTotal = useMemo(
    () => active.reduce((s, r) => {
      const remaining = Math.max(0, (r.total_payments || 0) - (r.payments_made || 0));
      return s + remaining * Number(r.monthly_amount || 0);
    }, 0),
    [active]
  );

  const markPaymentMade = async (row) => {
    const next = Math.min((row.payments_made || 0) + 1, row.total_payments);
    try {
      await updateInstallment(row.id, { payments_made: next });
      toast.success('תשלום נרשם');
      load();
    } catch (err) {
      toast.error('שגיאה: ' + (err?.message || ''));
    }
  };

  return (
    <LifeOSLayout title="תשלומי פס">
      <button
        onClick={() => setShowForm(true)}
        style={{
          width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none',
          backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
          fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 14,
          boxShadow: '0 2px 8px rgba(255,111,32,0.2)',
        }}
      >
        + תשלום פס חדש
      </button>

      {/* Totals */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div style={{ ...LIFEOS_CARD, textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: LIFEOS_COLORS.textSecondary }}>
            תשלום חודשי כולל
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: LIFEOS_COLORS.primary, marginTop: 4 }}>
            {fmt(monthlyTotal)}₪
          </div>
        </div>
        <div style={{ ...LIFEOS_CARD, textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: LIFEOS_COLORS.textSecondary }}>
            סה"כ נותר לשלם
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: LIFEOS_COLORS.textPrimary, marginTop: 4 }}>
            {fmt(remainingTotal)}₪
          </div>
        </div>
      </div>

      {/* Cards */}
      {!loaded ? (
        <EmptyCard text="טוען..." />
      ) : rows.length === 0 ? (
        <EmptyCard text="אין תשלומי פס. לחץ + להוספה" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(r => (
            <InstallmentCard key={r.id} row={r} onPaymentMade={() => markPaymentMade(r)} />
          ))}
        </div>
      )}

      <InstallmentForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        userId={userId}
        onSaved={load}
      />
    </LifeOSLayout>
  );
}

function InstallmentCard({ row, onPaymentMade }) {
  const paid = row.payments_made || 0;
  const total = row.total_payments || 0;
  const pct = total > 0 ? (paid / total) * 100 : 0;
  const isDone = paid >= total;
  const endStr = row.end_date
    ? new Date(row.end_date).toLocaleDateString('he-IL', { month: '2-digit', year: 'numeric' })
    : '';

  return (
    <div style={{ ...LIFEOS_CARD, opacity: isDone ? 0.6 : 1 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
            {row.name}
          </div>
          <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
            {paid}/{total} תשלומים{endStr ? ` • עד ${endStr}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: LIFEOS_COLORS.textPrimary }}>
            {fmt(Number(row.monthly_amount || 0))}₪
          </div>
          <div style={{ fontSize: 10, color: LIFEOS_COLORS.textSecondary }}>לחודש</div>
        </div>
      </div>

      <div style={{
        backgroundColor: '#F0E4D0', borderRadius: 999, height: 8, overflow: 'hidden', marginBottom: 10,
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          backgroundColor: isDone ? LIFEOS_COLORS.success : LIFEOS_COLORS.primary,
          transition: 'width 0.4s ease',
        }} />
      </div>

      {!isDone && (
        <button
          onClick={onPaymentMade}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            border: `1px solid ${LIFEOS_COLORS.primary}`,
            backgroundColor: '#FFFFFF', color: LIFEOS_COLORS.primary,
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >
          סמן תשלום נוסף
        </button>
      )}
      {isDone && (
        <div style={{
          textAlign: 'center', fontSize: 12, fontWeight: 700, color: LIFEOS_COLORS.success,
        }}>
          ✓ הושלם
        </div>
      )}
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
