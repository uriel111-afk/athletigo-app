import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import FocusTracker from './FocusTracker';
import { FOCUS } from '@/lib/lifeos/focus-api';

// The אישי (personal) world's home. It is the SAME tracker board as the
// business focus view — one tracker, one home — reused (not forked) with
// the personal affordances turned on:
//   • quick-add row pinned on top (build recurring tasks without the map)
//   • checking a cell opens the documentation sheet automatically
//   • a day-summary strip + chronological feed of today's docs
//   • the 'החיים שלי' arm is seeded once on first load
// No FocusChips here: the AppSwitcher is the cross-world nav. The old
// personal tools hub stays reachable via the 'עוד כלים' button below.
export default function PersonalBoard() {
  const navigate = useNavigate();

  const moreTools = (
    <div style={{ padding: '20px 12px 8px', display: 'flex', justifyContent: 'center' }}>
      <button
        onClick={() => navigate('/personal')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '11px 20px', borderRadius: 14, cursor: 'pointer',
          border: `1px solid ${FOCUS.border}`, background: '#fff',
          boxShadow: FOCUS.neu, color: FOCUS.ink, fontSize: 14, fontWeight: 700,
          fontFamily: 'inherit',
        }}
      >
        <LayoutGrid size={16} color={FOCUS.orange} />
        עוד כלים
      </button>
    </div>
  );

  return (
    <FocusTracker
      title="אישי"
      chips={null}
      quickAdd
      docOnCheck
      daySummary
      seedPersonal
      footerSlot={moreTools}
    />
  );
}
