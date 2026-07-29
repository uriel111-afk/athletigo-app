import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play } from 'lucide-react';

// ── Launch the matching clock from inside an exercise ────────────────
// The chip picks a clock mode from the exercise's own time fields and
// runs it INLINE, inside the open exercise card. No navigation, no
// route change, no second engine, no second wake lock.
//
// Everything here rides on the SHARED ClockContext engine that
// /clocks already uses:
//
//   countdown        → startTimer(ms, 0)
//   work+rest+rounds → startTabata({ work_seconds, rest_seconds, rounds, prepare_seconds: 0 })
//   tabata           → startTabata(from tabata_data)
//   stopwatch        → startStopwatch()
//
// Prepare is ALWAYS 0 from an exercise, so `totalDuration` is
// unambiguously the exercise's own duration and elapsed can be read
// as `totalDuration - display`.
//
// The engine files (ClockContext.jsx, TabataTimer.jsx,
// DynamicIntervalsTimer.jsx) are deliberately untouched. ClockContext
// already holds a screen wake lock for the whole time `isRunning` is
// true, so an exercise-launched clock inherits it — no new one.
//
// Inline styles only — the app ships no CSS framework.

const ORANGE = '#FF6F20';
const SANS = "'Rubik', system-ui, sans-serif";

const CHIP_BG = '#FDEDE3';
const CHIP_INK = '#993C1D';

// ── Field reading ────────────────────────────────────────────────────

// A time field counts as "present" only when it parses to a positive
// number. 0, '', null and '0' all mean the coach never prescribed it.
function posInt(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

// tabata_data is stored as TEXT and needs JSON.parse with a try/catch.
function parseTabata(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function isTabataMode(exercise) {
  const m = exercise?.mode;
  if (m == null) return false;
  const s = String(m).trim().toLowerCase();
  return s === 'טבטה' || s === 'tabata';
}

// ── The mapping ──────────────────────────────────────────────────────
// Returns null when the exercise carries no time value at all — a
// reps-only row gets NO chip. Never returns a "disabled" descriptor;
// absent means absent.
//
// `mode === tabata` is tested FIRST: it is an explicit declaration by
// the coach and tabata_data is the authoritative source, so a stray
// flat work_time column must not outrank it.
export function resolveExerciseClock(exercise) {
  if (!exercise) return null;

  if (isTabataMode(exercise)) {
    const td = parseTabata(exercise.tabata_data) || {};
    const cs = (td.clock_settings && typeof td.clock_settings === 'object') ? td.clock_settings : {};
    const work = posInt(cs.work_seconds) ?? posInt(td.work_time) ?? posInt(exercise.work_time);
    const rest = posInt(cs.rest_seconds) ?? posInt(td.rest_time) ?? posInt(exercise.rest_time);
    const rounds = posInt(cs.rounds) ?? posInt(td.rounds) ?? posInt(exercise.rounds);
    // Without a work time there is nothing to run — no chip.
    if (work) {
      return {
        kind: 'tabata',
        label: 'טבטה',
        workSeconds: work,
        restSeconds: rest ?? 0,
        rounds: rounds ?? 1,
        sets: posInt(cs.sets) ?? 1,
        restBetweenSets: posInt(cs.rest_between_sets) ?? 0,
        hasDuration: true,
      };
    }
  }

  const hold = posInt(exercise.static_hold_time) ?? posInt(exercise.static_hold);
  const work = posInt(exercise.work_time);
  const rest = posInt(exercise.rest_time);
  const rounds = posInt(exercise.rounds);

  // static_hold_time → countdown for exactly that many seconds.
  if (hold) {
    return { kind: 'countdown', label: `${hold} שניות`, seconds: hold, hasDuration: true };
  }

  if (work && !rest) {
    return { kind: 'countdown', label: `${work} שניות`, seconds: work, hasDuration: true };
  }

  if (work && rest) {
    return {
      kind: 'intervals',
      label: 'אינטרוולים',
      workSeconds: work,
      restSeconds: rest,
      rounds: rounds ?? 1,
      sets: 1,
      restBetweenSets: 0,
      hasDuration: true,
    };
  }

  // Rounds prescribed but no time anywhere → count up instead.
  if (rounds) {
    return { kind: 'stopwatch', label: 'סטופר', hasDuration: false };
  }

  // Reps only. Nothing to time.
  return null;
}

// ── The chip ─────────────────────────────────────────────────────────
// Pill, at the end of the row, inset from the left edge — nothing in
// this design sits flush against it.
export function ExerciseClockChip({ spec, onLaunch, style }) {
  if (!spec) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onLaunch && onLaunch(); }}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={`הפעל שעון · ${spec.label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        flexShrink: 0,
        background: CHIP_BG,
        color: CHIP_INK,
        border: 'none',
        borderRadius: 999,
        padding: '5px 11px',
        fontFamily: SANS,
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.4,
        boxShadow: '0 2px 5px rgba(255,111,32,0.18)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <Play size={12} fill={CHIP_INK} color={CHIP_INK} style={{ flexShrink: 0 }} />
      <span>{spec.label}</span>
    </button>
  );
}

// ── "another clock is running" confirmation ──────────────────────────
// Portalled so the card's overflow:hidden can't clip it. Backdrop does
// NOT close it — same rule the app's dialogs follow.
export function ClockSwapPrompt({ open, onConfirm, onCancel }) {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, zIndex: 12100,
        background: 'rgba(20,14,8,0.42)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 320,
          background: '#FFFFFF',
          borderRadius: 16,
          padding: 18,
          fontFamily: SANS,
          boxShadow: '0 12px 32px rgba(0,0,0,0.22)',
        }}
      >
        <div style={{
          fontSize: 16, fontWeight: 600, color: '#1a1a1a',
          lineHeight: 1.5, marginBottom: 16, textAlign: 'right',
        }}>
          שעון אחר פועל. להחליף?
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCancel && onCancel(); }}
            style={{
              flex: 1, padding: '12px 0', fontSize: 15, fontWeight: 600,
              fontFamily: SANS, background: '#FFFFFF', color: '#8a8177',
              border: '1px solid #F0E4D0', borderRadius: 12, cursor: 'pointer',
            }}
          >לבטל</button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onConfirm && onConfirm(); }}
            style={{
              flex: 2, padding: '12px 0', fontSize: 15, fontWeight: 600,
              fontFamily: SANS, background: ORANGE, color: '#FFFFFF',
              border: 'none', borderRadius: 12, cursor: 'pointer',
            }}
          >להחליף</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── The running block ────────────────────────────────────────────────
// Replaces the wheel area while a clock this exercise launched is
// live. Reads straight off ClockContext state — it owns no engine.
export function InlineExerciseClock({
  spec, clock, setNumber, totalSets, onStop, onTogglePause,
}) {
  const display = clock?.display || 0;
  const total = clock?.totalDuration || 0;
  const running = !!clock?.isRunning;

  // Countdown-like modes show what is LEFT; the stopwatch counts up.
  const bigSeconds = spec?.kind === 'stopwatch'
    ? Math.floor(display / 1000)
    : Math.max(0, Math.ceil(display / 1000));

  // No honest progress exists for a stopwatch — there is no target, so
  // the track is omitted rather than faked.
  const showTrack = spec?.hasDuration && total > 0;
  const pct = showTrack
    ? Math.max(0, Math.min(100, ((total - display) / total) * 100))
    : 0;

  const phaseWord = (() => {
    switch (clock?.phase) {
      case 'rest': return 'מנוחה';
      case 'set_rest': return 'מנוחה בין סטים';
      case 'work': return spec?.kind === 'countdown' ? null : 'עבודה';
      default: return null;
    }
  })();

  return (
    <div
      dir="rtl"
      onClick={(e) => e.stopPropagation()}
      style={{
        background: '#FBF6EE',
        borderRadius: 14,
        boxShadow: 'inset 2px 2px 6px rgba(197,175,145,0.4), inset -1px -1px 4px rgba(255,255,255,0.9)',
        padding: '12px 14px 14px',
        marginBottom: 10,
      }}
    >
      {/* line above — which set this clock belongs to */}
      <div style={{
        fontFamily: SANS, fontSize: 14, fontWeight: 500,
        color: '#8A7E6D', textAlign: 'right', lineHeight: 1.4,
      }}>
        סט {setNumber} מתוך {totalSets}
        {phaseWord && <span style={{ color: ORANGE, fontWeight: 600 }}>{` · ${phaseWord}`}</span>}
        {clock?.roundInfo ? <span>{` · ${clock.roundInfo}`}</span> : null}
      </div>

      {/* the seconds */}
      <div style={{
        fontFamily: SANS, fontSize: 56, fontWeight: 600,
        color: '#1a1a1a', textAlign: 'center',
        lineHeight: 1.1, margin: '4px 0 10px',
        fontVariantNumeric: 'tabular-nums',
      }}>{bigSeconds}</div>

      {showTrack && (
        <div style={{
          height: 6, borderRadius: 999,
          background: '#F3EADC',
          boxShadow: 'inset 1px 1px 3px rgba(184,160,128,0.5)',
          overflow: 'hidden',
          marginBottom: 12,
        }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: ORANGE, borderRadius: 999,
            boxShadow: '0 1px 3px rgba(255,111,32,0.5)',
            transition: 'width 0.15s linear',
          }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: showTrack ? 0 : 4 }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onStop && onStop(); }}
          style={{
            flex: 1, padding: '11px 0', fontSize: 15, fontWeight: 600,
            fontFamily: SANS, background: '#FFFFFF', color: '#8a8177',
            border: '1px solid #E4D8C4', borderRadius: 12, cursor: 'pointer',
          }}
        >עצור</button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onTogglePause && onTogglePause(); }}
          style={{
            flex: 2, padding: '11px 0', fontSize: 15, fontWeight: 600,
            fontFamily: SANS, background: ORANGE, color: '#FFFFFF',
            border: 'none', borderRadius: 12, cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(255,111,32,0.30)',
          }}
        >{running ? 'השהה' : 'המשך'}</button>
      </div>
    </div>
  );
}

// ── Confirmation strip, above the wheel ──────────────────────────────
export function ClockResultStrip({ seconds }) {
  if (seconds == null) return null;
  return (
    <div
      dir="rtl"
      style={{
        background: '#EAF3DE',
        color: '#173404',
        fontFamily: SANS,
        fontSize: 14,
        fontWeight: 600,
        borderRadius: 10,
        padding: '9px 12px',
        marginBottom: 10,
        textAlign: 'right',
        lineHeight: 1.4,
      }}
    >השעון סיים · {seconds} שניות</div>
  );
}

// ── Which card holds the shared engine ───────────────────────────────
// `activeClock` alone cannot answer this. Every starter in ClockContext
// calls stop() and then sets activeClock in the SAME batch, so a card
// that gets pre-empted never observes the null in between and would
// keep believing it still owns the run. A monotonic token, stamped at
// each start, gives ownership an identity that survives the batch.
let engineRunSeq = 0;
const engineHolder = { token: null };

// ── The controller hook ──────────────────────────────────────────────
// Owns: which exercise holds the engine, the swap confirmation, the
// once-per-run completion write-back, and the elapsed read.
//
// Elapsed is read in the click handler BEFORE stop() is called, using
// the shared-engine formula:
//     stopwatch      → display
//     timer / tabata → totalDuration - display
// `totalDuration` describes the CURRENT phase, which for a countdown
// (prepare 0, one phase) is the whole run. For interval/tabata runs the
// same formula gives the current WORK phase, which is what a per-set
// seconds wheel wants; if the trainee stops during a rest phase we fall
// back to the last work phase that was measured, rather than reporting
// rest seconds as work.
export function useExerciseClock({ spec, clock, onElapsed, onStart }) {
  const [owned, setOwned] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [resultSeconds, setResultSeconds] = useState(null);

  // Guards a single write-back per run.
  const settledRef = useRef(false);
  // Last measured elapsed inside a WORK phase, in ms.
  const lastWorkElapsedRef = useRef(0);
  const ownedRef = useRef(false);
  ownedRef.current = owned;
  // This card's claim on the shared engine.
  const runTokenRef = useRef(null);

  const display = clock?.display || 0;
  const totalDuration = clock?.totalDuration || 0;
  const phase = clock?.phase;
  const activeClock = clock?.activeClock;

  // Keep the last work-phase elapsed fresh while we own the engine. The
  // token check matters: once another card has taken over, these ticks
  // describe ITS clock and must not overwrite our measurement.
  useEffect(() => {
    if (!owned) return;
    if (engineHolder.token !== runTokenRef.current) return;
    if (spec?.kind === 'stopwatch') { lastWorkElapsedRef.current = display; return; }
    if (phase === 'work' && totalDuration > 0) {
      lastWorkElapsedRef.current = Math.max(0, totalDuration - display);
    }
  }, [owned, spec?.kind, phase, display, totalDuration]);

  // Read elapsed NOW, from live context state. Must be called before stop().
  const readElapsedSeconds = useCallback(() => {
    if (spec?.kind === 'stopwatch') return Math.max(0, Math.round(display / 1000));
    if (phase === 'work' && totalDuration > 0) {
      return Math.max(0, Math.round((totalDuration - display) / 1000));
    }
    // prepare / rest / set_rest / done — use the last measured work phase.
    return Math.max(0, Math.round(lastWorkElapsedRef.current / 1000));
  }, [spec?.kind, display, phase, totalDuration]);

  const settle = useCallback((seconds) => {
    if (settledRef.current) return;
    settledRef.current = true;
    setResultSeconds(seconds);
    if (typeof onElapsed === 'function') onElapsed(seconds);
  }, [onElapsed]);

  const startNow = useCallback(() => {
    if (!spec || !clock) return;
    settledRef.current = false;
    lastWorkElapsedRef.current = 0;
    setResultSeconds(null);
    setOwned(true);
    // Claim the engine. Any card holding an older token has just lost it.
    engineRunSeq += 1;
    runTokenRef.current = engineRunSeq;
    engineHolder.token = engineRunSeq;
    // Fires only on an actual start — never when the swap confirmation
    // is merely shown, so cancelling leaves the card exactly as it was.
    if (typeof onStart === 'function') onStart();
    // Prepare is ALWAYS 0 from an exercise.
    if (spec.kind === 'countdown') {
      clock.startTimer(spec.seconds * 1000, 0);
    } else if (spec.kind === 'stopwatch') {
      clock.startStopwatch();
    } else {
      clock.startTabata({
        work_seconds: spec.workSeconds,
        rest_seconds: spec.restSeconds,
        rounds: spec.rounds,
        sets: spec.sets,
        rest_between_sets: spec.restBetweenSets,
        prepare_seconds: 0,
      });
    }
  }, [spec, clock, onStart]);

  // Chip tap. Never silently replaces a running clock, and never starts
  // a second engine — the confirmation is the only path through.
  const launch = useCallback(() => {
    if (!spec || !clock) return;
    if (clock.activeClock != null) { setSwapOpen(true); return; }
    startNow();
  }, [spec, clock, startNow]);

  const confirmSwap = useCallback(() => { setSwapOpen(false); startNow(); }, [startNow]);
  const cancelSwap = useCallback(() => setSwapOpen(false), []);

  // Stop button — read elapsed first, then stop.
  const releaseClaim = useCallback(() => {
    if (engineHolder.token === runTokenRef.current) engineHolder.token = null;
    runTokenRef.current = null;
    setOwned(false);
  }, []);

  const stopNow = useCallback(() => {
    const seconds = readElapsedSeconds();
    settle(seconds);
    releaseClaim();
    clock?.stop && clock.stop();
  }, [readElapsedSeconds, settle, releaseClaim, clock]);

  const togglePause = useCallback(() => {
    if (!clock) return;
    if (clock.isRunning) clock.pause();
    else clock.resume();
  }, [clock]);

  // Natural completion. `phase === 'done'` is the only signal the shared
  // engine emits; settledRef makes it fire exactly once per run so the
  // wheel can never be double-written.
  useEffect(() => {
    if (!owned) return;
    if (engineHolder.token !== runTokenRef.current) return;   // not ours any more
    if (phase !== 'done') return;
    settle(readElapsedSeconds());
    releaseClaim();
    clock?.stop && clock.stop();
  }, [owned, phase, settle, readElapsedSeconds, releaseClaim, clock]);

  // Pre-empted — another card swapped us out, or the clocks page / the
  // footer bar's X stopped the engine underneath us. Release the claim
  // and keep what we had measured; a partial time is a truer record
  // than silently dropping it, and the trainee can still move the wheel.
  //
  // `display` is in the deps on purpose: the token lives outside React,
  // so this has to re-evaluate on the engine's own ticks to notice a
  // handover that happened inside a single batch.
  useEffect(() => {
    if (!owned) return;
    const takenOver = engineHolder.token !== runTokenRef.current;
    if (!takenOver && activeClock != null) return;
    // On a takeover the live display already belongs to the new clock,
    // so the only trustworthy number is what we banked before losing it.
    settle(takenOver
      ? Math.max(0, Math.round(lastWorkElapsedRef.current / 1000))
      : readElapsedSeconds());
    releaseClaim();
  }, [owned, activeClock, display, phase, settle, readElapsedSeconds, releaseClaim]);

  // Releasing the card mid-run must not leave the engine orphaned.
  useEffect(() => () => {
    if (ownedRef.current && engineHolder.token === runTokenRef.current) {
      engineHolder.token = null;
      try { clock?.stop && clock.stop(); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    owned, swapOpen, resultSeconds,
    launch, confirmSwap, cancelSwap, stopNow, togglePause,
    clearResult: () => setResultSeconds(null),
  };
}
