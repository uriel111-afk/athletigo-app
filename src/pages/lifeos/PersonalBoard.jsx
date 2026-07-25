import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Sparkles } from 'lucide-react';
import FocusTracker from './FocusTracker';
import { FOCUS, BOARD_TAG } from '@/lib/lifeos/focus-api';

// The אישי (personal) world's home — the SAME tracker component, curated
// into a clean, page-scrolling board:
//   • boardTag → shows ONLY tasks the user kept on the board (tag 'לוח');
//     quick-add is born on the board, long-press removes/deletes, and a
//     'מהקיים' picker adds existing recurring tasks. First run tags the
//     'החיים שלי' arm so the board opens personal-only.
//   • pageScroll → no inner scrolling; the page scrolls, week fits 380px.
//   • defaultPeriod 'week' · collapsible quick-add · one-row controls.
//   • row tap opens the habit's TASK BANK (details are one long-press away).
//   • checking a cell opens the documentation sheet automatically.
//   • seedHabits → the agreed habit set is created once, idempotently.
// No FocusChips here: the AppSwitcher is the cross-world nav. The old
// personal tools hub stays reachable via the 'עוד כלים' button below — that's
// also where the contacts card now lives (it used to sit on this page).
export default function PersonalBoard() {
  const navigate = useNavigate();

  // Two entry points under the habit table: the inspiration list (new, its own
  // route) sits alongside the existing 'עוד כלים' tools hub rather than
  // replacing it — one tap from the board either way.
  const btn = {
    flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '11px 14px', borderRadius: 14, cursor: 'pointer',
    border: `1px solid ${FOCUS.border}`, background: '#fff',
    boxShadow: FOCUS.neu, color: FOCUS.ink, fontSize: 13.5, fontWeight: 700,
    fontFamily: 'inherit', whiteSpace: 'nowrap',
  };
  const moreTools = (
    <div style={{ padding: '20px 12px 8px', display: 'flex', gap: 8 }}>
      <button onClick={() => navigate('/lifeos/inspiration')} style={btn}>
        <Sparkles size={16} color={FOCUS.orange} />
        רשימת השראה
      </button>
      <button onClick={() => navigate('/personal')} style={btn}>
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
      seedPersonal
      seedDomains
      seedHabits
      groupByDomain
      boardTag={BOARD_TAG}
      pageScroll
      defaultPeriod="week"
      hideTopBar
      footerSlot={moreTools}
    />
  );
}
