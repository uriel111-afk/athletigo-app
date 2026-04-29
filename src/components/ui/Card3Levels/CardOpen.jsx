import React from 'react';

// Level 2 of the Card3Levels pattern — the inline-expanded view.
// Renders below a CardClosed when the parent flips the open state.
// The "פרטים מלאים" CTA at the bottom escalates to Level 3
// (DetailDialog).
//
// CardClosed deliberately doesn't own the open state — the parent
// list does (one-open-at-a-time semantics, persistence rules,
// auto-expand on route param). This component just renders the
// body when told to.

export default function CardOpen({
  isOpen,
  children,
  onOpenDetail,
  detailLabel = 'פרטים מלאים',
}) {
  if (!isOpen) return null;
  return (
    <div
      style={{
        background: 'white',
        borderRadius: 14,
        border: '1px solid #F0E4D0',
        borderTop: '1px dashed #F0E4D0',
        marginTop: -10, // butt up against the closed card above
        marginBottom: 10,
        padding: 16,
        direction: 'rtl',
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
    >
      <div style={{ marginBottom: onOpenDetail ? 14 : 0 }}>
        {children}
      </div>
      {onOpenDetail && (
        <button
          type="button"
          onClick={onOpenDetail}
          style={{
            width: '100%',
            height: 44,
            borderRadius: 12,
            border: 'none',
            background: '#FF6F20',
            color: 'white',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'Heebo', 'Assistant', sans-serif",
          }}
        >
          {detailLabel}
        </button>
      )}
    </div>
  );
}
