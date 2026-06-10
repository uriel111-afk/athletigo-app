import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import {
  LIFEOS_COLORS, LIFEOS_CARD, INCOME_SOURCES,
} from '@/lib/lifeos/lifeos-constants';
import { listIncome } from '@/lib/lifeos/lifeos-api';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('he-IL');
const dateStr = (d) => d ? new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

const todayISO = () => new Date().toISOString().slice(0, 10);
const yearStartISO = () => `${new Date().getFullYear()}-01-01`;

const SOURCE_LABEL = Object.fromEntries(
  INCOME_SOURCES.map(s => [s.key, s.label])
);

export default function RevenueDetail() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [from, setFrom] = useState(yearStartISO());
  const [to,   setTo]   = useState(todayISO());
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      const data = await listIncome(userId, { from, to });
      setRows(data || []);
    } catch (err) {
      console.error('[RevenueDetail] load error:', err);
      toast.error('שגיאה: ' + (err?.message || ''));
    } finally {
      setLoaded(true);
    }
  }, [userId, from, to]);

  useEffect(() => { load(); }, [load]);

  const total = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [rows]
  );

  return (
    <LifeOSLayout title="פירוט הכנסה" rightSlot={
      <button onClick={load} aria-label="רענן" style={iconBtn}>
        <RefreshCw size={16} />
      </button>
    }>
      <div style={{ padding: '0 14px' }}>
        <button onClick={() => navigate('/lifeos/momentum')} style={backBtn}>
          <ChevronRight size={16} />
          <span>חזרה למומנטום</span>
        </button>

        {/* Filters */}
        <div style={{ ...LIFEOS_CARD, marginBottom: 12, display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>מתאריך</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>עד תאריך</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {/* Total */}
        <div style={{ ...LIFEOS_CARD, marginBottom: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary }}>סה"כ בתקופה</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: LIFEOS_COLORS.success, marginTop: 4 }}>
            {fmt(total)}₪
          </div>
          <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
            {rows.length} רשומות
          </div>
        </div>

        {/* Table */}
        <div style={{ ...LIFEOS_CARD, padding: 0, overflow: 'hidden' }}>
          <div style={tableHeader}>
            <span style={{ flex: 1.2 }}>תאריך</span>
            <span style={{ flex: 2 }}>מוצר</span>
            <span style={{ flex: 1.5 }}>מקור</span>
            <span style={{ flex: 1.2, textAlign: 'left', direction: 'ltr' }}>סכום</span>
          </div>
          {!loaded ? (
            <div style={emptyStyle}>טוען...</div>
          ) : rows.length === 0 ? (
            <div style={emptyStyle}>אין הכנסות בתקופה</div>
          ) : (
            rows.map((r, idx) => (
              <div key={r.id} style={tableRow(idx === rows.length - 1)}>
                <span style={{ flex: 1.2 }}>{dateStr(r.date)}</span>
                <span style={{ flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.product || '—'}
                </span>
                <span style={{ flex: 1.5, fontSize: 11, color: LIFEOS_COLORS.textSecondary }}>
                  {SOURCE_LABEL[r.source] || r.source || '—'}
                </span>
                <span style={{ flex: 1.2, textAlign: 'left', direction: 'ltr', fontWeight: 700, color: LIFEOS_COLORS.success }}>
                  {fmt(r.amount)}₪
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </LifeOSLayout>
  );
}

// ─── shared inline styles ─────────────────────────────────────
const iconBtn = {
  width: 28, height: 28, borderRadius: 8, border: 'none',
  background: 'transparent', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: LIFEOS_COLORS.textSecondary,
};
const backBtn = {
  display: 'flex', alignItems: 'center', gap: 4,
  background: 'transparent', border: 'none',
  padding: '4px 0 12px',
  color: LIFEOS_COLORS.textSecondary,
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit',
};
const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: LIFEOS_COLORS.textSecondary, marginBottom: 4,
};
const inputStyle = {
  width: '100%', padding: '7px 10px', borderRadius: 8,
  border: `1px solid ${LIFEOS_COLORS.border}`,
  backgroundColor: '#FFFFFF', fontSize: 13,
  color: LIFEOS_COLORS.textPrimary,
  fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
  outline: 'none', boxSizing: 'border-box',
};
const tableHeader = {
  display: 'flex', gap: 8, padding: '10px 12px',
  backgroundColor: '#F7F3EC',
  borderBottom: `1px solid ${LIFEOS_COLORS.border}`,
  fontSize: 11, fontWeight: 700, color: LIFEOS_COLORS.textSecondary,
};
const tableRow = (isLast) => ({
  display: 'flex', gap: 8, alignItems: 'center',
  padding: '10px 12px',
  borderBottom: isLast ? 'none' : `0.5px solid ${LIFEOS_COLORS.border}`,
  fontSize: 12, color: LIFEOS_COLORS.textPrimary,
});
const emptyStyle = {
  padding: '24px 14px', textAlign: 'center',
  fontSize: 13, color: LIFEOS_COLORS.textSecondary,
};
