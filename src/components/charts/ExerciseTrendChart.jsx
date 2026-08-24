import React, { useMemo, useState } from 'react';
import { formatTime } from '@/lib/formatTime';

// ────────────────────────────────────────────────────────────────
// One exercise, one trend.
//
// Hand-drawn SVG rather than a charting library: the brand palette is
// six colours and nothing else, and every library ships its own blues
// and greys for axes, grids, tooltips and legends. Drawing it here is
// less code than overriding all of that.
//
// Honesty rules are load-bearing, not decoration:
//   • fewer than 3 sessions → dots, no line, and a sentence saying so
//   • a gap of 14 days or more → the line BREAKS, it is not spanned
//   • one exercise per chart, one plan per chart, no plan legend
//   • an insight sentence appears only when the data supports it
// ────────────────────────────────────────────────────────────────

const C = {
  orange: '#FF6F20',
  charcoal: '#2D2A26',
  cream: '#FBF3EA',
  gold: '#C9A227',
  green: '#15803D',
  muted: '#807A6A',
};
const SANS = "'Rubik', system-ui, sans-serif";

const MIN_SESSIONS_FOR_TREND = 3;
const GAP_BREAK_DAYS = 14;
const MIN_SESSIONS_FOR_INSIGHT = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

const dayOf = (iso) => Math.floor(new Date(iso).getTime() / DAY_MS);

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  } catch { return ''; }
}

// Rest-day buckets. Coarse on purpose: with a handful of sessions,
// finer buckets would each hold one sample and mean nothing.
const REST_BUCKETS = [
  { key: '1', label: 'יום מנוחה אחד', min: 1, max: 1 },
  { key: '2', label: 'שני ימי מנוחה', min: 2, max: 2 },
  { key: '3', label: 'שלושה ימי מנוחה', min: 3, max: 3 },
  { key: '4-5', label: 'ארבעה עד חמישה ימי מנוחה', min: 4, max: 5 },
  { key: '6+', label: 'שבוע ומעלה של מנוחה', min: 6, max: Infinity },
];

function bucketFor(gapDays) {
  return REST_BUCKETS.find((b) => gapDays >= b.min && gapDays <= b.max) || null;
}

// ── The rest-vs-result insight ───────────────────────────────────
//
// For every session after the first: how many days of rest preceded it,
// and how much the value moved. Group those pairs by rest bucket, then
// ask whether one bucket is genuinely ahead of the rest.
//
// The sentence is withheld unless ALL of these hold:
//   1. at least 5 sessions — fewer is anecdote, not pattern
//   2. at least two buckets carry 2+ samples each, so there is
//      something to compare against
//   3. the leading bucket's mean gain is positive
//   4. it is at least double the pooled mean of every other sample AND
//      ahead by at least one whole unit
// Anything short of that renders no sentence at all, by design — a
// confident line about three data points is worse than silence.
function computeRestInsight(sessions) {
  if (!Array.isArray(sessions) || sessions.length < MIN_SESSIONS_FOR_INSIGHT) {
    return { text: null, bestKey: null, samples: [] };
  }

  const samples = [];
  for (let i = 1; i < sessions.length; i++) {
    const gap = sessions[i].day - sessions[i - 1].day;
    if (gap <= 0) continue;
    const bucket = bucketFor(gap);
    if (!bucket) continue;
    samples.push({
      index: i,
      gap,
      bucketKey: bucket.key,
      delta: sessions[i].value - sessions[i - 1].value,
    });
  }
  if (samples.length < 3) return { text: null, bestKey: null, samples };

  const byBucket = new Map();
  for (const s of samples) {
    if (!byBucket.has(s.bucketKey)) byBucket.set(s.bucketKey, []);
    byBucket.get(s.bucketKey).push(s.delta);
  }

  const eligible = [...byBucket.entries()].filter(([, arr]) => arr.length >= 2);
  if (eligible.length < 2) return { text: null, bestKey: null, samples };

  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const scored = eligible
    .map(([key, arr]) => ({ key, mean: mean(arr), n: arr.length }))
    .sort((a, b) => b.mean - a.mean);

  const best = scored[0];
  const othersPooled = samples.filter((s) => s.bucketKey !== best.key).map((s) => s.delta);
  if (othersPooled.length === 0) return { text: null, bestKey: null, samples };
  const othersMean = mean(othersPooled);

  const clearlyPositive = best.mean > 0;
  const doubled = best.mean >= othersMean * 2;
  const wholeUnitAhead = (best.mean - othersMean) >= 1;
  if (!clearlyPositive || !doubled || !wholeUnitAhead) {
    return { text: null, bestKey: null, samples };
  }

  const label = REST_BUCKETS.find((b) => b.key === best.key)?.label || '';
  return {
    text: `אתה עולה הכי מהר אחרי ${label}`,
    bestKey: best.key,
    samples,
  };
}

// ── The chart ───────────────────────────────────────────────────
function Plot({ sessions, metric, record, angle, insight }) {
  const W = 320;
  const H = 150;
  const padL = 8;
  const padR = 8;
  const padT = 14;
  const padB = 22;

  const values = sessions.map((s) => s.value);
  const prevValues = sessions.map((s, i) => (i > 0 ? sessions[i - 1].value : null));

  const lo = Math.min(...values, record ?? Infinity);
  const hi = Math.max(...values, record ?? -Infinity);
  const span = hi - lo || Math.max(1, hi * 0.2 || 1);
  const yMin = lo - span * 0.18;
  const yMax = hi + span * 0.18;

  const x = (i) => (sessions.length === 1
    ? padL + (W - padL - padR) / 2
    : padL + (i * (W - padL - padR)) / (sessions.length - 1));
  const y = (v) => padT + (H - padT - padB) * (1 - (v - yMin) / (yMax - yMin || 1));

  // Segments, split wherever the trainee was away 14 days or more.
  const segments = useMemo(() => {
    const out = [];
    let current = [];
    for (let i = 0; i < sessions.length; i++) {
      if (i > 0 && (sessions[i].day - sessions[i - 1].day) >= GAP_BREAK_DAYS) {
        if (current.length) out.push(current);
        current = [];
      }
      current.push(i);
    }
    if (current.length) out.push(current);
    return out;
  }, [sessions]);

  const hasTrend = sessions.length >= MIN_SESSIONS_FOR_TREND;
  const pathFor = (idxs) => idxs.map((i, k) => `${k === 0 ? 'M' : 'L'}${x(i)},${y(sessions[i].value)}`).join(' ');
  const areaFor = (idxs) => {
    if (idxs.length < 2) return null;
    const top = idxs.map((i, k) => `${k === 0 ? 'M' : 'L'}${x(i)},${y(sessions[i].value)}`).join(' ');
    const last = idxs[idxs.length - 1];
    const first = idxs[0];
    return `${top} L${x(last)},${H - padB} L${x(first)},${H - padB} Z`;
  };

  // Up to four date labels, always including the first and the last.
  const tickIdxs = useMemo(() => {
    const n = sessions.length;
    if (n <= 4) return sessions.map((_, i) => i);
    return [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1];
  }, [sessions]);

  const gridLines = 3;
  const gid = `agtrend-${metric.key}-${sessions.length}`;

  // Shaded bands behind the intervals that carry the winning rest gap.
  const highlight = (angle === 'rest' && insight?.bestKey)
    ? insight.samples.filter((s) => s.bucketKey === insight.bestKey)
    : [];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.orange} stopOpacity="0.2" />
          <stop offset="100%" stopColor={C.orange} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Horizontal grid only. Vertical rules add ink and say nothing. */}
      {Array.from({ length: gridLines }, (_, g) => {
        const gy = padT + ((H - padT - padB) * g) / (gridLines - 1);
        return (
          <line key={g} x1={padL} y1={gy} x2={W - padR} y2={gy}
            stroke={C.muted} strokeOpacity="0.18" strokeWidth="1" />
        );
      })}

      {highlight.map((s) => {
        const x1 = x(s.index - 1);
        const x2 = x(s.index);
        return (
          <rect key={s.index} x={x1} y={padT} width={Math.max(2, x2 - x1)} height={H - padT - padB}
            fill={C.green} fillOpacity="0.10" />
        );
      })}

      {record != null && (
        <>
          <line x1={padL} y1={y(record)} x2={W - padR} y2={y(record)}
            stroke={C.gold} strokeWidth="1.5" strokeDasharray="5 4" />
          <text x={W - padR} y={y(record) - 5} textAnchor="end"
            style={{ fontFamily: SANS, fontSize: 9.5, fontWeight: 700, fill: C.gold }}>
            {`שיא ${metric.fmt(record)}`}
          </text>
        </>
      )}

      {/* "מול הקודם" — what the session before scored, at each point. */}
      {angle === 'previous' && hasTrend && segments.map((idxs, si) => {
        const pts = idxs.filter((i) => prevValues[i] != null);
        if (pts.length < 2) return null;
        const d = pts.map((i, k) => `${k === 0 ? 'M' : 'L'}${x(i)},${y(prevValues[i])}`).join(' ');
        return <path key={`p${si}`} d={d} fill="none" stroke={C.muted}
          strokeOpacity="0.75" strokeWidth="1.25" strokeDasharray="3 3" />;
      })}

      {hasTrend && segments.map((idxs, si) => {
        const area = areaFor(idxs);
        return (
          <g key={si}>
            {area && <path d={area} fill={`url(#${gid})`} />}
            {idxs.length > 1 && (
              <path d={pathFor(idxs)} fill="none" stroke={C.orange} strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round" />
            )}
          </g>
        );
      })}

      {sessions.map((s, i) => {
        const last = i === sessions.length - 1;
        return (
          <circle key={i} cx={x(i)} cy={y(s.value)}
            r={last ? 5 : 3.5}
            fill={last ? C.orange : '#FFFFFF'}
            stroke={C.orange}
            strokeWidth={last ? 2 : 1.75} />
        );
      })}

      {tickIdxs.map((i) => (
        <text key={i} x={x(i)} y={H - 6}
          textAnchor={i === 0 ? 'start' : i === sessions.length - 1 ? 'end' : 'middle'}
          style={{ fontFamily: SANS, fontSize: 9.5, fill: C.muted }}>
          {formatDate(sessions[i].at)}
        </text>
      ))}
    </svg>
  );
}

function StatCell({ label, value }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontFamily: SANS, fontSize: 16, fontWeight: 800, color: C.charcoal }}>{value}</div>
      <div style={{ fontFamily: SANS, fontSize: 10, color: C.muted, marginTop: 1 }}>{label}</div>
    </div>
  );
}

// sessions: [{ at, day, value }] oldest first — built by the caller.
export default function ExerciseTrendChart({ exerciseName, sessions = [], metric }) {
  const [angle, setAngle] = useState('rest');

  const m = metric || { key: 'reps', fmt: (n) => String(n), unit: '' };
  const ordered = sessions;
  const n = ordered.length;

  const stats = useMemo(() => {
    if (n === 0) return null;
    const values = ordered.map((s) => s.value);
    const recordValue = Math.max(...values);
    const recordIdx = values.lastIndexOf(recordValue);
    const previousBest = n > 1 ? Math.max(...values.slice(0, -1)) : null;
    const lastIsRecord = recordIdx === n - 1 && previousBest != null && recordValue > previousBest;
    const spanDays = ordered[n - 1].day - ordered[0].day;
    const first = values[0];
    const last = values[n - 1];
    const improvePct = first > 0 ? Math.round(((last - first) / first) * 100) : null;
    return {
      record: recordValue,
      last,
      avg: Math.round((values.reduce((a, b) => a + b, 0) / n) * 10) / 10,
      first,
      spanDays,
      lastIsRecord,
      previousBest,
      improvePct,
    };
  }, [ordered, n]);

  const insight = useMemo(() => computeRestInsight(ordered), [ordered]);

  if (n === 0) return null;

  const chips = [
    { key: 'rest', label: 'מנוחה מול תוצאה' },
    { key: 'previous', label: 'מול הקודם' },
  ];

  return (
    <div dir="rtl" style={{
      background: '#FFFFFF', border: '1px solid #E8DBCB', borderRadius: 14,
      padding: '12px 12px 10px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: SANS, fontSize: 15, fontWeight: 800, color: C.charcoal,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{exerciseName}</div>
          <div style={{ fontFamily: SANS, fontSize: 11.5, color: C.muted, marginTop: 2 }}>
            {`${n} אימונים · ${Math.max(0, stats.spanDays)} יום`}
          </div>
        </div>

        {stats.improvePct != null && stats.improvePct !== 0 && (
          <span style={{
            flexShrink: 0, fontFamily: SANS, fontSize: 12, fontWeight: 800,
            padding: '3px 8px', borderRadius: 999,
            color: stats.improvePct > 0 ? C.green : C.muted,
            background: stats.improvePct > 0 ? 'rgba(21,128,61,0.10)' : 'rgba(128,122,106,0.12)',
          }}>
            {`${stats.improvePct > 0 ? '+' : ''}${stats.improvePct}%`}
          </span>
        )}
      </div>

      {/* The insight sentence, when the data earns one. */}
      {angle === 'rest' && insight.text && (
        <div style={{
          marginTop: 8, padding: '6px 9px', borderRadius: 8,
          background: 'rgba(21,128,61,0.08)',
          fontFamily: SANS, fontSize: 12, fontWeight: 700, color: C.green,
        }}>{insight.text}</div>
      )}

      <div style={{ marginTop: 8 }}>
        <Plot
          sessions={ordered}
          metric={m}
          record={stats.record}
          angle={angle}
          insight={insight}
        />
      </div>

      {n < MIN_SESSIONS_FOR_TREND && (
        <div style={{
          fontFamily: SANS, fontSize: 11.5, color: C.muted,
          textAlign: 'center', marginTop: 2,
        }}>צריך עוד אימון או שניים למגמה</div>
      )}

      {/* שיא · אחרון · ממוצע · התחלה */}
      <div style={{
        display: 'flex', gap: 4, marginTop: 10, paddingTop: 8,
        borderTop: '1px solid #F0E8D8',
      }}>
        <StatCell label="שיא" value={m.fmt(stats.record)} />
        <StatCell label="אחרון" value={m.fmt(stats.last)} />
        <StatCell label="ממוצע" value={m.fmt(stats.avg)} />
        <StatCell label="התחלה" value={m.fmt(stats.first)} />
      </div>

      {stats.lastIsRecord && (
        <div style={{
          marginTop: 8, padding: '7px 10px', borderRadius: 9,
          background: 'rgba(201,162,39,0.12)', border: `1px solid ${C.gold}`,
          fontFamily: SANS, fontSize: 12, fontWeight: 800, color: '#8A6410',
        }}>
          {`🏅 שיא חדש — ${m.fmt(stats.record)}, שיפור של ${m.fmt(stats.record - stats.previousBest)} מהשיא הקודם`}
        </div>
      )}

      {/* Two angles, no more. */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        {chips.map((c) => {
          const on = angle === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setAngle(c.key)}
              style={{
                flex: 1, padding: '7px 6px', borderRadius: 9,
                border: `1px solid ${on ? C.orange : '#E8DBCB'}`,
                background: on ? 'rgba(255,111,32,0.10)' : '#FFFFFF',
                color: on ? C.orange : C.muted,
                fontFamily: SANS, fontSize: 11.5, fontWeight: 800,
                cursor: 'pointer',
              }}
            >{c.label}</button>
          );
        })}
      </div>
    </div>
  );
}

// Shared metric descriptors — the board and the chart must agree on
// how a value is printed.
export const METRICS = {
  reps:   { key: 'reps',   logField: 'reps_completed', fmt: (n) => String(n), unit: 'חזרות' },
  time:   { key: 'time',   logField: 'time_completed', fmt: (n) => formatTime(Math.round(n)) || String(n), unit: '' },
  weight: { key: 'weight', logField: 'weight_used',    fmt: (n) => `${n} ק"ג`, unit: 'ק"ג' },
};

export { GAP_BREAK_DAYS, MIN_SESSIONS_FOR_TREND, MIN_SESSIONS_FOR_INSIGHT, computeRestInsight, dayOf };
