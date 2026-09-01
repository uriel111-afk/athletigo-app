import React, { useCallback, useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { isHiddenFromSelection } from '@/lib/clientStatusHelpers';
import { AuthContext } from '@/lib/AuthContext';
import { createPageUrl } from '@/utils';
import ProtectedCoachPage from '@/components/ProtectedCoachPage';
import PageSkeleton from '@/components/PageSkeleton';
import AddTraineeDialog from '@/components/forms/AddTraineeDialog';
import { requiresPayment } from '@/lib/sessionHelpers';
import { normalizeTrackValue, TRACK_LABELS } from '@/lib/trackHelpers';
import {
  setSessionStatus,
  markGroupSessionAllPresent,
  isFullyMarked,
  isSessionDone,
  SESSION_ATTENDED,
} from '@/lib/attendanceActions';

/**
 * ProHome — layer 1 of the coach hierarchy. The coach's landing screen.
 *
 * Three things, top to bottom: search the roster, add a trainee, work
 * today's list. No tile grid. Dashboard.jsx stays on disk and stays
 * routed at /dashboard; this is what the coach now lands on.
 *
 * Layout law: main topics run horizontally RTL, their detail runs
 * vertically. Selection lists are one item per row, description inline
 * on the same line, truncating with an ellipsis, equal row heights, and
 * the left edge of a row carries nothing.
 *
 * The coach identity is read from AuthContext and every query is scoped
 * by it. No coach id is hardcoded anywhere in this file.
 */

const CREAM  = '#FFF9F0';
const ORANGE = '#FF6F20';
const INK    = '#3A2E24';
const SOFT   = '#8A7B6C';
const LINE   = '#EFE2CE';
const CARD   = '#FFFFFF';
const TOUCH  = 44;

const TRACK_CHIP = {
  personal: { bg: '#E6F1FB', fg: '#185FA5' },
  group:    { bg: '#EEEDFE', fg: '#534AB7' },
  online:   { bg: '#FFE9D8', fg: '#993C1D' },
};

const todayISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const fmtTime = (t) => (t || '').slice(0, 5) || '--:--';

const digits = (v) => (v == null ? '' : String(v)).replace(/\D/g, '');

/** One row of the today list, derived from a sessions row. */
function toTodayRow(session) {
  const track = normalizeTrackValue(session?.session_type) || 'personal';
  const isGroup = track === 'group';
  const parts = Array.isArray(session?.participants) ? session.participants : [];
  const name = isGroup
    ? (session.group_name || 'קבוצה')
    : (parts[0]?.trainee_name || session.trainee_name || 'מתאמן');
  return {
    session,
    id: session.id,
    time: fmtTime(session.time),
    sortKey: `${session.time || '99:99'}`,
    name,
    track,
    isGroup,
    marked: isGroup ? isFullyMarked(session) : isSessionDone(session.status),
  };
}

export default function ProHome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: coach } = useContext(AuthContext);
  const coachId = coach?.id || null;

  const [term, setTerm] = useState('');
  const [isAddTraineeOpen, setIsAddTraineeOpen] = useState(false);
  const [savingId, setSavingId] = useState(null);

  // ── Roster — one query. Coaches, admins and archived/former clients
  //    are filtered out client-side using the app's existing rule. ─────
  const { data: trainees = [], isLoading: rosterLoading } = useQuery({
    queryKey: ['prohome-roster', coachId],
    enabled: !!coachId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        // NOTE: there is no users.avatar_url column — selecting it breaks
        // the query. Initials are rendered from full_name instead.
        .select('id, full_name, phone, role, client_status, status, is_coach')
        .order('full_name');
      if (error) throw error;
      // account_deleted is NOT a column on users — selecting it 400s the
      // whole query. Archived/former trainees are excluded through the
      // app's existing client_status rule instead.
      return (data || []).filter(
        (u) => u.id !== coachId
          && u.role !== 'admin' && u.role !== 'coach' && u.is_coach !== true
          && !isHiddenFromSelection(u),
      );
    },
    staleTime: 60_000,
  });

  // ── Today's sessions, all three tracks merged, one round trip. ──────
  const { data: todaySessions = [], isLoading: todayLoading } = useQuery({
    queryKey: ['prohome-today', coachId, todayISO()],
    enabled: !!coachId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, date, time, session_type, status, location, coach_notes, participants, group_id, group_name, trainee_id, trainee_name, service_id, price, is_paid, payment_status')
        .eq('coach_id', coachId)
        .eq('date', todayISO());
      if (error) throw error;
      return data || [];
    },
    staleTime: 15_000,
  });

  const rows = useMemo(() => {
    return (todaySessions || [])
      .filter((s) => s.status !== 'deleted' && !s.deleted_at)
      .map(toTodayRow)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [todaySessions]);

  const results = useMemo(() => {
    const q = term.trim();
    if (!q) return [];
    const qd = digits(q);
    const ql = q.toLowerCase();
    return (trainees || [])
      .filter((t) => {
        const nameHit = (t.full_name || '').toLowerCase().includes(ql);
        const phoneHit = qd.length >= 2 && digits(t.phone).includes(qd);
        return nameHit || phoneHit;
      })
      .slice(0, 12);
  }, [term, trainees]);

  const openTrainee = useCallback((id) => {
    navigate(`${createPageUrl('TraineeProfile')}?userId=${encodeURIComponent(id)}`);
  }, [navigate]);

  // ── The one attendance action on this screen. Writes through
  //    attendanceActions.js and never navigates away. ─────────────────
  const markPresent = useCallback(async (row) => {
    if (!row || row.marked || savingId) return;
    const { session } = row;

    // Same completion guard the Sessions page applies — an unpaid row
    // still has to go through the override dialog there, so we send the
    // coach to it rather than quietly bypassing it.
    if (!row.isGroup && requiresPayment(session)) {
      toast.error('המפגש דורש הסדרת תשלום — פותח את מסך המפגשים');
      navigate(`${createPageUrl('Sessions')}?status=all`);
      return;
    }

    setSavingId(row.id);
    try {
      if (row.isGroup) {
        await markGroupSessionAllPresent({ session, coachId, queryClient });
        toast.success('✅ הנוכחות נשמרה');
      } else {
        await setSessionStatus({
          session,
          newStatus: SESSION_ATTENDED,
          coach,
          queryClient,
          trainees,
        });
        toast.success('✅ נוכחות נרשמה ויתרות עודכנו');
      }
      await queryClient.invalidateQueries({ queryKey: ['prohome-today', coachId, todayISO()] });
    } catch (e) {
      console.error('[ProHome] attendance write failed:', e);
      toast.error('❌ שמירת הנוכחות נכשלה: ' + (e?.message || 'נסה שוב'));
    } finally {
      setSavingId(null);
    }
  }, [savingId, coachId, coach, trainees, queryClient, navigate]);

  if (!coachId) {
    return <ProtectedCoachPage><PageSkeleton rows={5} /></ProtectedCoachPage>;
  }

  return (
    <ProtectedCoachPage>
      <div
        dir="rtl"
        style={{
          flex: 1,
          minHeight: 0,
          background: CREAM,
          fontFamily: "'Rubik', system-ui, -apple-system, sans-serif",
          color: INK,
          textAlign: 'right',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        }}
      >
        <div style={{ maxWidth: 640, margin: '0 auto', width: '100%', boxSizing: 'border-box', padding: '12px 16px 0' }}>

          {/* ── A. Search ─────────────────────────────────────────── */}
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="חיפוש מתאמן לפי שם או טלפון"
            dir="rtl"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              minHeight: TOUCH,
              padding: '0 14px',
              borderRadius: 12,
              border: `1px solid ${LINE}`,
              background: CARD,
              // 16px keeps iOS from zooming the viewport on focus.
              fontSize: 16,
              fontFamily: 'inherit',
              color: INK,
              textAlign: 'right',
              outline: 'none',
            }}
          />

          {term.trim() !== '' && (
            <div style={{ marginTop: 8, background: CARD, borderRadius: 12, border: `1px solid ${LINE}`, overflow: 'hidden' }}>
              {results.length === 0 ? (
                <div style={{ minHeight: TOUCH, display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 14, color: SOFT }}>
                  לא נמצאו מתאמנים
                </div>
              ) : results.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openTrainee(t.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    minHeight: TOUCH,
                    padding: '0 14px',
                    background: 'transparent',
                    border: 'none',
                    borderTop: i === 0 ? 'none' : `1px solid ${LINE}`,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'right',
                    // One line. Title then its detail inline, both truncating.
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: 600, color: INK, flexShrink: 0 }}>
                    {t.full_name || 'ללא שם'}
                  </span>
                  <span style={{ fontSize: 13, color: SOFT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.phone || ''}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* ── B. The one primary action ─────────────────────────── */}
          <button
            type="button"
            onClick={() => setIsAddTraineeOpen(true)}
            style={{
              width: '100%',
              minHeight: TOUCH + 6,
              marginTop: 12,
              borderRadius: 14,
              border: 'none',
              background: ORANGE,
              color: CREAM,
              fontSize: 17,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            הוספת מתאמן
          </button>

          {/* ── C. Today ──────────────────────────────────────────── */}
          <div style={{ marginTop: 22, marginBottom: 8, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: INK }}>
              היום
            </h2>
            {rows.length > 0 && (
              <span style={{ fontSize: 13, color: SOFT }}>
                {rows.filter((r) => !r.marked).length} פתוחים מתוך {rows.length}
              </span>
            )}
          </div>

          {(todayLoading || rosterLoading) && rows.length === 0 ? (
            <PageSkeleton rows={3} header={false} />
          ) : rows.length === 0 ? (
            <div style={{
              background: CARD, border: `1px solid ${LINE}`, borderRadius: 12,
              minHeight: 64, display: 'flex', alignItems: 'center',
              padding: '0 14px', fontSize: 14, color: SOFT,
            }}>
              אין מפגשים היום
            </div>
          ) : (
            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
              {rows.map((r, i) => {
                const chip = TRACK_CHIP[r.track] || TRACK_CHIP.personal;
                const busy = savingId === r.id;
                return (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      // Equal row heights, always one line.
                      height: 56,
                      padding: '0 12px',
                      borderTop: i === 0 ? 'none' : `1px solid ${LINE}`,
                      background: r.marked ? '#F4FAF5' : CARD,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Attendance control — sits at the row's RIGHT, the
                        side that carries meaning in RTL. */}
                    <button
                      type="button"
                      onClick={() => markPresent(r)}
                      disabled={r.marked || busy}
                      aria-label={r.marked ? 'נוכחות סומנה' : 'סימון נוכחות'}
                      style={{
                        flexShrink: 0,
                        width: TOUCH, height: TOUCH,
                        borderRadius: 11,
                        border: `1px solid ${r.marked ? '#8FCB9B' : LINE}`,
                        background: r.marked ? '#2E8B57' : CARD,
                        color: r.marked ? '#FFFFFF' : SOFT,
                        fontSize: 19,
                        fontWeight: 700,
                        lineHeight: 1,
                        cursor: r.marked || busy ? 'default' : 'pointer',
                        opacity: busy ? 0.5 : 1,
                        fontFamily: 'inherit',
                      }}
                    >
                      {busy ? '…' : '✓'}
                    </button>

                    {/* time → name → track chip, reading right to left. */}
                    <span style={{
                      flexShrink: 0, fontSize: 15, fontWeight: 700,
                      color: r.marked ? SOFT : INK, fontVariantNumeric: 'tabular-nums',
                    }}>
                      {r.time}
                    </span>
                    {/* Shrinks and ellipsises so the chip stays inline
                        right after the name instead of being flung to the
                        left edge. minWidth:0 is what lets a flex item with
                        overflow:hidden actually shrink. */}
                    <span style={{
                      flexShrink: 1, minWidth: 0,
                      fontSize: 15, fontWeight: 600,
                      color: r.marked ? SOFT : INK,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {r.name}
                    </span>
                    <span style={{
                      flexShrink: 0,
                      fontSize: 12, fontWeight: 600,
                      padding: '3px 9px', borderRadius: 999,
                      background: chip.bg, color: chip.fg,
                    }}>
                      {TRACK_LABELS[r.track]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>

      <AddTraineeDialog
        open={isAddTraineeOpen}
        onClose={() => {
          setIsAddTraineeOpen(false);
          queryClient.invalidateQueries({ queryKey: ['prohome-roster', coachId] });
        }}
      />
    </ProtectedCoachPage>
  );
}
