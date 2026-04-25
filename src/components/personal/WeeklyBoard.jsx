import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { AuthContext } from '@/lib/AuthContext';
import PersonalLayout from '@/components/personal/PersonalLayout';
import DayColumn from '@/components/personal/DayColumn';
import WeeklySummary from '@/components/personal/WeeklySummary';
import WeekPlanner from '@/components/personal/WeekPlanner';
import { PERSONAL_COLORS, PERSONAL_CARD } from '@/lib/personal/personal-constants';
import {
  fetchWeek, weekStart, weekStartISO, HE_DAY_SHORT,
} from '@/lib/personal/weekly-api';

// Page that owns the week — fetches the data, picks the layout
// (desktop = 7-up grid, mobile = single day swipeable), and hosts the
// summary + planner buttons.
export default function WeeklyBoard() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;

  const [anchor, setAnchor] = useState(() => weekStart(new Date()));
  const [week, setWeek] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPlanner, setShowPlanner] = useState(false);

  // Mobile day pointer — defaults to today if today is in this week,
  // otherwise to the first day of the week.
  const [mobileDow, setMobileDow] = useState(() => new Date().getDay());

  const isMobile = useIsMobile();

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await fetchWeek(userId, userId, anchor);
      setWeek(data);
    } catch (err) {
      console.error('[WeeklyBoard] load error:', err);
      toast.error('שגיאה בטעינת השבוע');
    } finally {
      setLoading(false);
    }
  }, [userId, anchor]);

  useEffect(() => { load(); }, [load]);

  // Reset mobile pointer to today when we land back on the current
  // week, otherwise sit on Sunday.
  useEffect(() => {
    if (!week) return;
    const today = new Date();
    const isCurrentWeek = weekStartISO(today) === week.startISO;
    setMobileDow(isCurrentWeek ? today.getDay() : 0);
  }, [week?.startISO]);

  const prevWeek = () => {
    const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d);
  };
  const nextWeek = () => {
    const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d);
  };
  const goCurrent = () => setAnchor(weekStart(new Date()));

  const isCurrentWeek = useMemo(
    () => weekStartISO(new Date()) === (week?.startISO || ''),
    [week?.startISO]
  );

  const showPlannerButton = useMemo(() => {
    const d = new Date().getDay();
    return d === 5 || d === 6; // Fri/Sat
  }, []);

  return (
    <PersonalLayout title="השבוע שלי">
      {/* Week navigator */}
      <div style={{
        ...PERSONAL_CARD,
        marginBottom: 12, padding: '8px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button onClick={nextWeek} disabled={loading} style={navBtn}>
          <ChevronRight size={18} />
        </button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: PERSONAL_COLORS.textPrimary }}>
            {weekRangeLabel(anchor)}
          </div>
          {!isCurrentWeek && (
            <button onClick={goCurrent} style={{
              border: 'none', background: 'transparent',
              color: PERSONAL_COLORS.primary, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', padding: '2px 8px',
            }}>חזור לשבוע הנוכחי</button>
          )}
        </div>
        <button onClick={prevWeek} disabled={loading} style={navBtn}>
          <ChevronLeft size={18} />
        </button>
      </div>

      {/* Plan-week button — always shown so the user can plan whenever */}
      <button
        onClick={() => setShowPlanner(true)}
        style={{
          width: '100%',
          padding: '12px 16px', borderRadius: 14, border: 'none',
          backgroundColor: showPlannerButton ? PERSONAL_COLORS.primary : '#FFFFFF',
          color: showPlannerButton ? '#FFFFFF' : PERSONAL_COLORS.primary,
          border: showPlannerButton ? 'none' : `1px solid ${PERSONAL_COLORS.primary}`,
          fontSize: 14, fontWeight: 700, cursor: 'pointer',
          marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <CalendarDays size={16} />
        תכנן את השבוע
      </button>

      {loading || !week ? (
        <div style={{ textAlign: 'center', padding: 30 }}>
          <Loader2 size={28} className="animate-spin" style={{ color: PERSONAL_COLORS.primary }} />
        </div>
      ) : isMobile ? (
        <MobileLayout week={week} dow={mobileDow} setDow={setMobileDow} userId={userId} onChanged={load} />
      ) : (
        <DesktopLayout week={week} userId={userId} onChanged={load} />
      )}

      {/* Weekly summary */}
      {week?.summary && (
        <div style={{ marginTop: 16 }}>
          <WeeklySummary summary={week.summary} weekStartISO={week.startISO} />
        </div>
      )}

      {showPlanner && (
        <WeekPlanner
          isOpen={showPlanner}
          onClose={() => { setShowPlanner(false); load(); }}
          userId={userId}
        />
      )}
    </PersonalLayout>
  );
}

// ─── Layouts ─────────────────────────────────────────────────────

function DesktopLayout({ week, userId, onChanged }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
      gap: 8,
    }}>
      {week.days.map(d => (
        <DayColumn
          key={d.iso}
          day={d}
          habits={week.habits}
          userId={userId}
          onChanged={onChanged}
          showWeekDays={week.days}
          compact
        />
      ))}
    </div>
  );
}

function MobileLayout({ week, dow, setDow, userId, onChanged }) {
  const day = week.days[dow] || week.days[0];
  return (
    <>
      {/* Day pills */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 4, marginBottom: 10,
      }}>
        {week.days.map((d, i) => {
          const active = i === dow;
          const isToday = d.isToday;
          return (
            <button
              key={d.iso}
              onClick={() => setDow(i)}
              style={{
                padding: '8px 0', borderRadius: 10,
                border: `1px solid ${active ? PERSONAL_COLORS.primary : (isToday ? PERSONAL_COLORS.primary : PERSONAL_COLORS.border)}`,
                backgroundColor: active ? PERSONAL_COLORS.primary : (isToday ? '#FFF5EE' : '#FFFFFF'),
                color: active ? '#FFFFFF' : PERSONAL_COLORS.textPrimary,
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 2, fontSize: 11, fontWeight: 700,
              }}
            >
              <span>{HE_DAY_SHORT[i]}</span>
              <span style={{ fontSize: 10, opacity: 0.8 }}>{d.date.getDate()}</span>
            </button>
          );
        })}
      </div>

      {/* Prev / next day */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <button
          onClick={() => setDow(Math.max(0, dow - 1))}
          disabled={dow === 0}
          style={dayNavBtn(dow === 0)}
        >
          <ChevronRight size={14} /> יום קודם
        </button>
        <button
          onClick={() => setDow(Math.min(6, dow + 1))}
          disabled={dow === 6}
          style={dayNavBtn(dow === 6)}
        >
          יום הבא <ChevronLeft size={14} />
        </button>
      </div>

      <DayColumn
        day={day}
        habits={week.habits}
        userId={userId}
        onChanged={onChanged}
        showWeekDays={week.days}
      />
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function useIsMobile() {
  const [mobile, setMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 720 : false
  );
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 720);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return mobile;
}

function weekRangeLabel(anchor) {
  const start = new Date(anchor);
  const end = new Date(anchor);
  end.setDate(end.getDate() + 6);
  const fmt = (d) => `${d.getDate()}.${d.getMonth() + 1}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

const navBtn = {
  width: 32, height: 32, borderRadius: 10, border: 'none',
  background: 'transparent', cursor: 'pointer',
  color: PERSONAL_COLORS.textPrimary,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

function dayNavBtn(disabled) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '6px 10px', borderRadius: 10,
    border: `1px solid ${PERSONAL_COLORS.border}`,
    backgroundColor: '#FFFFFF',
    color: disabled ? '#C0B8A8' : PERSONAL_COLORS.textPrimary,
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 11, fontWeight: 700,
    opacity: disabled ? 0.5 : 1,
  };
}
