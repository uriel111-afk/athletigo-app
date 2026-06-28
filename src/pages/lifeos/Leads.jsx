import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, ChevronLeft, ChevronRight, RefreshCw, UserPlus, Phone, MessageCircle, AlertTriangle } from 'lucide-react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import GuidedLeadFlow from '@/components/lifeos/GuidedLeadFlow';
import LeadDetailView from '@/components/lifeos/LeadDetailView';
import AddTraineeDialog from '@/components/forms/AddTraineeDialog';
import {
  LIFEOS_COLORS, LIFEOS_CARD,
  LEAD_STATUS, LEAD_SOURCES, LEAD_INTERESTED_IN, LEAD_CLOSE_RESULTS,
  LADDER_MATCHES, ladderForExperience,
} from '@/lib/lifeos/lifeos-constants';
import { listLeads, updateLead, deleteLead } from '@/lib/lifeos/lifeos-api';
import { waLink, telLink, relTime, followUpState, followUpSortKey } from '@/lib/lifeos/lead-helpers';
import { seedSalesScripts } from '@/data/sales-scripts-seed';
import { scriptsKey } from '@/lib/lifeos/sales-scripts-api';
import { toast } from 'sonner';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');
const STATUS_BY_KEY   = Object.fromEntries(LEAD_STATUS.map(s => [s.key, s]));
const CLOSE_BY_KEY    = Object.fromEntries(LEAD_CLOSE_RESULTS.map(s => [s.key, s]));
const SOURCE_BY_KEY   = Object.fromEntries(LEAD_SOURCES.map(s => [s.key, s]));
const INTEREST_BY_KEY = Object.fromEntries(LEAD_INTERESTED_IN.map(s => [s.key, s]));

// Lead score — bigger numbers = hotter lead.
function leadScore(lead) {
  let s = 0;
  if (lead.source === 'instagram')      s += 20;
  if (lead.interested_in === 'dream_machine')   s += 30;
  if (lead.interested_in === 'course')          s += 25;
  if (lead.interested_in === 'online_coaching') s += 30;
  if (lead.interested_in === 'workshop')        s += 15;
  if (lead.source !== 'other')                  s += 15;
  if (lead.last_contact_date) {
    const days = Math.floor((Date.now() - new Date(lead.last_contact_date).getTime()) / 86_400_000);
    if (days >= 3) s -= 20;
  } else if (lead.created_at) {
    const days = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86_400_000);
    if (days >= 3) s -= 20;
  }
  return Math.max(0, s);
}
function scoreBadge(s) {
  if (s >= 50) return { label: 'Hot',  emoji: '🔥', bg: '#FEE2E2', color: '#dc2626' };
  if (s >= 25) return { label: 'Warm', emoji: '☀️', bg: '#FEF3C7', color: '#EAB308' };
  return            { label: 'Cold', emoji: '❄️', bg: '#DBEAFE', color: '#3B82F6' };
}

export default function Leads() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Seed the default sales scripts once (idempotent) so the guided
  // flow + editor always have content; refresh the scripts query if it
  // actually wrote so the flow reads live rows.
  useEffect(() => {
    if (!userId) return;
    seedSalesScripts(userId).then((res) => {
      if (res?.seeded) qc.invalidateQueries({ queryKey: scriptsKey });
    });
  }, [userId, qc]);

  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState('list');     // list | kanban
  const [filter, setFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewingLead, setViewingLead] = useState(null);  // detail overlay
  // Create-trainee flow: when the coach wants to spin a paying client
  // out of a converted lead, we open AddTraineeDialog with name+phone
  // prefilled so they don't retype the contact info.
  const [traineeSeed, setTraineeSeed] = useState(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try { setRows(await listLeads(userId) || []); }
    catch (err) { console.error('[Leads]', err); toast.error('שגיאה בטעינה'); }
    finally { setLoaded(true); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  // Follow-up urgency drives both the overdue badge and the list sort.
  const overdueIds = useMemo(() => {
    const out = new Set();
    rows.forEach(r => { if (followUpState(r) === 'overdue') out.add(r.id); });
    return out;
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter === 'overdue') list = rows.filter(r => followUpState(r) === 'overdue');
    else if (filter !== 'all') list = rows.filter(r => r.status === filter);
    // Sort by follow-up urgency: overdue → today → upcoming → none → dead.
    return [...list].sort((a, b) => followUpSortKey(a).localeCompare(followUpSortKey(b)));
  }, [rows, filter]);

  const counts = useMemo(() => {
    const m = { all: rows.length };
    LEAD_STATUS.forEach(s => { m[s.key] = 0; });
    rows.forEach(r => { if (m[r.status] !== undefined) m[r.status]++; });
    return m;
  }, [rows]);

  const summary = useMemo(() => {
    const active = rows.filter(r => r.status !== 'lost' && r.status !== 'converted');
    const potential = active.reduce((s, r) => s + Number(r.revenue_if_converted || 0), 0);
    const converted = rows.filter(r => r.status === 'converted').length;
    const total = rows.length;
    return {
      active: active.length, converted, potential,
      conversionRate: total > 0 ? (converted / total) * 100 : 0,
    };
  }, [rows]);

  const overdueCount = overdueIds.size;

  const openNew  = () => { setEditing(null); setShowForm(true); };
  const openEdit = (lead) => { setViewingLead(null); setEditing(lead); setShowForm(true); };
  const openView = (row) => setViewingLead(row);

  const handleDelete = async (e, id) => {
    e?.stopPropagation?.();
    if (!confirm('בטוח שאתה רוצה למחוק את הליד?')) return;
    try { await deleteLead(id); toast.success('נמחק'); load(); }
    catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const moveStatus = async (lead, newStatus) => {
    try {
      const patch = { status: newStatus, last_contact_date: new Date().toISOString() };
      if (newStatus === 'converted') patch.converted_at = new Date().toISOString();
      await updateLead(lead.id, patch);
      load();
    } catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  const openCreateTrainee = (e, lead) => {
    e?.stopPropagation?.();
    setTraineeSeed({
      fullName: lead.name || lead.full_name || '',
      phone: lead.phone || '',
      email: lead.email || '',
    });
  };

  return (
    <LifeOSLayout title="לידים" onQuickSaved={load} rightSlot={
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={() => navigate('/leads/scripts')} aria-label="עריכת סקריפטים" title="עריכת סקריפטים" style={{
          width: 32, height: 32, borderRadius: 10, border: 'none',
          background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: LIFEOS_COLORS.textSecondary,
        }}>
          <Pencil size={16} />
        </button>
        <button onClick={load} aria-label="רענן" title="רענן" style={{
          width: 32, height: 32, borderRadius: 10, border: 'none',
          background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: LIFEOS_COLORS.textSecondary,
        }}>
          <RefreshCw size={16} />
        </button>
      </div>
    }>
      <button onClick={openNew} style={{
        width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none',
        backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
        fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 12,
        boxShadow: '0 2px 8px rgba(255,111,32,0.2)',
      }}>+ ליד חדש</button>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button onClick={() => setView('list')} style={viewBtn(view === 'list')}>📋 רשימה</button>
        <button onClick={() => setView('kanban')} style={viewBtn(view === 'kanban')}>📊 Kanban</button>
      </div>

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
            💰 פוטנציאל הכנסה
          </div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{fmt(summary.potential)}₪</div>
        </div>
      )}

      {/* Overdue follow-up banner — tap to filter to overdue only. */}
      {overdueCount > 0 && view === 'list' && (
        <button onClick={() => setFilter(filter === 'overdue' ? 'all' : 'overdue')} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
          padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
          border: `1px solid ${filter === 'overdue' ? '#dc2626' : '#FCA5A5'}`,
          background: filter === 'overdue' ? '#FEE2E2' : '#FEF2F2', textAlign: 'right',
        }}>
          <AlertTriangle size={18} color="#dc2626" />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: '#dc2626' }}>
            {overdueCount} לידים מחכים לפולואפ
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>
            {filter === 'overdue' ? 'הצג הכל' : 'הצג'}
          </span>
        </button>
      )}

      {!loaded ? (
        <Empty text="טוען..." />
      ) : view === 'kanban' ? (
        <KanbanView
          rows={rows}
          onTap={openView}
          onMove={moveStatus}
          overdueIds={overdueIds}
        />
      ) : (
        <ListView
          rows={filtered}
          counts={counts}
          filter={filter}
          setFilter={setFilter}
          overdueIds={overdueIds}
          onView={openView}
          onDelete={handleDelete}
          onCreateTrainee={openCreateTrainee}
        />
      )}

      <GuidedLeadFlow
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        userId={userId}
        lead={editing}
        onSaved={load}
      />

      {viewingLead && (
        <LeadDetailView
          lead={viewingLead}
          onClose={() => setViewingLead(null)}
          onEdit={openEdit}
          onChanged={load}
        />
      )}

      {traineeSeed && (
        <AddTraineeDialog
          open={!!traineeSeed}
          onClose={() => { setTraineeSeed(null); load(); }}
          initialData={traineeSeed}
        />
      )}
    </LifeOSLayout>
  );
}

// ─── List view ───────────────────────────────────────────────────

function ListView({ rows, counts, filter, setFilter, overdueIds, onView, onDelete, onCreateTrainee }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label={`הכל (${counts.all})`} />
        {LEAD_STATUS.map(s => (
          <FilterChip key={s.key} active={filter === s.key} onClick={() => setFilter(s.key)}
                      label={`${s.label} (${counts[s.key] || 0})`} activeColor={s.color} />
        ))}
      </div>
      <div style={{ ...LIFEOS_CARD, padding: 0, overflow: 'hidden' }}>
        {rows.length === 0 ? (
          counts.all === 0 ? (
            <div style={{ padding: '36px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 38, marginBottom: 8 }}>👥</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, marginBottom: 6 }}>
                עדיין אין לידים
              </div>
              <div style={{ fontSize: 12, color: LIFEOS_COLORS.textSecondary }}>
                לחץ על "+ ליד חדש" למעלה כדי להתחיל
              </div>
            </div>
          ) : (
            <Empty text="אין לידים בסינון זה" />
          )
        ) : rows.map((row, idx) => (
          <LeadRow key={row.id} row={row} isLast={idx === rows.length - 1}
                   overdue={overdueIds.has(row.id)}
                   onView={() => onView(row)}
                   onDelete={(e) => onDelete(e, row.id)}
                   onCreateTrainee={(e) => onCreateTrainee(e, row)} />
        ))}
      </div>
    </>
  );
}

function LeadRow({ row, isLast, overdue, onView, onDelete, onCreateTrainee }) {
  const closeBadge = CLOSE_BY_KEY[row.close_result];
  const status = closeBadge || STATUS_BY_KEY[row.status] || { label: row.status, color: '#9ca3af' };
  const ladderKey = row.ladder_match || (row.sports_experience ? ladderForExperience(row.sports_experience) : null);
  const ladder = ladderKey ? LADDER_MATCHES[ladderKey] : null;
  const fu = followUpState(row);
  const fuDate = row.next_follow_up ? String(row.next_follow_up).slice(0, 10) : null;
  const fuColor = fu === 'overdue' ? '#dc2626' : fu === 'today' ? '#16a34a' : LIFEOS_COLORS.textSecondary;
  const lastContact = row.last_contact_date || row.created_at;

  const stop = (e) => e.stopPropagation();

  return (
    <div onClick={onView} style={{
      padding: '12px 14px',
      borderBottom: isLast ? 'none' : `0.5px solid ${LIFEOS_COLORS.border}`,
      cursor: 'pointer',
      backgroundColor: overdue ? '#FEF2F2' : 'transparent',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{row.name}</div>
            {ladder && (
              <span style={{
                padding: '2px 8px', borderRadius: 999,
                backgroundColor: '#F4E8D8', color: ladder.color,
                fontSize: 10, fontWeight: 800,
              }}>{ladder.title}</span>
            )}
          </div>
          <div style={{ fontSize: 12, marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {fuDate && <span style={{ color: fuColor, fontWeight: 700 }}>
              📅 {fuDate}{fu === 'overdue' ? ' · באיחור' : fu === 'today' ? ' · היום' : ''}
            </span>}
            {lastContact && <span style={{ color: LIFEOS_COLORS.textMuted }}>· {relTime(lastContact)}</span>}
          </div>
        </div>
        <span style={{
          padding: '4px 10px', borderRadius: 999,
          backgroundColor: status.color, color: '#FFFFFF',
          fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
        }}>{status.label}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {row.phone && (
          <>
            <a href={waLink(row.phone, '')} target="_blank" rel="noreferrer" onClick={stop}
               aria-label="וואטסאפ" style={{ ...iconBtn, color: '#25D366' }}><MessageCircle size={16} /></a>
            <a href={telLink(row.phone)} onClick={stop}
               aria-label="התקשר" style={{ ...iconBtn, color: '#3B82F6' }}><Phone size={16} /></a>
          </>
        )}
        {row.status === 'converted' && (
          <button onClick={(e) => { stop(e); onCreateTrainee(e); }} aria-label="צור מתאמן" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '5px 10px', borderRadius: 999, border: 'none',
            backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
            fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>
            <UserPlus size={12} /> צור מתאמן
          </button>
        )}
        <button onClick={(e) => { stop(e); onDelete(e); }} style={{ ...iconBtn, color: LIFEOS_COLORS.error }} aria-label="מחיקה"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

// ─── Kanban view ─────────────────────────────────────────────────

function KanbanView({ rows, onTap, onMove, overdueIds }) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'thin' }}>
      {LEAD_STATUS.map(col => {
        const items = rows.filter(r => r.status === col.key);
        return (
          <div key={col.key} style={{
            minWidth: 200, flexShrink: 0,
            backgroundColor: '#F7F3EC', borderRadius: 12, padding: 8,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '4px 6px', marginBottom: 6,
            }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: col.color }}>
                {col.label}
              </div>
              <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, fontWeight: 600 }}>
                {items.length}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.length === 0 ? (
                <div style={{ padding: 8, fontSize: 11, color: LIFEOS_COLORS.textSecondary, textAlign: 'center' }}>—</div>
              ) : items.map(r => (
                <KanbanCard key={r.id} lead={r} columns={LEAD_STATUS}
                            onTap={() => onTap(r)} onMove={onMove}
                            overdue={overdueIds.has(r.id)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({ lead, columns, onTap, onMove, overdue }) {
  const idx = columns.findIndex(c => c.key === lead.status);
  const prev = idx > 0 ? columns[idx - 1] : null;
  const next = idx < columns.length - 1 ? columns[idx + 1] : null;
  const score = leadScore(lead);
  const sb = scoreBadge(score);
  const interest = lead.interested_in ? INTEREST_BY_KEY[lead.interested_in] : null;

  return (
    <div style={{
      backgroundColor: '#FFFFFF', borderRadius: 10, padding: 8,
      border: overdue ? `1px solid ${LIFEOS_COLORS.error}` : `1px solid ${LIFEOS_COLORS.border}`,
    }}>
      <div onClick={onTap} style={{ cursor: 'pointer' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, flex: 1, minWidth: 0 }}>{lead.name}</div>
          <span style={{
            padding: '1px 5px', borderRadius: 999,
            backgroundColor: sb.bg, color: sb.color,
            fontSize: 9, fontWeight: 800, whiteSpace: 'nowrap',
          }}>{sb.emoji}</span>
        </div>
        {interest && (
          <div style={{ fontSize: 10, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>{interest.label}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <button onClick={(e) => { e.stopPropagation(); next && onMove(lead, next.key); }}
                disabled={!next} style={kanbanArrowBtn(!next)} aria-label="הבא">
          <ChevronLeft size={12} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); prev && onMove(lead, prev.key); }}
                disabled={!prev} style={kanbanArrowBtn(!prev)} aria-label="קודם">
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── Shared ──────────────────────────────────────────────────────

function FilterChip({ active, onClick, label, activeColor = LIFEOS_COLORS.primary }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', borderRadius: 999,
      border: `1px solid ${active ? activeColor : LIFEOS_COLORS.border}`,
      backgroundColor: active ? activeColor : '#FFFFFF',
      color: active ? '#FFFFFF' : LIFEOS_COLORS.textPrimary,
      fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
    }}>{label}</button>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={{ ...LIFEOS_CARD, textAlign: 'center', padding: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: LIFEOS_COLORS.textSecondary }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Empty({ text }) {
  return <div style={{ padding: 30, textAlign: 'center', fontSize: 13, color: LIFEOS_COLORS.textSecondary }}>{text}</div>;
}

const iconBtn = {
  width: 28, height: 28, borderRadius: 8, border: 'none',
  background: 'transparent', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: LIFEOS_COLORS.textSecondary,
};

function viewBtn(active) {
  return {
    flex: 1, padding: '8px 12px', borderRadius: 10,
    border: `1px solid ${active ? LIFEOS_COLORS.primary : LIFEOS_COLORS.border}`,
    backgroundColor: active ? LIFEOS_COLORS.primary : '#FFFFFF',
    color: active ? '#FFFFFF' : LIFEOS_COLORS.textPrimary,
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
  };
}

function kanbanArrowBtn(disabled) {
  return {
    flex: 1, padding: '4px 0', borderRadius: 6, border: 'none',
    backgroundColor: disabled ? '#F0E4D0' : LIFEOS_COLORS.primary,
    color: '#FFFFFF', cursor: disabled ? 'default' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: disabled ? 0.4 : 1,
  };
}
