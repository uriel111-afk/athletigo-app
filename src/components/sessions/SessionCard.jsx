import React, { useState } from 'react';
import { STATUS_BADGES } from '@/lib/sessionGrouping';
import SessionStatusPicker from './SessionStatusPicker';

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('he-IL');
};
const fmtTime = (t) => (t || '').slice(0, 5);

// Collapsible session card for the coach's redesigned Sessions page.
// Closed = single row (trainee name + date/time on the right, status
// badge + chevron on the left). Open = same row + 2-col detail grid
// + 'פתח את המפגש לעריכה' CTA. Click on the row toggles; CTA
// triggers onClick(session, trainee) which the page wires to a
// navigate to the trainee's profile sessions tab.
export default function SessionCard({
  session,
  trainee,
  onClick,
  onStatusChange,
  defaultOpen = false,
  selectable = false,
  selected = false,
  onSelectToggle,
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [hovered, setHovered] = useState(false);

  const status = session?.status;
  const badge = STATUS_BADGES[status] || (status
    ? { label: status, bg: '#F3F4F6', color: '#4B5563' }
    : null);

  const traineeName = trainee?.full_name || session?.trainee_name || 'מתאמן';
  const dateLabel = fmtDate(session?.date);
  const timeLabel = fmtTime(session?.time);

  const sessionType = session?.session_type || session?.type;
  const location = session?.location;
  const price = Number(session?.price || 0) || null;
  const packageName = session?.package_name || session?.service_name;
  const notes = session?.notes;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'white',
        borderRadius: 14,
        border: `1px solid ${hovered ? '#FF6F20' : '#F0E4D0'}`,
        padding: '14px 16px',
        marginBottom: 10,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hovered ? '0 4px 12px rgba(255,111,32,0.08)' : 'none',
        direction: 'rtl',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
      onClick={() => {
        if (selectable) { onSelectToggle?.(); return; }
        setOpen(o => !o);
      }}
    >
      {/* Closed-state row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          {selectable && (
            <div
              onClick={(e) => { e.stopPropagation(); onSelectToggle?.(); }}
              style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                border: selected ? '2px solid #FF6F20' : '2px solid #ccc',
                background: selected ? '#FF6F20' : 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              {selected && <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>✓</span>}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 16, fontWeight: 700, color: '#1A1A1A',
              fontFamily: "'Barlow', 'Heebo', sans-serif",
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {traineeName}
            </div>
            <div style={{
              fontSize: 13, color: '#888',
              fontFamily: "'Barlow', 'Heebo', sans-serif",
              marginTop: 2,
            }}>
              {dateLabel}{timeLabel ? ` · ${timeLabel}` : ''}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Payment badge — sits next to the status picker so the
              coach sees both attendance state AND money state on
              the closed card. Renders only when price > 0. */}
          <PaymentBadge session={session} />

          {/* Editable status picker — replaces the old static badge.
              stopPropagation inside the picker so opening its dropdown
              doesn't toggle the card's expand state. Falls back to a
              read-only badge when no onStatusChange handler is given. */}
          {onStatusChange ? (
            <SessionStatusPicker
              variant="badge"
              size="sm"
              value={status}
              onChange={(s) => onStatusChange(session, s)}
            />
          ) : badge ? (
            <span style={{
              padding: '4px 10px',
              borderRadius: 999,
              background: badge.bg,
              color: badge.color,
              fontSize: 12, fontWeight: 600,
              whiteSpace: 'nowrap',
            }}>{badge.label}</span>
          ) : null}
          {!selectable && (
            <span aria-hidden style={{
              fontSize: 13, color: '#888',
              display: 'inline-block',
              transition: 'transform 0.2s',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            }}>▼</span>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {!selectable && open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            marginTop: 12, paddingTop: 12,
            borderTop: '1px solid #F0E4D0',
          }}
        >
          {/* Status pills row — full row, click any chip to switch */}
          {onStatusChange && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>סטטוס המפגש</div>
              <SessionStatusPicker
                variant="pills"
                value={status}
                onChange={(s) => onStatusChange(session, s)}
              />
            </div>
          )}

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
            fontSize: 13, color: '#1A1A1A',
          }}>
            {sessionType && (
              <Detail label="סוג" value={sessionType} />
            )}
            {location && (
              <Detail label="מיקום" value={location} />
            )}
            {price && (
              <Detail label="מחיר" value={`${price}₪`} />
            )}
            {packageName && (
              <Detail label="חבילה" value={packageName} />
            )}
            {notes && (
              <div style={{ gridColumn: '1 / -1' }}>
                <Detail label="הערות" value={notes} multiline />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClick?.(session, trainee); }}
            style={{
              width: '100%', height: 44,
              marginTop: 14,
              borderRadius: 12, border: 'none',
              background: '#FF6F20', color: 'white',
              fontSize: 14, fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'Heebo', 'Assistant', sans-serif",
            }}
          >📂 פתח את המפגש לעריכה</button>
        </div>
      )}
    </div>
  );
}

// Tiny money-state pill. Three states + a hidden state for free
// rows (price=0/null). Mirrors the colour vocab elsewhere in the
// app: green=settled, red=skipped/overridden, amber=pending.
//
// viewerRole defaults to 'coach' because every current call site
// is the coach Sessions page. The trainee surfaces should never
// render this badge — passing 'trainee' is a defensive null-out
// that future calls can opt into without re-plumbing each card.
function PaymentBadge({ session, viewerRole = 'coach' }) {
  if (viewerRole === 'trainee') return null;
  const price = Number(session?.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  const status = session?.payment_status;

  let bg, color, label;
  if (status === 'paid') {
    bg = '#D1FAE5'; color = '#065F46'; label = '✓ שולם';
  } else if (status === 'override_no_payment') {
    bg = '#FEE2E2'; color = '#991B1B'; label = '! ללא תשלום';
  } else {
    bg = '#FEF3C7'; color = '#92400E'; label = '₪ ממתין לתשלום';
  }
  return (
    <span style={{
      background: bg,
      color,
      padding: '3px 9px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 500,
      whiteSpace: 'nowrap',
      fontFamily: "'Heebo', 'Assistant', sans-serif",
    }}>
      {label}
    </span>
  );
}

function Detail({ label, value, multiline }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: 13, color: '#1A1A1A',
        whiteSpace: multiline ? 'pre-wrap' : 'normal',
        lineHeight: multiline ? 1.5 : 1.3,
      }}>{value}</div>
    </div>
  );
}
