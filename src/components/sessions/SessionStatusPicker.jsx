import React, { useEffect, useRef, useState } from 'react';

// Canonical Hebrew status values + colors. Aliases (English + legacy
// long forms) are normalized to the canonical key on read so the
// active chip lights up regardless of the raw DB value.
const STATUS_OPTIONS = [
  { key: 'ממתין',  bg: '#FEF3C7', color: '#92400E' },
  { key: 'מאושר',  bg: '#DBEAFE', color: '#1E40AF' },
  { key: 'הושלם',  bg: '#D1FAE5', color: '#065F46' },
  { key: 'בוטל',   bg: '#FEE2E2', color: '#991B1B' },
  { key: 'נדחה',   bg: '#F3E8FF', color: '#6B21A8' },
];

const ALIAS = {
  // Pending family
  'pending':           'ממתין',
  'scheduled':         'ממתין',
  'מתוכנן':            'ממתין',
  'ממתין לאישור':      'ממתין',
  // Confirmed family
  'confirmed':         'מאושר',
  // Completed family
  'התקיים':            'הושלם',
  'completed':         'הושלם',
  // Cancelled family (multiple long forms in legacy data)
  'cancelled':         'בוטל',
  'בוטל על ידי מאמן':  'בוטל',
  'בוטל על ידי מתאמן': 'בוטל',
  // Rejected family
  'rejected':          'נדחה',
  'declined':          'נדחה',
};

function normalize(value) {
  if (!value) return null;
  if (STATUS_OPTIONS.some(o => o.key === value)) return value;
  return ALIAS[value] || null;
}

function findOption(value) {
  const k = normalize(value);
  return STATUS_OPTIONS.find(o => o.key === k) || null;
}

// Shared picker — used in 3 places:
//   variant='badge' → compact pill with chevron, tap to open dropdown
//                     (closed-state SessionCard)
//   variant='pills' → full row of 5 chips, click a chip to switch
//                     (expanded SessionCard, SessionFormDialog header)
//
// onChange always receives a Hebrew canonical key so the DB stays
// consistent regardless of which alias the row started with.
export default function SessionStatusPicker({
  value,
  onChange,
  size = 'md',
  variant = 'badge',
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const current = findOption(value);

  // Close the badge dropdown on outside-click. Pills variant has no
  // dropdown so this is a no-op there.
  useEffect(() => {
    if (variant !== 'badge' || !open) return;
    const handler = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [variant, open]);

  const choose = (e, key) => {
    e.stopPropagation();
    setOpen(false);
    if (disabled) return;
    if (key === normalize(value)) return; // no change
    onChange?.(key);
  };

  // ─── Pills variant ─────────────────────────────────────────────
  if (variant === 'pills') {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
          direction: 'rtl',
        }}
      >
        {STATUS_OPTIONS.map(opt => {
          const active = current?.key === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              disabled={disabled}
              onClick={(e) => choose(e, opt.key)}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: active ? `1.5px solid ${opt.color}` : '1.5px solid #F0E4D0',
                background: active ? opt.bg : '#FFFFFF',
                color: active ? opt.color : '#888',
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                cursor: disabled ? 'default' : 'pointer',
                transition: 'all 0.15s',
                fontFamily: "'Heebo', 'Assistant', sans-serif",
                whiteSpace: 'nowrap',
              }}
            >
              {opt.key}
            </button>
          );
        })}
      </div>
    );
  }

  // ─── Badge variant ─────────────────────────────────────────────
  const padding = size === 'sm' ? '4px 10px' : '6px 12px';
  const fontSize = size === 'sm' ? 12 : 13;
  const badgeColor = current?.color || '#4B5563';
  const badgeBg = current?.bg || '#F3F4F6';
  const label = current?.key || (value || 'ללא');

  return (
    <div
      ref={wrapRef}
      onClick={(e) => e.stopPropagation()}
      style={{ position: 'relative', display: 'inline-block', direction: 'rtl' }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); if (!disabled) setOpen(o => !o); }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding,
          borderRadius: 999,
          background: badgeBg, color: badgeColor,
          border: 'none',
          fontSize,
          fontWeight: 600,
          cursor: disabled ? 'default' : 'pointer',
          fontFamily: "'Heebo', 'Assistant', sans-serif",
          whiteSpace: 'nowrap',
        }}
      >
        <span>{label}</span>
        {!disabled && (
          <span aria-hidden style={{
            fontSize: fontSize - 2,
            transition: 'transform 0.15s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}>▾</span>
        )}
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '100%',
            insetInlineEnd: 0,
            marginTop: 6,
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #F0E4D0',
            boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
            zIndex: 200,
            overflow: 'hidden',
            minWidth: 130,
          }}
        >
          {STATUS_OPTIONS.map(opt => {
            const active = current?.key === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={(e) => choose(e, opt.key)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: 'none',
                  background: active ? '#FFF5EE' : 'white',
                  color: active ? '#FF6F20' : '#1A1A1A',
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'right',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontFamily: "'Heebo', 'Assistant', sans-serif",
                  borderBottom: '1px solid #F0E4D0',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: opt.color, display: 'inline-block',
                  }} />
                  {opt.key}
                </span>
                {active && <span aria-hidden>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Pure helper: caller-side normalization for callers that want to
// compare a raw row's status to the canonical keys without rendering.
export const normalizeStatusKey = normalize;
