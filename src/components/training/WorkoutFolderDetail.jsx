import React, { useMemo, useState } from 'react';
import { ArrowRight, ChevronUp, ChevronLeft } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import UnifiedPlanBuilder from './UnifiedPlanBuilder';
import WorkoutExecutionReadOnly from './WorkoutExecutionReadOnly';
import FullscreenChart from '@/components/FullscreenChart';
import SwipeableCard from '@/components/SwipeableCard';

const ORANGE = '#FF6F20';
const DARK = '#1a1a1a';

function formatShort(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('he-IL', {
      day: '2-digit', month: '2-digit',
    });
  } catch { return ''; }
}

// Hebrew long format for execution metadata, e.g.
// "יום שלישי, 22 באפריל 2026, 14:32".
function formatLongHe(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('he-IL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

function GradientDivider() {
  return (
    <div style={{
      height: 1,
      background: 'linear-gradient(to right, #FF6F20, #FFE5D0, transparent)',
      margin: '20px 0',
      borderRadius: 999,
    }} />
  );
}

function ExecutionDivider() {
  return (
    <>
      <div style={{ height: 8 }} />
      <div style={{ height: 1, background: '#F0E4D0', margin: '0 16px' }} />
      <div style={{ height: 8 }} />
    </>
  );
}

// The chart body is extracted so we can render it both inline (200px)
// and inside the fullscreen modal (340px) without duplication.
function ImprovementChart({ data, height, gradientId = 'workoutGrad' }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={ORANGE} stopOpacity={0.25} />
            <stop offset="95%" stopColor={ORANGE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F5E6D8" vertical={false} />
        <XAxis
          dataKey="date" tick={{ fontSize: 10, fill: '#AAA' }}
          axisLine={false} tickLine={false}
        />
        <YAxis
          domain={[0, 10]} tick={{ fontSize: 10, fill: '#AAA' }}
          axisLine={false} tickLine={false} ticks={[0, 2, 4, 6, 8, 10]}
        />
        <Tooltip
          contentStyle={{
            background: '#1a1a1a', border: 'none', borderRadius: 10,
            color: 'white', fontSize: 12,
          }}
          formatter={(v) => [`${Number(v).toFixed(1)}/10`, 'ציון']}
          labelStyle={{ color: ORANGE, fontWeight: 700 }}
          cursor={{ stroke: ORANGE, strokeWidth: 1, strokeDasharray: '4 4' }}
        />
        <ReferenceLine y={5} stroke="#E5E5E5" strokeDasharray="3 3" />
        <Area
          type="monotone"
          dataKey="score"
          stroke={ORANGE}
          strokeWidth={3}
          fill={`url(#${gradientId})`}
          dot={{ fill: ORANGE, r: 5, strokeWidth: 2, stroke: 'white' }}
          activeDot={{ r: 8, fill: ORANGE, stroke: 'white', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ImprovementGraph({ data, executionsCount }) {
  const [fullscreen, setFullscreen] = useState(false);

  if (!data || data.length === 0) {
    return (
      <div style={{
        padding: '24px 12px', textAlign: 'center', color: '#888',
        background: '#FAFAFA', borderRadius: 14, border: '1px solid #F0F0F0',
        fontSize: 13,
      }}>
        עוד לא ביצעת אימון זה · הגרף יופיע אחרי הביצוע הראשון
      </div>
    );
  }

  const latest = data[data.length - 1].score;
  const prev = data.length >= 2 ? data[data.length - 2].score : null;
  const trend = prev != null ? Number((latest - prev).toFixed(2)) : 0;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setFullscreen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setFullscreen(true); }}
        style={{
          background: 'white',
          borderRadius: 20,
          padding: '20px 16px 12px',
          marginBottom: 16,
          boxShadow: '0 8px 32px rgba(255,111,32,0.10)',
          border: '1px solid #FFE5D0',
          cursor: 'pointer',
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: 16, gap: 8,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>
              גרף השיפור שלך
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              {executionsCount} ביצועים
            </div>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{
              fontSize: 40, fontWeight: 900, color: ORANGE, lineHeight: 1,
            }}>
              {latest.toFixed(1)}
            </div>
            <div style={{ fontSize: 11, color: '#888', textAlign: 'center' }}>
              מתוך 10
            </div>
          </div>
        </div>

        {trend !== 0 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 999, marginBottom: 12,
            background: trend > 0 ? '#ECFDF5' : '#FEF2F2',
            color: trend > 0 ? '#059669' : '#DC2626',
            fontSize: 12, fontWeight: 600,
          }}>
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)} מהאימון הקודם
          </div>
        )}

        <ImprovementChart data={data} height={200} gradientId="workoutGrad" />
      </div>

      <FullscreenChart
        isOpen={fullscreen}
        onClose={() => setFullscreen(false)}
        title="גרף השיפור שלך"
      >
        <ImprovementChart data={data} height={340} gradientId="workoutGradFs" />
      </FullscreenChart>
    </>
  );
}

function MasterCard({
  plan, sectionsCount, exercisesCount, isCoach, hasExecutions,
  onActivate, onEditPlan, onDuplicateExecution,
}) {
  // Coach edits the master plan; trainee runs it. Tap target = whole
  // card to give a generous hit area.
  const traineeLabel = hasExecutions ? 'בצע שוב' : 'התחל אימון';
  const handleCardTap = isCoach
    ? () => onEditPlan && onEditPlan(plan)
    : () => onActivate && onActivate();
  return (
    <div
      onClick={handleCardTap}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCardTap(); }}
      style={{
        position: 'relative',
        background: '#EEF2FF',
        border: '2px solid #818CF8',
        borderRadius: 14,
        padding: 16,
        cursor: 'pointer',
      }}
    >
      <span style={{
        position: 'absolute', top: 10, left: 12,
        fontSize: 10, fontWeight: 800, color: '#6D28D9',
        background: '#F5F3FF',
        padding: '2px 10px', borderRadius: 999,
        letterSpacing: 0.5, border: '1px solid #DDD6FE',
      }}>
        אימון אב
      </span>
      <div style={{ fontSize: 13, color: '#6366F1', fontWeight: 700, marginBottom: 6 }}>
        🎯 אימון אב
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: DARK, marginBottom: 4, paddingLeft: 64 }}>
        {plan.plan_name || plan.title || 'תוכנית'}
      </div>
      <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 14 }}>
        {sectionsCount} סקשנים · {exercisesCount} תרגילים
      </div>
      {isCoach ? (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEditPlan && onEditPlan(plan); }}
            style={{
              width: '100%', padding: '12px',
              background: 'white',
              border: `2px solid ${ORANGE}`,
              borderRadius: 12,
              color: ORANGE,
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
              marginBottom: 8,
            }}
          >
            ✏️ ערוך תוכנית
          </button>
          {onDuplicateExecution && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDuplicateExecution(plan); }}
              style={{
                width: '100%', padding: '12px',
                background: '#1a1a1a',
                border: 'none',
                borderRadius: 12,
                color: ORANGE,
                fontWeight: 700,
                fontSize: 15,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              📋 שכפל אימון
            </button>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onActivate && onActivate(); }}
            style={{
              width: '100%', height: 48, borderRadius: 12,
              background: ORANGE, color: 'white', border: 'none',
              fontSize: 15, fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(255,111,32,0.25)',
              marginBottom: onDuplicateExecution ? 8 : 0,
            }}
          >
            {traineeLabel}
          </button>
          {onDuplicateExecution && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDuplicateExecution(plan); }}
              style={{
                width: '100%', padding: '12px',
                background: 'white',
                border: `2px solid ${ORANGE}`,
                borderRadius: 12,
                color: ORANGE,
                fontWeight: 700, fontSize: 15, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              📋 שכפל אימון
            </button>
          )}
        </>
      )}
    </div>
  );
}

// One past-execution accordion. Closed shows the Hebrew long timestamp,
// plan name, score and completion %. Expanded mounts
// WorkoutExecutionReadOnly compact, which fetches workout_executions +
// exercise_set_logs and renders the saved per-set values, exercise notes,
// section ratings, and the average score.
//
// When isCoach=true and onDelete is provided, the row is wrapped in
// SwipeableCard so a left-swipe reveals a delete button.
function ExecutionRow({ plan, execution, indexLabel, isCoach = false, onDelete }) {
  const [open, setOpen] = useState(false);
  const score = execution.self_rating != null ? Number(execution.self_rating) : null;
  const completion = execution.completion_percent != null
    ? Number(execution.completion_percent)
    : null;
  const inner = (
    <div style={{
      background: 'white',
      border: '1px solid #F0E4D0',
      borderRadius: 12,
      boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, padding: '12px 16px',
          width: '100%', boxSizing: 'border-box',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 15, fontWeight: 800, color: DARK,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginBottom: 2,
          }}>
            {plan?.plan_name || plan?.title || 'אימון'} ({indexLabel})
          </div>
          <div style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {formatLongHe(execution.executed_at)}
            {completion != null && ` · ${completion}% השלמה`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 2,
            fontSize: 14, fontWeight: 800, color: ORANGE,
          }}>
            {score != null ? score.toFixed(1) : '—'}
            <span style={{ fontSize: 12 }}>⭐</span>
          </span>
          {open
            ? <ChevronUp className="w-4 h-4" style={{ color: '#888' }} />
            : <ChevronLeft className="w-4 h-4" style={{ color: '#888' }} />}
        </div>
      </button>
      {open && (
        <div style={{ padding: '0 12px 12px' }}>
          <WorkoutExecutionReadOnly
            plan={plan}
            executionId={execution.id}
            compact
          />
        </div>
      )}
    </div>
  );

  return (
    <SwipeableCard
      disabled={!isCoach || !onDelete}
      onDelete={onDelete ? () => onDelete(execution) : undefined}
    >
      {inner}
    </SwipeableCard>
  );
}

export default function WorkoutFolderDetail({
  plan, sectionsCount, exercisesCount, executions,
  isCoach = false, onBack, onWorkoutFinished, onEditPlan,
  onDuplicateExecution, onDeleteExecution,
}) {
  // null = render the folder body. 'active' = full-screen workout via the
  // master button (canEdit/isCoach mirror the user's role).
  const [activeMode, setActiveMode] = useState(null);

  const completed = executions || [];

  const numberedNewestFirst = useMemo(() => {
    const sorted = completed
      .slice()
      .sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at));
    const total = sorted.length;
    return sorted.map((exec, i) => ({ exec, indexLabel: total - i }));
  }, [completed]);

  const chartData = useMemo(
    () => completed
      .slice()
      .sort((a, b) => new Date(a.executed_at) - new Date(b.executed_at))
      .filter((e) => e.self_rating != null)
      .map((e) => ({
        date: formatShort(e.executed_at),
        score: Number(e.self_rating),
      })),
    [completed]
  );

  const planName = plan?.plan_name || plan?.title || 'אימון';

  // Master button activation → full-screen UnifiedPlanBuilder (replaces
  // the folder body but stays within the same Workouts page level).
  if (activeMode === 'active') {
    return (
      <UnifiedPlanBuilder
        plan={plan}
        isCoach={isCoach}
        canEdit={isCoach}
        onBack={() => {
          setActiveMode(null);
          onWorkoutFinished && onWorkoutFinished();
        }}
      />
    );
  }

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: '#FAFAFA' }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'white',
        borderBottom: '1px solid #F0E4D0',
        display: 'flex', alignItems: 'center',
        height: 56, padding: '0 8px',
      }}>
        <button
          type="button"
          onClick={() => onBack && onBack()}
          style={{
            all: 'unset', cursor: 'pointer',
            height: 36, borderRadius: 8, padding: '0 10px',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: DARK, fontSize: 14, fontWeight: 700,
          }}
        >
          <ArrowRight className="w-5 h-5" />
          חזרה לאימונים
        </button>
        <div style={{
          flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 800, color: DARK,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          padding: '0 8px',
        }}>
          {planName}
        </div>
        {/* Spacer to balance the back-button width so the title
            actually centers. Width matched to a typical "חזרה לאימונים"
            label so the visual balance is close. */}
        <div style={{ width: 110 }} />
      </div>

      <div style={{ padding: 16 }}>
        <ImprovementGraph data={chartData} executionsCount={completed.length} />

        <GradientDivider />

        <MasterCard
          plan={plan}
          sectionsCount={sectionsCount}
          exercisesCount={exercisesCount}
          isCoach={isCoach}
          hasExecutions={completed.length > 0}
          onActivate={() => setActiveMode('active')}
          onEditPlan={onEditPlan}
          onDuplicateExecution={onDuplicateExecution}
        />

        {completed.length > 0 && (
          <>
            <GradientDivider />

            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10, color: DARK }}>
              ביצועים קודמים ({completed.length})
            </div>
            <div>
              {numberedNewestFirst.map(({ exec, indexLabel }, i) => (
                <React.Fragment key={exec.id}>
                  <ExecutionRow
                    plan={plan}
                    execution={exec}
                    indexLabel={indexLabel}
                    isCoach={isCoach}
                    onDelete={onDeleteExecution}
                  />
                  {i < numberedNewestFirst.length - 1 && <ExecutionDivider />}
                </React.Fragment>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
