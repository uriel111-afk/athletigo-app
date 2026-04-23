import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import ContentForm from '@/components/lifeos/ContentForm';
import {
  LIFEOS_COLORS, LIFEOS_CARD,
  CONTENT_STATUS, CONTENT_TYPES,
} from '@/lib/lifeos/lifeos-constants';
import { listContentItems } from '@/lib/lifeos/lifeos-api';
import { toast } from 'sonner';

const STATUS_BY_KEY = Object.fromEntries(CONTENT_STATUS.map(s => [s.key, s]));
const TYPE_BY_KEY   = Object.fromEntries(CONTENT_TYPES.map(t => [t.key, t]));

export default function ContentCalendar() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try {
      setRows(await listContentItems(userId) || []);
    } catch (err) {
      console.error('[ContentCalendar] load error:', err);
      toast.error('שגיאה בטעינה');
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => filter === 'all' ? rows : rows.filter(r => r.status === filter),
    [rows, filter]
  );

  const counts = useMemo(() => {
    const m = { all: rows.length };
    CONTENT_STATUS.forEach(s => { m[s.key] = 0; });
    rows.forEach(r => { if (m[r.status] !== undefined) m[r.status]++; });
    return m;
  }, [rows]);

  // This week's pipeline: how many published vs not, to gauge consistency.
  const weekStats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    const inWeek = rows.filter(r => {
      const d = r.scheduled_date ? new Date(r.scheduled_date) : null;
      return d && d >= weekAgo && d <= now;
    });
    const published = inWeek.filter(r => r.status === 'published').length;
    const planned = inWeek.length;
    return { published, planned };
  }, [rows]);

  const openNew = () => { setEditing(null); setShowForm(true); };
  const openEdit = (row) => { setEditing(row); setShowForm(true); };

  return (
    <LifeOSLayout title="לוח תוכן">
      <button
        onClick={openNew}
        style={{
          width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none',
          backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
          fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 14,
          boxShadow: '0 2px 8px rgba(255,111,32,0.2)',
        }}
      >
        + רעיון תוכן חדש
      </button>

      {/* Consistency banner */}
      <div style={{ ...LIFEOS_CARD, marginBottom: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: LIFEOS_COLORS.textSecondary, marginBottom: 4 }}>
          תוכן שפורסם ב-7 ימים האחרונים
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: LIFEOS_COLORS.textPrimary }}>
          {weekStats.published}<span style={{ fontSize: 16, fontWeight: 600, color: LIFEOS_COLORS.textSecondary }}> / 7</span>
        </div>
        <div style={{
          fontSize: 11, marginTop: 4, fontWeight: 700,
          color: weekStats.published >= 7 ? LIFEOS_COLORS.success
               : weekStats.published >= 4 ? LIFEOS_COLORS.primary
               : LIFEOS_COLORS.error,
        }}>
          {weekStats.published >= 7 ? '🔥 עקביות מושלמת'
            : weekStats.published >= 4 ? '💪 בדרך הנכונה'
            : 'צריך יותר תוכן החודש'}
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}
                    label={`הכל (${counts.all})`} />
        {CONTENT_STATUS.map(s => (
          <FilterChip key={s.key} active={filter === s.key} onClick={() => setFilter(s.key)}
                      label={`${s.label} (${counts[s.key] || 0})`} activeColor={s.color} />
        ))}
      </div>

      {/* List */}
      <div style={{ ...LIFEOS_CARD, padding: 0, overflow: 'hidden' }}>
        {!loaded ? (
          <EmptyRow text="טוען..." />
        ) : filtered.length === 0 ? (
          <EmptyRow text={filter === 'all' ? 'אין תוכן. לחץ + להוספה' : 'אין פריטים בסטטוס זה'} />
        ) : (
          filtered.map((row, idx) => (
            <ContentRow key={row.id} row={row} isLast={idx === filtered.length - 1} onClick={() => openEdit(row)} />
          ))
        )}
      </div>

      <ContentForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        userId={userId}
        item={editing}
        onSaved={load}
      />
    </LifeOSLayout>
  );
}

function ContentRow({ row, isLast, onClick }) {
  const status = STATUS_BY_KEY[row.status] || { label: row.status, color: '#9ca3af' };
  const type = TYPE_BY_KEY[row.content_type] || { label: row.content_type, emoji: '📷' };
  const dateStr = row.scheduled_date
    ? new Date(row.scheduled_date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
    : '';

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 14px',
        borderBottom: isLast ? 'none' : `0.5px solid ${LIFEOS_COLORS.border}`,
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 22 }}>{type.emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: LIFEOS_COLORS.textPrimary,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {row.title}
        </div>
        <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
          {type.label}
          {dateStr ? ` • ${dateStr}` : ''}
          {row.scheduled_time ? ` ${row.scheduled_time}` : ''}
          {row.platform && row.platform !== 'instagram' ? ` • ${row.platform}` : ''}
        </div>
      </div>
      <span style={{
        padding: '4px 10px', borderRadius: 999,
        backgroundColor: status.color, color: '#FFFFFF',
        fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
      }}>
        {status.label}
      </span>
    </div>
  );
}

function FilterChip({ active, onClick, label, activeColor = LIFEOS_COLORS.primary }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: 999,
        border: `1px solid ${active ? activeColor : LIFEOS_COLORS.border}`,
        backgroundColor: active ? activeColor : '#FFFFFF',
        color: active ? '#FFFFFF' : LIFEOS_COLORS.textPrimary,
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}

function EmptyRow({ text }) {
  return (
    <div style={{ padding: '30px 14px', textAlign: 'center', fontSize: 13, color: LIFEOS_COLORS.textSecondary }}>
      {text}
    </div>
  );
}
