import React, { useState } from 'react';

// Level 1 of the Card3Levels pattern — the closed/list-row card.
// Composes a single content slot (children) with an optional left
// badge area (status pills, payment marks, multi-select checkbox)
// and a chevron-down on the trailing edge.
//
// Designed to be domain-agnostic: SessionCardClosed wraps it with
// session-shaped children, but a future PackageCardClosed /
// PlanCardClosed would do the same. Keep all session-specific
// styling in the wrapper, not here.

export default function CardClosed({
  children,
  onClick,
  leftBadge,
  hover = true,
  selected = false,
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role={onClick ? 'button' : undefined}
      onClick={onClick}
      onMouseEnter={() => hover && setHovered(true)}
      onMouseLeave={() => hover && setHovered(false)}
      style={{
        background: 'white',
        borderRadius: 14,
        border: `1px solid ${selected ? '#FF6F20' : (hover && hovered ? '#FF6F20' : '#F0E4D0')}`,
        padding: '14px 16px',
        marginBottom: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        transform: hover && hovered ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hover && hovered ? '0 4px 12px rgba(255,111,32,0.08)' : 'none',
        minHeight: 64,
        direction: 'rtl',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}>
        {leftBadge}
        {onClick && (
          <span
            aria-hidden
            style={{
              fontSize: 14,
              color: '#888',
              display: 'inline-block',
              transition: 'transform 0.2s',
            }}
          >▼</span>
        )}
      </div>
    </div>
  );
}
