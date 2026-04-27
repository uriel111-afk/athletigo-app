import React, { useState } from "react";

// 4-screen intake questionnaire used inside /Onboarding right after
// the personal-info step. Pure controlled component — the parent
// (Onboarding.jsx) owns the answers via `value` + `onChange` and
// decides what to do on `onComplete`.
//
// Schema → users columns:
//   training_goal        → users.training_goals (multi-select array;
//                          the questionnaire owns the list and merges
//                          the user's picks into the canonical
//                          training_goals[] column on save)
//   fitness_level        → users.fitness_level
//   preferred_frequency  → users.preferred_frequency  (NEW col)
//   current_challenges[] → users.current_challenges   (NEW JSONB)
//   training_preferences[] → users.training_preferences (NEW JSONB)
//   additional_notes     → users.additional_notes     (NEW col)

// Hebrew labels written in dual-gender (-/ה) per spec.
const SCREEN_1_GOALS = [
  { value: 'strength',     emoji: '💪', label: 'חיזוק והתחשלות' },
  { value: 'weight_loss',  emoji: '⚖️', label: 'ירידה במשקל' },
  { value: 'flexibility',  emoji: '🤸', label: 'גמישות ותנועתיות' },
  { value: 'endurance',    emoji: '🏃', label: 'סיבולת וכושר' },
  { value: 'skill',        emoji: '🎯', label: 'מיומנות ספציפית' },
  { value: 'wellbeing',    emoji: '😊', label: 'הנאה ותחושה טובה' },
];

const SCREEN_2_FITNESS = [
  { value: 'beginner',     emoji: '🌱', label: 'מתחיל/ה' },
  { value: 'intermediate', emoji: '🌿', label: 'בינוני/ת' },
  { value: 'advanced',     emoji: '🌳', label: 'מתקדם/ת' },
  { value: 'athlete',      emoji: '🏆', label: 'ספורטאי/ת' },
];
const SCREEN_2_FREQUENCY = [
  { value: '1-2',     label: '1-2' },
  { value: '3-4',     label: '3-4' },
  { value: '5-6',     label: '5-6' },
  { value: 'daily',   label: 'כל יום' },
];

const SCREEN_3_CHALLENGES = [
  { value: 'motivation',  emoji: '😫', label: 'חוסר מוטיבציה' },
  { value: 'time',        emoji: '⏰', label: 'חוסר זמן' },
  { value: 'injuries',    emoji: '🤕', label: 'כאבים או פציעות' },
  { value: 'where_start', emoji: '🤷', label: 'קושי לדעת מאיפה להתחיל' },
  { value: 'plateau',     emoji: '📉', label: 'תחושת עצירה' },
  { value: 'nutrition',   emoji: '🍔', label: 'תזונה לא מסודרת' },
];
const SCREEN_3_PREFERENCES = [
  { value: 'fast_results',  emoji: '🎯', label: 'תוצאות מהירות' },
  { value: 'technique',     emoji: '🧠', label: 'טכניקה נכונה' },
  { value: 'guidance',      emoji: '🤝', label: 'ליווי אישי צמוד' },
  { value: 'tracking',      emoji: '📊', label: 'מעקב ומדידות' },
  { value: 'variety',       emoji: '🎮', label: 'גיוון ואתגרים' },
  { value: 'calm',          emoji: '🧘', label: 'רוגע ומתיחות' },
];

const COLORS = {
  primary: '#FF6F20',
  primaryLight: '#FFF5EE',
  bg: '#FDF8F3',
  card: '#FFFFFF',
  border: '#F0E4D0',
  text: '#1A1A1A',
  textSoft: '#6B7280',
  textMuted: '#9CA3AF',
  success: '#16A34A',
};

export default function OnboardingQuestionnaire({ value, onChange, onComplete, onSkip }) {
  // Local screen index — kept inside the component so the parent
  // doesn't have to manage wizard state. The collected answers DO
  // live on the parent (via `value` + `onChange`) so they survive
  // navigating away and coming back.
  const [screen, setScreen] = useState(1);

  const set = (patch) => onChange?.({ ...value, ...patch });
  const toggleInArray = (key, item) => {
    const cur = Array.isArray(value?.[key]) ? value[key] : [];
    const next = cur.includes(item)
      ? cur.filter((v) => v !== item)
      : [...cur, item];
    set({ [key]: next });
  };

  // Validation per screen — what's required to enable "הבא".
  // Screen 1 is now multi-select; at least one goal must be picked.
  const screen1Goals = Array.isArray(value?.training_goal)
    ? value.training_goal
    : (value?.training_goal ? [value.training_goal] : []);
  const screenValid = (() => {
    switch (screen) {
      case 1: return screen1Goals.length > 0;
      case 2: return !!value?.fitness_level && !!value?.preferred_frequency;
      case 3: return true;  // multi-selects are optional
      case 4: return true;  // free-text is optional
      default: return true;
    }
  })();

  const next = () => {
    if (!screenValid) return;
    if (screen < 4) setScreen(screen + 1);
    else onComplete?.();
  };
  const back = () => { if (screen > 1) setScreen(screen - 1); };

  return (
    <div dir="rtl" style={{
      background: COLORS.bg,
      borderRadius: 14,
      padding: '20px 18px 22px',
      fontFamily: "'Heebo', 'Assistant', sans-serif",
      color: COLORS.text,
    }}>
      {/* Progress dots — 4 circles, current = orange, past = green,
          future = gray. Stays at the top of the card so the user
          always sees how far they are. */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{
            width: 12, height: 12, borderRadius: 999,
            background: i < screen ? COLORS.success
                      : i === screen ? COLORS.primary
                      : '#E5E7EB',
            transition: 'background 0.25s ease',
          }} />
        ))}
      </div>

      {/* Slide-in animation between screens — keyframes inline so the
          component stays self-contained. */}
      <style>{`
        @keyframes ob-slide-in {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div key={screen} style={{ animation: 'ob-slide-in 0.3s ease-out' }}>
        {screen === 1 && <Screen1 value={value} set={set} toggleInArray={toggleInArray} />}
        {screen === 2 && <Screen2 value={value} set={set} />}
        {screen === 3 && <Screen3 value={value} set={set} toggleInArray={toggleInArray} />}
        {screen === 4 && <Screen4 value={value} set={set} onSkip={onSkip} />}
      </div>

      {/* Footer nav */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
        <button
          type="button"
          onClick={next}
          disabled={!screenValid}
          style={{
            width: '100%', padding: '14px 18px', borderRadius: 14, border: 'none',
            background: screenValid ? COLORS.primary : '#E5E7EB',
            color: screenValid ? '#FFFFFF' : COLORS.textMuted,
            fontSize: 16, fontWeight: 800,
            cursor: screenValid ? 'pointer' : 'not-allowed',
            fontFamily: "'Heebo', 'Assistant', sans-serif",
          }}
        >
          {screen === 4 ? 'סיימתי! 🎉' : 'הבא →'}
        </button>
        {screen > 1 && (
          <button
            type="button"
            onClick={back}
            style={{
              width: '100%', padding: '8px 0', borderRadius: 10, border: 'none',
              background: 'transparent', color: COLORS.textSoft,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'Heebo', 'Assistant', sans-serif",
            }}
          >← חזרה</button>
        )}
      </div>
    </div>
  );
}

// ─── Reusable bits ─────────────────────────────────────────────

const Header = ({ title, subtitle }) => (
  <div style={{ textAlign: 'center', marginBottom: 18 }}>
    <h2 style={{ fontSize: 22, fontWeight: 800, color: COLORS.text, marginBottom: 6 }}>{title}</h2>
    {subtitle && (
      <p style={{ fontSize: 13, color: COLORS.textSoft, lineHeight: 1.5 }}>{subtitle}</p>
    )}
  </div>
);

const SectionLabel = ({ children }) => (
  <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.text, marginBottom: 10, marginTop: 14, textAlign: 'right' }}>
    {children}
  </div>
);

// Big choice button — used in the 2-column grids on screens 1 and 3.
function ChoiceButton({ active, multi, onClick, emoji, label }) {
  // Multi-select uses the lighter "tinted" style so users see at a
  // glance that more than one can be picked. Single-select uses the
  // bold filled style.
  const style = active ? (
    multi
      ? { background: COLORS.primaryLight, color: COLORS.primary, border: `2px solid ${COLORS.primary}` }
      : { background: COLORS.primary,      color: '#FFFFFF',     border: `2px solid ${COLORS.primary}` }
  ) : { background: COLORS.card, color: COLORS.text, border: `2px solid ${COLORS.border}` };
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...style,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '14px 8px', borderRadius: 14,
        cursor: 'pointer',
        fontSize: 13, fontWeight: 700,
        textAlign: 'center', lineHeight: 1.3,
        minHeight: 78,
        fontFamily: "'Heebo', 'Assistant', sans-serif",
        transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
      }}
    >
      <span style={{ fontSize: 22, marginBottom: 4 }}>{emoji}</span>
      <span>{label}</span>
    </button>
  );
}

// Pill button — used on screen 2 horizontal rows.
function Pill({ active, onClick, emoji, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '10px 18px', borderRadius: 25,
        background: active ? COLORS.primary : COLORS.card,
        color: active ? '#FFFFFF' : COLORS.text,
        border: `2px solid ${active ? COLORS.primary : COLORS.border}`,
        fontSize: 13, fontWeight: 700, cursor: 'pointer',
        whiteSpace: 'nowrap', flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontFamily: "'Heebo', 'Assistant', sans-serif",
      }}
    >
      {emoji && <span style={{ fontSize: 14 }}>{emoji}</span>}
      <span>{label}</span>
    </button>
  );
}

// ─── Individual screens ────────────────────────────────────────

function Screen1({ value, set, toggleInArray }) {
  // Goals are now multi-select. Be lenient about how the value is
  // shaped on disk — older drafts may have a single string.
  const goals = Array.isArray(value?.training_goal)
    ? value.training_goal
    : (value?.training_goal ? [value.training_goal] : []);
  const description = value?.goals_description || '';
  return (
    <>
      <Header
        title="מה המטרה שלך?"
        subtitle="אפשר לבחור כמה מטרות"
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {SCREEN_1_GOALS.map((g) => (
          <ChoiceButton
            key={g.value} multi
            active={goals.includes(g.value)}
            onClick={() => toggleInArray('training_goal', g.value)}
            emoji={g.emoji}
            label={g.label}
          />
        ))}
      </div>

      {/* Free-text expansion — appears once at least one goal is
          picked. Not required: the trainee can leave it blank and
          still advance. */}
      {goals.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{
            fontSize: 13, color: '#888',
            marginBottom: 4, direction: 'rtl', textAlign: 'right',
          }}>
            רוצה להרחיב על המטרות שבחרת? (לא חובה)
          </div>
          <textarea
            value={description}
            onChange={(e) => set({ goals_description: e.target.value })}
            placeholder="למשל: רוצה להגיע ל-Muscle Up תוך חצי שנה, לחזק את הכתפיים בגלל פציעה ישנה..."
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 12,
              border: `1px solid ${COLORS.border}`, background: COLORS.card,
              fontSize: 14, color: COLORS.text,
              direction: 'rtl', textAlign: 'right',
              minHeight: 80, resize: 'vertical',
              outline: 'none', boxSizing: 'border-box',
              fontFamily: "'Heebo', 'Assistant', sans-serif",
            }}
          />
        </div>
      )}
    </>
  );
}

function Screen2({ value, set }) {
  return (
    <>
      <Header title="קצת על עצמך" />
      <SectionLabel>מה רמת הכושר הנוכחית?</SectionLabel>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {SCREEN_2_FITNESS.map((f) => (
          <Pill key={f.value} active={value?.fitness_level === f.value}
                onClick={() => set({ fitness_level: f.value })}
                emoji={f.emoji} label={f.label} />
        ))}
      </div>
      <SectionLabel>כמה פעמים בשבוע מעניין אותך להתאמן?</SectionLabel>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {SCREEN_2_FREQUENCY.map((f) => (
          <Pill key={f.value} active={value?.preferred_frequency === f.value}
                onClick={() => set({ preferred_frequency: f.value })}
                label={f.label} />
        ))}
      </div>
    </>
  );
}

function Screen3({ value, set, toggleInArray }) {
  const challenges    = Array.isArray(value?.current_challenges)    ? value.current_challenges    : [];
  const preferences   = Array.isArray(value?.training_preferences) ? value.training_preferences : [];
  const challengesDesc  = value?.challenges_description  || '';
  const preferencesDesc = value?.preferences_description || '';
  return (
    <>
      <Header
        title="מה נוכל לשפר ביחד?"
        subtitle="אפשר לבחור כמה תשובות"
      />
      <SectionLabel>מה האתגר הגדול ביותר כרגע?</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {SCREEN_3_CHALLENGES.map((c) => (
          <ChoiceButton
            key={c.value} multi
            active={challenges.includes(c.value)}
            onClick={() => toggleInArray('current_challenges', c.value)}
            emoji={c.emoji} label={c.label}
          />
        ))}
      </div>
      {challenges.length > 0 && (
        <textarea
          value={challengesDesc}
          onChange={(e) => set({ challenges_description: e.target.value })}
          placeholder="רוצה להרחיב על האתגרים? (לא חובה)"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 12,
            border: `1px solid ${COLORS.border}`, background: COLORS.card,
            fontSize: 13, color: COLORS.text,
            direction: 'rtl', textAlign: 'right',
            minHeight: 60, resize: 'vertical', marginTop: 10,
            outline: 'none', boxSizing: 'border-box',
            fontFamily: "'Heebo', 'Assistant', sans-serif",
          }}
        />
      )}

      <SectionLabel>מה הדבר הכי חשוב באימון?</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {SCREEN_3_PREFERENCES.map((p) => (
          <ChoiceButton
            key={p.value} multi
            active={preferences.includes(p.value)}
            onClick={() => toggleInArray('training_preferences', p.value)}
            emoji={p.emoji} label={p.label}
          />
        ))}
      </div>
      {preferences.length > 0 && (
        <textarea
          value={preferencesDesc}
          onChange={(e) => set({ preferences_description: e.target.value })}
          placeholder="רוצה להרחיב על ההעדפות? (לא חובה)"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 12,
            border: `1px solid ${COLORS.border}`, background: COLORS.card,
            fontSize: 13, color: COLORS.text,
            direction: 'rtl', textAlign: 'right',
            minHeight: 60, resize: 'vertical', marginTop: 10,
            outline: 'none', boxSizing: 'border-box',
            fontFamily: "'Heebo', 'Assistant', sans-serif",
          }}
        />
      )}
    </>
  );
}

function Screen4({ value, set, onSkip }) {
  return (
    <>
      <Header
        title="רוצה להוסיף משהו?"
        subtitle="לא חובה — אפשר לדלג"
      />
      <textarea
        value={value?.additional_notes || ''}
        onChange={(e) => set({ additional_notes: e.target.value })}
        placeholder="פציעות, מגבלות, העדפות, ציפיות — כל דבר שיעזור לנו להתאים את התהליך..."
        rows={6}
        style={{
          width: '100%', padding: '12px 14px', borderRadius: 14,
          border: `1px solid ${COLORS.border}`, background: COLORS.card,
          fontSize: 14, color: COLORS.text, outline: 'none',
          resize: 'vertical', minHeight: 130,
          fontFamily: "'Heebo', 'Assistant', sans-serif",
          textAlign: 'right',
          boxSizing: 'border-box',
        }}
      />
      {onSkip && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button
            type="button"
            onClick={onSkip}
            style={{
              background: 'transparent', border: 'none',
              color: COLORS.textSoft, fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'Heebo', 'Assistant', sans-serif",
            }}
          >דלג</button>
        </div>
      )}
    </>
  );
}
