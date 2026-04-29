import React, { useState } from 'react';

// Unified chip pill used across the onboarding flow + chip-style
// selectors elsewhere. Selected state uses an orange gradient with a
// soft drop shadow + 1px lift; hover (unselected) tints the border
// and text orange and softens the background.
//
// Props:
//   label     — visible text (string)
//   selected  — boolean
//   onClick   — toggle handler
//   icon      — optional emoji/string rendered before the label
//   size      — 'sm' | 'md' (default) | 'lg'
//   disabled  — boolean (no hover/transform, reduced opacity)

const SIZES = {
  sm: { padding: '8px 14px',  fontSize: 13 },
  md: { padding: '10px 18px', fontSize: 14 },
  lg: { padding: '12px 22px', fontSize: 15 },
};

export function Chip({ label, selected, onClick, icon, size = 'md', disabled = false, children }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const dim = SIZES[size] || SIZES.md;

  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: dim.padding,
    fontSize: dim.fontSize,
    fontWeight: 500,
    fontFamily: "'Barlow', 'Heebo', 'Assistant', sans-serif",
    borderRadius: 999,
    cursor: disabled ? 'default' : 'pointer',
    userSelect: 'none',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
    opacity: disabled ? 0.5 : 1,
    transform: pressed && !disabled ? 'scale(0.97)' : (selected ? 'translateY(-1px)' : 'translateY(0)'),
  };

  const selectedStyle = {
    background: 'linear-gradient(135deg, #FF6F20 0%, #FF8A47 100%)',
    border: '1.5px solid #FF6F20',
    color: '#FFFFFF',
    boxShadow: '0 2px 8px rgba(255,111,32,0.25)',
  };

  const unselectedStyle = {
    background: hovered && !disabled ? '#FFF8F2' : '#FFFFFF',
    border: `1.5px solid ${hovered && !disabled ? '#FF6F20' : '#F0E4D0'}`,
    color: hovered && !disabled ? '#FF6F20' : '#555',
    boxShadow: 'none',
  };

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      style={{ ...baseStyle, ...(selected ? selectedStyle : unselectedStyle) }}
    >
      {icon && <span aria-hidden style={{ fontSize: dim.fontSize + 2 }}>{icon}</span>}
      <span>{children ?? label}</span>
    </button>
  );
}

// Flex-wrap container for a row of chips. Defaults to 8px gap.
export function ChipGroup({ children, gap = 8, style = {} }) {
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap,
      ...style,
    }}>
      {children}
    </div>
  );
}

export default Chip;
