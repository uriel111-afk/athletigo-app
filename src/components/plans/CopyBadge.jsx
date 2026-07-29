import React from 'react';

// "עותק" badge — renders next to a plan name whenever the plan has a
// parent_plan_id. Its whole job is to make a duplicate visually
// distinguishable from its source: the 2026-07-29 data loss happened
// because a shallow copy carried the same assigned_to / coach_id /
// created_by / parent_plan_id as its source and there was no way to
// tell the two rows apart in a list.
//
// Inline styles on purpose — matches the plan screens' existing idiom
// and avoids adding a stylesheet for one chip.
export default function CopyBadge({ plan, style }) {
  if (!plan?.parent_plan_id) return null;
  return (
    <span
      title="תוכנית זו היא עותק של תוכנית אחרת"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        background: '#FFF0E4',
        border: '1px solid #FFE5D0',
        borderRadius: 999,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1.6,
        color: '#7A3A0F',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      עותק
    </span>
  );
}
