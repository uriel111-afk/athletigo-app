import React, { useMemo, useState } from 'react';
import { X, MapPin, Sparkles, Play } from 'lucide-react';
import { FOCUS, hexAlpha, isoDate, INSPIRATION_TAG, catOf } from '@/lib/lifeos/focus-api';
import { topMoves, netMinutes } from '@/lib/lifeos/priority-engine';

// ─── "אני במקום חדש, מה אפשר לעשות כאן?" ───────────────────────────
// Step 1: one field — where are you.
// Step 2: the three highest-scoring OPEN tasks whose nature fits that place,
//         plus items from the inspiration list.
//
// Stage 1 fits by NATURE, not by a stored location: focus_node_locations only
// arrives in Stage 2, so matching is done on the free text against each node's
// title / first_step / success_criteria, and anything with no signal falls back
// to plain score order. Once Stage 2 lands, swap the `fitsPlace` predicate for
// a real location lookup — nothing else here changes.
const norm = (s) => String(s || '').toLowerCase();

export default function OpportunitySheet({ nodes = [], ctx = {}, onPick, onClose }) {
  const [place, setPlace] = useState('');
  const [asked, setAsked] = useState(false);

  const fitsPlace = (node, q) => {
    if (!q) return true;
    const hay = norm([node.title, node.first_step, node.success_criteria, (node.tags || []).join(' ')].join(' '));
    return q.split(/\s+/).filter(Boolean).some(w => hay.includes(norm(w)));
  };

  const matches = useMemo(() => {
    if (!asked) return [];
    const q = place.trim();
    const fitting = nodes.filter(n => fitsPlace(n, q));
    // Score the fitting subset; if the place matched nothing, fall back to the
    // whole open set so the sheet always answers with something.
    const pool = fitting.length ? fitting : nodes;
    return topMoves(pool, { ...ctx, today: ctx.today || isoDate() }, 3);
  }, [asked, place, nodes, ctx]);

  const inspiration = useMemo(() => {
    if (!asked) return [];
    const q = place.trim();
    return nodes
      .filter(n => (n.tags || []).includes(INSPIRATION_TAG) && n.status !== 'done' && n.node_type === 'task')
      .filter(n => fitsPlace(n, q))
      .slice(0, 4);
  }, [asked, place, nodes]);

  return (
    <div dir="rtl" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1420, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '16px 16px calc(env(safe-area-inset-bottom,0px) + 20px)', boxShadow: '0 -6px 24px rgba(0,0,0,0.15)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: FOCUS.ink }}>מה אפשר לעשות כאן?</div>
          <button onClick={onClose} aria-label="סגור" style={{ background: 'none', border: 'none', cursor: 'pointer', color: FOCUS.muted }}><X size={20} /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <MapPin size={15} color={FOCUS.muted} style={{ position: 'absolute', right: 10, top: 12 }} />
            <input autoFocus value={place} onChange={(e) => { setPlace(e.target.value); setAsked(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') setAsked(true); }}
              placeholder="איפה אתה? (בית, חוץ, אוטו, חדר כושר…)"
              style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${FOCUS.border}`, borderRadius: 11, padding: '11px 32px 11px 12px', fontSize: 14, fontFamily: 'inherit', color: FOCUS.ink, background: '#FFFDFA', outline: 'none' }} />
          </div>
          <button onClick={() => setAsked(true)}
            style={{ flexShrink: 0, padding: '0 16px', borderRadius: 11, border: 'none', background: FOCUS.orangeGrad, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            הראה
          </button>
        </div>

        {asked && (
          <>
            <div style={sectionLabel}>הכי משתלם עכשיו</div>
            {matches.length === 0 ? (
              <div style={{ fontSize: 13, color: FOCUS.muted, padding: '10px 2px' }}>אין משימות פתוחות שמתאימות</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {matches.map(({ node, score }) => (
                  <button key={node.id} onClick={() => onPick && onPick(node)}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 12px', borderRadius: 12, border: `1px solid ${FOCUS.border}`, background: '#FFFDFA', cursor: 'pointer', textAlign: 'right', fontFamily: 'inherit' }}>
                    <Play size={14} color={FOCUS.orange} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: FOCUS.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.title}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: FOCUS.muted, flexShrink: 0 }}>{netMinutes(node)}′</span>
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: '#B4531A', background: hexAlpha(FOCUS.orange, 0.14), borderRadius: 6, padding: '2px 5px', flexShrink: 0 }}>{score}</span>
                  </button>
                ))}
              </div>
            )}

            <div style={sectionLabel}>מרשימת ההשראה</div>
            {inspiration.length === 0 ? (
              <div style={{ fontSize: 13, color: FOCUS.muted, padding: '10px 2px' }}>אין פריט מתאים ברשימה</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {inspiration.map(it => (
                  <span key={it.id}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 11px', borderRadius: 999, border: `1px solid ${FOCUS.border}`, background: '#fff', fontSize: 12.5, fontWeight: 700, color: FOCUS.ink }}>
                    <Sparkles size={12} color={FOCUS.orange} />
                    {it.title}
                    <span style={{ fontSize: 9, color: FOCUS.muted }}>{catOf(it) === 'place' ? 'מקום' : catOf(it) === 'learn' ? 'ללמוד' : 'חוויה'}</span>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const sectionLabel = { fontSize: 11, fontWeight: 800, color: FOCUS.muted, margin: '4px 2px 6px' };
