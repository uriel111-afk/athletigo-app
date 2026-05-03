import React, { useMemo, useState } from 'react';
import {
  ChevronDown, ChevronUp, ChevronLeft, Play, Eye, Calendar, Award,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import WorkoutExecutionReadOnly from './WorkoutExecutionReadOnly';

const ORANGE = '#FF6F20';
const DARK = '#1a1a1a';

function formatLong(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('he-IL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch { return ''; }
}

function formatShort(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('he-IL', {
      day: '2-digit', month: '2-digit',
    });
  } catch { return ''; }
}

function scoreBadgeColor(score) {
  if (score == null) return { bg: '#F3F4F6', fg: '#6B7280' };
  if (score >= 7) return { bg: '#DCFCE7', fg: '#16A34A' };
  if (score >= 4) return { bg: '#FEF3C7', fg: '#B45309' };
  return { bg: '#FEE2E2', fg: '#DC2626' };
}

function Divider() {
  return <div style={{ height: 1, background: '#EAEAEA', margin: '14px 0' }} />;
}

function ScoreCircle({ score }) {
  const display = score == null ? '—' : Number(score).toFixed(1);
  return (
    <div style={{
      width: 44, height: 44, borderRadius: '50%',
      background: ORANGE, color: 'white',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 800,
      flexShrink: 0,
    }}>
      {display}
    </div>
  );
}

// One past-execution card. Loads the full read-only body lazily on first
// expand by mounting WorkoutExecutionReadOnly in compact mode — it does
// its own data fetch + caching.
function ExecutionAccordionItem({ plan, execution, indexLabel }) {
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '12px 16px',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
          <div style={{ fontSize: 13, color: '#888' }}>
            {formatLong(execution.executed_at)}
          </div>
          <div style={{
            fontSize: 15, fontWeight: 800, color: DARK,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {plan?.plan_name || plan?.title || 'אימון'} ({indexLabel})
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <ScoreCircle score={score} />
          {open
            ? <ChevronUp className="w-5 h-5" style={{ color: '#888' }} />
            : <ChevronLeft className="w-5 h-5" style={{ color: '#888' }} />}
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

export default function WorkoutFolder({
  plan, sectionsCount, exercisesCount, executions,
  onStart, onReview, onPreviewMaster,
}) {
  const [open, setOpen] = useState(false);

  // Every row in workout_executions is a completed run in the new save
  // model — there is no in-progress / status field.
  const completed = executions || [];

  // Sort newest-first for the past-executions list, while assigning an
  // index where the OLDEST run is "(1)" and the newest is "(N)".
  const numberedNewestFirst = useMemo(() => {
    const sorted = completed
      .slice()
      .sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at));
    const total = sorted.length;
    return sorted.map((exec, i) => ({ exec, indexLabel: total - i }));
  }, [completed]);

  const lastExecution = numberedNewestFirst[0]?.exec || null;
  const lastScore = lastExecution?.self_rating ?? null;

  // The improvement chart wants oldest→newest so the line moves left→right
  // through time. (X axis renders LTR even in an RTL container.)
  const chartData = useMemo(
    () => completed
      .slice()
      .sort((a, b) => new Date(a.executed_at) - new Date(b.executed_at))
      .filter((e) => e.self_rating != null)
      .map((e) => ({
        date: formatShort(e.executed_at),
        score: Number(e.self_rating),
        completion: e.completion_percent != null ? Number(e.completion_percent) : null,
      })),
    [completed]
  );

  const lastBadge = scoreBadgeColor(lastScore != null ? Number(lastScore) : null);

  const handleStart = (e) => { e?.stopPropagation(); onStart && onStart(plan); };
  const handleReviewLatest = (e) => {
    e?.stopPropagation();
    if (lastExecution) onReview && onReview(lastExecution);
  };
  const handlePreviewMaster = () => {
    if (onPreviewMaster) onPreviewMaster(plan);
  };

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #E0E0E0',
        borderRadius: 16,
        boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
        overflow: 'hidden',
        marginBottom: 12,
      }}
      dir="rtl"
    >
      {/* ───────────── Closed-folder header ───────────── */}
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
              {plan.plan_name || plan.title || 'תוכנית'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12, color: '#666' }}>
              <span>{sectionsCount} סקשנים</span>
              <span>·</span>
              <span>{exercisesCount} תרגילים</span>
              <span>·</span>
              <span>{completed.length} ביצועים</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {lastScore != null && (
                <span style={{
                  background: lastBadge.bg, color: lastBadge.fg,
                  padding: '3px 10px', borderRadius: 999,
                  fontSize: 12, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <Award className="w-3 h-3" />
                  {Number(lastScore).toFixed(1)}
                </span>
              )}
              {plan.created_at && (
                <span style={{ fontSize: 11, color: '#888', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Calendar className="w-3 h-3" />
                  {formatLong(plan.created_at)}
                </span>
              )}
            </div>
          </div>
          <div style={{ paddingTop: 4 }}>
            {open
              ? <ChevronUp className="w-6 h-6" style={{ color: ORANGE }} />
              : <ChevronDown className="w-6 h-6" style={{ color: ORANGE }} />}
          </div>
        </div>

        {/* Always-visible action row, even when the folder is closed. */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            onClick={handleStart}
            style={{
              flex: 1, height: 44, borderRadius: 10,
              background: ORANGE, color: 'white', border: 'none',
              fontSize: 14, fontWeight: 800, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', gap: 6,
            }}
          >
            <Play className="w-4 h-4" />
            התחל אימון
          </button>
          <button
            type="button"
            onClick={handleReviewLatest}
            disabled={!lastExecution}
            style={{
              flex: 1, height: 44, borderRadius: 10,
              background: 'white',
              color: lastExecution ? DARK : '#AAA',
              border: `1px solid ${lastExecution ? '#F0E4D0' : '#EEE'}`,
              fontSize: 13, fontWeight: 700,
              cursor: lastExecution ? 'pointer' : 'not-allowed',
              display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', gap: 6,
            }}
          >
            <Eye className="w-4 h-4" />
            צפה בביצועים קודמים
          </button>
        </div>
      </button>

      {/* ───────────── Open-folder body ───────────── */}
      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          {/* SECTION 1 — Improvement graph */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              📈 התקדמות
            </div>
            {chartData.length === 0 ? (
              <div style={{
                padding: '20px 8px', textAlign: 'center', color: '#888',
                fontSize: 12, background: '#FAFAFA',
                border: '1px solid #F0F0F0', borderRadius: 12,
              }}>
                עוד לא ביצעת את האימון — הגרף יופיע אחרי הביצוע הראשון
              </div>
            ) : (
              <div style={{
                background: '#FAFAFA', borderRadius: 12,
                border: '1px solid #F0F0F0', padding: 12,
                height: 160 + 24,
              }}>
                <div style={{ height: 160, width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="date" fontSize={11} />
                      <YAxis domain={[0, 10]} fontSize={11} />
                      <Tooltip
                        formatter={(v, name) => {
                          if (name === 'score') return [Number(v).toFixed(1), 'ציון'];
                          return [v, name];
                        }}
                        labelFormatter={(l, payload) => {
                          const p = payload?.[0]?.payload;
                          if (!p) return l;
                          const pct = p.completion != null ? ` · ${p.completion}% השלמה` : '';
                          return `${l}${pct}`;
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke={ORANGE}
                        strokeWidth={2}
                        dot={{ r: 4, fill: ORANGE }}
                        activeDot={{ r: 6, fill: ORANGE }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          <Divider />

          {/* SECTION 2 — Master workout card. The card body (everything
              outside the orange button) is itself tappable and opens
              the master in read-only template mode. */}
          <div
            onClick={handlePreviewMaster}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handlePreviewMaster(); }}
            style={{
              position: 'relative',
              background: '#F0F4FF',
              border: '2px solid #CBD5FF',
              borderRadius: 12,
              padding: 16,
              cursor: onPreviewMaster ? 'pointer' : 'default',
            }}
          >
            <span style={{
              position: 'absolute', top: 8, left: 12,
              fontSize: 10, fontWeight: 800, color: '#64748B',
              background: 'rgba(255,255,255,0.7)',
              padding: '2px 8px', borderRadius: 999,
              letterSpacing: 0.5,
            }}>
              תבנית
            </span>
            <div style={{ fontSize: 18, fontWeight: 800, color: DARK, marginBottom: 4, paddingLeft: 56 }}>
              {plan.plan_name || plan.title || 'תוכנית'}
            </div>
            <div style={{ fontSize: 13, color: '#64748B', marginBottom: 14 }}>
              {sectionsCount} סקשנים · {exercisesCount} תרגילים
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onStart && onStart(plan); }}
              style={{
                width: '100%', height: 48, borderRadius: 12,
                background: ORANGE, color: 'white', border: 'none',
                fontSize: 15, fontWeight: 800, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', gap: 8,
                boxShadow: '0 4px 12px rgba(255,111,32,0.25)',
              }}
            >
              <Play className="w-4 h-4" />
              התחל אימון חדש
            </button>
          </div>

          <Divider />

          {/* SECTION 3 — Past executions, newest first, with inline expand. */}
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10, color: DARK }}>
              ביצועים קודמים ({completed.length})
            </div>
            {completed.length === 0 ? (
              <div style={{
                padding: 20, background: '#FAFAFA', borderRadius: 12,
                border: '1px solid #F0F0F0',
                fontSize: 13, color: '#888', textAlign: 'center',
              }}>
                עוד אין ביצועים — לחץ "התחל אימון חדש" כדי להתחיל.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {numberedNewestFirst.map(({ exec, indexLabel }) => (
                  <ExecutionAccordionItem
                    key={exec.id}
                    plan={plan}
                    execution={exec}
                    indexLabel={indexLabel}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
