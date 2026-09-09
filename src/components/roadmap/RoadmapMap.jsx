import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Lock, Flag } from 'lucide-react';
import { unitLabel } from '@/lib/recordExercises';
import { listStations, groupIntoLadders, pbsForStations } from '@/lib/roadmapApi';
import { normalizeExerciseName } from '@/lib/goalsApi';
import StationSheet from './StationSheet';
import {
  CREAM, CHARCOAL, ORANGE, WHITE, CARD_BORDER, MUTED,
  GREEN, BEIGE, SANS, LTR_NUM, stationValueLabel,
  STATION_STATE, stationState,
} from './roadmapUi';

/**
 * TRAINEE MAP — the winding path.
 *
 * The goal sits at the top on a charcoal band. Below it the stations
 * climb a curved trail, bottom to top: solid orange up to where the
 * trainee is, dashed beige beyond. Reached stations are green with a
 * check, the current one is larger and flame-marked, locked ones are
 * beige with a lock. Tapping any of them opens StationSheet.
 *
 * READ-ONLY on roadmap_stations. Nothing in this component writes a
 * station; the PB comes from getCurrentPB through roadmapApi, which
 * is the existing records read, unchanged.
 *
 * Geometry is fixed-pixel inside a 300px column so the curve keeps
 * its shape at any screen width — no measuring, no ResizeObserver.
 */

const W = 300;          // the trail's own coordinate width
const SPACING = 92;     // vertical distance between two stations
const PAD_B = 46;
const PAD_T = 42;
const X_RIGHT = 205;    // RTL: the ladder starts on the right
const X_LEFT = 95;
const R = 22;           // node radius
const R_BIG = 30;       // the current station

const nodeX = (i) => (i % 2 === 0 ? X_RIGHT : X_LEFT);

export default function RoadmapMap({ traineeId, currentUserId = null }) {
  const queryClient = useQueryClient();
  const [openStation, setOpenStation] = useState(null);
  const [ladderIdx, setLadderIdx] = useState(0);

  const { data: stations = [], isLoading } = useQuery({
    queryKey: ['roadmap-stations', traineeId],
    enabled: !!traineeId,
    queryFn: () => listStations(traineeId),
  });

  const { data: pbs = {} } = useQuery({
    queryKey: ['roadmap-pbs', traineeId, stations.length],
    enabled: !!traineeId && stations.length > 0,
    queryFn: () => pbsForStations(traineeId, stations),
  });

  const ladders = useMemo(() => groupIntoLadders(stations), [stations]);
  const ladder = ladders[Math.min(ladderIdx, Math.max(0, ladders.length - 1))] || null;
  const pbFor = (name) => Number(pbs[normalizeExerciseName(name)]) || 0;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['roadmap-stations', traineeId] });
    queryClient.invalidateQueries({ queryKey: ['roadmap-pbs', traineeId] });
    queryClient.invalidateQueries({ queryKey: ['personal-records', traineeId] });
    queryClient.invalidateQueries({ queryKey: ['progress-records', traineeId] });
  };

  if (!traineeId) return null;
  if (isLoading) return null;

  // No ladder, no card. A trainee whose coach has not built a
  // roadmap yet sees nothing here at all — not an empty state. The
  // coach's own editor keeps its empty state, because the coach is
  // the one who has something to do about it.
  if (!ladder) return null;

  const { stations: rows, goal, currentIndex, exerciseName } = ladder;
  const trail = rows.slice(0, Math.max(0, rows.length - 1));  // goal is the band
  const goalIndex = rows.length - 1;
  const goalState = stationState(goalIndex, currentIndex);
  const pb = pbFor(exerciseName);

  const n = trail.length;
  const H = n > 0 ? PAD_B + (n - 1) * SPACING + PAD_T : 0;
  const yOf = (i) => H - PAD_B - i * SPACING;

  // Two paths: the walked part and the part still ahead. A segment
  // belongs to the walked path when its LOWER node is already behind
  // the trainee.
  const solid = [];
  const dashed = [];
  for (let i = 0; i < n - 1; i += 1) {
    const x0 = nodeX(i), y0 = yOf(i);
    const x1 = nodeX(i + 1), y1 = yOf(i + 1);
    const seg = `M ${x0} ${y0} C ${x0} ${y0 - SPACING * 0.55}, `
      + `${x1} ${y1 + SPACING * 0.55}, ${x1} ${y1}`;
    (currentIndex < 0 || i < currentIndex ? solid : dashed).push(seg);
  }
  // The last stretch, from the top station up into the goal band.
  if (n > 0) {
    const xT = nodeX(n - 1), yT = yOf(n - 1);
    const tail = `M ${xT} ${yT} C ${xT} ${yT - 30}, ${W / 2} ${PAD_T}, ${W / 2} 0`;
    (currentIndex < 0 ? solid : dashed).push(tail);
  }

  return (
    <Frame>
      {/* Exercise switcher — only when there is more than one ladder */}
      {ladders.length > 1 && (
        <div style={{
          display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 12px 0',
        }}>
          {ladders.map((l, i) => (
            <button
              key={l.exerciseName}
              type="button"
              onClick={() => setLadderIdx(i)}
              style={{
                flexShrink: 0, borderRadius: 999, cursor: 'pointer',
                padding: '5px 12px', fontFamily: SANS, fontSize: 12, fontWeight: 700,
                border: `1px solid ${i === ladderIdx ? ORANGE : CARD_BORDER}`,
                background: i === ladderIdx ? ORANGE : WHITE,
                color: i === ladderIdx ? WHITE : MUTED,
              }}
            >{l.exerciseName}</button>
          ))}
        </div>
      )}

      {/* ── THE GOAL, on the charcoal band ───────────────────────── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpenStation(goal)}
        onKeyDown={(e) => { if (e.key === 'Enter') setOpenStation(goal); }}
        style={{
          margin: '12px 12px 0', cursor: 'pointer',
          background: CHARCOAL, color: WHITE, borderRadius: 14,
          padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
        }}
      >
        <div style={{
          flexShrink: 0, width: 42, height: 42, borderRadius: 12,
          background: goalState === STATION_STATE.REACHED ? GREEN : ORANGE,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {goalState === STATION_STATE.REACHED
            ? <Check size={22} color={WHITE} strokeWidth={3} />
            : <Flag size={20} color={WHITE} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', fontWeight: 700 }}>
            היעד
          </div>
          <div style={{
            fontSize: 16, fontWeight: 800, lineHeight: 1.3, overflowWrap: 'anywhere',
          }}>{goal?.label}</div>
        </div>
        <div style={{ flexShrink: 0, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1, ...LTR_NUM }}>
            {stationValueLabel(goal?.threshold, goal?.unit)}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
            {unitLabel(goal?.unit)}
          </div>
        </div>
      </div>

      {/* ── THE TRAIL ────────────────────────────────────────────── */}
      {n > 0 && (
        <div style={{
          position: 'relative', width: W, height: H, margin: '0 auto',
        }}>
          <svg
            width={W} height={H} viewBox={`0 0 ${W} ${H}`}
            style={{ position: 'absolute', inset: 0 }}
            aria-hidden="true"
          >
            {dashed.map((d, i) => (
              <path key={`d${i}`} d={d} fill="none" stroke={BEIGE}
                    strokeWidth="5" strokeLinecap="round" strokeDasharray="2 11" />
            ))}
            {solid.map((d, i) => (
              <path key={`s${i}`} d={d} fill="none" stroke={ORANGE}
                    strokeWidth="5" strokeLinecap="round" />
            ))}
          </svg>

          {trail.map((s, i) => {
            const state = stationState(i, currentIndex);
            const isCurrent = state === STATION_STATE.CURRENT;
            const r = isCurrent ? R_BIG : R;
            const x = nodeX(i);
            const y = yOf(i);
            const onRight = i % 2 === 0;
            const bg = state === STATION_STATE.REACHED ? GREEN
              : isCurrent ? ORANGE : CREAM;
            const bd = state === STATION_STATE.LOCKED ? BEIGE : bg;
            return (
              <React.Fragment key={s.id}>
                <button
                  type="button"
                  onClick={() => setOpenStation(s)}
                  aria-label={`תחנה ${s.label}`}
                  style={{
                    position: 'absolute', left: x - r, top: y - r,
                    width: r * 2, height: r * 2, borderRadius: '50%',
                    background: bg, border: `2.5px solid ${bd}`,
                    boxShadow: isCurrent
                      ? '0 4px 14px rgba(255,111,32,0.35)'
                      : '0 2px 6px rgba(0,0,0,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', padding: 0, fontFamily: SANS,
                  }}
                >
                  {state === STATION_STATE.REACHED && (
                    <Check size={20} color={WHITE} strokeWidth={3} />
                  )}
                  {isCurrent && <span style={{ fontSize: 22, lineHeight: 1 }}>🔥</span>}
                  {state === STATION_STATE.LOCKED && (
                    <Lock size={16} color={MUTED} />
                  )}
                </button>
                <div
                  onClick={() => setOpenStation(s)}
                  style={{
                    position: 'absolute', top: y - 20,
                    left: onRight ? 10 : x + r + 12,
                    width: onRight ? x - r - 22 : W - (x + r + 12) - 10,
                    textAlign: onRight ? 'right' : 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    fontSize: 13, fontWeight: 800, lineHeight: 1.3,
                    color: state === STATION_STATE.LOCKED ? MUTED : CHARCOAL,
                    overflowWrap: 'anywhere',
                  }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                    <span style={LTR_NUM}>{stationValueLabel(s.threshold, s.unit)}</span>
                    {' '}{unitLabel(s.unit)}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* The trainee's standing, in words, under the trail */}
      <div style={{
        borderTop: `1px solid ${CARD_BORDER}`, padding: '10px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 12, color: MUTED }}>{exerciseName}</div>
        <div style={{ fontSize: 12, color: CHARCOAL, fontWeight: 700 }}>
          השיא שלי: <span style={LTR_NUM}>{stationValueLabel(pb, ladder.unit)}</span>
          {' '}{unitLabel(ladder.unit)}
        </div>
      </div>

      {openStation && (
        <StationSheet
          station={openStation}
          pb={pbFor(openStation.exercise_name)}
          traineeId={traineeId}
          currentUserId={currentUserId}
          onClose={() => setOpenStation(null)}
          onSaved={refresh}
        />
      )}
    </Frame>
  );
}

// The sheet's frame — cream paper inside a charcoal-titled card.
function Frame({ children }) {
  return (
    <div dir="rtl" style={{
      fontFamily: SANS, background: CREAM,
      border: `1px solid ${CARD_BORDER}`, borderRadius: 16,
      overflow: 'hidden', marginBottom: 16,
    }}>
      <div style={{
        background: CHARCOAL, color: WHITE, padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 15 }}>🗺️</span>
        <span style={{ fontSize: 14, fontWeight: 800 }}>מפת ההתקדמות</span>
      </div>
      {children}
    </div>
  );
}
