import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronRight, ChevronLeft, Check, X, Maximize2, Minimize2 } from 'lucide-react';
import { FOCUS, hexAlpha, isoDate, addDays, HEB_DAYS, monthLabel } from '@/lib/lifeos/focus-api';
import {
  HOURS, QUARTERS, timeLabel, hourOf, quarterOf, hhmm, dayItems, itemsAtHour, itemsAtQuarter,
  weekOf, monthWeeks, sameMonth, occursOn, durationOf,
} from '@/lib/lifeos/schedule-api';
import { colorOfCategory } from '@/lib/lifeos/categories';

// ═══════════════════════════════════════════════════════════════════
// The schedule — day / week as date × hour, month as a fitted grid
// ═══════════════════════════════════════════════════════════════════
// Day and week are the SAME grid: columns are dates (1 or 7), rows are hours
// 06:00–23:00. Pinching splits every hour into four 15-minute rows; each row is
// its own drop target and each block keeps its own tick box at either zoom.
//
// Placing a task never opens a dialog. Two routes, both ending in onPlace:
//   • drag  — @dnd-kit droppables (pointer sensor → works with finger and mouse)
//   • touch — tapping an empty slot ARMS it: the slot goes dashed-orange with a
//             +, and the bank below turns into a picker for exactly that slot.
//
// The month view must fit the screen with no vertical scroll. That is not left
// to a fixed cell height: the grid measures the space it actually has and
// divides it by the number of weeks the month really spans. See fitCellHeight.
// ═══════════════════════════════════════════════════════════════════

const VIEWS = [
  { key: 'day', label: 'יום' },
  { key: 'week', label: 'שבוע' },
  { key: 'month', label: 'חודש' },
];

export const slotId = (date, hour, quarter) => `slot|${date}|${hour}|${quarter}`;
export const parseSlotId = (id) => {
  const [tag, date, hour, quarter] = String(id).split('|');
  return tag === 'slot' ? { date, hour: Number(hour), quarter: Number(quarter) } : null;
};

export default function DayCalendar({
  nodes = [], logSet = new Set(), doneOf,
  date, onDate, view, onView, zoom = 'hour', onZoom,
  armed = null, onArm, onClearArm,
  onToggleDone, onOpenDoc, onUnschedule,
  categoryOf = () => 'other',
  progress = null,
}) {
  const today = isoDate();
  const nowHour = new Date().getHours();

  const days = useMemo(() => (view === 'week' ? weekOf(date) : [date]), [view, date]);

  const shift = (n) => {
    if (view === 'month') {
      const d = new Date(date + 'T00:00:00');
      onDate(isoDate(new Date(d.getFullYear(), d.getMonth() + n, 1)));
    } else onDate(addDays(date, view === 'week' ? n * 7 : n));
  };

  const title = view === 'month'
    ? monthLabel(date)
    : view === 'week'
      ? `${days[0].slice(8)}/${days[0].slice(5, 7)} – ${days[6].slice(8)}/${days[6].slice(5, 7)}`
      : `יום ${HEB_DAYS[new Date(date + 'T00:00:00').getDay()]}׳ · ${date.slice(8)}/${date.slice(5, 7)}`;

  return (
    <div style={{ margin: '0 12px 10px', background: FOCUS.card, border: `1px solid ${FOCUS.border}`, borderRadius: 16, boxShadow: FOCUS.neu, overflow: 'hidden' }}>

      <div style={{ padding: '9px 10px 7px', borderBottom: `1px solid ${FOCUS.border}` }}>
        <div style={{ display: 'flex', gap: 5, marginBottom: 7 }}>
          {VIEWS.map(v => {
            const on = view === v.key;
            return (
              <button key={v.key} onClick={() => onView(v.key)}
                style={{ flex: 1, padding: '7px 4px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: on ? 800 : 600,
                  border: `1px solid ${on ? FOCUS.orange : FOCUS.border}`, background: on ? hexAlpha(FOCUS.orange, 0.13) : '#fff', color: on ? '#B4531A' : FOCUS.muted }}>
                {v.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => shift(1)} style={navBtn} aria-label="קדימה"><ChevronRight size={16} /></button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 800, color: FOCUS.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          <button onClick={() => shift(-1)} style={navBtn} aria-label="אחורה"><ChevronLeft size={16} /></button>
          {date !== today && (
            <button onClick={() => onDate(today)} style={{ ...navBtn, width: 'auto', padding: '0 9px', fontSize: 11.5, fontWeight: 800, color: '#B4531A' }}>היום</button>
          )}
          {view !== 'month' && (
            <button onClick={() => onZoom(zoom === 'hour' ? 'quarter' : 'hour')}
              title={zoom === 'hour' ? 'רבע שעה' : 'שעה שלמה'}
              style={{ ...navBtn, width: 'auto', padding: '0 8px', gap: 3, fontSize: 10.5, fontWeight: 800, color: zoom === 'quarter' ? '#B4531A' : FOCUS.muted, borderColor: zoom === 'quarter' ? FOCUS.orange : FOCUS.border }}>
              {zoom === 'hour' ? <Maximize2 size={12} /> : <Minimize2 size={12} />} 15′
            </button>
          )}
        </div>

        {progress && (
          <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ flex: 1, height: 5, borderRadius: 3, background: '#F0E4D0', overflow: 'hidden' }}>
              <div style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`, height: '100%', background: FOCUS.orangeGrad, transition: 'width .25s' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, color: FOCUS.muted, flexShrink: 0 }}>{progress.done}/{progress.total} שובצו</span>
          </div>
        )}
      </div>

      {armed && view !== 'month' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', background: hexAlpha(FOCUS.orange, 0.14), borderBottom: `1px solid ${FOCUS.border}` }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, color: '#B4531A' }}>
            בחר משימה מהבנק ל-{timeLabel(armed.hour, armed.quarter)}
          </span>
          <button onClick={onClearArm} aria-label="בטל"
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#B4531A', display: 'flex', padding: 2 }}><X size={16} /></button>
        </div>
      )}

      {view === 'month' ? (
        <MonthGrid nodes={nodes} date={date} today={today} doneOf={doneOf} categoryOf={categoryOf}
          onPickDay={(d) => onDate(d)} />
      ) : (
        <TimeGrid days={days} today={today} nowHour={nowHour} nodes={nodes} zoom={zoom} onZoom={onZoom}
          armed={armed} onArm={onArm} doneOf={doneOf} categoryOf={categoryOf}
          onToggleDone={onToggleDone} onOpenDoc={onOpenDoc} onUnschedule={onUnschedule} />
      )}
    </div>
  );
}

// ── יום / שבוע: date columns × hour rows ──────────────────────────
function TimeGrid({ days, today, nowHour, nodes, zoom, onZoom, armed, onArm, doneOf, categoryOf, onToggleDone, onOpenDoc, onUnschedule }) {
  const scrollRef = useRef(null);
  const wide = days.length === 1;

  const perDay = useMemo(
    () => Object.fromEntries(days.map(d => [d, dayItems(nodes, d)])),
    [days, nodes]);

  // Scroll to the current hour when today is on screen.
  useEffect(() => {
    if (!days.includes(today) || !scrollRef.current) return;
    const row = scrollRef.current.querySelector(`[data-hour="${nowHour}"]`);
    if (row) row.scrollIntoView({ block: 'center' });
  }, [days, today, nowHour, zoom]);

  // ── pinch → 15-minute rows ──────────────────────────────────────
  const pts = useRef(new Map());
  const baseDist = useRef(0);
  const onPD = (e) => {
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) baseDist.current = dist(pts.current);
  };
  const onPM = (e) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size !== 2 || !baseDist.current) return;
    const r = dist(pts.current) / baseDist.current;
    if (r > 1.25 && zoom !== 'quarter') { onZoom('quarter'); baseDist.current = dist(pts.current); }
    if (r < 0.8 && zoom !== 'hour') { onZoom('hour'); baseDist.current = dist(pts.current); }
  };
  const onPU = (e) => { pts.current.delete(e.pointerId); if (pts.current.size < 2) baseDist.current = 0; };

  const untimedAll = days.flatMap(d => (perDay[d]?.untimed || []).map(n => ({ n, d })));

  return (
    <div>
      {untimedAll.length > 0 && (
        <div style={{ padding: '8px 10px', borderBottom: `1px dashed ${FOCUS.border}`, background: '#FFFDFA' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: FOCUS.muted, marginBottom: 5 }}>ללא שעה ({untimedAll.length})</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {untimedAll.slice(0, 12).map(({ n, d }) => (
              <UntimedChip key={n.id + d} node={n} color={colorOfCategory(categoryOf(n))}
                done={doneOf(n, d)} onTick={() => onToggleDone(n, d)} onOpen={() => onOpenDoc(n, d)} />
            ))}
          </div>
        </div>
      )}

      {/* date header — day letter AND the numeric date, today highlighted */}
      <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 3, background: '#FFFDFA', borderBottom: `1px solid ${FOCUS.border}` }}>
        <div style={{ width: 42, flexShrink: 0, borderLeft: `1px solid ${FOCUS.border}` }} />
        {days.map(d => {
          const isToday = d === today;
          return (
            <div key={d} style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '4px 0 5px', background: isToday ? hexAlpha(FOCUS.orange, 0.14) : 'transparent' }}>
              <div style={{ fontSize: 9.5, fontWeight: isToday ? 800 : 600, color: isToday ? '#B4531A' : FOCUS.muted }}>
                {HEB_DAYS[new Date(d + 'T00:00:00').getDay()]}
              </div>
              <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 700, color: isToday ? '#B4531A' : FOCUS.ink, lineHeight: 1.2 }}>
                {Number(d.slice(8))}
              </div>
              {isToday && <div style={{ width: 14, height: 2, borderRadius: 2, background: FOCUS.orange, margin: '2px auto 0' }} />}
            </div>
          );
        })}
      </div>

      <div ref={scrollRef} onPointerDown={onPD} onPointerMove={onPM} onPointerUp={onPU} onPointerCancel={onPU}
        style={{ maxHeight: 430, overflowY: 'auto', touchAction: 'pan-y' }}>
        {HOURS.map(h => {
          const isNow = days.includes(today) && h === nowHour;
          const rows = zoom === 'quarter' ? QUARTERS : [0];
          return (
            <div key={h} data-hour={h} style={{ display: 'flex', borderBottom: `1px solid ${FOCUS.border}`, background: isNow ? hexAlpha(FOCUS.orange, 0.06) : 'transparent' }}>
              <div style={{ width: 42, flexShrink: 0, borderLeft: `1px solid ${FOCUS.border}`, paddingTop: 4, textAlign: 'center' }}>
                <div style={{ fontSize: 10.5, fontWeight: isNow ? 800 : 600, color: isNow ? '#B4531A' : FOCUS.muted }}>{timeLabel(h, 0)}</div>
                {zoom === 'quarter' && (
                  <div style={{ marginTop: 2, display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {[1, 2, 3].map(q => (
                      <span key={q} style={{ fontSize: 8, color: FOCUS.border, lineHeight: `${wide ? 34 : 26}px` }}>{String(q * 15)}</span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
                {days.map(d => (
                  <div key={d} style={{ flex: 1, minWidth: 0, borderLeft: days.length > 1 ? `1px solid ${hexAlpha(FOCUS.border, 0.6)}` : 'none' }}>
                    {rows.map(q => (
                      <Slot key={q} date={d} hour={h} quarter={q} wide={wide}
                        items={zoom === 'quarter'
                          ? itemsAtQuarter(perDay[d]?.timed || [], h, q)
                          : itemsAtHour(perDay[d]?.timed || [], h)}
                        armed={armed} onArm={onArm} doneOf={doneOf} categoryOf={categoryOf}
                        onToggleDone={onToggleDone} onOpenDoc={onOpenDoc} onUnschedule={onUnschedule} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const dist = (map) => {
  const [a, b] = [...map.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
};

// ── one drop target ───────────────────────────────────────────────
function Slot({ date, hour, quarter, items, wide, armed, onArm, doneOf, categoryOf, onToggleDone, onOpenDoc, onUnschedule }) {
  const id = slotId(date, hour, quarter);
  const { setNodeRef, isOver } = useDroppable({ id });
  const isArmed = armed && armed.date === date && armed.hour === hour && armed.quarter === quarter;
  const empty = items.length === 0;
  const minH = wide ? 34 : 26;

  return (
    <div ref={setNodeRef} data-slot={id}
      // An empty slot is a real tap target ("tap a slot, then pick a task"),
      // so it is announced as one rather than being an anonymous div.
      role={empty ? 'button' : undefined}
      aria-label={empty ? `שבץ ב-${timeLabel(hour, quarter)}` : undefined}
      onClick={() => empty && onArm({ date, hour, quarter })}
      style={{
        minHeight: minH, padding: 2, display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center',
        cursor: empty ? 'pointer' : 'default',
        border: isArmed || isOver ? `1.5px dashed ${FOCUS.orange}` : '1.5px dashed transparent',
        borderRadius: 8,
        background: isOver ? hexAlpha(FOCUS.orange, 0.16) : isArmed ? hexAlpha(FOCUS.orange, 0.1) : 'transparent',
      }}>
      {empty ? (
        (isArmed || isOver) ? (
          <span style={{ textAlign: 'center', fontSize: 13, fontWeight: 900, color: '#B4531A', lineHeight: 1 }}>+</span>
        ) : null
      ) : items.map(n => (
        <Block key={n.id} node={n} date={date} wide={wide} color={colorOfCategory(categoryOf(n))}
          done={doneOf(n, date)} onTick={() => onToggleDone(n, date)}
          onOpen={() => onOpenDoc(n, date)} onUnschedule={() => onUnschedule(n)} />
      ))}
    </div>
  );
}

// A placed task. Tick box at EVERY zoom level — the write is the same one the
// habit matrix performs, whether the block sits in an hour or in a quarter.
function Block({ node, wide, color, done, onTick, onOpen, onUnschedule }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: wide ? '5px 7px' : '3px 4px', borderRadius: 7, border: `1px solid ${done ? hexAlpha('#16a34a', 0.5) : hexAlpha(color, 0.5)}`, background: done ? hexAlpha('#16a34a', 0.1) : hexAlpha(color, 0.12), minWidth: 0 }}>
      <button onClick={(e) => { e.stopPropagation(); onTick(); }} aria-label={done ? 'בטל סימון' : 'סמן שבוצע'}
        style={{ width: wide ? 18 : 14, height: wide ? 18 : 14, borderRadius: 4, flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: done ? 'none' : `1.5px solid ${hexAlpha(color, 0.8)}`, background: done ? '#16a34a' : '#fff', color: '#fff', padding: 0 }}>
        {done && <Check size={wide ? 11 : 9} />}
      </button>
      <button onClick={(e) => { e.stopPropagation(); onOpen(); }}
        style={{ flex: 1, minWidth: 0, textAlign: 'right', border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
        <div style={{ fontSize: wide ? 12 : 8.5, fontWeight: 700, color: done ? '#15803d' : FOCUS.ink, textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.25 }}>{node.title}</div>
        {wide && <div style={{ fontSize: 9, color: FOCUS.muted }}>{hhmm(node.task_time)} · {durationOf(node)} דק׳</div>}
      </button>
      {wide && (
        <button onClick={(e) => { e.stopPropagation(); onUnschedule(); }} aria-label="הסר מהשעה"
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: FOCUS.muted, flexShrink: 0, display: 'flex', padding: 1 }}><X size={12} /></button>
      )}
    </div>
  );
}

function UntimedChip({ node, color, done, onTick, onOpen }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 999, border: `1px solid ${done ? hexAlpha('#16a34a', 0.5) : hexAlpha(color, 0.45)}`, background: done ? hexAlpha('#16a34a', 0.09) : '#fff' }}>
      <button onClick={onTick} aria-label={done ? 'בטל סימון' : 'סמן שבוצע'}
        style={{ width: 15, height: 15, borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: done ? 'none' : `1.5px solid ${hexAlpha(color, 0.8)}`, background: done ? '#16a34a' : '#fff', color: '#fff', padding: 0, flexShrink: 0 }}>
        {done && <Check size={10} />}
      </button>
      <button onClick={onOpen}
        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: done ? '#15803d' : FOCUS.ink, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {node.title}
      </button>
    </span>
  );
}

// ── חודש: every week of the month, fitted to the screen ───────────
// MIN_CELL is the smallest cell that still holds a day number plus three rows
// of dots. If the available height ever forces a cell below it the grid stops
// shrinking and reports through onFit, so "it did not fit" is visible rather
// than silently clipped.
const MIN_CELL = 34;
const MAX_CELL = 78;
const GAP = 3;
const BOTTOM_RESERVE = 14;

function MonthGrid({ nodes, date, today, doneOf, categoryOf, onPickDay }) {
  const weeks = useMemo(() => monthWeeks(date), [date]);
  const wrapRef = useRef(null);
  const rowsRef = useRef(null);
  const [cellH, setCellH] = useState(48);

  // Measure from the ROWS container, not the wrapper: the wrapper's top sits
  // above the weekday header and the container padding, and dividing that
  // larger span among the week rows overflowed a 6-week month by ~16px on a
  // 640px-tall screen. The rows container's own top already excludes both, and
  // its position does not move when the cell height changes, so there is no
  // measure→resize→measure loop.
  const fit = useCallback(() => {
    const el = rowsRef.current || wrapRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const avail = window.innerHeight - top - BOTTOM_RESERVE;
    const rows = weeks.length;
    const h = Math.floor((avail - (rows - 1) * GAP) / rows);
    setCellH(Math.max(MIN_CELL, Math.min(MAX_CELL, h)));
  }, [weeks.length]);

  useLayoutEffect(() => {
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(document.documentElement);
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); window.removeEventListener('orientationchange', fit); };
  }, [fit]);

  // Dots per day, by category, capped at the 3×3 the cell can hold.
  const dotsOf = useCallback((d) => {
    const due = nodes.filter(n => occursOn(n, d));
    return due.slice(0, 9).map(n => ({ id: n.id, color: colorOfCategory(categoryOf(n)), done: doneOf(n, d) }));
  }, [nodes, categoryOf, doneOf]);

  const dotSize = cellH >= 56 ? 5 : cellH >= 44 ? 4 : 3;

  return (
    <div ref={wrapRef} data-month-grid style={{ padding: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: GAP, marginBottom: 4 }}>
        {HEB_DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 9.5, fontWeight: 700, color: FOCUS.muted }}>{d}</div>
        ))}
      </div>
      <div ref={rowsRef} data-month-rows style={{ display: 'grid', gridTemplateRows: `repeat(${weeks.length}, ${cellH}px)`, gap: GAP }}>
        {weeks.map((w, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: GAP }}>
            {w.map(d => {
              const dim = !sameMonth(d, date);
              const isToday = d === today;
              const sel = d === date;
              const dots = dotsOf(d);
              return (
                <button key={d} onClick={() => onPickDay(d)}
                  style={{ height: cellH, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 2, padding: '3px 1px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', overflow: 'hidden', opacity: dim ? 0.4 : 1,
                    border: `1px solid ${isToday ? FOCUS.orange : sel ? FOCUS.edge : FOCUS.border}`,
                    background: isToday ? hexAlpha(FOCUS.orange, 0.12) : sel ? hexAlpha(FOCUS.orange, 0.05) : '#fff' }}>
                  <span style={{ fontSize: cellH >= 44 ? 11.5 : 10, fontWeight: isToday ? 800 : 600, color: isToday ? '#B4531A' : FOCUS.ink, lineHeight: 1.1 }}>
                    {Number(d.slice(8))}
                  </span>
                  {dots.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(3, ${dotSize}px)`, gap: 1.5, justifyContent: 'center' }}>
                      {dots.map(dt => (
                        <span key={dt.id} style={{ width: dotSize, height: dotSize, borderRadius: '50%', background: dt.color, opacity: dt.done ? 0.35 : 1 }} />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const navBtn = { height: 28, minWidth: 28, borderRadius: 8, border: `1px solid ${FOCUS.border}`, background: '#fff', color: FOCUS.ink, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'inherit', padding: 0 };
