import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Play, Eye, Calendar, Award } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

const ORANGE = '#FF6F20';
const DARK = '#1a1a1a';

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('he-IL', {
      day: 'numeric', month: 'numeric', year: 'numeric',
    });
  } catch {
    return '';
  }
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

export default function WorkoutFolder({
  plan, sectionsCount, exercisesCount, executions, onStart, onReview,
}) {
  const [open, setOpen] = useState(false);

  // The new save-on-finish model means every row in workout_executions is
  // a completed run — there is no in-progress / status field.
  const completed = executions || [];

  const lastExecution = completed[0] || null;
  const lastScore = lastExecution?.self_rating ?? null;

  const chartData = useMemo(
    () => completed
      .slice()
      .reverse()
      .filter((e) => e.self_rating != null)
      .map((e) => ({
        date: formatShort(e.executed_at),
        score: Number(e.self_rating),
        completion: e.completion_percent != null ? Number(e.completion_percent) : null,
      })),
    [completed]
  );

  const lastBadge = scoreBadgeColor(lastScore != null ? Number(lastScore) : null);

  const handleStart = (e) => {
    e?.stopPropagation();
    onStart && onStart(plan);
  };

  const handleReviewLatest = (e) => {
    e?.stopPropagation();
    if (lastExecution) onReview && onReview(lastExecution);
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          all: 'unset',
          display: 'block',
          width: '100%',
          padding: 16,
          cursor: 'pointer',
          boxSizing: 'border-box',
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
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12,
              color: '#666',
            }}>
              <span>{sectionsCount} סקשנים</span>
              <span>·</span>
              <span>{exercisesCount} תרגילים</span>
              <span>·</span>
              <span>{completed.length} ביצועים</span>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 8,
              flexWrap: 'wrap',
            }}>
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
                <span style={{
                  fontSize: 11, color: '#888',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <Calendar className="w-3 h-3" />
                  {formatDate(plan.created_at)}
                </span>
              )}
            </div>
          </div>
          <div style={{ paddingTop: 4 }}>
            {open ? (
              <ChevronUp className="w-6 h-6" style={{ color: ORANGE }} />
            ) : (
              <ChevronDown className="w-6 h-6" style={{ color: ORANGE }} />
            )}
          </div>
        </div>

        {/* Always-visible action row, even when the folder is closed. */}
        <div style={{
          display: 'flex', gap: 8, marginTop: 12,
        }}>
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

      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          {/* Improvement graph or empty state. */}
          <div style={{
            background: '#FAFAFA', borderRadius: 12, padding: 12,
            border: '1px solid #F0F0F0', marginBottom: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              📈 התקדמות
            </div>
            {chartData.length === 0 ? (
              <div style={{
                padding: '20px 8px', textAlign: 'center', color: '#888',
                fontSize: 12,
              }}>
                עדיין לא ביצעת אימון — הגרף יופיע אחרי הביצוע הראשון
              </div>
            ) : (
              <div style={{ height: 180, width: '100%' }}>
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
            )}
          </div>

          {/* Master template chip */}
          <div style={{
            border: '2px solid #cbd5e1', background: '#F8FAFC',
            borderRadius: 12, padding: 12, marginBottom: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: '#64748B', fontWeight: 700, marginBottom: 2 }}>
                  אימון אב (תבנית)
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: DARK }}>
                  {plan.plan_name || plan.title || 'תוכנית'}
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                  {sectionsCount} סקשנים · {exercisesCount} תרגילים
                </div>
              </div>
            </div>
          </div>

          {/* Past executions list */}
          {completed.length > 0 ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#444' }}>
                ביצועים אחרונים
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {completed.slice(0, 8).map((exec) => {
                  const badge = scoreBadgeColor(
                    exec.self_rating != null ? Number(exec.self_rating) : null
                  );
                  return (
                    <button
                      key={exec.id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onReview && onReview(exec); }}
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid #EEE',
                        background: 'white',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Eye className="w-4 h-4" style={{ color: '#888' }} />
                        <span style={{ fontSize: 13, color: '#444' }}>
                          {formatDate(exec.executed_at)}
                        </span>
                      </div>
                      <span style={{
                        background: badge.bg, color: badge.fg,
                        padding: '2px 8px', borderRadius: 999,
                        fontSize: 12, fontWeight: 700,
                      }}>
                        {exec.self_rating != null
                          ? Number(exec.self_rating).toFixed(1)
                          : '—'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
