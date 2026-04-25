import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Loader2 } from 'lucide-react';
import { AuthContext } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { LIFEOS_COLORS } from '@/lib/lifeos/lifeos-constants';

const PER_TABLE_LIMIT = 5;
const DEBOUNCE_MS = 300;

// Multi-table ilike search across all sub-apps. Triggered by a 🔍 icon
// in the layout top bar. Shows results grouped by entity, each row
// navigates to the natural target screen.
//
// We pre-build a registry of {table, columns, group, route} and fan
// out concurrently per query. Each table is capped at PER_TABLE_LIMIT
// rows so a single noisy table can't drown others.
const SEARCH_TARGETS = (userId) => [
  {
    key: 'trainees', group: '👥 מתאמנים', table: 'users',
    select: 'id, full_name, email, phone',
    cols: ['full_name', 'email', 'phone'],
    filter: (q) => q.eq('role', 'trainee').eq('coach_id', userId),
    label: (r) => r.full_name || r.email || r.phone || '—',
    sub: (r) => r.email || r.phone || '',
    route: (r) => `/trainees/${r.id}`,
  },
  {
    key: 'leads', group: '📋 לידים', table: 'leads',
    select: 'id, full_name, phone, notes',
    cols: ['full_name', 'phone', 'notes'],
    filter: (q) => q.eq('coach_id', userId),
    label: (r) => r.full_name || '—',
    sub: (r) => r.phone || (r.notes ? r.notes.slice(0, 50) : ''),
    route: () => '/lifeos/leads',
  },
  {
    key: 'income', group: '💰 הכנסות', table: 'income',
    select: 'id, amount, description, client_name, product, date',
    cols: ['description', 'client_name', 'product'],
    filter: (q) => q.eq('user_id', userId),
    label: (r) => r.description || r.product || r.client_name || '—',
    sub: (r) => `${Math.round(Number(r.amount || 0)).toLocaleString('he-IL')}₪ • ${r.date || ''}`,
    route: () => '/lifeos/income',
  },
  {
    key: 'expenses', group: '💸 הוצאות', table: 'expenses',
    select: 'id, amount, description, category, date',
    cols: ['description', 'category'],
    filter: (q) => q.eq('user_id', userId),
    label: (r) => r.description || r.category || '—',
    sub: (r) => `${Math.round(Number(r.amount || 0)).toLocaleString('he-IL')}₪ • ${r.date || ''}`,
    route: () => '/lifeos/expenses',
  },
  {
    key: 'tasks', group: '✅ משימות', table: 'life_os_tasks',
    select: 'id, title, status, category',
    cols: ['title'],
    filter: (q) => q.eq('user_id', userId),
    label: (r) => r.title || '—',
    sub: (r) => r.status === 'completed' ? 'הושלמה' : 'פתוחה',
    route: () => '/lifeos/tasks',
  },
  {
    key: 'content', group: '🎬 תוכן', table: 'content_calendar',
    select: 'id, title, caption, status, date',
    cols: ['title', 'caption'],
    filter: (q) => q.eq('user_id', userId),
    label: (r) => r.title || (r.caption ? r.caption.slice(0, 50) : '—'),
    sub: (r) => `${r.status || ''} • ${r.date || ''}`,
    route: () => '/lifeos/content',
  },
  {
    key: 'contacts', group: '🤝 קשרים', table: 'personal_contacts',
    select: 'id, name, notes, contact_frequency',
    cols: ['name', 'notes'],
    filter: (q) => q.eq('user_id', userId),
    label: (r) => r.name || '—',
    sub: (r) => r.contact_frequency || '',
    route: () => '/personal/people',
  },
  {
    key: 'goals', group: '🎯 מטרות', table: 'personal_goals',
    select: 'id, title, status, target_date',
    cols: ['title'],
    filter: (q) => q.eq('user_id', userId),
    label: (r) => r.title || '—',
    sub: (r) => `${r.status || ''} ${r.target_date ? `• עד ${r.target_date}` : ''}`,
    route: () => '/personal/growth',
  },
  {
    key: 'courses', group: '📚 קורסים', table: 'courses',
    select: 'id, name, name_he, status',
    cols: ['name', 'name_he'],
    filter: (q) => q.eq('user_id', userId),
    label: (r) => r.name_he || r.name || '—',
    sub: (r) => r.status || '',
    route: () => '/lifeos/business-plan',
  },
];

async function runSearch(query, userId) {
  if (!query || !userId) return [];
  const term = query.trim();
  if (term.length < 2) return [];
  const escaped = term.replace(/[%_]/g, '\\$&');
  const targets = SEARCH_TARGETS(userId);

  const all = await Promise.all(targets.map(async (t) => {
    try {
      let q = supabase.from(t.table).select(t.select).limit(PER_TABLE_LIMIT);
      q = t.filter(q);
      const orExpr = t.cols.map(c => `${c}.ilike.%${escaped}%`).join(',');
      q = q.or(orExpr);
      const { data, error } = await q;
      if (error) {
        // Tables that don't exist (e.g. courses on a fresh install)
        // shouldn't blow up the whole search.
        return { ...t, rows: [] };
      }
      return { ...t, rows: data || [] };
    } catch {
      return { ...t, rows: [] };
    }
  }));

  return all.filter(g => g.rows.length > 0);
}

export default function GlobalSearch({ iconColor }) {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Focus the input once the overlay mounts.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    if (!open) { setQuery(''); setResults([]); }
  }, [open]);

  // Debounced query → search.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setResults([]); setLoading(false); return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const out = await runSearch(query, user?.id);
      setResults(out);
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [query, open, user?.id]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const handlePick = (group, row) => {
    setOpen(false);
    navigate(group.route(row));
  };

  const totalCount = useMemo(
    () => results.reduce((s, g) => s + g.rows.length, 0),
    [results]
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="חיפוש"
        title="חיפוש"
        style={{
          width: 32, height: 32, borderRadius: 10, border: 'none',
          background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: iconColor || LIFEOS_COLORS.textSecondary,
        }}
      >
        <Search size={18} />
      </button>

      {open && (
        <div
          dir="rtl"
          style={{
            position: 'fixed', inset: 0, zIndex: 9500,
            backgroundColor: 'rgba(20, 20, 20, 0.55)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '40px 14px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div style={{
            width: '100%', maxWidth: 560,
            backgroundColor: '#FFFFFF', borderRadius: 16,
            boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            maxHeight: '78vh',
          }}>
            {/* Search field */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '14px 16px',
              borderBottom: `1px solid ${LIFEOS_COLORS.border}`,
            }}>
              <Search size={18} style={{ color: LIFEOS_COLORS.textSecondary, flexShrink: 0 }} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חיפוש לידים, מתאמנים, הכנסות, תוכן..."
                style={{
                  flex: 1, border: 'none', outline: 'none',
                  fontSize: 16, fontWeight: 500,
                  color: LIFEOS_COLORS.textPrimary,
                  fontFamily: "'Heebo', 'Assistant', sans-serif",
                  background: 'transparent',
                }}
              />
              <button onClick={() => setOpen(false)} aria-label="סגור" style={{
                width: 28, height: 28, borderRadius: 999, border: 'none',
                background: 'transparent', cursor: 'pointer',
                color: LIFEOS_COLORS.textSecondary,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <X size={16} />
              </button>
            </div>

            {/* Results */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {!query.trim() ? (
                <div style={{
                  padding: '40px 20px', textAlign: 'center',
                  fontSize: 13, color: LIFEOS_COLORS.textSecondary,
                }}>
                  חפש בכל המערכת — לידים, מתאמנים, הוצאות, תוכן וכו'
                </div>
              ) : loading ? (
                <div style={{ padding: 30, textAlign: 'center' }}>
                  <Loader2 size={22} className="animate-spin" style={{ color: LIFEOS_COLORS.primary }} />
                </div>
              ) : totalCount === 0 ? (
                <div style={{
                  padding: '40px 20px', textAlign: 'center',
                  fontSize: 13, color: LIFEOS_COLORS.textSecondary,
                }}>
                  לא נמצאו תוצאות ל-"{query}"
                </div>
              ) : (
                results.map(group => (
                  <div key={group.key}>
                    <div style={{
                      padding: '8px 16px',
                      backgroundColor: '#FAF6EE',
                      fontSize: 11, fontWeight: 700,
                      color: LIFEOS_COLORS.textSecondary,
                    }}>
                      {group.group} ({group.rows.length})
                    </div>
                    {group.rows.map(row => (
                      <button
                        key={`${group.key}-${row.id}`}
                        onClick={() => handlePick(group, row)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'right',
                          padding: '10px 16px', border: 'none',
                          backgroundColor: '#FFFFFF', cursor: 'pointer',
                          borderBottom: `0.5px solid ${LIFEOS_COLORS.border}`,
                        }}
                      >
                        <div style={{
                          fontSize: 14, fontWeight: 600, color: LIFEOS_COLORS.textPrimary,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {group.label(row)}
                        </div>
                        {group.sub(row) && (
                          <div style={{
                            fontSize: 11, color: LIFEOS_COLORS.textSecondary, marginTop: 2,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {group.sub(row)}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
