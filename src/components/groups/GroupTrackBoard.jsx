import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { createPageUrl } from '@/utils';
import CreateGroupDialog from '@/components/groups/CreateGroupDialog';
import { isHiddenFromSelection } from '@/lib/clientStatusHelpers';
import { requiresPayment } from '@/lib/sessionHelpers';
import { isGroupSessionType, isActivePackageStatus, normalizeTrackValue } from '@/lib/trackHelpers';
import {
  saveGroupAttendance,
  markGroupSessionAllPresent,
  createGroupSession,
  findTodaySession,
  firstRow,
  isPresentStatus,
  PARTICIPANT_STATUSES,
} from '@/lib/attendanceActions';

/**
 * GroupTrackBoard — the קבוצתי track as a WORK SCREEN.
 *
 * The coach acts here and never leaves: groups list, tap to expand in
 * place, toggle a member's attendance, mark the whole group, create a
 * group. No row on this screen jumps out to an old screen except the
 * add-member flow, which has no reusable component (see below).
 *
 * Every attendance write goes through src/lib/attendanceActions.js —
 * the single writer. Nothing here talks to base44.entities.Session
 * directly.
 *
 * Membership is derived from BOTH sources, unioned:
 *   1. training_group_members rows (reads empty through the client today)
 *   2. the participants jsonb of past group sessions carrying group_id
 * so a group whose membership rows never landed still shows its people.
 *
 * Coach identity arrives as a prop, read from AuthContext by the parent.
 * No coach id is hardcoded here.
 */

const CREAM  = '#FFF9F0';
const ORANGE = '#FF6F20';
const INK    = '#3A2E24';
const SOFT   = '#8A7B6C';
const LINE   = '#EFE2CE';
const CARD   = '#FFFFFF';
const GREEN  = '#2E8B57';
const TOUCH  = 44;

const DAY_LABELS = {
  sun: 'ראשון', mon: 'שני', tue: 'שלישי', wed: 'רביעי',
  thu: 'חמישי', fri: 'שישי', sat: 'שבת',
};

const todayISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const nowHHMM = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

const isPaidStatus = (v) => {
  const s = (v == null ? '' : String(v)).trim().toLowerCase();
  return s === 'שולם' || s === 'paid';
};

/** Training day + time, folded into one short inline string. */
function groupDayLabel(group) {
  const days = Array.isArray(group?.active_days) ? group.active_days : [];
  const named = days.map((d) => DAY_LABELS[d]).filter(Boolean);
  const time = (group?.session_time || '').slice(0, 5);
  if (named.length === 0) return time || '';
  const dayPart = named.length <= 2 ? named.join(', ') : `${named.length} ימים`;
  return time ? `${dayPart} ${time}` : dayPart;
}

export default function GroupTrackBoard({ coach, trainees = [] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const coachId = coach?.id || null;

  const [openGroupId, setOpenGroupId] = useState(null);   // only one at a time
  const [busyKey, setBusyKey] = useState(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  // ── Groups ─────────────────────────────────────────────────────────
  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['training-groups', coachId],
    enabled: !!coachId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_groups')
        // NOTE: there is no training_groups.schedule column — selecting
        // it 400s the whole query. Day/time live on active_days +
        // session_time.
        .select('id, name, description, coach_id, coach_name, icon, color, active_days, session_time, location_name')
        .eq('coach_id', coachId)
        .order('name');
      if (error) {
        console.warn('[GroupTrackBoard] groups fetch failed:', error.message);
        return [];
      }
      return data || [];
    },
    staleTime: 30_000,
  });

  // ── Membership rows ────────────────────────────────────────────────
  const { data: memberRows = [] } = useQuery({
    queryKey: ['group-members', coachId],
    enabled: !!coachId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_group_members')
        .select('id, group_id, trainee_id, trainee_name, allowed_days, weekly_quota');
      if (error) {
        console.warn('[GroupTrackBoard] members fetch failed:', error.message);
        return [];
      }
      return data || [];
    },
    staleTime: 30_000,
  });

  // ── Every group session this coach owns ────────────────────────────
  const { data: groupSessions = [] } = useQuery({
    queryKey: ['group-track-sessions', coachId],
    enabled: !!coachId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, date, time, session_type, status, location, coach_notes, participants, group_id, group_name, service_id, price, is_paid, payment_status')
        .eq('coach_id', coachId);
      if (error) throw error;
      return (data || []).filter((s) => isGroupSessionType(s.session_type) && s.status !== 'deleted');
    },
    staleTime: 15_000,
  });

  // ── Packages, for the inline "overdue payment" note ────────────────
  const { data: packages = [] } = useQuery({
    queryKey: ['group-track-packages', coachId],
    enabled: !!coachId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_services')
        .select('id, trainee_id, service_type, package_type, status, payment_status')
        .eq('coach_id', coachId);
      if (error) {
        console.warn('[GroupTrackBoard] packages fetch failed:', error.message);
        return [];
      }
      return data || [];
    },
    staleTime: 60_000,
  });

  const traineeById = useMemo(() => {
    const m = new Map();
    for (const t of trainees || []) m.set(t.id, t);
    return m;
  }, [trainees]);

  /**
   * Members per group, unioning the two sources. A trainee seen only in
   * an old session's participants still appears; ids are de-duplicated
   * so nobody is listed twice.
   */
  const membersByGroup = useMemo(() => {
    const map = new Map();
    const push = (groupId, id, name, extra) => {
      if (!groupId || !id) return;
      if (!map.has(groupId)) map.set(groupId, new Map());
      const bucket = map.get(groupId);
      const prev = bucket.get(id) || {};
      bucket.set(id, {
        trainee_id: id,
        trainee_name: name || prev.trainee_name || traineeById.get(id)?.full_name || 'מתאמן',
        ...prev,
        ...extra,
      });
    };
    for (const r of memberRows || []) {
      push(r.group_id, r.trainee_id, r.trainee_name, {
        membershipId: r.id, allowed_days: r.allowed_days, weekly_quota: r.weekly_quota,
      });
    }
    for (const s of groupSessions || []) {
      if (!s.group_id) continue;
      for (const p of (Array.isArray(s.participants) ? s.participants : [])) {
        push(s.group_id, p?.trainee_id, p?.trainee_name, {});
      }
    }
    const out = new Map();
    for (const [gid, bucket] of map) {
      out.set(gid, [...bucket.values()].sort(
        (a, b) => String(a.trainee_name).localeCompare(String(b.trainee_name), 'he'),
      ));
    }
    return out;
  }, [memberRows, groupSessions, traineeById]);

  /** Today's session per group, if one already exists. Uses the shared
   *  matcher in attendanceActions so both work screens agree on what
   *  "today's session" means. */
  const todaySessionByGroup = useMemo(() => {
    const t = todayISO();
    const m = new Map();
    for (const g of groups || []) {
      const found = findTodaySession(groupSessions, t, { groupId: g.id });
      if (found) m.set(g.id, found);
    }
    return m;
  }, [groups, groupSessions]);

  /** Trainees whose active group package is still unpaid. */
  const unpaidIds = useMemo(() => {
    const s = new Set();
    for (const p of packages || []) {
      const track = normalizeTrackValue(p.service_type) || normalizeTrackValue(p.package_type);
      if (track !== 'group') continue;
      if (isActivePackageStatus(p.status) && !isPaidStatus(p.payment_status)) s.add(p.trainee_id);
    }
    return s;
  }, [packages]);

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['group-track-sessions', coachId] }),
      queryClient.invalidateQueries({ queryKey: ['group-members', coachId] }),
      queryClient.invalidateQueries({ queryKey: ['training-groups', coachId] }),
    ]);
  }, [queryClient, coachId]);

  /**
   * Today's session for a group, created on demand through the SAME
   * helper Sessions.jsx uses so there is one creation path.
   */
  const ensureTodaySession = useCallback(async (group) => {
    const existing = todaySessionByGroup.get(group.id);
    if (existing) return existing;
    const members = membersByGroup.get(group.id) || [];
    const created = await createGroupSession({
      group,
      members,
      form: {
        date: todayISO(),
        time: (group.session_time || '').slice(0, 5) || nowHHMM(),
        location: group.location_name || 'סטודיו',
        notes: '',
      },
      coachId,
    });
    return firstRow(created);
  }, [todaySessionByGroup, membersByGroup, coachId]);

  // ── Toggle one member's attendance for today ───────────────────────
  const toggleMember = useCallback(async (group, member) => {
    const key = `${group.id}:${member.trainee_id}`;
    if (busyKey) return;
    setBusyKey(key);
    try {
      const session = await ensureTodaySession(group);
      if (!session) throw new Error('לא ניתן ליצור מפגש להיום');

      // Same guard the Sessions page applies to a paid-but-unpaid row.
      // Never bypassed — the coach is sent to the override dialog there.
      if (requiresPayment(session)) {
        toast.error('המפגש דורש הסדרת תשלום — פותח את מסך המפגשים');
        navigate(`${createPageUrl('Sessions')}?type=${encodeURIComponent('קבוצתי')}`);
        return;
      }

      const current = (session.participants || [])
        .find((p) => p?.trainee_id === member.trainee_id);
      const nextStatus = isPresentStatus(current?.attendance_status)
        ? PARTICIPANT_STATUSES[2]   // 'לא הגיע'
        : PARTICIPANT_STATUSES[0];  // 'הגיע'

      const existing = Array.isArray(session.participants) ? session.participants : [];
      const known = existing.some((p) => p?.trainee_id === member.trainee_id);
      const participants = known
        ? existing.map((p) => (p?.trainee_id === member.trainee_id
            ? { ...p, attendance_status: nextStatus }
            : p))
        // A member derived from membership rows may not be on an
        // already-created session row yet; add them rather than drop them.
        : [...existing, {
            trainee_id: member.trainee_id,
            trainee_name: member.trainee_name,
            attendance_status: nextStatus,
          }];

      await saveGroupAttendance({
        session,
        coachId,
        participants,
        date: session.date,
        time: session.time,
        location: session.location || 'סטודיו',
        notes: session.coach_notes || '',
        queryClient,
      });
      await refresh();
    } catch (e) {
      console.error('[GroupTrackBoard] member toggle failed:', e);
      toast.error('❌ שמירת הנוכחות נכשלה: ' + (e?.message || 'נסה שוב'));
    } finally {
      setBusyKey(null);
    }
  }, [busyKey, ensureTodaySession, coachId, queryClient, refresh, navigate]);

  // ── Mark the whole group present, one action ───────────────────────
  const markWholeGroup = useCallback(async (group) => {
    const key = `all:${group.id}`;
    if (busyKey) return;
    setBusyKey(key);
    try {
      let session = await ensureTodaySession(group);
      if (!session) throw new Error('לא ניתן ליצור מפגש להיום');

      if (requiresPayment(session)) {
        toast.error('המפגש דורש הסדרת תשלום — פותח את מסך המפגשים');
        navigate(`${createPageUrl('Sessions')}?type=${encodeURIComponent('קבוצתי')}`);
        return;
      }

      // Seed anyone missing from the session row before the sweep, so
      // "the whole group" really means the whole group.
      const existing = Array.isArray(session.participants) ? session.participants : [];
      const have = new Set(existing.map((p) => p?.trainee_id));
      const missing = (membersByGroup.get(group.id) || [])
        .filter((m) => !have.has(m.trainee_id))
        .map((m) => ({
          trainee_id: m.trainee_id,
          trainee_name: m.trainee_name,
          attendance_status: 'ממתין',
        }));
      if (missing.length > 0) session = { ...session, participants: [...existing, ...missing] };

      await markGroupSessionAllPresent({ session, coachId, queryClient });
      toast.success('✅ הנוכחות נשמרה');
      await refresh();
    } catch (e) {
      console.error('[GroupTrackBoard] mark-all failed:', e);
      toast.error('❌ שמירת הנוכחות נכשלה: ' + (e?.message || 'נסה שוב'));
    } finally {
      setBusyKey(null);
    }
  }, [busyKey, ensureTodaySession, membersByGroup, coachId, queryClient, refresh, navigate]);

  /**
   * Add a member to an existing group.
   *
   * There is NO reusable component for this: the picker lives inline in
   * AllUsers.jsx (its group hub), and this task forbids touching that
   * file's internals. CreateGroupDialog only picks members while
   * CREATING a group; MemberEligibilityDialog only edits an existing
   * row's weekly quota; AddTraineeDialog creates a users row and knows
   * nothing about groups. So this opens the real flow where it lives
   * rather than inventing a second one.
   */
  const openAddMember = useCallback(() => {
    navigate(`${createPageUrl('AllUsers')}?service=group`);
  }, [navigate]);

  const rowBase = {
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', boxSizing: 'border-box',
    background: 'transparent', border: 'none',
    fontFamily: 'inherit', textAlign: 'right',
    whiteSpace: 'nowrap', overflow: 'hidden',
  };

  return (
    <>
      <div style={{
        marginTop: 16,
        background: CARD,
        border: `1px solid ${LINE}`,
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        {groupsLoading && groups.length === 0 && (
          <div style={{ ...rowBase, height: 60, padding: '0 14px', fontSize: 14, color: SOFT }}>
            טוען קבוצות…
          </div>
        )}

        {!groupsLoading && groups.length === 0 && (
          <div style={{ ...rowBase, height: 60, padding: '0 14px', fontSize: 14, color: SOFT }}>
            אין עדיין קבוצות
          </div>
        )}

        {groups.map((g, gi) => {
          const members = membersByGroup.get(g.id) || [];
          const session = todaySessionByGroup.get(g.id) || null;
          const open = openGroupId === g.id;
          const dayLabel = groupDayLabel(g);
          const detail = [
            `${members.length} חברים`,
            dayLabel,
          ].filter(Boolean).join(' · ');

          return (
            <div key={g.id} style={{ borderTop: gi === 0 ? 'none' : `1px solid ${LINE}` }}>
              {/* ── Group row. Tap expands in place, never navigates. ── */}
              <button
                type="button"
                // Only one group open at a time.
                onClick={() => setOpenGroupId(open ? null : g.id)}
                style={{
                  ...rowBase,
                  height: 60,
                  padding: '0 14px',
                  background: open ? '#FDF6EC' : CARD,
                  cursor: 'pointer',
                }}
              >
                <span style={{ flexShrink: 0, width: 26, fontSize: 18, lineHeight: 1, color: ORANGE }}>
                  {g.icon || '👥'}
                </span>
                <span style={{ flexShrink: 0, fontSize: 16, fontWeight: 700, color: INK }}>
                  {g.name || 'קבוצה'}
                </span>
                {/* Inline, same line, truncates before the row grows. */}
                <span style={{
                  flexShrink: 1, minWidth: 0, fontSize: 13, color: SOFT,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {detail}
                </span>
              </button>

              {open && (
                <div style={{ background: '#FCFAF6', borderTop: `1px solid ${LINE}` }}>
                  {members.length === 0 ? (
                    <div style={{ ...rowBase, height: 52, padding: '0 14px', fontSize: 13, color: SOFT }}>
                      אין חברים בקבוצה
                    </div>
                  ) : members.map((m, mi) => {
                    const p = (session?.participants || [])
                      .find((x) => x?.trainee_id === m.trainee_id);
                    const present = isPresentStatus(p?.attendance_status);
                    const busy = busyKey === `${g.id}:${m.trainee_id}`;
                    const note = unpaidIds.has(m.trainee_id)
                      ? 'תשלום פתוח'
                      : (p?.attendance_status && p.attendance_status !== 'ממתין' && !present
                          ? p.attendance_status
                          : '');
                    return (
                      <div
                        key={m.trainee_id}
                        style={{
                          ...rowBase,
                          height: 52,
                          padding: '0 14px',
                          borderTop: mi === 0 ? 'none' : `1px solid ${LINE}`,
                        }}
                      >
                        {/* Round toggle at the row's RIGHT edge — the
                            side that carries meaning in RTL. */}
                        <button
                          type="button"
                          onClick={() => toggleMember(g, m)}
                          disabled={!!busyKey}
                          aria-pressed={present}
                          aria-label={present ? 'בטל נוכחות' : 'סמן נוכחות'}
                          style={{
                            flexShrink: 0,
                            width: TOUCH, height: TOUCH,
                            borderRadius: '50%',
                            border: `1px solid ${present ? '#8FCB9B' : LINE}`,
                            background: present ? GREEN : CARD,
                            color: present ? '#FFFFFF' : SOFT,
                            fontSize: 18, fontWeight: 700, lineHeight: 1,
                            cursor: busyKey ? 'default' : 'pointer',
                            opacity: busy ? 0.5 : 1,
                            fontFamily: 'inherit',
                          }}
                        >
                          {busy ? '…' : '✓'}
                        </button>
                        <span style={{
                          flexShrink: 1, minWidth: 0,
                          fontSize: 15, fontWeight: 600,
                          color: present ? SOFT : INK,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {m.trainee_name}
                        </span>
                        {note && (
                          <span style={{
                            flexShrink: 0, fontSize: 12, color: SOFT,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {note}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* ── Two actions, side by side. ─────────────────── */}
                  <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${LINE}` }}>
                    <button
                      type="button"
                      onClick={() => markWholeGroup(g)}
                      disabled={!!busyKey || members.length === 0}
                      style={{
                        flex: 1, minHeight: TOUCH,
                        borderRadius: 12, border: 'none',
                        background: ORANGE, color: CREAM,
                        fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
                        cursor: busyKey || members.length === 0 ? 'default' : 'pointer',
                        opacity: busyKey === `all:${g.id}` ? 0.6 : 1,
                      }}
                    >
                      סמן נוכחות
                    </button>
                    <button
                      type="button"
                      onClick={openAddMember}
                      style={{
                        flex: 1, minHeight: TOUCH,
                        borderRadius: 12,
                        border: `1px solid ${LINE}`,
                        background: CARD, color: INK,
                        fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      הוסף חבר
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* ── Final row of the list. ─────────────────────────────── */}
        <button
          type="button"
          onClick={() => setShowCreateGroup(true)}
          style={{
            ...rowBase,
            height: 60,
            padding: '0 14px',
            borderTop: `1px solid ${LINE}`,
            background: CARD,
            cursor: 'pointer',
          }}
        >
          <span style={{ flexShrink: 0, width: 26, fontSize: 20, lineHeight: 1, color: ORANGE }}>+</span>
          <span style={{ flexShrink: 0, fontSize: 16, fontWeight: 700, color: INK }}>
            קבוצה חדשה
          </span>
        </button>
      </div>

      {/* The existing comprehensive create-group dialog — same component
          the AllUsers group hub mounts, writing to the same tables. */}
      <CreateGroupDialog
        isOpen={showCreateGroup}
        onClose={() => { setShowCreateGroup(false); refresh(); }}
        currentUser={coach}
        trainees={(trainees || []).filter((t) => !isHiddenFromSelection(t))}
      />
    </>
  );
}
