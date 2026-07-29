import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, ChevronLeft, ChevronRight, RefreshCw, UserPlus, Phone, MessageCircle, AlertTriangle, List, Columns } from 'lucide-react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import GuidedLeadFlow from '@/components/lifeos/GuidedLeadFlow';
import LeadIntakeTree from '@/components/lifeos/LeadIntakeTree';
import IntakeSchemaEditor from '@/components/lifeos/IntakeSchemaEditor';
import { loadIntakeSchema, saveIntakeSchema } from '@/lib/lifeos/intake-schema-api';
import { addOption, updateOptionByKey, removeOptionByKey } from '@/lib/lifeos/intake-tree-ops';
import { DEFAULT_INTAKE_TREE } from '@/lib/lifeos/intake-tree-schema';
// QuickIntakeForm is out of the routing, but its helper exports are still
// the source of truth for lead classification used across this page.
import { needsCompletion, isBusinessLead, TYPE_LABEL, groupPeopleCount } from '@/components/lifeos/QuickIntakeForm';
import LeadDetailView from '@/components/lifeos/LeadDetailView';
import AddTraineeDialog from '@/components/forms/AddTraineeDialog';
import {
  LIFEOS_COLORS, LIFEOS_CARD,
  LEAD_STATUS, LEAD_SOURCES, LEAD_INTERESTED_IN, LEAD_CLOSE_RESULTS,
  LADDER_MATCHES, ladderForExperience, LEAD_STATUS_DETAIL, COACH_USER_ID,
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

// ── lead_status_detail classification for filters/badges ──
const isClosedDetail = (l) => (l.lead_status_detail || '').startsWith('closed');
const isNewLead       = (l) => (l.lead_status_detail || l.status || 'new') === 'new';
const needsFollowup   = (l) => l.lead_status_detail === 'thinking' || ['overdue', 'today'].includes(followUpState(l));
const isClosedLead    = (l) => isClosedDetail(l) || l.status === 'converted';
const isRefusedLead   = (l) => l.lead_status_detail === 'refused' || l.status === 'lost';
const noReceiptLead   = (l) => isClosedDetail(l) && l.receipt_issued === false;

const LEAD_FILTERS = [
  { key: 'all',        label: 'הכל',            test: () => true },
  { key: 'new',        label: 'חדשים',          test: isNewLead },
  { key: 'followup',   label: 'מחכים לפולואפ',  test: needsFollowup },
  { key: 'closed',     label: 'סגרו',           test: isClosedLead },
  { key: 'refused',    label: 'סירבו',          test: isRefusedLead },
  { key: 'no_receipt', label: 'חסר קבלה',       test: noReceiptLead, danger: true },
];

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
  const isCoordinator = user?.role === 'coordinator';
  // Schema editing is for the coach/admin only — never the coordinator.
  const canEditSchema = !!user && !isCoordinator && (user.role === 'coach' || user.role === 'admin' || user.is_coach === true);
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
  const [showTree, setShowTree] = useState(false);       // recursive intake tree (single new-lead entry)
  const [treeLead, setTreeLead] = useState(null);        // existing lead reopened in the tree (else null = new)
  const [intakeSchema, setIntakeSchema] = useState(DEFAULT_INTAKE_TREE); // active tree (DB or bundled default)
  const [showEditor, setShowEditor] = useState(false);   // admin schema editor
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

  // Load the active intake tree (DB version, else the bundled default).
  useEffect(() => {
    let alive = true;
    loadIntakeSchema().then(({ schema }) => { if (alive && Array.isArray(schema)) setIntakeSchema(schema); });
    return () => { alive = false; };
  }, []);

  // In-conversation chip edits — each one persists a new schema version.
  // Optimistic: local state first so the chip row updates immediately.
  const saveSchemaVersion = async (next, okLabel) => {
    setIntakeSchema(next);
    try { const v = await saveIntakeSchema(next, userId); toast.success(`${okLabel} · גרסה ${v}`); }
    catch (e) { toast.error('שמירת התהליך נכשלה: ' + (e?.message || '')); }
  };

  // Quick-add — append a chip to a node's list (admins only; the button
  // is gated in the tree). is_custom marks it as hand-added, which is
  // what lets a coordinator edit/delete it later.
  const handleQuickAdd = (nodeId, label) =>
    saveSchemaVersion(addOption(intakeSchema, nodeId, { label, is_custom: true }), 'נוסף');

  // Rename a chip. The option key never changes, so saved lead answers
  // that reference it stay valid.
  const handleOptionEdit = (nodeId, key, label) =>
    saveSchemaVersion(updateOptionByKey(intakeSchema, nodeId, key, { label }), 'עודכן');

  const handleOptionDelete = (nodeId, key) =>
    saveSchemaVersion(removeOptionByKey(intakeSchema, nodeId, key), 'נמחק');

  // Follow-up urgency drives both the overdue badge and the list sort.
  const overdueIds = useMemo(() => {
    const out = new Set();
    rows.forEach(r => { if (followUpState(r) === 'overdue') out.add(r.id); });
    return out;
  }, [rows]);

  // Leads whose follow-up time has arrived (overdue + today), most-urgent
  // first — the "מעקבים להיום" bar at the top of the screen.
  const dueFollowups = useMemo(
    () => rows.filter((r) => ['overdue', 'today'].includes(followUpState(r)))
      .sort((a, b) => followUpSortKey(a).localeCompare(followUpSortKey(b))),
    [rows],
  );

  const filtered = useMemo(() => {
    const f = LEAD_FILTERS.find((x) => x.key === filter) || LEAD_FILTERS[0];
    const list = rows.filter(f.test);
    // Sort by follow-up urgency: overdue → today → upcoming → none → dead.
    return [...list].sort((a, b) => followUpSortKey(a).localeCompare(followUpSortKey(b)));
  }, [rows, filter]);

  const counts = useMemo(() => {
    const m = {};
    LEAD_FILTERS.forEach((f) => { m[f.key] = rows.filter(f.test).length; });
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

  // Single new-lead entry point — the recursive intake tree. Replaces the
  // inbound generator + silent quick form (their code stays in the repo,
  // just out of the routing).
  const openTree = () => { setTreeLead(null); setShowTree(true); };
  const openTreeLead = (lead) => { setViewingLead(null); setTreeLead(lead); setShowTree(true); };
  // "המשך שיחה מודרכת" + quick-complete + edit-quick all reopen the tree
  // on the existing lead (its persist guards never clobber earlier data).
  const openContinueGuided = openTreeLead;
  const openQuickLead = openTreeLead;
  // The wizard — for private leads (edit / "continue in wizard"), prefilled.
  const openEdit = (lead) => { setViewingLead(null); setEditing(lead); setShowForm(true); };
  // Tapping a lead: "awaiting completion" leads jump straight to the tree;
  // everything else opens the detail card.
  const openView = (row) => { if (needsCompletion(row)) openTreeLead(row); else setViewingLead(row); };

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
      // Converted from a lead → system-acquired client.
      clientOrigin: 'system',
    });
  };

  return (
    <LifeOSLayout title="לידים" onQuickSaved={load} rightSlot={
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* Coach-only tool: script editor. Hidden for the coordinator. */}
        {!isCoordinator && (
          <button onClick={() => navigate('/leads/scripts')} aria-label="עריכת סקריפטים" title="עריכת סקריפטים" style={headerIconBtn}>
            <Pencil size={18} />
          </button>
        )}
        <button onClick={load} aria-label="רענן" title="רענן" style={headerIconBtn}>
          <RefreshCw size={18} />
        </button>
      </div>
    }>
      {/* Intake — ONE and only new-lead entry: the recursive intake
          tree. The proactive wizard (GuidedLeadFlow) is NOT a create
          path — it's reached from a lead card ("שיחה יזומה"). The old
          generator + silent-form buttons are gone (code stays in repo). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <button onClick={openTree} style={{
          width: '100%', padding: '16px 12px', borderRadius: 14, border: 'none',
          background: 'linear-gradient(135deg,#FF6F20,#FF8A42)', color: '#FFFFFF',
          fontSize: 17, fontWeight: 900, cursor: 'pointer',
          boxShadow: '0 3px 10px rgba(255,111,32,0.28)',
        }}>+ ליד חדש</button>
        {/* Admin/coach only (never the coordinator) — schema editing, not
            a lead-creation entry. */}
        {canEditSchema && (
          <button onClick={() => setShowEditor(true)} style={{
            width: '100%', padding: '10px', borderRadius: 12, cursor: 'pointer',
            border: `1px solid ${LIFEOS_COLORS.border}`, background: '#FFFFFF', color: LIFEOS_COLORS.textSecondary,
            fontSize: 13, fontWeight: 700,
          }}>✏️ ערוך תהליך</button>
        )}
      </div>

      {dueFollowups.length > 0 && <TodayFollowupsBar leads={dueFollowups} onOpen={openView} />}

      {/* View switcher — one compact segmented control (centered) */}
      <div style={{
        display: 'flex', alignItems: 'center', width: 'fit-content', margin: '0 auto 12px',
        background: '#FFFFFF', border: `1px solid ${LIFEOS_COLORS.border}`, borderRadius: 14,
        padding: 3, gap: 2, height: 38, boxSizing: 'border-box',
      }}>
        {[
          { key: 'list', label: 'רשימה', Icon: List },
          { key: 'kanban', label: 'לוח תהליך', Icon: Columns },
        ].map((seg) => {
          const active = view === seg.key;
          const SegIcon = seg.Icon;
          return (
            <button key={seg.key} type="button" onClick={() => setView(seg.key)} style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              height: '100%', padding: '0 16px', borderRadius: 11, border: 'none', cursor: 'pointer',
              background: active ? LIFEOS_COLORS.primary : 'transparent',
              color: active ? '#FFFFFF' : LIFEOS_COLORS.textSecondary,
              fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
              transition: 'background .18s ease, color .18s ease',
            }}>
              <SegIcon size={15} />{seg.label}
            </button>
          );
        })}
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
        <button onClick={() => setFilter(filter === 'followup' ? 'all' : 'followup')} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
          padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
          border: `1px solid ${filter === 'followup' ? '#dc2626' : '#FCA5A5'}`,
          background: filter === 'followup' ? '#FEE2E2' : '#FEF2F2', textAlign: 'right',
        }}>
          <AlertTriangle size={18} color="#dc2626" />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: '#dc2626' }}>
            {overdueCount} לידים מחכים לפולואפ
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>
            {filter === 'followup' ? 'הצג הכל' : 'הצג'}
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

      <LeadIntakeTree
        isOpen={showTree}
        userId={userId}
        lead={treeLead}
        schema={intakeSchema}
        canEdit={canEditSchema}
        isMaster={userId === COACH_USER_ID}
        onQuickAdd={handleQuickAdd}
        onOptionEdit={handleOptionEdit}
        onOptionDelete={handleOptionDelete}
        onClose={() => { setShowTree(false); setTreeLead(null); }}
        onSaved={load}
      />

      <IntakeSchemaEditor
        isOpen={showEditor}
        userId={userId}
        schema={intakeSchema}
        onSaved={(next) => setIntakeSchema(next)}
        onClose={() => setShowEditor(false)}
      />

      {viewingLead && (
        <LeadDetailView
          lead={viewingLead}
          onClose={() => setViewingLead(null)}
          onEdit={openEdit}
          onEditQuick={openQuickLead}
          onChanged={load}
          onContinueGuided={openContinueGuided}
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
      <div style={{
        display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto',
        scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
        paddingInline: 2, paddingBottom: 2,
      }}>
        {LEAD_FILTERS.map(f => {
          const danger = f.danger && (counts[f.key] || 0) > 0;
          return (
            <FilterChip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}
                        label={`${f.label} (${counts[f.key] || 0})`}
                        activeColor={danger ? '#dc2626' : LIFEOS_COLORS.primary}
                        dangerIdle={danger} />
          );
        })}
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
  // Prefer the granular lead_status_detail; fall back to close_result/status.
  const detailBadge = LEAD_STATUS_DETAIL[row.lead_status_detail];
  const status = detailBadge || CLOSE_BY_KEY[row.close_result]
    || STATUS_BY_KEY[row.status] || { label: row.status || 'חדש', color: '#9ca3af' };
  const isClosed = (row.lead_status_detail || '').startsWith('closed');
  const receiptMissing = isClosed && row.receipt_issued === false;
  // Secondary text on the badge: price/product for closed deals.
  const badgeExtra = row.lead_status_detail === 'closed_breakthrough' ? '49₪'
    : (isClosed && row.payment_amount) ? `${Math.round(row.payment_amount)}₪`
    : (row.lead_status_detail === 'closed_equipment' && row.product_sold) ? row.product_sold
    : null;
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
            {isBusinessLead(row) && <LeadTypeTag lead={row} />}
            {needsCompletion(row) && <PendingTag />}
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {receiptMissing && <span title="חסרה קבלה" style={{ fontSize: 13 }}>⚠️</span>}
            <span style={{
              padding: '4px 10px', borderRadius: 999,
              backgroundColor: status.color, color: '#FFFFFF',
              fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
            }}>{status.label}</span>
          </div>
          {badgeExtra && <span style={{ fontSize: 11, fontWeight: 800, color: '#16a34a' }}>{badgeExtra}</span>}
        </div>
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
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 6px', marginBottom: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 800, color: col.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {col.label}
              </div>
              <span style={{
                minWidth: 20, height: 20, padding: '0 6px', flexShrink: 0,
                borderRadius: 999, background: col.color, color: '#FFFFFF',
                fontSize: 11, fontWeight: 800,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.length === 0 ? (
                <div style={{
                  border: `1px dashed ${LIFEOS_COLORS.border}`, borderRadius: 14,
                  padding: '16px 8px', textAlign: 'center',
                  fontSize: 11, color: LIFEOS_COLORS.textSecondary,
                }}>אין לידים בשלב זה</div>
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
      backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12,
      border: overdue ? `1px solid ${LIFEOS_COLORS.error}` : `1px solid ${LIFEOS_COLORS.border}`,
    }}>
      <div onClick={onTap} style={{ cursor: 'pointer' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0 }}>{lead.name}</div>
          <span style={{
            padding: '1px 5px', borderRadius: 999,
            backgroundColor: sb.bg, color: sb.color,
            fontSize: 9, fontWeight: 800, whiteSpace: 'nowrap',
          }}>{sb.emoji}</span>
        </div>
        {interest && (
          <div style={{ fontSize: 10, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>{interest.label}</div>
        )}
        {(isBusinessLead(lead) || needsCompletion(lead)) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
            {isBusinessLead(lead) && <LeadTypeTag lead={lead} />}
            {needsCompletion(lead) && <PendingTag />}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
        <button onClick={(e) => { e.stopPropagation(); next && onMove(lead, next.key); }}
                disabled={!next} style={kanbanArrowBtn(!next)} aria-label="הבא">
          <ChevronLeft size={14} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); prev && onMove(lead, prev.key); }}
                disabled={!prev} style={kanbanArrowBtn(!prev)} aria-label="קודם">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Shared ──────────────────────────────────────────────────────

// "מעקבים להיום" — leads whose follow-up has arrived, most urgent first,
// with direct call / whatsapp actions.
function TodayFollowupsBar({ leads, onOpen }) {
  return (
    <div style={{
      ...LIFEOS_CARD, marginBottom: 12, padding: 10,
      background: '#FFF7ED', border: '1px solid #FDBA74',
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#C24A0A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        📞 מעקבים להיום ({leads.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {leads.slice(0, 8).map((l) => {
          const st = followUpState(l);
          return (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 10, border: '1px solid #F0E4D0', padding: '7px 10px' }}>
              <button type="button" onClick={() => onOpen(l)} style={{ flex: 1, minWidth: 0, textAlign: 'right', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: st === 'overdue' ? '#dc2626' : '#16a34a' }}>{st === 'overdue' ? 'באיחור' : 'היום'}</span>
              </button>
              <a href={telLink(l.phone)} onClick={(e) => e.stopPropagation()} aria-label="חייג" style={fuActBtn('#3B82F6')}><Phone size={15} /></a>
              <a href={waLink(l.phone, '')} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label="וואטסאפ" style={fuActBtn('#25D366')}><MessageCircle size={15} /></a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
const fuActBtn = (color) => ({ flexShrink: 0, width: 34, height: 34, borderRadius: 9, background: color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' });

// Distinct tag for business / existing-group leads (vs private).
function LeadTypeTag({ lead }) {
  const ppl = groupPeopleCount(lead);
  const label = lead.lead_type === 'group' && ppl ? `קבוצה · ${ppl} איש` : (TYPE_LABEL[lead.lead_type] || 'עסקי');
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999,
      background: '#EEF2FF', color: '#4338CA', border: '1px solid #C7D2FE',
      fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap',
    }}>🏢 {label}</span>
  );
}

// "Awaiting completion" tag — a quick lead not yet classified.
function PendingTag() {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 999, background: '#FEF3C7', color: '#92400E',
      border: '1px solid #FDE68A', fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap',
    }}>ממתין להשלמה</span>
  );
}

function FilterChip({ active, onClick, label, activeColor = LIFEOS_COLORS.primary, dangerIdle }) {
  // dangerIdle → red border + text when not active (e.g. "חסר קבלה" > 0).
  const idleBorder = dangerIdle ? '#dc2626' : LIFEOS_COLORS.border;
  const idleText = dangerIdle ? '#dc2626' : LIFEOS_COLORS.textPrimary;
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', borderRadius: 999,
      border: `1px solid ${active ? activeColor : idleBorder}`,
      backgroundColor: active ? activeColor : '#FFFFFF',
      color: active ? '#FFFFFF' : idleText,
      fontSize: 12, fontWeight: dangerIdle ? 800 : 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
    }}>{label}</button>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={{
      ...LIFEOS_CARD, textAlign: 'center', padding: 10, minHeight: 64,
      height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
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

// Uniform 40px circular header action buttons (refresh / edit) so the
// left-side cluster reads as one evenly-spaced group.
const headerIconBtn = {
  width: 40, height: 40, borderRadius: 999, border: 'none',
  background: '#F7F3EC', cursor: 'pointer', flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: LIFEOS_COLORS.textSecondary,
};

function kanbanArrowBtn(disabled) {
  return {
    width: 32, height: 26, flexShrink: 0, padding: 0, borderRadius: 8, border: 'none',
    backgroundColor: disabled ? '#F0E4D0' : LIFEOS_COLORS.primary,
    color: '#FFFFFF', cursor: disabled ? 'default' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: disabled ? 0.4 : 1,
  };
}
