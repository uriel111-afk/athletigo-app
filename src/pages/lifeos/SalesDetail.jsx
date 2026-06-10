import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import { LIFEOS_COLORS, LIFEOS_CARD } from '@/lib/lifeos/lifeos-constants';
import { listIncome } from '@/lib/lifeos/lifeos-api';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('he-IL');
const dateStr = (d) => d ? new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

const yearStartISO = () => `${new Date().getFullYear()}-01-01`;
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function SalesDetail() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [productFilter, setProductFilter] = useState('');
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      // YTD by default — the records on Momentum already give a
      // year-context, the table just makes it granular.
      const data = await listIncome(userId, { from: yearStartISO(), to: todayISO() });
      setRows(data || []);
    } catch (err) {
      console.error('[SalesDetail] load error:', err);
      toast.error('שגיאה: ' + (err?.message || ''));
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const productOptions = useMemo(() => {
    // Distinct product values present in the data; the dropdown
    // mirrors what the user actually sold rather than every catalog
    // entry, which keeps the menu short and meaningful.
    const set = new Set();
    for (const r of rows) {
      const p = (r.product || '').trim();
      if (p) set.add(p);
    }
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    if (!productFilter) return rows;
    return rows.filter(r => (r.product || '').trim() === productFilter);
  }, [rows, productFilter]);

  const total = useMemo(
    () => filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [filtered]
  );

  return (
    <LifeOSLayout title="פירוט מכירות" rightSlot={
      <button onClick={load} aria-label="רענן" style={iconBtn}>
        <RefreshCw size={16} />
      </button>
    }>
      <div style={{ padding: '0 14px' }}>
        <button onClick={() => navigate('/lifeos/momentum')} style={backBtn}>
          <ChevronRight size={16} />
          <span>חזרה למומנטום</span>
        </button>

        {/* Filter */}
        <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
          <label style={labelStyle}>סינון לפי מוצר</label>
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="">— כל המוצרים —</option>
            {productOptions.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Total */}
        <div style={{ ...LIFEOS_CARD, marginBottom: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary }}>סה"כ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: LIFEOS_COLORS.success, marginTop: 4 }}>
            {fmt(total)}₪
          </div>
          <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
            {filtered.length} מכירות
          </div>
        </div>

        {/* Table */}
        <div style={{ ...LIFEOS_CARD, padding: 0, overflow: 'hidden' }}>
          <div style={tableHeader}>
            <span style={{ flex: 1.2 }}>תאריך</span>
            <span style={{ flex: 1.8 }}>מוצר</span>
            <span style={{ flex: 1.6 }}>לקוח</span>
            <span style={{ flex: 1.2, textAlign: 'left', direction: 'ltr' }}>סכום</span>
          </div>
          {!loaded ? (
            <div style={emptyStyle}>טוען...</div>
          ) : filtered.length === 0 ? (
            <div style={emptyStyle}>אין מכירות</div>
          ) : (
            filtered.map((r, idx) => (
              <div key={r.id} style={tableRow(idx === filtered.length - 1)}>
                <span style={{ flex: 1.2 }}>{dateStr(r.date)}</span>
                <span style={{ flex: 1.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.product || '—'}
                </span>
                <span style={{ flex: 1.6, fontSize: 11, color: LIFEOS_COLORS.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.client_name || '—'}
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
