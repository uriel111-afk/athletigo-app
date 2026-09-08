import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  loadFamilyProgress, Chart, exerciseKind, exerciseTarget, EX_KINDS,
  fmtNum, fmtDate, daysBetween, MIN_SESSIONS,
  ORANGE, MUTED, SANS,
} from './ProgressGraph';

/**
 * Two graphs built ON TOP of ProgressGraph, never beside it.
 *
 * The family walk, the source_exercise_id match, the executed_at
 * ordering, the three point statuses and every honesty rule come from
 * loadFamilyProgress and Chart in that file. Nothing about how a point
 * is decided is re-implemented here — these are two readings of the
 * same data:
 *
 *   ExerciseTrendGraph  one exercise across the family's performances
 *   WorkoutDashboard    the whole workout, performance by performance
 *
 * The honesty rules that come with Chart, unchanged:
 *   entered            solid orange, filled dot
 *   completed, empty   dashed grey, hollow dot
 *   not performed      a hole — no dot, no line across it
 *   < 3 performances   no trend at all, and a line saying what is short
 *   gap >= 14 days     the line breaks rather than spanning it
 *   no source_exercise_id  says so, never falls back to name matching
 */

const CREAM = '#FBF3EA';
const CHARCOAL = '#2D2A26';
const BAND = '#FFF4EA';
const BAND_LINE = '#F0C9A8';
const CARD_LINE = '#F0E4D0';

const hasVal = (v) => v != null && v !== '';
/** mm:ss — minutes on the left, even on an RTL page. */
const secondsLabel = (v) => {
  const t = Math.max(0, Math.round(Number(v) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

const card = {
  background: CREAM, border: `1px solid ${CHARCOAL}`,
  borderRadius: 12, padding: 13, fontFamily: SANS, direction: 'rtl',
};

/** A metric tile: the number big, its label small underneath. */
function Tile({ label, value, sub, accent = false }) {
  return (
    <div style={{
      flex: '1 1 0', minWidth: 70,
      background: '#FFFFFF', border: `1px solid ${accent ? BAND_LINE : CARD_LINE}`,
      borderRadius: 10, padding: '9px 7px', textAlign: 'center',
    }}>
      <div style={{
        fontSize: 19, fontWeight: 600, lineHeight: 1.15,
        color: accent ? ORANGE : CHARCOAL, direction: 'ltr',
        whiteSpace: 'nowrap',
      }}>{value}</div>
      <div style={{ fontSize: 10, color: MUTED, marginTop: 3, lineHeight: 1.3 }}>{label}</div>
      {sub && <div style={{ fontSize: 9, color: MUTED, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

/** Five circles, the 1-5 rating INSIDE, filling toward the good end. */
function RatingRow({ label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
      <span style={{ fontSize: 12, color: MUTED, width: 42, flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', gap: 5 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value != null && n <= value;
          return (
            <span key={n} style={{
              width: 24, height: 24, borderRadius: '50%',
              border: `1px solid ${on ? ORANGE : '#E4DACB'}`,
              background: on ? ORANGE : '#FFFFFF',
              color: on ? '#FFFFFF' : '#C9BCAB',
              fontSize: 11, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{n}</span>
          );
        })}
      </div>
      {value == null && <span style={{ fontSize: 11, color: MUTED }}>לא דורג</span>}
    </div>
  );
}

/**
 * The switchable series of a family: one per plain exercise, and ONE
 * PER SUB of a container — keyed (family root, drill_index), which is
 * how the set logs are written. A superset therefore yields two lines,
 * one per movement, and is never summed into a single meaningless one.
 */
function buildSeriesCatalogue(exercises, sessions) {
  const keys = new Set();
  for (const s of sessions) for (const k of s.perSeries.keys()) keys.add(k);

  const out = [];
  for (const skey of keys) {
    const sep = skey.lastIndexOf(':');
    const root = skey.slice(0, sep);
    const drill = Number(skey.slice(sep + 1)) || 0;
    const ex = exercises.find((e) => (e.source_exercise_id || e.id) === root);
    if (!ex) continue;

    let kind = exerciseKind(ex);
    let target = exerciseTarget(ex, kind);
    let name = ex.exercise_name || ex.name || 'תרגיל';

    // A container's sub carries its own name, its own type and its own
    // target — the container row carries none of them.
    let td = null;
    try { td = ex.tabata_data ? JSON.parse(ex.tabata_data) : null; } catch { td = null; }
    const subs = Array.isArray(td?.sub_exercises) ? td.sub_exercises : [];
    if (subs.length) {
      const sub = subs[drill];
      if (sub) {
        name = `${name} · ${sub.exercise_name || sub.name || `תרגיל ${drill + 1}`}`;
        if (hasVal(sub.reps)) { kind = EX_KINDS.reps; target = Number(sub.reps) || null; }
        else if (hasVal(sub.hold_seconds)) { kind = EX_KINDS.hold; target = Number(sub.hold_seconds) || null; }
        else if (hasVal(sub.work_time)) { kind = EX_KINDS.work; target = Number(sub.work_time) || null; }
      }
    }
    out.push({ skey, root, drill, name, kind, target, order: ex.order || 0 });
  }
  return out.sort((a, b) => (a.order - b.order) || (a.drill - b.drill));
}

// ═════════════════════════════════════════════════════════════════════
// GRAPH 1 — PER EXERCISE
// ═════════════════════════════════════════════════════════════════════
export function ExerciseTrendGraph({
  planId, traineeId, initialRoot = null, title = 'התקדמות בתרגיל',
}) {
  const [chosen, setChosen] = useState(null);
  const { data, isLoading } = useQuery({
    queryKey: ['progress-graph', planId, traineeId],
    queryFn: () => loadFamilyProgress({ planId, traineeId }),
    enabled: !!planId,
  });

  const sessions = data?.sessions || [];
  const exercises = data?.exercises || [];
  const catalogue = useMemo(
    () => buildSeriesCatalogue(exercises, sessions), [exercises, sessions],
  );
  const active = catalogue.find((c) => c.skey === chosen)
    || catalogue.find((c) => c.root === initialRoot)
    || catalogue[0] || null;

  // One point per performance, carrying the same three statuses the
  // plan-level chart uses, plus that performance's own note.
  const points = useMemo(() => {
    if (!active) return [];
    return sessions.map((s) => {
      const agg = s.perSeries.get(active.skey);
      const note = s.noteOf(active.root);
      if (!agg) return { date: s.date, value: null, status: 'absent', note };
      const metric = active.kind.metric;
      if (!metric || !agg.entered) return { date: s.date, value: null, status: 'noentry', note };
      return { date: s.date, value: Number(agg[metric]) || 0, status: 'entered', note };
    });
  }, [sessions, active]);

  if (!planId) return null;
  if (isLoading) return <div dir="rtl" style={{ ...card, color: MUTED, fontSize: 14 }}>טוען…</div>;

  if (data?.missingColumn) {
    return (
      <div dir="rtl" style={{ ...card, color: MUTED, fontSize: 13, lineHeight: 1.7 }}>
        גרף ההתקדמות דורש את העמודה{' '}
        <span style={{ direction: 'ltr', display: 'inline-block' }}>exercises.source_exercise_id</span>.
        הגרף לא מזהה תרגילים לפי שם — זה היה מאחד תרגילים שונים בטעות.
      </div>
    );
  }

  // Nothing plots until a duplicate has been performed: one point is
  // not a trend, and there is nothing to compare it against.
  if (sessions.length < 2 || !active) {
    return (
      <div dir="rtl" style={{ ...card, fontSize: 13, color: MUTED, lineHeight: 1.7 }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: CHARCOAL, marginBottom: 6 }}>{title}</div>
        עדיין אין מספיק ביצועים להשוואה. אחרי אימון שני מהתוכנית הזאת הגרף יופיע כאן.
      </div>
    );
  }

  const entered = points.filter((p) => p.status === 'entered' && p.value != null);
  const notEnough = entered.length < MIN_SESSIONS;
  const fmt = active.kind.time ? secondsLabel : fmtNum;
  // A fixed work window and a tick-only row have no "better" direction,
  // and a tabata stores nothing at all — those show adherence, labelled
  // as adherence so it is never read as progress.
  const adherence = active.kind.better !== 'up';

  const peak = entered.length ? Math.max(...entered.map((p) => p.value)) : null;
  const first = entered.length ? entered[0].value : null;
  const last = entered.length ? entered[entered.length - 1].value : null;
  const change = (first != null && last != null && first !== 0)
    ? Math.round(((last - first) / Math.abs(first)) * 100) : null;
  const weeks = entered.length > 1
    ? Math.max(1, daysBetween(entered[0].date, entered[entered.length - 1].date) / 7) : 1;
  const weekly = entered.length
    ? entered.reduce((a, p) => a + p.value, 0) / weeks : null;
  const met = active.target != null
    ? entered.filter((p) => p.value >= active.target).length : null;

  const performed = points.filter((p) => p.status !== 'absent').length;
  const streak = (() => {
    let run = 0;
    for (let i = points.length - 1; i >= 0; i -= 1) {
      if (points[i].status === 'absent') break;
      run += 1;
    }
    return run;
  })();

  const latestRating = (() => {
    for (let i = sessions.length - 1; i >= 0; i -= 1) {
      const r = sessions[i].ratingOf(active.root);
      if (r) return r;
    }
    return null;
  })();
  const latestNote = (() => {
    for (let i = points.length - 1; i >= 0; i -= 1) if (points[i].note) return points[i].note;
    return null;
  })();

  return (
    <div dir="rtl" style={card}>
      <div style={{ fontSize: 15, fontWeight: 500, color: CHARCOAL, lineHeight: 1.4 }}>{title}</div>
      <div style={{
        fontSize: 18, fontWeight: 500, color: CHARCOAL, marginTop: 3,
        lineHeight: 1.35, overflowWrap: 'anywhere',
      }}>{active.name}</div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{active.kind.label}</div>

      {/* four metric tiles */}
      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        {adherence ? (
          <>
            <Tile label="בוצע" value={`${performed}/${points.length}`} accent />
            <Tile label="רצף" value={String(streak)} />
            <Tile label="ביצועים" value={String(points.length)} />
            <Tile label="אחרון" value={fmtDate(points[points.length - 1].date)} />
          </>
        ) : (
          <>
            <Tile label="שיא" value={peak == null ? '—' : fmt(peak)} accent />
            <Tile label="ממוצע שבועי" value={weekly == null ? '—' : fmt(Math.round(weekly))} />
            <Tile
              label="יעדים שהושגו"
              value={met == null ? '—' : `${met}/${entered.length}`}
              sub={active.target != null ? `יעד ${fmt(active.target)}` : 'ללא יעד'}
            />
            <Tile label="שינוי" value={change == null ? '—' : `${change > 0 ? '+' : ''}${change}%`} />
          </>
        )}
      </div>

      {/* the trend — or, for a type with no direction, adherence */}
      {adherence ? (
        <div style={{
          marginTop: 12, padding: '12px 11px', background: BAND,
          border: `1px dashed ${BAND_LINE}`, borderRadius: 10,
          fontSize: 12, color: CHARCOAL, lineHeight: 1.65,
        }}>
          {active.kind.key === 'tabata'
            ? 'טבטה היא שעון ואינה שומרת מספר. מוצג רק אם בוצעה.'
            : active.kind.key === 'work'
              ? 'זמן העבודה קבוע בתוכנית, ולכן זמן ארוך יותר אינו שיפור. מוצגת עמידה בתוכנית בלבד.'
              : 'לתרגיל הזה אין ערך נמדד. מוצגת עמידה בתוכנית בלבד.'}
          <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
            {points.map((p, i) => (
              <span key={i} title={fmtDate(p.date)} style={{
                width: 22, height: 22, borderRadius: 6,
                background: p.status === 'absent' ? '#FFFFFF' : ORANGE,
                border: `1px solid ${p.status === 'absent' ? '#E4DACB' : ORANGE}`,
                opacity: p.status === 'noentry' ? 0.45 : 1,
              }} />
            ))}
          </div>
        </div>
      ) : notEnough ? (
        <div style={{
          marginTop: 12, padding: '14px 12px',
          background: '#FBF6EE', border: '1px dashed #E4DACB', borderRadius: 10,
          fontSize: 13, color: MUTED, lineHeight: 1.6,
        }}>
          {entered.length === 0
            ? `אין עדיין ביצועים עם נתונים שהוזנו. צריך ${MIN_SESSIONS} כדי להציג מגמה.`
            : `יש ${entered.length} ביצועים עם נתונים. חסרים עוד ${MIN_SESSIONS - entered.length} כדי להציג מגמה.`}
        </div>
      ) : (
        <>
          <div style={{ marginTop: 12 }}>
            <Chart
              points={points}
              unit={active.kind.unit}
              target={active.target}
              format={fmt}
              showValues
            />
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 11, color: MUTED, marginTop: 2,
          }}>
            <span>{fmtDate(points[points.length - 1].date)}</span>
            <span>{fmtDate(points[0].date)}</span>
          </div>
        </>
      )}

      {/* the trainee's own ratings, from the latest performance carrying any */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${CARD_LINE}` }}>
        <RatingRow label="קושי" value={latestRating?.difficulty ?? null} />
        <RatingRow label="שליטה" value={latestRating?.control ?? null} />
      </div>

      {latestNote && (
        <div style={{
          marginTop: 12, padding: '9px 11px', background: BAND,
          border: `1px solid ${BAND_LINE}`, borderRadius: 8,
          fontSize: 12, color: CHARCOAL, lineHeight: 1.6,
        }}>
          <span style={{ color: MUTED }}>הערה: </span>{latestNote}
        </div>
      )}

      {/* the switcher — move between the family's exercises in place */}
      {catalogue.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
          {catalogue.map((c) => {
            const on = c.skey === active.skey;
            return (
              <button
                key={c.skey}
                type="button"
                onClick={() => setChosen(c.skey)}
                style={{
                  padding: '6px 11px', borderRadius: 999, maxWidth: '100%',
                  border: `1px solid ${on ? ORANGE : CARD_LINE}`,
                  background: on ? ORANGE : '#FFFFFF',
                  color: on ? '#FFFFFF' : CHARCOAL,
                  fontFamily: SANS, fontSize: 12, fontWeight: 500,
                  cursor: 'pointer', lineHeight: 1.5,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >{c.name}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// GRAPH 2 — PER WORKOUT
//
// The whole family, performance by performance: three tiles, a volume
// bar per performance, and one line answering the question a heavier
// bar cannot — is the same work getting EASIER, not just bigger.
// ═════════════════════════════════════════════════════════════════════
export function WorkoutDashboard({ planId, traineeId, title = 'התקדמות באימון' }) {
  const { data, isLoading } = useQuery({
    queryKey: ['progress-graph', planId, traineeId],
    queryFn: () => loadFamilyProgress({ planId, traineeId }),
    enabled: !!planId,
  });

  const sessions = data?.sessions || [];
  const exercises = data?.exercises || [];

  // Volume = every entered number in the performance. Reps and seconds
  // are not the same unit, so this is a relative index compared against
  // the FIRST performance, never an absolute claim.
  const rows = useMemo(() => sessions.map((s) => {
    let volume = 0, entered = false, met = 0, total = 0;
    const diffs = [];
    for (const [root, agg] of s.perExercise) {
      const own = exercises.find(
        (e) => e.training_plan_id === s.planId && (e.source_exercise_id || e.id) === root,
      );
      const kind = own ? exerciseKind(own) : null;
      const target = own && kind ? exerciseTarget(own, kind) : null;
      if (agg.entered) {
        entered = true;
        volume += (Number(agg.reps) || 0) + (Number(agg.seconds) || 0);
        if (target != null && kind?.better === 'up') {
          total += 1;
          const achieved = kind.metric ? Number(agg[kind.metric]) || 0 : 0;
          if (achieved >= target) met += 1;
        }
      }
      const r = s.ratingOf(root);
      if (r?.difficulty != null) diffs.push(r.difficulty);
    }
    return {
      date: s.date,
      volume: entered ? volume : null,
      entered,
      met,
      total,
      difficulty: diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null,
    };
  }), [sessions, exercises]);

  if (!planId) return null;
  if (isLoading) return <div dir="rtl" style={{ ...card, color: MUTED, fontSize: 14 }}>טוען…</div>;
  if (data?.missingColumn) {
    return (
      <div dir="rtl" style={{ ...card, color: MUTED, fontSize: 13, lineHeight: 1.7 }}>
        גרף ההתקדמות דורש את העמודה{' '}
        <span style={{ direction: 'ltr', display: 'inline-block' }}>exercises.source_exercise_id</span>.
      </div>
    );
  }
  if (sessions.length < 2) {
    return (
      <div dir="rtl" style={{ ...card, fontSize: 13, color: MUTED, lineHeight: 1.7 }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: CHARCOAL, marginBottom: 6 }}>{title}</div>
        עדיין אין מספיק ביצועים להשוואה. אחרי אימון שני מהתוכנית הזאת הגרף יופיע כאן.
      </div>
    );
  }

  const withVol = rows.filter((r) => r.volume != null);
  const latest = rows[rows.length - 1];
  const firstVol = withVol.length ? withVol[0].volume : null;
  const lastVol = withVol.length ? withVol[withVol.length - 1].volume : null;
  const volPct = (firstVol && lastVol != null)
    ? Math.round((lastVol / firstVol) * 100) : null;
  const withDiff = rows.filter((r) => r.difficulty != null);
  const firstDiff = withDiff.length ? withDiff[0].difficulty : null;
  const lastDiff = withDiff.length ? withDiff[withDiff.length - 1].difficulty : null;
  const maxVol = withVol.length ? Math.max(...withVol.map((r) => r.volume)) : 1;

  // The summary line. More volume AND a lower reported difficulty is
  // the only combination that means the same work got easier.
  const verdict = (() => {
    if (volPct == null || firstDiff == null || lastDiff == null) {
      return 'עוד אין מספיק דירוגי קושי כדי לדעת אם אותה עבודה נעשית קלה יותר.';
    }
    const heavier = volPct > 105;
    const easier = lastDiff < firstDiff - 0.25;
    if (heavier && easier) return 'יותר עבודה ובקושי נמוך יותר — אותה עבודה נעשית קלה יותר.';
    if (heavier && !easier) return 'הנפח עלה אבל הקושי המדווח לא ירד — עדיין מאמץ מלא.';
    if (!heavier && easier) return 'אותו נפח בקושי נמוך יותר — הגוף מסתגל.';
    return 'הנפח והקושי יציבים.';
  })();

  return (
    <div dir="rtl" style={card}>
      <div style={{ fontSize: 15, fontWeight: 500, color: CHARCOAL, lineHeight: 1.4 }}>{title}</div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <Tile
          label="יעדים שהושגו"
          value={latest.total ? `${latest.met}/${latest.total}` : '—'}
          sub="בביצוע האחרון"
          accent
        />
        <Tile
          label="נפח כולל"
          value={volPct == null ? '—' : `${volPct}%`}
          sub="מול הראשון"
        />
        <Tile
          label="קושי ממוצע"
          value={(firstDiff == null || lastDiff == null)
            ? '—'
            : `${fmtNum(Math.round(firstDiff * 10) / 10)} → ${fmtNum(Math.round(lastDiff * 10) / 10)}`}
        />
      </div>

      {/* a bar per performance, the number on it, opacity by recency */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 6,
        marginTop: 14, height: 132, direction: 'rtl',
      }}>
        {rows.map((r, i) => {
          const h = r.volume == null ? 0 : Math.max(6, (r.volume / maxVol) * 96);
          const recency = 0.35 + 0.65 * ((i + 1) / rows.length);
          return (
            <div key={i} style={{
              flex: '1 1 0', minWidth: 0, display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
            }}>
              <span style={{
                fontSize: 10, fontWeight: 600, color: CHARCOAL,
                marginBottom: 3, direction: 'ltr',
              }}>{r.volume == null ? '' : fmtNum(r.volume)}</span>
              {r.volume == null ? (
                // not performed, or performed with nothing entered — a
                // hollow stub, never a bar that implies a number
                <div style={{
                  width: '100%', height: 6, borderRadius: 3,
                  border: '1px dashed #E4DACB', background: '#FFFFFF',
                }} />
              ) : (
                <div style={{
                  width: '100%', height: h, borderRadius: '4px 4px 0 0',
                  background: ORANGE, opacity: recency,
                }} />
              )}
              <span style={{ fontSize: 9, color: MUTED, marginTop: 4, whiteSpace: 'nowrap' }}>
                {fmtDate(r.date)}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 14, padding: '10px 11px', background: BAND,
        border: `1px solid ${BAND_LINE}`, borderRadius: 8,
        fontSize: 12, color: CHARCOAL, lineHeight: 1.65,
      }}>{verdict}</div>

      <div style={{ fontSize: 10, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
        נפח = סך הערכים שהוזנו באותו ביצוע. חזרות ושניות אינן אותה יחידה,
        ולכן זהו מדד יחסי מול הביצוע הראשון בלבד.
      </div>
    </div>
  );
}

export default ExerciseTrendGraph;
