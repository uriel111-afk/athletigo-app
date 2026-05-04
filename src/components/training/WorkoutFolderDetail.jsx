import React, { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { base44 } from '@/api/base44Client';
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
          formatter={(v, name) => {
            if (name === 'completionScaled') {
              const pct = Math.round(Number(v) * 10);
              return [`${pct}%`, 'השלמה'];
            }
            return [`${Number(v).toFixed(1)}/10`, 'ציון'];
          }}
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
          connectNulls
        />
        {/* Completion %, normalized to the same 0..10 axis as score so
            both lines share a Y range. Tooltip de-normalizes back to %
            via the formatter above. */}
        <Area
          type="monotone"
          dataKey="completionScaled"
          stroke="#3B82F6"
          strokeWidth={2}
          strokeDasharray="4 4"
          fill="transparent"
          dot={{ fill: '#3B82F6', r: 3, strokeWidth: 1, stroke: 'white' }}
          activeDot={{ r: 6, fill: '#3B82F6', stroke: 'white', strokeWidth: 2 }}
          connectNulls
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
  onActivate, onEditPlan, onDuplicateExecution, onPlanDeleted,
}) {
  const traineeLabel = hasExecutions ? 'בצע שוב' : 'התחל אימון';
  const handleCardTap = isCoach
    ? () => onEditPlan && onEditPlan(plan)
    : () => onActivate && onActivate();

  // Plan-level action menu (coach only). The 3-dots button opens
  // a bottom sheet with: copy-to-trainee → opens a second sheet
  // with the coach's roster; edit → existing onEditPlan; duplicate
  // → inserts a new training_plans row; delete → cascade delete +
  // navigate back.
  const queryClient = useQueryClient();
  const [showPlanMenu, setShowPlanMenu] = useState(false);
  const [showCopyToTrainee, setShowCopyToTrainee] = useState(false);

  const { data: trainees = [] } = useQuery({
    queryKey: ['plan-menu-trainees'],
    queryFn: async () => {
      const me = await base44.auth.me().catch(() => null);
      if (!me?.id) return [];
      const { data } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('role', 'trainee')
        .eq('coach_id', me.id)
        .order('full_name');
      return data || [];
    },
    enabled: showCopyToTrainee || showPlanMenu,
  });

  const handlePlanAction = async (action) => {
    setShowPlanMenu(false);
    if (action === 'edit') {
      onEditPlan && onEditPlan(plan);
      return;
    }
    if (action === 'duplicate') {
      try {
        const { id, created_at, ...rest } = plan;
        const { error } = await supabase
          .from('training_plans')
          .insert({ ...rest, plan_name: `${plan.plan_name || 'תוכנית'} (עותק)` });
        if (error) throw error;
        toast.success('התוכנית שוכפלה ✅');
        queryClient.invalidateQueries({ queryKey: ['workouts-plans'] });
        queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      } catch (e) {
        toast.error('שכפול נכשל: ' + (e?.message || 'נסה שוב'));
      }
      return;
    }
    if (action === 'copy') {
      setShowCopyToTrainee(true);
      return;
    }
    if (action === 'delete') {
      if (!window.confirm(`למחוק את "${plan.plan_name || ''}" לצמיתות? לא ניתן לשחזר.`)) return;
      try {
        await supabase.from('exercises').delete().eq('training_plan_id', plan.id);
        await supabase.from('training_sections').delete().eq('training_plan_id', plan.id);
        await supabase.from('workout_executions').delete().eq('plan_id', plan.id);
        const { error } = await supabase.from('training_plans').delete().eq('id', plan.id);
        if (error) throw error;
        toast.success('התוכנית נמחקה');
        queryClient.invalidateQueries({ queryKey: ['workouts-plans'] });
        queryClient.invalidateQueries({ queryKey: ['training-plans'] });
        if (onPlanDeleted) onPlanDeleted();
      } catch (e) {
        toast.error('מחיקה נכשלה: ' + (e?.message || 'נסה שוב'));
      }
    }
  };

  const copyPlanToTrainee = async (traineeId) => {
    try {
      const { id, created_at, ...rest } = plan;
      const { error } = await supabase
        .from('training_plans')
        .insert({ ...rest, assigned_to: traineeId });
      if (error) throw error;
      toast.success('התוכנית הועתקה בהצלחה ✅');
      queryClient.invalidateQueries({ queryKey: ['workouts-plans'] });
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
    } catch (e) {
      toast.error('העתקה נכשלה: ' + (e?.message || 'נסה שוב'));
    } finally {
      setShowCopyToTrainee(false);
    }
  };

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
        תוכנית המאמן
      </span>
      {isCoach && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowPlanMenu(true); }}
          aria-label="פעולות תוכנית"
          style={{
            position: 'absolute', top: 10, right: 12,
            width: 36, height: 36, borderRadius: '50%',
            background: '#F5F5F5', border: 'none',
            fontSize: 22, lineHeight: 1, cursor: 'pointer',
            color: '#888',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
        >⋮</button>
      )}
      <div style={{ fontSize: 13, color: '#6366F1', fontWeight: 700, marginBottom: 6 }}>
        🎯 תוכנית המאמן
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

      {/* Action menu — bottom sheet */}
      {showPlanMenu && (
        <>
          <div
            onClick={(e) => { e.stopPropagation(); setShowPlanMenu(false); }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.4)', zIndex: 200,
            }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              background: 'white', borderRadius: '20px 20px 0 0',
              padding: '24px 20px 40px', zIndex: 201, direction: 'rtl',
              cursor: 'default',
            }}
          >
            <div style={{ width: 36, height: 4, background: '#E5E7EB', borderRadius: 999, margin: '0 auto 20px' }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: DARK, marginBottom: 16 }}>
              {plan.plan_name || 'תוכנית'}
            </div>
            {[
              { icon: '📋', label: 'העתק למתאמן אחר', action: 'copy', color: DARK },
              { icon: '✏️', label: 'ערוך תוכנית', action: 'edit', color: DARK },
              { icon: '📄', label: 'שכפל תוכנית', action: 'duplicate', color: DARK },
              { icon: '🗑️', label: 'מחק תוכנית', action: 'delete', color: '#DC2626' },
            ].map((item) => (
              <button
                key={item.action}
                type="button"
                onClick={() => handlePlanAction(item.action)}
                style={{
                  width: '100%', padding: '16px',
                  background: 'white', border: 'none',
                  borderBottom: '1px solid #F5F5F5',
                  display: 'flex', alignItems: 'center', gap: 14,
                  fontSize: 16, color: item.color,
                  cursor: 'pointer', direction: 'rtl', textAlign: 'right',
                }}
              >
                <span style={{ fontSize: 20 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Copy-to-trainee picker — second sheet */}
      {showCopyToTrainee && (
        <>
          <div
            onClick={(e) => { e.stopPropagation(); setShowCopyToTrainee(false); }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.4)', zIndex: 202,
            }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              background: 'white', borderRadius: '20px 20px 0 0',
              padding: '24px 20px 40px', zIndex: 203,
              maxHeight: '70vh', overflowY: 'auto', direction: 'rtl',
              cursor: 'default',
            }}
          >
            <div style={{ width: 36, height: 4, background: '#E5E7EB', borderRadius: 999, margin: '0 auto 20px' }} />
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: DARK }}>בחר מתאמן</div>
            {trainees.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 14 }}>
                אין מתאמנים זמינים
              </div>
            ) : (
              trainees.map((trainee) => (
                <button
                  key={trainee.id}
                  type="button"
                  onClick={() => copyPlanToTrainee(trainee.id)}
                  style={{
                    width: '100%', padding: '14px 16px',
                    background: 'white', border: 'none',
                    borderBottom: '1px solid #F5F5F5',
                    display: 'flex', alignItems: 'center', gap: 12,
                    fontSize: 15, color: DARK, cursor: 'pointer',
                    direction: 'rtl', textAlign: 'right',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: ORANGE, color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, flexShrink: 0,
                  }}>
                    {trainee.full_name?.[0] || '?'}
                  </div>
                  {trainee.full_name}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// One past-execution accordion. Three render shapes:
//
//   • Completed (has a score)          — tap expands inline to
//     WorkoutExecutionReadOnly which fetches workout_executions +
//     exercise_set_logs and renders the saved per-set values,
//     exercise notes, section ratings, and the average score.
//
//   • Blank / scheduled (completion=0  — created by the duplicate
//     button or any other "I plan to do this" path) — tap fires
//     onActivate(execution); the parent flips to active mode and
//     mounts UnifiedPlanBuilder so the trainee can actually run it.
//     No accordion, no read-only render — those would just show
//     placeholders since no set logs exist yet.
//
//   • In-progress (completion>0 but no score) — falls through to the
//     accordion in case partial set logs exist worth showing.
//
// When isCoach=true and onDelete is provided, the row is wrapped in
// SwipeableCard so a left-swipe reveals a delete button.
function ExecutionRow({ plan, execution, indexLabel, isCoach = false, onDelete, onActivate }) {
  const [open, setOpen] = useState(false);
  const score = execution.self_rating != null ? Number(execution.self_rating) : null;
  const hasScore = score != null;
  const completionRaw = execution.completion_percent;
  const completionNum = completionRaw == null ? 0 : Number(completionRaw);
  // Treat blank duplicates and any unstarted scheduled rows as
  // "tap to start." We can't cheaply check exercise_set_logs from
  // here without an extra round-trip per row, so completion_percent
  // alone gates the branch — createDuplicatedExecution writes 0 and
  // the live workout flow overwrites it on save.
  const isBlank = !hasScore && completionNum === 0;

  const handleClick = () => {
    if (isBlank) {
      if (onActivate) onActivate(execution);
      return;
    }
    setOpen((v) => !v);
  };

  const inner = (
    <div style={{
      background: 'white',
      border: isBlank ? `1px solid ${ORANGE}` : '1px solid #F0E4D0',
      borderRadius: 10,
      marginBottom: 6,
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={handleClick}
        aria-expanded={isBlank ? undefined : open}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, padding: '10px 14px',
          width: '100%', boxSizing: 'border-box',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 15, fontWeight: 700, color: DARK,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginBottom: 1,
          }}>
            {plan?.plan_name || plan?.title || 'אימון'} ({indexLabel})
          </div>
          <div style={{ fontSize: 13, color: '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {isBlank ? 'מוכן להתחלה' : formatLongHe(execution.executed_at)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {isBlank ? (
            <span style={{
              padding: '6px 12px',
              borderRadius: 999,
              background: ORANGE,
              color: 'white',
              fontSize: 12,
              fontWeight: 800,
              lineHeight: 1,
              boxShadow: '0 2px 6px rgba(255,111,32,0.25)',
            }}>
              ▶ התחל אימון
            </span>
          ) : (
            <>
              {hasScore && (
                <div style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: ORANGE, color: 'white',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 900, lineHeight: 1,
                }}>
                  {score.toFixed(1)}
                </div>
              )}
              {completionNum > 0 && (
                <span style={{ fontSize: 13, color: '#888' }}>
                  {Math.round(completionNum)}%
                </span>
              )}
              <span style={{ fontSize: 11, color: '#ccc' }}>
                {open ? '▲' : '▼'}
              </span>
            </>
          )}
        </div>
      </button>
      {!isBlank && open && (
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
      .filter((e) => e.self_rating != null || (e.completion_percent ?? 0) > 0)
      .map((e) => {
        const completionPct = e.completion_percent != null ? Number(e.completion_percent) : 0;
        return {
          date: formatShort(e.executed_at),
          score: e.self_rating != null ? Number(e.self_rating) : null,
          completion: completionPct,
          // Same 0..10 axis as score; the chart's tooltip formatter
          // de-normalizes this back to a 0..100% string.
          completionScaled: completionPct / 10,
        };
      }),
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
          onPlanDeleted={onBack}
        />

        {completed.length > 0 && (
          <>
            <div style={{
              borderTop: '1px solid #F0E4D0',
              marginTop: 12,
              padding: '12px 0 8px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: DARK }}>
                ביצועים קודמים
              </div>
              <span style={{
                background: '#FFF5EE',
                color: ORANGE,
                fontSize: 12, fontWeight: 700,
                padding: '3px 10px', borderRadius: 999,
                lineHeight: 1,
              }}>
                {completed.length}
              </span>
            </div>
            <div>
              {numberedNewestFirst.map(({ exec, indexLabel }) => (
                <ExecutionRow
                  key={exec.id}
                  plan={plan}
                  execution={exec}
                  indexLabel={indexLabel}
                  isCoach={isCoach}
                  onDelete={onDeleteExecution}
                  onActivate={() => setActiveMode('active')}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
