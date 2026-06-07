import React, { useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { AuthContext } from '@/lib/AuthContext';
import { ATHLETIGO_ADMIN_UUID } from '@/constants/admin';
import { base44 } from '@/api/base44Client';
import PageLoader from '@/components/PageLoader';

// Admin-only inbox for app_feedback rows. Gated strictly to
// ATHLETIGO_ADMIN_UUID at route level — other users land on an
// "אין הרשאה" screen instead of seeing the inbox.
//
// Per row: category badge, message, sender + role, originating
// screen, date, status triage dropdown (new → read → done). Top
// filter row lets the admin slice by category and status.

const STATUS_FLOW = ['new', 'read', 'done'];
const STATUS_LABEL = { new: 'חדש', read: 'נקרא', done: 'טופל' };
const STATUS_COLOR = {
  new:  { bg: '#FEE2E2', fg: '#991B1B' },
  read: { bg: '#FEF3C7', fg: '#854F0B' },
  done: { bg: '#DCFCE7', fg: '#15803D' },
};
const CATEGORY_LABEL = { bug: 'באג', improvement: 'רעיון לשיפור', other: 'אחר' };
const CATEGORY_EMOJI = { bug: '🐞', improvement: '💡', other: '💬' };
const CATEGORY_COLOR = {
  bug:         { bg: '#FEE2E2', fg: '#991B1B' },
  improvement: { bg: '#FEF3C7', fg: '#854F0B' },
  other:       { bg: '#E2E8F0', fg: '#475569' },
};

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('he-IL', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

export default function FeedbackPage() {
  const { user, isLoadingAuth } = useContext(AuthContext);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const isAdmin = user?.id === ATHLETIGO_ADMIN_UUID;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['app-feedback'],
    queryFn: async () => base44.entities.AppFeedback.list('-created_at', 500),
    enabled: isAdmin,
    staleTime: 30 * 1000,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }) =>
      base44.entities.AppFeedback.update(id, { status }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['app-feedback'] });
      const prev = queryClient.getQueryData(['app-feedback']) || [];
      queryClient.setQueryData(['app-feedback'],
        prev.map((r) => r.id === id ? { ...r, status } : r));
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['app-feedback'], ctx.prev);
      console.error('[Feedback] status update failed:', err);
      toast.error('שגיאה בעדכון הסטטוס');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['app-feedback'] }),
  });

  const counts = useMemo(() => {
    const c = { all: rows.length, new: 0, read: 0, done: 0 };
    for (const r of rows) {
      const s = STATUS_FLOW.includes(r.status) ? r.status : 'new';
      c[s] += 1;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (statusFilter   !== 'all' && (r.status || 'new') !== statusFilter) return false;
      return true;
    });
  }, [rows, categoryFilter, statusFilter]);

  if (isLoadingAuth) return <PageLoader />;

  if (!isAdmin) {
    return (
      <div dir="rtl" style={{
        padding: 32, textAlign: 'center',
        fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, color: '#1a1a1a' }}>
          אין הרשאה לעמוד זה
        </div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
          התיבה הזו זמינה רק למנהל הראשי.
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          style={{
            padding: '10px 18px', borderRadius: 12, border: 'none',
            background: '#FF6F20', color: 'white',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          חזרה
        </button>
      </div>
    );
  }

  return (
    <div dir="rtl" style={{
      padding: '12px 14px 80px',
      fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
      maxWidth: 760, margin: '0 auto',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a1a' }}>שיפורים</div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
          {counts.all} פניות · חדשות: {counts.new} · נקראו: {counts.read} · טופלו: {counts.done}
        </div>
      </div>

      {/* Filters */}
      <div style={{
        background: 'white', borderRadius: 14, border: '1px solid #F0E4D0',
        padding: 12, marginBottom: 12,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }}>
          קטגוריה
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {[
            { key: 'all',         label: 'הכל' },
            { key: 'bug',         label: '🐞 באגים' },
            { key: 'improvement', label: '💡 שיפורים' },
            { key: 'other',       label: '💬 אחר' },
          ].map((opt) => {
            const active = categoryFilter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setCategoryFilter(opt.key)}
                style={{
                  padding: '6px 12px', borderRadius: 999,
                  border: active ? '1px solid #FF6F20' : '1px solid #F0E4D0',
                  background: active ? '#FFF5EE' : 'white',
                  color: active ? '#FF6F20' : '#555',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }}>
          סטטוס
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all',  label: 'הכל' },
            { key: 'new',  label: 'חדש' },
            { key: 'read', label: 'נקרא' },
            { key: 'done', label: 'טופל' },
          ].map((opt) => {
            const active = statusFilter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setStatusFilter(opt.key)}
                style={{
                  padding: '6px 12px', borderRadius: 999,
                  border: active ? '1px solid #FF6F20' : '1px solid #F0E4D0',
                  background: active ? '#FFF5EE' : 'white',
                  color: active ? '#FF6F20' : '#555',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#FF6F20', margin: '0 auto' }} />
        </div>
      ) : visible.length === 0 ? (
        <div style={{
          background: 'white', borderRadius: 14, border: '1px dashed #F0E4D0',
          padding: 40, textAlign: 'center', color: '#888',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 13, color: '#1a1a1a', fontWeight: 600 }}>
            אין פניות בקטגוריה הזו
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map((row) => {
            const catKey = CATEGORY_LABEL[row.category] ? row.category : 'other';
            const catC = CATEGORY_COLOR[catKey];
            const statusKey = STATUS_FLOW.includes(row.status) ? row.status : 'new';
            const stC = STATUS_COLOR[statusKey];
            return (
              <div key={row.id} style={{
                background: 'white', borderRadius: 14,
                border: '1px solid #F0E4D0', padding: 14,
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}>
                {/* Top row: category badge + date */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 8, gap: 8,
                }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 10px', borderRadius: 999,
                    background: catC.bg, color: catC.fg,
                    fontSize: 11, fontWeight: 700,
                  }}>
                    <span>{CATEGORY_EMOJI[catKey]}</span>
                    <span>{CATEGORY_LABEL[catKey]}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#888' }}>
                    {formatDate(row.created_at)}
                  </div>
                </div>

                {/* Message */}
                <div style={{
                  fontSize: 14, color: '#1a1a1a', lineHeight: 1.5,
                  marginBottom: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {row.message}
                </div>

                {/* Meta + status */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 8, flexWrap: 'wrap',
                }}>
                  <div style={{ fontSize: 11, color: '#666', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span>👤 {row.user_name || 'אנונימי'}{row.user_role ? ` · ${row.user_role === 'coach' ? 'מאמן' : 'מתאמן'}` : ''}</span>
                    {row.screen && <span>📍 {row.screen}</span>}
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 999,
                      background: stC.bg, color: stC.fg,
                      fontSize: 11, fontWeight: 700,
                    }}>
                      {STATUS_LABEL[statusKey]}
                    </span>
                    <select
                      value={statusKey}
                      onChange={(e) => updateStatus.mutate({ id: row.id, status: e.target.value })}
                      style={{
                        fontSize: 11, padding: '4px 6px', borderRadius: 8,
                        border: '1px solid #F0E4D0', background: 'white',
                        color: '#555', fontFamily: 'inherit', cursor: 'pointer',
                      }}
                    >
                      <option value="new">חדש</option>
                      <option value="read">נקרא</option>
                      <option value="done">טופל</option>
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
