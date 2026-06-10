import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, RefreshCw, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import { LIFEOS_COLORS, LIFEOS_CARD } from '@/lib/lifeos/lifeos-constants';
import { listContentItems } from '@/lib/lifeos/lifeos-api';

const dateStr = (d) => d ? new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

const yearStartISO = () => `${new Date().getFullYear()}-01-01`;
const todayISO = () => new Date().toISOString().slice(0, 10);

// The engagement number can live under any of these fields depending
// on when the row was created; pick the first one with a numeric value.
const ENGAGEMENT_FIELDS = ['engagement', 'engagement_count', 'likes', 'views', 'reach'];
const pickEngagement = (row) => {
  for (const k of ENGAGEMENT_FIELDS) {
    if (row[k] != null && !Number.isNaN(Number(row[k]))) return Number(row[k]);
  }
  return null;
};

export default function PostsDetail() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [platformFilter, setPlatformFilter] = useState('');
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      const data = await listContentItems(userId, {
        fromDate: yearStartISO(),
        toDate:   todayISO(),
      });
      setRows(data || []);
    } catch (err) {
      console.error('[PostsDetail] load error:', err);
      toast.error('שגיאה: ' + (err?.message || ''));
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const platformOptions = useMemo(() => {
    const set = new Set();
    for (const r of rows) {
      const p = (r.platform || '').trim();
      if (p) set.add(p);
    }
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    if (!platformFilter) return rows;
    return rows.filter(r => (r.platform || '').trim() === platformFilter);
  }, [rows, platformFilter]);

  return (
    <LifeOSLayout title="פירוט פוסטים" rightSlot={
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
          <label style={labelStyle}>סינון לפי פלטפורמה</label>
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="">— כל הפלטפורמות —</option>
            {platformOptions.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Total */}
        <div style={{ ...LIFEOS_CARD, marginBottom: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary }}>סה"כ פוסטים</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: LIFEOS_COLORS.primary, marginTop: 4 }}>
            {filtered.length}
          </div>
        </div>

        {/* Table */}
        <div style={{ ...LIFEOS_CARD, padding: 0, overflow: 'hidden' }}>
          <div style={tableHeader}>
            <span style={{ flex: 1.2 }}>תאריך</span>
            <span style={{ flex: 1.4 }}>פלטפורמה</span>
            <span style={{ flex: 2.4 }}>תוכן</span>
            <span style={{ flex: 1, textAlign: 'left', direction: 'ltr' }}>engagement</span>
          </div>
          {!loaded ? (
            <div style={emptyStyle}>טוען...</div>
          ) : filtered.length === 0 ? (
            <div style={emptyStyle}>אין פוסטים</div>
          ) : (
            filtered.map((r, idx) => {
              const eng = pickEngagement(r);
              const href = r.link || r.url || r.post_url || null;
              return (
                <div key={r.id} style={tableRow(idx === filtered.length - 1)}>
                  <span style={{ flex: 1.2 }}>{dateStr(r.scheduled_date)}</span>
                  <span style={{ flex: 1.4, fontSize: 11, color: LIFEOS_COLORS.textSecondary }}>
                    {r.platform || '—'}
                  </span>
                  <span style={{
                    flex: 2.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.title || r.content_type || '—'}
                    </span>
                    {href && (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="פתח פוסט"
                        style={{ color: LIFEOS_COLORS.primary, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </span>
                  <span style={{ flex: 1, textAlign: 'left', direction: 'ltr', fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
                    {eng != null ? eng : '—'}
                  </span>
                </div>
              );
            })
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
