import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { AuthContext } from '@/lib/AuthContext';
import LifeOSLayout from '@/components/lifeos/LifeOSLayout';
import ContentForm from '@/components/lifeos/ContentForm';
import {
  LIFEOS_COLORS, LIFEOS_CARD,
  CONTENT_STATUS, CONTENT_TYPES, ATHLETIGO_PRODUCTS,
} from '@/lib/lifeos/lifeos-constants';
import { listContentItems } from '@/lib/lifeos/lifeos-api';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

const STATUS_BY_KEY = Object.fromEntries(CONTENT_STATUS.map(s => [s.key, s]));
const TYPE_BY_KEY   = Object.fromEntries(CONTENT_TYPES.map(t => [t.key, t]));

const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

// Days of the current week, Sunday-first.
function currentWeekDays(offsetWeeks = 0) {
  const today = new Date();
  const day = today.getDay(); // 0 = Sunday
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - day + offsetWeeks * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

// Streak of consecutive days with at least one published item.
function calcContentStreak(rows) {
  const days = new Set(
    rows.filter(r => r.status === 'published' && r.scheduled_date).map(r => dayKey(r.scheduled_date))
  );
  let streak = 0;
  const cursor = new Date();
  if (days.has(dayKey(cursor))) { streak = 1; cursor.setDate(cursor.getDate() - 1); }
  else                          { cursor.setDate(cursor.getDate() - 1); }
  while (days.has(dayKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

// Pull views/leads from `performance` JSONB; pick the top performer.
function bestPerformer(rows) {
  const ranked = rows
    .map(r => {
      const perf = r.performance || {};
      const views = Number(perf.views || 0);
      const leads = Number(perf.leads || 0);
      const score = views + leads * 100;
      return { row: r, views, leads, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0] || null;
}

// Suggest 3 ideas based on which products/skills haven't been
// covered recently (or ever).
function suggestIdeas(rows) {
  const lastByProduct = new Map();
  rows.forEach(r => {
    if (!r.product_tag) return;
    const k = r.product_tag;
    const dt = r.scheduled_date ? new Date(r.scheduled_date) : null;
    if (!dt) return;
    if (!lastByProduct.has(k) || dt > lastByProduct.get(k)) lastByProduct.set(k, dt);
  });
  const ideas = [];
  const now = Date.now();
  const daysSince = (d) => Math.floor((now - d.getTime()) / 86_400_000);

  // Rings — flagship long-tail product
  const ringsLast = lastByProduct.get('rings');
  const ringsDays = ringsLast ? daysSince(ringsLast) : 999;
  if (ringsDays > 14) ideas.push({
    text: `לא פרסמת על Rings כבר ${ringsDays === 999 ? 'הרבה זמן' : `${ringsDays} יום`} — רעיון: 60 שניות של muscle-up progression`,
  });

  // Workshops
  const wsLast = lastByProduct.get('workshop');
  if (!wsLast || daysSince(wsLast) > 30) ideas.push({
    text: 'לא פרסמת על סדנאות החודש — רעיון: טיזר של 30 שניות מסדנה קודמת',
  });

  // Online coaching
  const ocLast = lastByProduct.get('online_coaching');
  if (!ocLast) ideas.push({
    text: 'לא פרסמת על ליווי אונליין — רעיון: Before/After של מתאמן בתהליך ליווי',
  });

  // Generic Dream Machine fallback
  const dmLast = lastByProduct.get('dream_machine');
  if (ideas.length < 3 && (!dmLast || daysSince(dmLast) > 7)) ideas.push({
    text: `Dream Machine — ${dmLast ? `${daysSince(dmLast)} יום ללא תוכן` : 'אין תוכן בכלל'}. רעיון: דמו של תרגיל אחד`,
  });

  return ideas.slice(0, 3);
}

export default function ContentCalendar() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState('week'); // week | list
  const [filter, setFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoaded(false);
    try { setRows(await listContentItems(userId) || []); }
    catch (err) { console.error('[Content]', err); toast.error('שגיאה בטעינה'); }
    finally { setLoaded(true); }
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

  const streak = useMemo(() => calcContentStreak(rows), [rows]);
  const best = useMemo(() => bestPerformer(rows), [rows]);
  const ideas = useMemo(() => suggestIdeas(rows), [rows]);
  const weekDays = useMemo(() => currentWeekDays(weekOffset), [weekOffset]);

  const openNew  = () => { setEditing(null); setShowForm(true); };
  const openEdit = (e, row) => { e?.stopPropagation?.(); setEditing(row); setShowForm(true); };
  const handleDelete = async (e, id) => {
    e?.stopPropagation?.();
    if (!confirm('בטוח שאתה רוצה למחוק את התוכן?')) return;
    try { await supabase.from('content_calendar').delete().eq('id', id); toast.success('נמחק'); load(); }
    catch (err) { toast.error('שגיאה: ' + (err?.message || '')); }
  };

  return (
    <LifeOSLayout title="לוח תוכן" onQuickSaved={load}>
      <button onClick={openNew} style={{
        width: '100%', padding: '14px 16px', borderRadius: 12, border: 'none',
        backgroundColor: LIFEOS_COLORS.primary, color: '#FFFFFF',
        fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 12,
        boxShadow: '0 2px 8px rgba(255,111,32,0.2)',
      }}>+ רעיון תוכן חדש</button>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button onClick={() => setView('week')} style={viewBtn(view === 'week')}>📅 שבוע</button>
        <button onClick={() => setView('list')} style={viewBtn(view === 'list')}>📋 רשימה</button>
      </div>

      {/* Streak + best performer */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div style={{
          ...LIFEOS_CARD, padding: 12, textAlign: 'center',
          backgroundColor: streak > 0 ? '#FFF4E6' : '#F7F3EC',
        }}>
          <div style={{ fontSize: 22 }}>{streak > 0 ? '🔥' : '💤'}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: streak > 0 ? LIFEOS_COLORS.primary : LIFEOS_COLORS.textSecondary }}>
            {streak} ימים
          </div>
          <div style={{ fontSize: 10, color: LIFEOS_COLORS.textSecondary }}>רצף תוכן</div>
        </div>
        <div style={{ ...LIFEOS_CARD, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: LIFEOS_COLORS.textSecondary, marginBottom: 4 }}>
            🏆 Best performer
          </div>
          {best ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {best.row.title}
              </div>
              <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
                {best.views} צפיות · {best.leads} לידים
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: LIFEOS_COLORS.textSecondary }}>אין נתוני performance</div>
          )}
        </div>
      </div>

      {/* Suggestions */}
      {ideas.length > 0 && (
        <div style={{ ...LIFEOS_CARD, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: LIFEOS_COLORS.textPrimary, marginBottom: 8 }}>
            💡 רעיונות לתוכן
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ideas.map((idea, i) => (
              <div key={i} style={{
                padding: '8px 10px', borderRadius: 10,
                backgroundColor: '#F7F3EC',
                fontSize: 12, color: LIFEOS_COLORS.textPrimary, lineHeight: 1.5,
              }}>
                {idea.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loaded ? (
        <Empty text="טוען..." />
      ) : view === 'week' ? (
        <WeekView weekDays={weekDays} rows={rows}
                  weekOffset={weekOffset} setWeekOffset={setWeekOffset}
                  onTap={(r) => openEdit({}, r)} />
      ) : (
        <ListView filtered={filtered} counts={counts}
                  filter={filter} setFilter={setFilter}
                  onEdit={openEdit} onDelete={handleDelete} />
      )}

      <ContentForm
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        userId={userId}
        item={editing}
        onSaved={load}
      />
    </LifeOSLayout>
  );
}

// ─── Week view ───────────────────────────────────────────────────

function WeekView({ weekDays, rows, weekOffset, setWeekOffset, onTap }) {
  const dayNames = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  return (
    <>
      <div style={{
        ...LIFEOS_CARD, marginBottom: 8, padding: '8px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button onClick={() => setWeekOffset(weekOffset + 1)} style={navBtnStyle(false)}>‹</button>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {weekOffset === 0 ? 'השבוע' : weekOffset > 0 ? `+${weekOffset} שבועות` : `${weekOffset} שבועות`}
        </div>
        <button onClick={() => setWeekOffset(weekOffset - 1)} style={navBtnStyle(false)}>›</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {weekDays.map((d, i) => {
          const k = dayKey(d);
          const items = rows.filter(r => r.scheduled_date && dayKey(r.scheduled_date) === k);
          const isToday = k === dayKey(new Date());
          const empty = items.length === 0;
          return (
            <div key={i} style={{
              ...LIFEOS_CARD, padding: '8px 10px',
              borderRight: `4px solid ${empty ? LIFEOS_COLORS.error : LIFEOS_COLORS.success}`,
              backgroundColor: isToday ? '#FFF4E6' : '#FFFFFF',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: empty ? 0 : 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>
                  {dayNames[d.getDay()]} · {d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}
                  {isToday && <span style={{ marginRight: 6, color: LIFEOS_COLORS.primary, fontSize: 11 }}>· היום</span>}
                </div>
                {empty && <span style={{ fontSize: 10, color: LIFEOS_COLORS.error, fontWeight: 700 }}>חסר תוכן</span>}
              </div>
              {!empty && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {items.map(it => {
                    const t = TYPE_BY_KEY[it.content_type];
                    const s = STATUS_BY_KEY[it.status];
                    return (
                      <div key={it.id} onClick={() => onTap(it)} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
                        backgroundColor: '#F7F3EC',
                      }}>
                        <span>{t?.emoji || '🎬'}</span>
                        <span style={{
                          flex: 1, fontSize: 12, fontWeight: 600,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{it.title}</span>
                        {s && (
                          <span style={{
                            padding: '2px 6px', borderRadius: 999,
                            backgroundColor: s.color, color: '#FFFFFF',
                            fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap',
                          }}>{s.label}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── List view ───────────────────────────────────────────────────

function ListView({ filtered, counts, filter, setFilter, onEdit, onDelete }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label={`הכל (${counts.all})`} />
        {CONTENT_STATUS.map(s => (
          <FilterChip key={s.key} active={filter === s.key} onClick={() => setFilter(s.key)}
                      label={`${s.label} (${counts[s.key] || 0})`} activeColor={s.color} />
        ))}
      </div>
      <div style={{ ...LIFEOS_CARD, padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? <Empty text="אין תוכן בסינון זה" /> : filtered.map((row, idx) => (
          <ContentRow key={row.id} row={row} isLast={idx === filtered.length - 1}
                      onEdit={(e) => onEdit(e, row)} onDelete={(e) => onDelete(e, row.id)} />
        ))}
      </div>
    </>
  );
}

function ContentRow({ row, isLast, onEdit, onDelete }) {
  const status = STATUS_BY_KEY[row.status] || { label: row.status, color: '#9ca3af' };
  const type = TYPE_BY_KEY[row.content_type] || { label: row.content_type, emoji: '📷' };
  const dateStr = row.scheduled_date ? new Date(row.scheduled_date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) : '';
  return (
    <div onClick={onEdit} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 14px',
      borderBottom: isLast ? 'none' : `0.5px solid ${LIFEOS_COLORS.border}`,
      cursor: 'pointer',
    }}>
      <div style={{ fontSize: 22 }}>{type.emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {row.title}
        </div>
        <div style={{ fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 2 }}>
          {type.label}{dateStr ? ` • ${dateStr}` : ''}
        </div>
      </div>
      <span style={{
        padding: '4px 10px', borderRadius: 999,
        backgroundColor: status.color, color: '#FFFFFF',
        fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
      }}>{status.label}</span>
      <button onClick={onEdit} style={iconBtn} aria-label="עריכה"><Pencil size={14} /></button>
      <button onClick={onDelete} style={{ ...iconBtn, color: LIFEOS_COLORS.error }} aria-label="מחיקה"><Trash2 size={14} /></button>
    </div>
  );
}

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

function navBtnStyle(disabled) {
  return {
    width: 32, height: 32, borderRadius: 10, border: 'none',
    backgroundColor: disabled ? '#F7F3EC' : '#FFFFFF',
    color: LIFEOS_COLORS.textPrimary,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, fontSize: 18, fontWeight: 800,
  };
}
