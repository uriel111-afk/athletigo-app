import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Sparkles, SlidersHorizontal } from 'lucide-react';
import { AuthContext } from '@/lib/AuthContext';
import FocusTracker from '@/pages/lifeos/FocusTracker';
import StructureSheet from '@/components/lifeos/StructureSheet';
import QuickCapture from '@/components/lifeos/QuickCapture';
import { FOCUS, BOARD_TAG, isoDate, addDays, fetchNodes } from '@/lib/lifeos/focus-api';
import { fetchExecutions, fetchCustomFields, fetchDayStates } from '@/lib/lifeos/personal-day-api';
import { execCountMap } from '@/lib/lifeos/week-math';

// ═══════════════════════════════════════════════════════════════════
// הלוח — the habit matrix, unchanged, plus the execution counts
// ═══════════════════════════════════════════════════════════════════
// FocusTracker is NOT forked. It keeps reading focus_task_logs for the
// done/skipped mark exactly as before; this screen loads focus_executions on
// its own and hands the per-cell counts down as ONE prop (`execCounts`), which
// the tracker only uses to draw a small ×N badge when a day holds two or more
// executions. Everything else — quick add, groups, long-press, the doc sheet —
// is the same single component the business tracker uses.
//
// The structural editor (branches, habits, bank items, promote/demote, custom
// fields) hangs off the footer, so the board stays a board.
// ═══════════════════════════════════════════════════════════════════

export default function BoardScreen({ headerSlot = null }) {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const today = isoDate();

  const [executions, setExecutions] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [dayStates, setDayStates] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [structOpen, setStructOpen] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const from = addDays(today, -120);
    // The tracker fetches its own nodes; this second read exists only so the
    // structural sheet has the tree without reaching into the tracker.
    const [ex, cf, ds, ns] = await Promise.all([
      fetchExecutions(userId, from, today),
      fetchCustomFields(userId),
      fetchDayStates(userId, from, today),
      fetchNodes(userId),
    ]);
    setExecutions(ex); setCustomFields(cf); setDayStates(ds); setNodes(ns);
  }, [userId, today]);

  useEffect(() => { load(); }, [load]);

  const execCounts = useMemo(() => execCountMap(executions), [executions]);
  const brokenDays = useMemo(
    () => dayStates.filter(d => d.capacity === 'broken').map(d => String(d.day).slice(0, 10)),
    [dayStates]);

  const btn = {
    flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    padding: '11px 12px', borderRadius: 14, cursor: 'pointer',
    border: `1px solid ${FOCUS.border}`, background: '#fff',
    boxShadow: FOCUS.neu, color: FOCUS.ink, fontSize: 13, fontWeight: 700,
    fontFamily: 'inherit', whiteSpace: 'nowrap',
  };

  const footer = (
    <div style={{ padding: '18px 12px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setStructOpen(true)} style={btn}>
          <SlidersHorizontal size={16} color={FOCUS.orange} /> הוספה ושינוי
        </button>
        <button onClick={() => navigate('/lifeos/inspiration')} style={btn}>
          <Sparkles size={16} color={FOCUS.orange} /> רשימת השראה
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => navigate('/personal')} style={btn}>
          <LayoutGrid size={16} color={FOCUS.orange} /> עוד כלים
        </button>
      </div>
      <QuickCapture userId={userId} />
    </div>
  );

  return (
    <>
      <FocusTracker
        title="אישי"
        chips={null}
        quickAdd
        docOnCheck
        seedPersonal
        groupByDomain
        boardTag={BOARD_TAG}
        pageScroll
        defaultPeriod="week"
        hideTopBar
        headerSlot={headerSlot}
        footerSlot={footer}
        execCounts={execCounts}
        brokenDays={brokenDays}
      />
      {structOpen && (
        <StructureSheet userId={userId} nodes={nodes} customFields={customFields}
          onSaved={load} onClose={() => setStructOpen(false)} />
      )}
    </>
  );
}
