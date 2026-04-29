import React from 'react';
import CardClosed from '@/components/ui/Card3Levels/CardClosed';
import SessionStatusPicker from '@/components/sessions/SessionStatusPicker';

// Closed-row session card — Level 1 of the Card3Levels pattern.
// Reads {session, otherParty, viewerRole} and composes:
//   • Right side (children) — name + date/time/location meta line.
//   • Left side (leftBadge)  — status picker (editable for coach,
//                              read-only badge for trainee).
//
// otherParty
//   The party shown on the left of the row. Coach view => trainee.
//   Trainee view => coach. Caller passes whichever it has resolved
//   (full name + optional avatar).

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('he-IL');
};
const fmtTime = (t) => (t || '').slice(0, 5);

export default function SessionCardClosed({
  session,
  otherParty,
  viewerRole = 'coach',
  onClick,
  onStatusChange,
  selected = false,
}) {
  const name = otherParty?.full_name || otherParty?.name || '—';
  const dateLabel = fmtDate(session?.date);
  const timeLabel = fmtTime(session?.time);
  const location = session?.location || '';

  // Coach gets the editable status picker. Trainee gets a static
  // read-only chip — no menu, no chevron, no onChange.
  const statusValue = session?.status;
  const leftBadge = viewerRole === 'coach' && onStatusChange ? (
    <SessionStatusPicker
      variant="badge"
      size="sm"
      value={statusValue}
      onChange={(s) => onStatusChange(session, s)}
    />
  ) : statusValue ? (
    <ReadOnlyStatus value={statusValue} />
  ) : null;

  return (
    <CardClosed
      onClick={onClick}
      leftBadge={leftBadge}
      selected={selected}
    >
      <div style={{
        fontSize: 16, fontWeight: 700, color: '#1A1A1A',
        fontFamily: "'Barlow', 'Heebo', sans-serif",
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {name}
      </div>
      <div style={{
        fontSize: 13, color: '#888',
        marginTop: 2,
        display: 'flex', flexWrap: 'wrap', gap: 6,
      }}>
        {dateLabel && <span>{dateLabel}</span>}
        {timeLabel && <span aria-hidden>·</span>}
        {timeLabel && <span>{timeLabel}</span>}
        {location && <span aria-hidden>·</span>}
        {location && <span>{location}</span>}
      </div>
    </CardClosed>
  );
}

// Status pill mirror — same colour map the picker uses, but
// without click affordances. Trainee can't edit status from here.
const STATUS_COLORS = {
  'ממתין':  { bg: '#FEF3C7', color: '#92400E' },
  'מאושר':  { bg: '#DBEAFE', color: '#1E40AF' },
  'הושלם':  { bg: '#D1FAE5', color: '#065F46' },
  'התקיים': { bg: '#D1FAE5', color: '#065F46' },
  'בוטל':   { bg: '#FEE2E2', color: '#991B1B' },
  'נדחה':   { bg: '#F3E8FF', color: '#6B21A8' },
};
function ReadOnlyStatus({ value }) {
  const conf = STATUS_COLORS[value] || { bg: '#F3F4F6', color: '#4B5563' };
  return (
    <span style={{
      padding: '4px 10px',
      borderRadius: 999,
      background: conf.bg,
      color: conf.color,
      fontSize: 12,
      fontWeight: 600,
      whiteSpace: 'nowrap',
      fontFamily: "'Heebo', 'Assistant', sans-serif",
    }}>
      {value}
    </span>
  );
}
