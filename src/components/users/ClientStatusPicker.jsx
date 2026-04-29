import React, { useState, useEffect, useRef } from 'react';
import { STATUS_CONFIG, SELECTABLE_STATUSES } from '@/lib/clientStatusHelpers';

// Shared client-status picker. Two visual modes:
//   variant='badge' — closed-row pill + chevron + dropdown overlay.
//                     Used in trainee-list rows.
//   variant='pills' — full row of selectable chips (good for
//                     expanded card or profile tab body).
//
// Common rules
//   • The 5th canonical value, 'onboarding', is never selectable.
//     If `value === 'onboarding'` we render it read-only with a
//     tiny "מנוהל אוטומטית" hint so the coach knows why they can't
//     flip it from here.
//   • The picker just calls onChange(newStatus); the parent decides
//     whether to write through updateClientStatus (lightweight) or
//     a custom handler (e.g. TraineeProfile's full cascade).

const SIZE_DIMS = {
  sm: { padding: '4px 10px',  fontSize: 11 },
  md: { padding: '6px 12px',  fontSize: 12 },
  lg: { padding: '8px 14px',  fontSize: 13 },
};

export default function ClientStatusPicker({
  value,
  onChange,
  size = 'md',
  variant = 'badge',
  disabled = false,
  allowOnboarding = false,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const isOnboarding = value === 'onboarding';

  // Close badge dropdown on outside click. No-op for pills mode.
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
    if (disabled || isOnboarding) return;
    if (key === value) return;
    onChange?.(key);
  };

  // List of statuses to render in the menu / chips. onboarding only
  // shows up when the current value is 'onboarding' (so the coach
  // sees the read-only state) or when allowOnboarding is true (rare;
  // intended for an explicit "send to onboarding" surface).
  const optionList = (() => {
    const base = SELECTABLE_STATUSES.slice();
    if (allowOnboarding || isOnboarding) base.unshift('onboarding');
    return base;
  })();

  // ─── pills variant ───────────────────────────────────────────────
  if (variant === 'pills') {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
          direction: 'rtl',
          fontFamily: "'Heebo', 'Assistant', sans-serif",
        }}
      >
        {optionList.map((key) => {
          const conf = STATUS_CONFIG[key];
          if (!conf) return null;
          const active = value === key;
          const lockedByOnboarding = key === 'onboarding' && !allowOnboarding;
          const isDisabled = disabled || lockedByOnboarding;
          return (
            <button
              key={key}
              type="button"
              disabled={isDisabled}
              onClick={(e) => choose(e, key)}
              title={lockedByOnboarding ? 'מנוהל אוטומטית — לא ניתן לבחירה ידנית' : undefined}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: active ? `1.5px solid ${conf.color}` : `1.5px solid ${conf.border}`,
                background: active ? conf.bg : '#FFFFFF',
                color: active ? conf.color : '#666',
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                cursor: isDisabled ? 'default' : 'pointer',
                opacity: isDisabled && !active ? 0.55 : 1,
                transition: 'all 0.15s',
                fontFamily: "'Heebo', 'Assistant', sans-serif",
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span aria-hidden>{conf.icon}</span>
              {conf.label}
            </button>
          );
        })}
      </div>
    );
  }

  // ─── badge variant ──────────────────────────────────────────────
  const dims = SIZE_DIMS[size] || SIZE_DIMS.md;
  const conf = STATUS_CONFIG[value] || null;
  const label = conf?.label || (value || 'לא מוגדר');
  const bg = conf?.bg || '#F3F4F6';
  const color = conf?.color || '#4B5563';
  const border = conf?.border || '#E5E7EB';
  const icon = conf?.icon || null;
  const noDropdown = disabled || isOnboarding;

  return (
    <div
      ref={wrapRef}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'relative',
        display: 'inline-block',
        direction: 'rtl',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
    >
      <button
        type="button"
        disabled={noDropdown}
        onClick={(e) => { e.stopPropagation(); if (!noDropdown) setOpen((o) => !o); }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: dims.padding,
          borderRadius: 999,
          background: bg, color,
          border: `1px solid ${border}`,
          fontSize: dims.fontSize,
          fontWeight: 700,
          cursor: noDropdown ? 'default' : 'pointer',
          whiteSpace: 'nowrap',
          fontFamily: "'Heebo', 'Assistant', sans-serif",
        }}
        title={isOnboarding ? 'מנוהל אוטומטית' : undefined}
      >
        {icon && <span aria-hidden>{icon}</span>}
        <span>{label}</span>
        {!noDropdown && (
          <span aria-hidden style={{
            fontSize: dims.fontSize - 1,
            transition: 'transform 0.15s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}>▾</span>
        )}
      </button>

      {open && !noDropdown && (
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
            zIndex: 11000,
            overflow: 'hidden',
            minWidth: 160,
          }}
        >
          {optionList.map((key) => {
            const opt = STATUS_CONFIG[key];
            if (!opt) return null;
            const active = value === key;
            const lockedByOnboarding = key === 'onboarding' && !allowOnboarding;
            return (
              <button
                key={key}
                type="button"
                disabled={lockedByOnboarding}
                onClick={(e) => choose(e, key)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: 'none',
                  background: active ? '#FFF5EE' : 'white',
                  color: active ? '#1A1A1A' : '#1A1A1A',
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  cursor: lockedByOnboarding ? 'default' : 'pointer',
                  opacity: lockedByOnboarding ? 0.55 : 1,
                  textAlign: 'right',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  fontFamily: "'Heebo', 'Assistant', sans-serif",
                  borderBottom: '1px solid #F0E4D0',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: opt.color, display: 'inline-block',
                  }} />
                  {opt.label}
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
