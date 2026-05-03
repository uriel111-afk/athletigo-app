import React, { useMemo, useState } from 'react';
import { ArrowRight, ChevronUp, ChevronLeft } from 'lucide-react';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import UnifiedPlanBuilder from './UnifiedPlanBuilder';

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

function trendFor(scores) {
  if (!scores || scores.length < 2) return null;
  const a = scores[scores.length - 2];
  const b = scores[scores.length - 1];
  if (b > a) return { icon: '↑', color: '#16A34A' };
  if (b < a) return { icon: '↓', color: '#DC2626' };
  return { icon: '→', color: '#888' };
}

function ImprovementGraph({ data }) {
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

  const lastScore = data[data.length - 1].score;
  const trend = trendFor(data.map((d) => d.score));

  return (
    <div style={{
      background: '#FFFFFF', borderRadius: 14,
      border: '1px solid #F0F0F0', padding: 14,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', marginBottom: 8, gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 40, fontWeight: 800, color: ORANGE, lineHeight: 1 }}>
            {lastScore.toFixed(1)}
          </span>
          {trend && (
            <span style={{ fontSize: 16, fontWeight: 800, color: trend.color }}>
              {trend.icon}
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#444' }}>
          📈 גרף השיפור
        </div>
      </div>
      <div style={{ height: 220, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="orangeGradDetail" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={ORANGE} stopOpacity={0.35} />
                <stop offset="100%" stopColor={ORANGE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="date" fontSize={11} />
            <YAxis domain={[0, 10]} fontSize={11} />
            <Tooltip
              formatter={(v) => [Number(v).toFixed(1), 'ציון']}
              labelFormatter={(l) => l}
            />
            <Area
              type="monotone" dataKey="score"
              stroke="none" fill="url(#orangeGradDetail)"
            />
            <Line
              type="monotone" dataKey="score"
              stroke={ORANGE} strokeWidth={2.5}
              dot={{ r: 4, fill: ORANGE }}
              activeDot={{ r: 6, fill: ORANGE }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MasterCard({
  plan, sectionsCount, exercisesCount, isCoach, hasExecutions, onActivate,
}) {
  // Coach edits, trainee runs. The trainee label flips to "בצע שוב" once
  // there's at least one prior execution so the CTA reflects "do the
  // master again" rather than implying a fresh start.
  const buttonLabel = isCoach
    ? 'ערוך אימון'
    : (hasExecutions ? 'בצע שוב' : 'התחל אימון');

  // The whole card is tappable — clicking anywhere outside the button
  // also opens the workout view. Both paths land on the same
  // UnifiedPlanBuilder mount, so this is just a larger tap target.
  return (
    <div
      onClick={onActivate}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onActivate && onActivate(); }}
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
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onActivate && onActivate(); }}
        style={{
          width: '100%', height: 48, borderRadius: 12,
          background: ORANGE, color: 'white', border: 'none',
          fontSize: 15, fontWeight: 800, cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(255,111,32,0.25)',
        }}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

// One past-execution accordion. Closed shows metadata; expanded mounts
// UnifiedPlanBuilder inline so coach and trainee see the same canonical
// workout layout. canEdit/isCoach flow through from the parent.
function ExecutionRow({ plan, execution, indexLabel, isCoach, onWorkoutFinished }) {
  const [open, setOpen] = useState(false);
  const score = execution.self_rating != null ? Number(execution.self_rating) : null;
  return (
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
        <div style={{
          fontSize: 15, fontWeight: 800, color: DARK,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          minWidth: 0,
        }}>
          {plan?.plan_name || plan?.title || 'אימון'} ({indexLabel})
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: '#888' }}>
            {formatShort(execution.executed_at)}
          </span>
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
        <div style={{ padding: '0 4px 8px' }}>
          <UnifiedPlanBuilder
            plan={plan}
            isCoach={isCoach}
            canEdit={isCoach}
            onBack={() => {
              setOpen(false);
              onWorkoutFinished && onWorkoutFinished();
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function WorkoutFolderDetail({
  plan, sectionsCount, exercisesCount, executions,
  isCoach = false, onBack, onWorkoutFinished,
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
        <ImprovementGraph data={chartData} />

        <GradientDivider />

        <MasterCard
          plan={plan}
          sectionsCount={sectionsCount}
          exercisesCount={exercisesCount}
          isCoach={isCoach}
          hasExecutions={completed.length > 0}
          onActivate={() => setActiveMode('active')}
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
                    onWorkoutFinished={onWorkoutFinished}
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
