import React, { useContext, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { AuthContext } from '@/lib/AuthContext';
import { createPlanFromSpec } from '@/lib/plansApi';

/**
 * TEMPORARY. Delete this file and its route in App.jsx as soon as the
 * plan below has been ingested.
 *
 * It exists for one reason: createPlanFromSpec takes the coach id from
 * the CALL SITE and the call site is required to read it from
 * AuthContext, which only exists inside the running app. So the insert
 * has to be triggered from a screen, not from a script.
 *
 * Coach-only: "DevIngestPlan" is in neither traineeOnlyPages nor
 * sharedPages in App.jsx, so PageRouteGuard bounces trainees.
 */

const TRAINEE_ID = '48cb1b24-c421-4ae6-b8d5-ad860d87f55b';

// The spec, verbatim. start_date is deliberately omitted so
// createPlanFromSpec stamps today at click time.
const SPEC_SECTIONS = [
  {
    section_name: 'חימום',
    exercises: [
      {
        name: 'קפיצות חופשיות · בסיס, החלפת רגליים',
        mode: 'חזרות', work_time: 120, track_for_measurement: false,
      },
      {
        name: 'פיסוק לפנים ולצדדים, מצד לצד, לפנים ולאחור, הצלבה',
        mode: 'חזרות', work_time: 60, track_for_measurement: false,
      },
    ],
  },
  {
    section_name: 'מתיחות',
    exercises: [
      {
        name: 'מתיחה לכל חלקי הגוף · ראש, כתפיים בתחנת רוח',
        mode: 'חזרות', static_hold_time: 20, side: 'דו־צדדי',
      },
      {
        name: 'אגן ושרירי הרגליים',
        mode: 'חזרות', static_hold_time: 20,
      },
    ],
  },
  {
    section_name: 'כוח',
    exercises: [
      {
        name: 'סקוואט · לחיצות כתפיים',
        mode: 'קומבו', reps: 25, sets: 1,
        track_for_measurement: true, description: 'ברצף',
      },
      {
        name: 'חצי סמוך קום',
        mode: 'חזרות', reps: 25, sets: 1, track_for_measurement: true,
      },
      {
        name: '3 עליות מתח · 5 שכיבות סמיכה',
        mode: 'סופרסט', sets: 4, track_for_measurement: true,
        description: 'אחד אחרי השני',
        sub_exercises: [
          { name: 'עליות מתח', reps: 3 },
          { name: 'שכיבות סמיכה', reps: 5 },
        ],
      },
      {
        name: 'טבטה בטן',
        mode: 'טבטה', weight_type: 'bodyweight',
        sub_exercises: [
          { name: 'עלייה לישיבה', work_time: 30, rest_time: 5 },
          { name: 'טיפוס הרים', work_time: 30, rest_time: 5 },
          { name: 'עלייה לישיבה', work_time: 30, rest_time: 5 },
          { name: 'טיפוס הרים', work_time: 30, rest_time: 5 },
        ],
      },
    ],
  },
  {
    section_name: 'גמישות',
    exercises: [
      { name: 'קוברה וחתול', mode: 'חזרות', static_hold_time: 30 },
      {
        name: 'מכרעים ברגל ישרה, לפנים ולאחור',
        mode: 'חזרות', static_hold_time: 30, side: 'דו־צדדי',
      },
      { name: 'מתיחות לחגורת הכתפיים על הסולם', mode: 'חזרות', static_hold_time: 30 },
    ],
  },
  {
    section_name: 'הערות',
    coach_notes: 'דגש · תרגול תנועת החלפת הרגליים והרמת הברכיים. האולרים בסגנון שעשינו עם הכדור בין הרגליים',
    // No exercises. See the warning rendered below the button.
  },
];

export default function DevIngestPlan() {
  const { user } = useContext(AuthContext);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    if (busy || result) return;          // one plan, one click
    setBusy(true); setError(null);
    try {
      const plan = await createPlanFromSpec({
        // FROM AuthContext. Never hardcoded.
        coachId: user?.id,
        traineeId: TRAINEE_ID,
        title: 'תוכנית אימונים · דניאל פיש',
        status: 'פעילה',
        sections: SPEC_SECTIONS,
      });
      // Read the whole thing back so the result can be copied out.
      const [{ data: secs }, { data: exs }] = await Promise.all([
        supabase.from('training_sections').select('*')
          .eq('training_plan_id', plan.id).order('order', { ascending: true }),
        supabase.from('exercises').select('*')
          .eq('training_plan_id', plan.id).order('order', { ascending: true }),
      ]);
      setResult({ plan, sections: secs || [], exercises: exs || [] });
    } catch (e) {
      console.error('[DevIngestPlan]', e);
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const box = {
    background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8,
    fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap',
    wordBreak: 'break-all', direction: 'ltr', textAlign: 'left',
    maxHeight: 460, overflow: 'auto',
  };

  return (
    <div dir="rtl" style={{
      padding: 20, fontFamily: "'Rubik', system-ui, sans-serif",
      maxWidth: 760, margin: '0 auto',
    }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
        קליטת תוכנית — כלי זמני
      </h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
        לחיצה אחת יוצרת את התוכנית. המסך הזה נמחק מיד אחרי.
      </p>

      <div style={{
        background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
        padding: 12, fontSize: 13, marginBottom: 14, lineHeight: 1.8,
      }}>
        <div><b>מאמן (מ-AuthContext):</b> {user?.full_name || '—'} · {user?.id || 'לא מחובר'}</div>
        <div><b>מתאמן:</b> {TRAINEE_ID}</div>
        <div><b>מקטעים:</b> {SPEC_SECTIONS.length} · <b>תרגילים:</b> {
          SPEC_SECTIONS.reduce((n, s) => n + (s.exercises?.length || 0), 0)
        }</div>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={busy || !!result || !user?.id}
        style={{
          width: '100%', minHeight: 52, borderRadius: 8, border: 'none',
          background: result ? '#16a34a' : '#FF6F20', color: '#fff',
          fontSize: 16, fontWeight: 700, fontFamily: 'inherit',
          cursor: busy || result ? 'default' : 'pointer',
          opacity: (busy || !user?.id) ? 0.6 : 1,
        }}
      >
        {result ? 'נוצר ✓' : busy ? 'יוצר…' : 'צור את התוכנית'}
      </button>

      <p style={{ fontSize: 12, color: '#B45309', marginTop: 12, lineHeight: 1.6 }}>
        שים לב: מקטע &quot;הערות&quot; מוגדר עם coach_notes בלבד וללא תרגילים.
        PlanSheet מסנן מקטעים ריקים, ולכן הוא לא יופיע במסך המתאמן.
      </p>

      {error && (
        <pre style={{ ...box, background: '#7f1d1d', marginTop: 14 }}>{error}</pre>
      )}

      {result && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            plan {result.plan.id} · {result.sections.length} sections ·{' '}
            {result.exercises.length} exercises
          </div>
          <pre style={box}>{JSON.stringify(result, null, 1)}</pre>
        </div>
      )}
    </div>
  );
}
