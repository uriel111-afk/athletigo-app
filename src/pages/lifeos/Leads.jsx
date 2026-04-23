import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import LeadForm from '@/components/lifeos/LeadForm';
import {
  LIFEOS_COLORS, LIFEOS_CARD,
  LEAD_STATUS, LEAD_SOURCES, LEAD_INTERESTED_IN,
} from '@/lib/lifeos/lifeos-constants';
import { listLeads } from '@/lib/lifeos/lifeos-api';
import { toast } from 'sonner';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');

const STATUS_BY_KEY    = Object.fromEntries(LEAD_STATUS.map(s => [s.key, s]));
const SOURCE_BY_KEY    = Object.fromEntries(LEAD_SOURCES.map(s => [s.key, s]));
const INTEREST_BY_KEY  = Object.fromEntries(LEAD_INTERESTED_IN.map(s => [s.key, s]));

export default function Leads() {
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
      setRows(await listLeads(userId) || []);
    } catch (err) {
      console.error('[Leads] load error:', err);
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

  // Counts per status for the filter chips.
  const counts = useMemo(() => {
    const m = { all: rows.length };
    LEAD_STATUS.forEach(s => { m[s.key] = 0; });
    rows.forEach(r => { if (m[r.status] !== undefined) m[r.status]++; });
    return m;
  }, [rows]);

  // Summary totals.
  const summary = useMemo(() => {
    const active = rows.filter(r => r.status !== 'lost' && r.status !== 'converted');
    const potential = active.reduce((s, r) => s + Number(r.revenue_if_converted || 0), 0);
    const converted = rows.filter(r => r.status === 'converted').length;
    const total = rows.length;
    const conversionRate = total > 0 ? (converted / total) * 100 : 0;
    return { active: active.length, potential, converted, conversionRate };
  }, [rows]);

  const openNew = () => { setEditing(null); setShowForm(true); };
  const openEdit = (row) => { setEditing(row); setShowForm(true); };

  return (
    <LifeOSLayout title="לידים">
      <button
        onClick={openNew}
        style={{
          width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none',
          backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
          fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 14,
          boxShadow: '0 2px 8px rgba(255,111,32,0.2)',
        }}
      >
        + ליד חדש
      </button>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        <MiniStat label="פעילים" value={summary.active} />
        <MiniStat label="שנסגרו" value={summary.converted} />
        <MiniStat label="% המרה" value={`${summary.conversionRate.toFixed(0)}%`} />
      </div>

      {summary.potential > 0 && (
        <div style={{
          ...LIFEOS_CARD, marginBottom: 12,
          backgroundColor: '#FFF4E6', border: `1px solid ${LIFEOS_COLORS.primary}`,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: LIFEOS_COLORS.primary, marginBottom: 4 }}>
            💰 פוטנציאל הכנסה מלידים פעילים
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: LIFEOS_COLORS.textPrimary }}>
            {fmt(summary.potential)}₪
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}
                    label={`הכל (${counts.all})`} />
        {LEAD_STATUS.map(s => (
          <FilterChip key={s.key} active={filter === s.key} onClick={() => setFilter(s.key)}
                      label={`${s.label} (${counts[s.key] || 0})`} activeColor={s.color} />
        ))}
      </div>

      {/* List */}
      <div style={{ ...LIFEOS_CARD, padding: 0, overflow: 'hidden' }}>
        {!loaded ? (
          <EmptyRow text="טוען..." />
        ) : filtered.length === 0 ? (
          <EmptyRow text={filter === 'all' ? 'אין לידים. לחץ + להוספה' : 'אין לידים בסטטוס זה'} />
        ) : (
          filtered.map((row, idx) => (
            <LeadRow key={row.id} row={row} isLast={idx === filtered.length - 1} onClick={() => openEdit(row)} />
          ))
        )}
      </div>

      <LeadForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        userId={userId}
        lead={editing}
        onSaved={load}
      />
    </LifeOSLayout>
  );
}

function LeadRow({ row, isLast, onClick }) {
  const status = STATUS_BY_KEY[row.status] || { label: row.status, color: '#9ca3af' };
  const source = SOURCE_BY_KEY[row.source];
  const interest = row.interested_in ? INTEREST_BY_KEY[row.interested_in] : null;
  const followUp = row.next_follow_up
    ? new Date(row.next_follow_up).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
    : null;
  const isOverdue = row.next_follow_up && new Date(row.next_follow_up) < new Date();

  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 14px',
        borderBottom: isLast ? 'none' : `0.5px solid ${LIFEOS_COLORS.border}`,
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: LIFEOS_COLORS.textPrimary }}>
            {row.name}
          </div>
          <div style={{ fontSize: 12, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
            {row.phone}
            {source ? ` • ${source.label}` : ''}
            {interest ? ` • ${interest.label}` : ''}
          </div>
          {followUp && (
            <div style={{
              fontSize: 11, marginTop: 4,
              color: isOverdue ? LIFEOS_COLORS.error : LIFEOS_COLORS.primary,
              fontWeight: 700,
            }}>
              📅 מעקב: {followUp}{isOverdue ? ' (באיחור!)' : ''}
            </div>
          )}
        </div>
        <span style={{
          padding: '4px 10px', borderRadius: 999,
          backgroundColor: status.color, color: '#FFFFFF',
          fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
        }}>
          {status.label}
        </span>
      </div>
      {Number(row.revenue_if_converted) > 0 && (
        <div style={{
          fontSize: 12, fontWeight: 700, color: LIFEOS_COLORS.success, marginTop: 6,
        }}>
          +{fmt(Number(row.revenue_if_converted))}₪ פוטנציאל
        </div>
      )}
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

function MiniStat({ label, value }) {
  return (
    <div style={{ ...LIFEOS_CARD, textAlign: 'center', padding: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: LIFEOS_COLORS.textSecondary }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: LIFEOS_COLORS.textPrimary, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function EmptyRow({ text }) {
  return (
    <div style={{ padding: '30px 14px', textAlign: 'center', fontSize: 13, color: LIFEOS_COLORS.textSecondary }}>
      {text}
    </div>
  );
}
