import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronLeft } from 'lucide-react';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import WorkoutExecutionReadOnly from './WorkoutExecutionReadOnly';

const ORANGE = '#FF6F20';
const DARK = '#1a1a1a';

function formatShort(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('he-IL', {
      day: 'numeric', month: 'numeric',
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
              <linearGradient id="orangeGrad" x1="0" y1="0" x2="0" y2="1">
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
              stroke="none" fill="url(#orangeGrad)"
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

function MasterCard({ plan, sectionsCount, exercisesCount, onStart }) {
  return (
    <div style={{
      position: 'relative',
      background: '#EEF2FF',
      border: '2px solid #818CF8',
      borderRadius: 14,
      padding: 16,
    }}>
      <span style={{
        position: 'absolute', top: 10, left: 12,
        fontSize: 10, fontWeight: 800, color: '#6D28D9',
        background: '#F5F3FF',
        padding: '2px 10px', borderRadius: 999,
        letterSpacing: 0.5, border: '1px solid #DDD6FE',
      }}>
        תבנית
      </span>
      <div style={{ fontSize: 13, color: '#6366F1', fontWeight: 700, marginBottom: 6 }}>
        🎯 אימון אב
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: DARK, marginBottom: 4, paddingLeft: 56 }}>
        {plan.plan_name || plan.title || 'תוכנית'}
      </div>
      <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 14 }}>
        {sectionsCount} סקשנים · {exercisesCount} תרגילים
      </div>
      <button
        type="button"
        onClick={() => onStart && onStart(plan)}
        style={{
          width: '100%', height: 48, borderRadius: 12,
          background: ORANGE, color: 'white', border: 'none',
          fontSize: 15, fontWeight: 800, cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(255,111,32,0.25)',
        }}
      >
        שכפל והתחל אימון חדש
      </button>
    </div>
  );
}

function ExecutionItem({ plan, execution, indexLabel }) {
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
}

// onReview / onPreviewMaster are kept in the prop list for backward
// compat with any caller still passing them — the new design folds
// review-latest into the inline accordion list and the master preview
// into the inline master card.
export default function WorkoutFolder({
  plan, sectionsCount, exercisesCount, executions,
  onStart,
  /* eslint-disable-next-line no-unused-vars */
  onReview, /* eslint-disable-next-line no-unused-vars */ onPreviewMaster,
}) {
  const [open, setOpen] = useState(false);
  const completed = executions || [];

  // Newest-first for the accordion list, with index labels where the
  // OLDEST run is "(1)" and the newest is "(N)".
  const numberedNewestFirst = useMemo(() => {
    const sorted = completed
      .slice()
      .sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at));
    const total = sorted.length;
    return sorted.map((exec, i) => ({ exec, indexLabel: total - i }));
  }, [completed]);

  // Oldest→newest for the chart so the line moves left→right through time.
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

  const lastScore = numberedNewestFirst[0]?.exec?.self_rating ?? null;

  return (
    <div
      dir="rtl"
      style={{
        background: 'white',
        borderRight: `4px solid ${ORANGE}`,
        borderRadius: 16,
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}
    >
      {/* ── Closed-folder header ────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          all: 'unset', display: 'block', width: '100%',
          padding: 16, cursor: 'pointer', boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 20, fontWeight: 900, color: DARK,
              marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              💪 {plan.plan_name || plan.title || 'תוכנית'}
            </div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
              {sectionsCount} סקשנים · {exercisesCount} תרגילים
            </div>
            <div style={{ fontSize: 13, color: '#666' }}>
              {completed.length} ביצועים
              {lastScore != null && (
                <>
                  {' · ציון אחרון: '}
                  <span style={{ color: ORANGE, fontWeight: 800 }}>
                    {Number(lastScore).toFixed(1)} ⭐
                  </span>
                </>
              )}
            </div>
          </div>
          <div style={{ paddingTop: 4 }}>
            {open
              ? <ChevronUp className="w-6 h-6" style={{ color: ORANGE }} />
              : <ChevronDown className="w-6 h-6" style={{ color: ORANGE }} />}
          </div>
        </div>
      </button>

      {/* ── Open-folder body ───────────────────────────────────── */}
      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          <ImprovementGraph data={chartData} />

          <GradientDivider />

          <MasterCard
            plan={plan}
            sectionsCount={sectionsCount}
            exercisesCount={exercisesCount}
            onStart={onStart}
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
                    <ExecutionItem
                      plan={plan}
                      execution={exec}
                      indexLabel={indexLabel}
                    />
                    {i < numberedNewestFirst.length - 1 && <ExecutionDivider />}
                  </React.Fragment>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
