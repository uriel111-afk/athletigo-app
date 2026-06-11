import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/lib/supabaseClient';

// JS `Date#getDay` returns 0..6 (Sunday..Saturday). The membership
// `allowed_days` jsonb stores keys in the same order so the lookup is
// a flat array index.
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Compute the Sunday-of-week boundary for a YYYY-MM-DD string. The
// trainer market reads weeks Sun→Sat (not the ISO Mon→Sun convention),
// so the "weekly quota" resets on Sunday locally. Returns null on a
// bad input so the caller can fall through to "no quota in effect".
function sundayWeekStart(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDay(); // 0 = Sunday
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start;
}

function sundayWeekEnd(dateStr) {
  const start = sundayWeekStart(dateStr);
  if (!start) return null;
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

// Whole-group fast attendance — opens with one tap, mark members in
// place, confirm creates a קבוצתי Session in a single round trip.
//
// Lifted out of Sessions.jsx (where it lived inline) so both the
// Sessions groups view AND the AllUsers group hub can mount the same
// dialog with identical logic. The createFastAttendanceMutation flow
// (status derivation, participants payload, query invalidation) lives
// here too — no caller writes Session.create directly.
//
// Props:
//   group       — the training_groups row whose card was tapped. Null
//                 closes the dialog (treats `group` as the open flag).
//   groupMembers — the full training_group_members array (filtered to
//                 group.id internally so callers don't pre-shape it).
//   coachId     — currentUser.id, written into sessions.coach_id.
//   onClose     — closes the dialog (sets the parent's group state to null).
//   onCreated   — optional success hook (e.g. parent toast / nav reset).
//
// Defaults:
//   date  → today (locale-safe ISO)
//   time  → current HH:MM
//   per-member status → 'הגיע' (coach taps the exceptions)
//   session.status → 'התקיים' if anyone is 'הגיע', else 'מתוכנן'
//
// Storage shape matches what TraineeSessions reads:
//   participants[].attendance_status is a Hebrew string ('הגיע' /
//   'איחר' / 'לא הגיע' / 'ביטל'), matching the existing
//   markGroupAttendance dialog and the SERVICE_TYPE enum's legacy map.
export default function FastAttendanceDialog({
  group,
  groupMembers,
  coachId,
  onClose,
  onCreated,
}) {
  const queryClient = useQueryClient();

  // Local state — re-initialized whenever a new group opens so a second
  // open never resurfaces the previous group's typed values.
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('סטודיו');
  const [notes, setNotes] = useState('');
  const [attendance, setAttendance] = useState({});

  // Default everyone to 'הגיע' when a new group is opened. Effect runs
  // on each `group.id` change so reopening with a different group
  // doesn't keep stale per-member ticks from the prior dialog.
  useEffect(() => {
    if (!group) return;
    const members = (groupMembers || []).filter((m) => m.group_id === group.id);
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    setDate(now.toISOString().split('T')[0]);
    setTime(`${hh}:${mm}`);
    setLocation('סטודיו');
    setNotes('');
    setAttendance(Object.fromEntries(members.map((m) => [m.trainee_id, 'הגיע'])));
  }, [group?.id]);

  const members = group
    ? (groupMembers || []).filter((m) => m.group_id === group.id)
    : [];

  // ── Eligibility — informational only ──────────────────────────
  // Fetch every past session for this group so we can count how many
  // times each member has been marked present/late in the same Sunday-
  // week as the date being marked. One round-trip per group; the
  // group_id filter keeps it small. Skipped when no group is mounted.
  const { data: groupSessions = [] } = useQuery({
    queryKey: ['group-session-history', group?.id],
    queryFn: async () => {
      if (!group?.id) return [];
      const { data, error } = await supabase
        .from('sessions')
        .select('id, date, participants')
        .eq('group_id', group.id);
      if (error) {
        console.warn('[FastAttendance] history fetch failed:', error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!group?.id,
    staleTime: 30_000,
  });

  // Per-member eligibility for the currently-marked date. Memoised
  // against the inputs (date, members snapshot, history snapshot) so
  // a coach typing in the location field doesn't re-walk the loop.
  //
  //   eligibility[trainee_id] = {
  //     dayKey,
  //     isEligibleByDay,
  //     usedThisWeek,
  //     weeklyQuota,
  //     isWithinQuota,
  //     warning,           // 'לא ביום זה' | 'חרגה מהמכסה' | null
  //   }
  //
  // The warning is INFORMATIONAL — the save flow still accepts any
  // status the coach picks. Eligibility never blocks a marking.
  const eligibility = useMemo(() => {
    const out = {};
    if (!members.length || !date) return out;
    const weekStart = sundayWeekStart(date);
    const weekEnd = sundayWeekEnd(date);
    const d = new Date(date + 'T00:00:00');
    const dayKey = Number.isNaN(d.getTime()) ? null : WEEKDAY_KEYS[d.getDay()];

    // Count this week's attended sessions per trainee. Hebrew status
    // strings 'הגיע' / 'איחר' both count toward the quota — matching
    // ATTENDANCE_STATUS.countsTowardQuota in src/lib/enums.js.
    const usedByTrainee = new Map();
    if (weekStart && weekEnd) {
      for (const s of groupSessions || []) {
        if (!s?.date) continue;
        const sd = new Date(s.date + 'T00:00:00');
        if (Number.isNaN(sd.getTime())) continue;
        if (sd < weekStart || sd > weekEnd) continue;
        for (const p of (s.participants || [])) {
          if (p?.attendance_status === 'הגיע' || p?.attendance_status === 'איחר') {
            usedByTrainee.set(p.trainee_id, (usedByTrainee.get(p.trainee_id) || 0) + 1);
          }
        }
      }
    }

    for (const m of members) {
      const allowed = Array.isArray(m.allowed_days) ? m.allowed_days : null;
      const isEligibleByDay = !allowed?.length || (dayKey && allowed.includes(dayKey));
      const weeklyQuota = Number.isFinite(Number(m.weekly_quota)) && Number(m.weekly_quota) > 0
        ? Number(m.weekly_quota)
        : null;
      const usedThisWeek = usedByTrainee.get(m.trainee_id) || 0;
      const isWithinQuota = weeklyQuota == null || usedThisWeek < weeklyQuota;
      const warning = !isEligibleByDay
        ? 'לא ביום זה'
        : (!isWithinQuota ? 'חרגה מהמכסה' : null);
      out[m.trainee_id] = {
        dayKey, isEligibleByDay, weeklyQuota,
        usedThisWeek, isWithinQuota, warning,
      };
    }
    return out;
  }, [members, date, groupSessions]);

  const statusConfig = [
    { key: 'הגיע',    color: 'var(--ag-success)', bg: '#dcfce7' },
    { key: 'איחר',    color: 'var(--ag-warning)', bg: '#fef9c3' },
    { key: 'לא הגיע', color: 'var(--ag-error)', bg: '#fee2e2' },
    { key: 'ביטל',    color: '#6b7280', bg: '#f3f4f6' },
  ];

  const setStatusFor = (traineeId, status) => {
    setAttendance((prev) => ({ ...prev, [traineeId]: status }));
  };

  const createMutation = useMutation({
    mutationFn: async ({ groupRow, participants }) => {
      // Status derivation kept identical to the original mutation in
      // Sessions.jsx — any present marks the row as 'התקיים' so it
      // counts as a completed workout in the trainee's surface.
      const sessionStatus = participants.some(p => p.attendance_status === 'הגיע')
        ? 'התקיים'
        : 'מתוכנן';
      return base44.entities.Session.create({
        date,
        time,
        session_type: 'קבוצתי',
        location,
        coach_id: coachId,
        status: sessionStatus,
        coach_notes: notes,
        participants,
        group_id: groupRow.id,
        group_name: groupRow.name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['trainee-sessions'] });
      toast.success('✅ הנוכחות נשמרה והאימון נוצר');
      if (typeof onCreated === 'function') onCreated();
      onClose && onClose();
    },
    onError: (err) => {
      console.error('[fastAttendance] create failed:', err);
      toast.error('❌ שגיאה ביצירת האימון: ' + (err?.message || 'נסה שוב'));
    },
  });

  const presentCount = members.reduce(
    (n, m) => n + (attendance[m.trainee_id] === 'הגיע' ? 1 : 0),
    0,
  );

  const handleConfirm = async () => {
    if (members.length === 0) return;
    const participants = members.map((m) => ({
      trainee_id: m.trainee_id,
      trainee_name: m.trainee_name,
      attendance_status: attendance[m.trainee_id] || 'הגיע',
    }));
    createMutation.mutate({ groupRow: group, participants });
  };

  return (
    <Dialog
      open={!!group}
      onOpenChange={(o) => {
        if (!o && !createMutation.isPending) onClose && onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>סימון נוכחות: {group?.name || ''}</DialogTitle>
        </DialogHeader>
        {group && (
          <div className="space-y-4">
            {/* Date + time + location + notes */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>תאריך</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-xl mt-1"
                  style={{ fontSize: 16 }}
                />
              </div>
              <div>
                <Label>שעה</Label>
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="rounded-xl mt-1"
                  style={{ fontSize: 16 }}
                />
              </div>
            </div>
            <div>
              <Label>מיקום</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="rounded-xl mt-1"
                style={{ fontSize: 16 }}
              />
            </div>
            <div>
              <Label>הערות</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="rounded-xl mt-1"
                style={{ fontSize: 16 }}
              />
            </div>

            <div className="text-xs text-gray-500 flex items-center justify-between pt-1 border-t border-gray-100">
              <span>{members.length} חברים בקבוצה</span>
              <span>{presentCount} סומנו כהגיעו</span>
            </div>

            {/* Informational legend — explains the amber tags below.
                The tag never blocks marking; it just lets the coach
                see at a glance whether the attendee paid for this
                day/quota. */}
            <div style={{
              fontSize: 11, color: '#854F0B',
              background: '#FAEEDA', border: '1px solid #F0D9A8',
              borderRadius: 8, padding: '6px 10px', textAlign: 'right',
            }}>
              תגית כתומה = מחוץ לזכאות (אפשר לסמן בכל זאת)
            </div>

            {/* Per-member attendance — same 4-status pattern as the
                legacy attendance dialog. Default is 'הגיע' so the
                coach only taps to mark exceptions. */}
            <div style={{ maxHeight: '36vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
              {members.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-400">
                  אין חברים בקבוצה
                </div>
              ) : (
                members.map((m) => {
                  const current = attendance[m.trainee_id] || 'הגיע';
                  const elig = eligibility[m.trainee_id];
                  const warning = elig?.warning;
                  // Add a quota count to the "חרגה" tag so the coach
                  // can see N/Q at a glance without expanding anything.
                  const warningLabel = warning === 'חרגה מהמכסה' && elig?.weeklyQuota
                    ? `חרגה מהמכסה · ${elig.usedThisWeek}/${elig.weeklyQuota}`
                    : warning;
                  return (
                    <div
                      key={m.trainee_id}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 0', borderBottom: '1px solid #f5f5f5',
                        direction: 'rtl', gap: 8,
                      }}
                    >
                      <div style={{
                        flex: 1, minWidth: 0,
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <span style={{
                          fontSize: 13, fontWeight: 600,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          minWidth: 0,
                        }}>
                          {m.trainee_name}
                        </span>
                        {warning && (
                          <span style={{
                            flexShrink: 0,
                            fontSize: 10, fontWeight: 700,
                            background: '#FAEEDA', color: '#854F0B',
                            border: '1px solid #F0D9A8',
                            padding: '2px 7px', borderRadius: 999,
                            whiteSpace: 'nowrap',
                          }}>
                            {warningLabel}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', flexShrink: 0 }}>
                        {statusConfig.map((st) => {
                          const active = current === st.key;
                          return (
                            <button
                              key={st.key}
                              type="button"
                              onClick={() => setStatusFor(m.trainee_id, st.key)}
                              style={{
                                padding: '4px 8px', borderRadius: 6,
                                fontSize: 10, fontWeight: 700,
                                border: `1.5px solid ${active ? st.color : '#eee'}`,
                                background: active ? st.bg : 'white',
                                color: active ? st.color : '#bbb',
                                cursor: 'pointer', touchAction: 'manipulation',
                              }}
                            >
                              {st.key}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bulk row — flip an entire room with one tap. */}
            {members.length > 0 && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                <Button
                  variant="outline"
                  onClick={() => setAttendance(Object.fromEntries(members.map((m) => [m.trainee_id, 'הגיע'])))}
                  className="font-bold rounded-lg min-h-[36px] text-xs"
                  style={{ borderColor: 'var(--ag-success)', color: 'var(--ag-success)' }}
                >
                  כולם הגיעו
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setAttendance(Object.fromEntries(members.map((m) => [m.trainee_id, 'לא הגיע'])))}
                  className="font-bold rounded-lg min-h-[36px] text-xs"
                  style={{ borderColor: 'var(--ag-error)', color: 'var(--ag-error)' }}
                >
                  כולם לא הגיעו
                </Button>
              </div>
            )}

            <Button
              disabled={members.length === 0 || createMutation.isPending}
              onClick={handleConfirm}
              className="w-full font-bold text-white rounded-xl min-h-[44px]"
              style={{ backgroundColor: '#4CAF50' }}
            >
              {createMutation.isPending
                ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שומר...</>
                : 'שמור נוכחות וצור אימון'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
