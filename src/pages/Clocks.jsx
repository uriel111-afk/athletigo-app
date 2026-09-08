import React, { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Timer, Clock, Zap, Play, Pause, RotateCcw, Flag, ListOrdered, ChevronRight, Music, Wind } from "lucide-react";
import MetronomeMode from "@/components/MetronomeMode";
import BreathingMode, { hasLiveBreathingSession } from "@/components/BreathingMode";
import { useClock } from "@/contexts/ClockContext";
import { useActiveTimer } from "@/contexts/ActiveTimerContext";
import { AuthContext } from "@/lib/AuthContext";
import ScrollPickerPopup, { SECONDS_OPTIONS, MINUTES_OPTIONS, PREP_OPTIONS } from "@/components/ScrollPickerPopup";
// TimerView and the clocks-tab furniture moved out so the SAME clock
// can also be raised as a global overlay from the plan screen. This
// tab renders the identical component.
import TimerView from '@/components/clocks/TimerView';
import {
  BRAND, FN, FL, C1, C2, C3, BRD, BG2,
  fmt, fmtMMSS, fmtStopwatch, HoldButton,
  SOUND_START, SOUND_RESET, SOUND_TICK, SOUND_ALERT, SOUND_TRIPLE_BELL,
  unlockAudio,
} from '@/components/clocks/clockUi';
import { formatDurationMs, formatStopwatchMs, LTR_TIME } from '@/lib/duration';

const MinimizeBtn = ({ onClick }) => (
  <button onClick={onClick} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
      <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
    </svg>
  </button>
);

/* ═══ STOPWATCH ═══ */
function StopwatchView({ onMinimize }) {
  const navigate = useNavigate();
  const { startStopwatch, pause, resume, reset, lapStopwatch, display, isRunning, activeClock, laps } = useClock();
  const { setLiveTimer: setLiveTimerAT, setIsMinimized: setIsMinimizedAT, isMinimized: isMinimizedAT } = useActiveTimer();
  // Gate the full-screen overlay on the *bar* minimize flag so that
  // TimerFooterBar.handleExpand (which flips this flag back to false)
  // returns the user to the running overlay — not the setup screen.
  const active = activeClock === 'stopwatch' && !isMinimizedAT;

  // Mirror minimizeTimer (Clocks.jsx) state writes EXACTLY so the bar
  // gets the same snapshot the proven minimize button writes. Only the
  // navigation destination differs — back goes to /clocks, the original
  // minimize button goes to the role home.
  const handleClockBack = (e) => {
    e.stopPropagation();
    setLiveTimerAT({ type: 'stopwatch', display: fmtStopwatch(display), phase: 'סטופר', info: null, paused: !isRunning });
    setIsMinimizedAT(true);
    navigate('/clocks');
  };

  if (active) {
    return (
      <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center" dir="rtl"
        style={{ backgroundColor: BRAND, padding: '20px 16px 100px', gap: 16, position: 'fixed' }}>
        <button
          onClick={handleClockBack}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          aria-label="חזרה"
          style={{
            position: 'absolute', top: 16, left: 16, zIndex: 5,
            width: 44, height: 44, borderRadius: 12,
            background: '#FFFFFF', border: '1px solid #F0E4D0',
            boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <ChevronRight size={24} color="#1a1a1a" />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MinimizeBtn onClick={onMinimize} />
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: FN, color: 'rgba(255,255,255,0.7)', letterSpacing: 2, textTransform: 'uppercase' }}>STOPWATCH</div>
        </div>
        <div className="tabular-nums leading-none" style={{ fontSize: 'clamp(52px, 15vw, 96px)', fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontFamily: FN, color: '#FFF', letterSpacing: -2, lineHeight: 1 }}>{fmtStopwatch(display)}</div>
        {laps.length > 0 && (
          <div className="w-full rounded-xl p-3 max-h-28 overflow-y-auto" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
            {laps.map((l, i) => (
              <div key={i} className="flex justify-between py-1">
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: FL, color: 'rgba(255,255,255,0.7)' }}>הקפה {i + 1}</span>
                <span className="tabular-nums" style={{ fontSize: 16, fontWeight: 700, fontFamily: FN, color: '#FFF' }}>{fmtStopwatch(l)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex w-full" style={{ gap: 10 }}>
          <button onClick={() => { SOUND_RESET(); reset(); }} className="flex items-center justify-center active:scale-90 transition-transform"
            style={{ flex: 1, height: 56, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', fontSize: 16, fontWeight: 700, fontFamily: FL, color: '#FFF', border: 'none' }}>
            <RotateCcw className="w-5 h-5 ml-1.5" />אפס
          </button>
          {isRunning && (
            <button onClick={lapStopwatch} className="flex items-center justify-center active:scale-90 transition-transform"
              style={{ flex: 1, height: 56, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', fontSize: 16, fontWeight: 700, fontFamily: FL, color: '#FFF', border: 'none' }}>
              <Flag className="w-5 h-5 ml-1.5" />הקפה
            </button>
          )}
          {isRunning ? (
            <button onClick={() => { pause(); }} className="flex items-center justify-center active:scale-95 transition-transform"
              style={{ flex: 2, height: 56, borderRadius: 12, backgroundColor: '#FFF', fontSize: 20, fontWeight: 700, fontFamily: FL, color: BRAND }}>
              <Pause className="w-6 h-6 ml-2" />השהה
            </button>
          ) : (
            <button onClick={() => { SOUND_START(); resume(); }} className="flex items-center justify-center active:scale-95 transition-transform"
              style={{ flex: 2, height: 56, borderRadius: 12, backgroundColor: '#FFF', fontSize: 20, fontWeight: 700, fontFamily: FL, color: BRAND }}>
              <Play className="w-6 h-6 ml-2" />המשך
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div dir="rtl" style={{ padding: '16px 16px 100px' }} className="flex flex-col items-center gap-5">
      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: FN, color: C3, letterSpacing: 2, textTransform: 'uppercase', marginTop: 16 }}>STOPWATCH</div>
      <div className="text-center tabular-nums leading-none" style={{ fontSize: 80, fontWeight: 900, fontFamily: FN, color: '#D1D5DB' }}>00:00.00</div>
      <button onClick={() => { unlockAudio(); SOUND_START(); startStopwatch(); }} className="w-full flex items-center justify-center active:scale-[0.98] transition-transform"
        style={{ height: 56, borderRadius: 12, backgroundColor: BRAND, fontSize: 20, fontWeight: 700, fontFamily: FL, color: '#FFF' }}>
        <Play className="w-6 h-6 ml-2" />התחל
      </button>
    </div>
  );
}

/* ═══ TIMER ═══ */
/* ═══ CLOCKS PAGE ═══ */
const MODES = [
  { id: 'tabata', label: 'טבטה', icon: Zap },
  { id: 'dynamic', label: 'אינטרוולים', icon: ListOrdered },
  { id: 'metronome', label: 'מטרונום', icon: Music },
  { id: 'breathing', label: 'נשימות', icon: Wind },
  { id: 'timer', label: 'טיימר', icon: Timer },
  { id: 'stopwatch', label: 'סטופר', icon: Clock },
];

export default function Clocks() {
  const navigate = useNavigate();
  const location = useLocation();
  // Default tab comes from:
  //   1. navigation state (set by TimerFooterBar expand button)
  //   2. currently-active clock in ClockContext (after refresh)
  //   3. fallback 'tabata'
  const [activeTab, setActiveTab] = useState(() => {
    const fromNav = location.state?.openTimer;
    if (fromNav === 'tabata' || fromNav === 'timer' || fromNav === 'stopwatch' || fromNav === 'dynamic' || fromNav === 'metronome' || fromNav === 'breathing') return fromNav;
    // A breathing exercise that was mid-flight when the app was killed/reloaded
    // → land back inside it (BreathingMode rehydrates its own running state).
    if (hasLiveBreathingSession()) return 'breathing';
    return 'tabata';
  });
  const clock = useClock();
  const { setLiveTimer, setShowTabata, setShowDynamic, setIsMinimized, activeTimers, showTabata, showDynamic } = useActiveTimer();
  const { user } = React.useContext(AuthContext);
  const isCoach = user?.role === 'coach' || user?.is_coach === true || user?.role === 'admin';

  const [metronomeRunning, setMetronomeRunning] = useState(false);
  // Breathing state is declared HERE (before keepAwake/runningCount read
  // it) — moving it below caused a TDZ crash on Clocks entry ("Cannot
  // access 'breathingRunning' before initialization").
  const [breathingRunning, setBreathingRunning] = useState(false);
  const [breathingInfo, setBreathingInfo] = useState({ phase: '', roundsLeft: '' });
  const [breathStopSignal, setBreathStopSignal] = useState(0);
  const timerOrStopwatchRunning = clock?.isRunning && (clock?.activeClock === 'timer' || clock?.activeClock === 'stopwatch');
  const anyRunning = timerOrStopwatchRunning;
  // Metronome + breathing share the timers' screen wake-lock while running.
  const keepAwake = anyRunning || metronomeRunning || breathingRunning || showTabata || showDynamic;
  const lastBackPress = useRef(0);

  // Two-state selection: focused === null → mode grid (STATE A); a mode
  // id → that mode focused (STATE B). Default is the grid unless we
  // arrived via a deep-link / with a running clock.
  const [focused, setFocused] = useState(() => {
    const fromNav = location.state?.openTimer;
    const VALID = ['tabata', 'dynamic', 'metronome', 'breathing', 'timer', 'stopwatch'];
    // Explicit deep-link (dashboard/footer/exercise shortcuts) → land
    // INSIDE that mode immediately, skipping the STATE A grid.
    if (VALID.includes(fromNav)) return fromNav;
    // No explicit mode, but an engine is ALREADY live (e.g. a shortcut
    // that calls startTabata()/startTimer() then navigates here with no
    // openTimer) → focus that running mode instead of the bare grid.
    if (showTabata) return 'tabata';
    if (showDynamic) return 'dynamic';
    if (clock?.activeClock === 'timer' || clock?.activeClock === 'stopwatch') return clock.activeClock;
    // A live breathing session (survived an app kill/reload) → focus it so
    // the user returns straight to the running exercise, not the grid.
    if (hasLiveBreathingSession()) return 'breathing';
    return null;
  });
  const focus = useCallback((id) => { setFocused(id); setActiveTab(id); }, []);
  const [metronomeBpm, setMetronomeBpm] = useState(120);
  const [metroStopSignal, setMetroStopSignal] = useState(0);

  // Running clocks (for the leave-confirm; timer+stopwatch share one
  // engine so at most one of them). Metronome + the two overlays add up.
  const runningCount =
    (clock?.isRunning && (clock?.activeClock === 'timer' || clock?.activeClock === 'stopwatch') ? 1 : 0) +
    (metronomeRunning ? 1 : 0) + (breathingRunning ? 1 : 0) + (showTabata ? 1 : 0) + (showDynamic ? 1 : 0);

  const leaveClocks = useCallback(() => {
    if (runningCount > 1 && !window.confirm('לעזוב? כל השעונים ייעצרו')) return;
    try { clock?.stop && clock.stop(); } catch {}   // timer / stopwatch
    setMetroStopSignal((x) => x + 1);               // metronome
    setBreathStopSignal((x) => x + 1);              // breathing
    navigate(isCoach ? '/dashboard' : '/trainee-home');
  }, [runningCount, navigate, isCoach, clock]);

  // Apply nav-state tab selection once, then scrub state so reloading
  // the page doesn't re-apply.
  useEffect(() => {
    if (location.state?.openTimer) {
      const t = location.state.openTimer;
      if (t === 'tabata' || t === 'timer' || t === 'stopwatch' || t === 'dynamic' || t === 'metronome' || t === 'breathing') { setActiveTab(t); setFocused(t); }
      try { window.history.replaceState({}, ''); } catch {}
    }
    // Fallback: no nav state, but an engine/overlay is already live —
    // sync activeTab so we land inside it (the focused initializer above
    // already picked the mode; activeTab defaults to 'tabata' so the
    // dynamic/timer/stopwatch cases need this to match).
    else if (showTabata) { setActiveTab('tabata'); setFocused('tabata'); }
    else if (showDynamic) { setActiveTab('dynamic'); setFocused('dynamic'); }
    else if (clock?.activeClock === 'timer' || clock?.activeClock === 'stopwatch') {
      setActiveTab(clock.activeClock); setFocused(clock.activeClock);
    }
    else if (hasLiveBreathingSession()) { setActiveTab('breathing'); setFocused('breathing'); }
  }, []);

  // Minimize — NEVER stops intervals, navigates to role dashboard,
  // and flips isMinimized so the footer bar appears.
  const minimizeTimer = useCallback(() => {
    if (clock?.activeClock === 'timer') {
      setLiveTimer({ type: 'timer', display: fmt(clock.display), phase: 'טיימר', info: null, paused: !clock.isRunning });
    } else if (clock?.activeClock === 'stopwatch') {
      setLiveTimer({ type: 'stopwatch', display: fmtStopwatch(clock.display), phase: 'סטופר', info: null, paused: !clock.isRunning });
    }
    setIsMinimized(true);
    navigate(isCoach ? '/dashboard' : '/trainee-home', { replace: true });
  }, [clock, setLiveTimer, setIsMinimized, navigate, isCoach]);

  // Entering the Clocks page = bar should disappear. If the user leaves
  // while ANY timer is still active (clock engine OR tabata engine),
  // re-minimize so the bar reappears on the next page.
  React.useEffect(() => {
    setIsMinimized(false);
    return () => {
      const hasAny = !!clock?.activeClock || (activeTimers?.length || 0) > 0;
      if (hasAny) setIsMinimized(true);
    };
  }, []);

  // Update floating widget every tick (timer/stopwatch from ClockContext)
  useEffect(() => {
    setLiveTimer(prev => {
      if (!prev) return prev;
      if (prev.type === 'timer' && clock?.isRunning) return { ...prev, display: fmt(clock.display) };
      if (prev.type === 'stopwatch' && clock?.isRunning) return { ...prev, display: fmtStopwatch(clock.display) };
      return prev;
    });
  }, [clock?.display]);

  // When returning to clocks page — hide floating widget (only if nothing running)
  // Do NOT clear liveTimer on mount — it must persist after minimize

  // Phone back-button: when ANY timer is active, intercept it so a
  // single back press does nothing (just records timestamp), and a
  // SECOND press within 500ms minimizes and navigates to dashboard.
  // This prevents accidental "back kills my running tabata" while
  // still letting the user escape with two quick taps.
  //
  // We register exactly ONE pushState as the intercept anchor — no
  // continuous re-pushing on every render that polluted history in
  // the previous version. The handler re-pushes only after the first
  // tap so the second tap has something to consume.
  useEffect(() => {
    // Double-tap protection only when a timer is actually RUNNING. A
    // visible tabata overlay sitting on the settings screen is handled
    // inside TabataTimer.jsx (single-tap closes; cfg is auto-saved),
    // so we deliberately exclude !!showTabata from the gate here.
    const hasActiveTimer = (activeTimers?.length || 0) > 0 || !!clock?.activeClock;
    if (!hasActiveTimer) return;

    let lastBackTime = 0;
    window.history.pushState(null, '', window.location.href);

    const handlePopState = () => {
      const now = Date.now();
      if (now - lastBackTime < 500) {
        // Double tap — minimize and navigate
        lastBackTime = 0;
        if (showTabata) setShowTabata(false);
        setIsMinimized(true);
        navigate(isCoach ? '/dashboard' : '/trainee-home', { replace: true });
      } else {
        // First tap — intercept by re-pushing /clocks
        lastBackTime = now;
        window.history.pushState(null, '', window.location.href);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeTimers?.length, clock?.activeClock, showTabata, navigate, isCoach, setIsMinimized, setShowTabata]);

  // Wake lock
  const globalWakeLockRef = useRef(null);
  useEffect(() => {
    const acquire = async () => { try { if ('wakeLock' in navigator && !globalWakeLockRef.current) globalWakeLockRef.current = await navigator.wakeLock.request('screen'); } catch {} };
    if (keepAwake) acquire();
    else if (globalWakeLockRef.current) { globalWakeLockRef.current.release().catch(() => {}); globalWakeLockRef.current = null; }
  }, [keepAwake]);
  useEffect(() => {
    const onVis = async () => { if (document.visibilityState === 'visible' && keepAwake) { try { if ('wakeLock' in navigator) globalWakeLockRef.current = await navigator.wakeLock.request('screen'); } catch {} } };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [keepAwake]);
  useEffect(() => () => { globalWakeLockRef.current?.release().catch(() => {}); globalWakeLockRef.current = null; }, []);

  const isModeRunning = (id) => {
    if (id === 'timer' || id === 'stopwatch') return !!(clock?.isRunning && clock?.activeClock === id);
    if (id === 'metronome') return metronomeRunning;
    if (id === 'breathing') return breathingRunning;
    if (id === 'tabata') return showTabata;
    if (id === 'dynamic') return showDynamic;
    return false;
  };
  // Floating bars for running clocks that AREN'T focused. The
  // timer/stopwatch engine is single-instance, so at most one of them;
  // the metronome runs independently. (Tabata/interval keep their
  // existing fullscreen overlay + global minimized bar.)
  const bars = [];
  if (clock?.isRunning && (clock?.activeClock === 'timer' || clock?.activeClock === 'stopwatch') && focused !== clock.activeClock) {
    const isT = clock.activeClock === 'timer';
    bars.push({ id: clock.activeClock, icon: isT ? Timer : Clock, name: isT ? 'טיימר' : 'סטופר',
      value: isT ? fmtMMSS(clock.display) : fmtStopwatch(clock.display), onStop: () => clock.stop && clock.stop() });
  }
  if (metronomeRunning && focused !== 'metronome') {
    bars.push({ id: 'metronome', icon: Music, name: 'מטרונום', value: `${metronomeBpm} BPM`, onStop: () => setMetroStopSignal((x) => x + 1) });
  }
  if (breathingRunning && focused !== 'breathing') {
    bars.push({ id: 'breathing', icon: Wind, name: 'נשימות',
      value: `${breathingInfo.phase || ''}${breathingInfo.roundsLeft !== '' ? ` · ${breathingInfo.roundsLeft} סבבים` : ''}`.trim(),
      onStop: () => setBreathStopSignal((x) => x + 1) });
  }

  return (
    <div dir="rtl" style={{
      height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      background: '#FFF9F0', touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none',
      boxSizing: 'border-box', overflowX: 'hidden',
      // PART 1 — Clocks renders outside the Layout shell (isClocks → the
      // page-container gives it 0 padding), so it needs its own insets.
      paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
      paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
    }}>
      {/* STATE A — mode grid (nothing focused) */}
      {focused === null && (
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '8px 14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={leaveClocks} aria-label="חזרה" style={{ width: 44, height: 44, borderRadius: 12, background: '#fff', border: '1px solid #F0E4D0', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <ChevronRight size={24} color="#1a1a1a" />
            </button>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#1a1a1a', fontFamily: FN }}>שעונים</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {MODES.map(m => {
              const Icon = m.icon; const run = isModeRunning(m.id);
              return (
                <button key={m.id} onClick={() => focus(m.id)} style={{ minHeight: 118, borderRadius: 18, border: `1px solid ${run ? '#FF6F20' : '#F0E4D0'}`, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', position: 'relative' }}>
                  <Icon style={{ width: 40, height: 40, color: '#FF6F20' }} />
                  <span style={{ fontSize: 17, fontWeight: 800, color: '#1a1a1a' }}>{m.label}</span>
                  {run && <span style={{ position: 'absolute', top: 10, insetInlineEnd: 12, fontSize: 11, fontWeight: 800, color: '#16a34a' }}>● פועל</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* STATE B — compact top row (a mode is focused) */}
      {focused !== null && (
        <div style={{ backgroundColor: '#fff', borderBottom: `0.5px solid ${BRD}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
          <button onClick={() => setFocused(null)} aria-label="חזרה לרשימה" style={{ width: 40, height: 40, borderRadius: 10, background: '#FFF9F0', border: `1px solid ${BRD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <ChevronRight size={22} color="#1a1a1a" />
          </button>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#1a1a1a', fontFamily: FN, whiteSpace: 'nowrap' }}>{MODES.find(m => m.id === focused)?.label}</div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {MODES.filter(m => m.id !== focused).map(m => {
              const Icon = m.icon; const run = isModeRunning(m.id);
              return (
                <button key={m.id} onClick={() => focus(m.id)} aria-label={m.label} style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${run ? '#FF6F20' : BRD}`, background: run ? '#FFF0E5' : '#FFF9F0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Icon className="w-4 h-4" style={{ color: run ? '#FF6F20' : '#8A6A52' }} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Floating bars — running clocks that aren't focused */}
      {focused !== null && bars.length > 0 && (
        <div style={{ padding: '6px 12px 0', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          {bars.map(b => {
            const Icon = b.icon;
            return (
              <div key={b.id} onClick={() => focus(b.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FFF4ED', border: '1px solid #F0D9C6', borderRadius: 12, padding: '8px 10px', cursor: 'pointer' }}>
                <Icon className="w-4 h-4" style={{ color: '#FF6F20', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: '#5C3A28' }}>{b.name}</span>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: '#1a1a1a', fontFamily: FN }}>{b.value}</span>
                <button onClick={(e) => { e.stopPropagation(); b.onStop(); }} aria-label="עצור" style={{ border: 'none', background: '#fff', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 800, color: '#dc2626', cursor: 'pointer' }}>עצור</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Content — ALWAYS mounted so running engines survive focus
          switches; hidden entirely while the grid (STATE A) is showing. */}
      <div style={{ flex: 1, overflow: 'hidden', display: focused === null ? 'none' : 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: activeTab === 'tabata' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, background: '#FF6F20', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <div style={{ fontSize: '60px' }}>⏱</div>
          <button onPointerDown={() => setShowTabata(true)} style={{ background: 'white', color: '#FF6F20', border: 'none', borderRadius: '12px', padding: '16px 40px', fontSize: '22px', fontWeight: '900', cursor: 'pointer', touchAction: 'manipulation' }}>▶ טבטה</button>
        </div>
        <div style={{ display: activeTab === 'dynamic' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, background: '#FFF9F0', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '24px' }}>
          <div style={{ fontSize: '60px' }}>🔥</div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#1a1a1a', textAlign: 'center' }}>אינטרוולים דינאמיים</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#888', textAlign: 'center', maxWidth: 320 }}>
            כל סט מקבל זמן עבודה ומנוחה משלו
          </div>
          <button onPointerDown={() => setShowDynamic && setShowDynamic(true)} style={{ background: '#FF6F20', color: 'white', border: 'none', borderRadius: '12px', padding: '16px 40px', fontSize: '22px', fontWeight: '900', cursor: 'pointer', touchAction: 'manipulation', boxShadow: '0 4px 14px rgba(255,111,32,0.3)' }}>▶ אינטרוולים</button>
        </div>
        <div style={{ display: activeTab === 'metronome' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <MetronomeMode active={activeTab === 'metronome'} stopSignal={metroStopSignal}
            onRunningChange={(r, b) => { setMetronomeRunning(r); if (b != null) setMetronomeBpm(b); }} />
        </div>
        <div style={{ display: activeTab === 'breathing' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <BreathingMode active={activeTab === 'breathing'} stopSignal={breathStopSignal}
            onRunningChange={(r, info) => { setBreathingRunning(r); if (info) setBreathingInfo(info); }} />
        </div>
        <div style={{ display: activeTab === 'timer' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <TimerView onMinimize={minimizeTimer} />
        </div>
        <div style={{ display: activeTab === 'stopwatch' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <StopwatchView onMinimize={minimizeTimer} />
        </div>
      </div>
    </div>
  );
}
