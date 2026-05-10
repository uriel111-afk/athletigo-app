---
name: athletigo-app-dev
description: Complete technical reference for AthletiGo PWA development. Use ALWAYS for any code, bug, UI, DB, or feature work.
---

# AthletiGo — Complete Reference (May 2026)

## Key IDs
- Supabase: rrxcycidsojncpqlagsf
- Coach ID: 67b0093d-d4ca-4059-8572-26f020bef1eb
- Coach Email: uriel111@gmail.com
- Test Trainee: athletigo@gmail.com
- Vercel Hook: https://api.vercel.com/v1/integrations/deploy/prj_5UisHw6yXTG36RgmN7UDIfqbbngM/27hqgYETQd
- Repo: github.com/uriel111-afk/athletigo-app
- Domain: athletigo-coach.com

## Deploy Command (end every prompt with this)
npm run build && git add -A && git commit -m "fix: description" && git push origin main
curl --ssl-no-revoke -X POST "https://api.vercel.com/v1/integrations/deploy/prj_5UisHw6yXTG36RgmN7UDIfqbbngM/27hqgYETQd"

## CRITICAL Column Names
- rest_time (NOT rest), work_time (NOT work)
- plan_name (NOT name for training_plans)
- training_sections (NOT plan_sections)
- training_plan_id (NOT plan_id in sections)
- tabata_data (NOT tabata_config)
- body_position (NOT position)
- client_status (NOT status for users)
- workout_template_id IS nullable

## Client Status Flow
onboarding → casual → active → suspended → graduated
English values only. After onboarding + health declaration = casual.
Trainee NEVER sees their own status — coach only.

## DB Tables & Key Columns

### users
id, full_name, email, phone, role, coach_id, birth_date,
client_status, onboarding_completed, onboarding_completed_at,
onboarding_summary, health_declaration_signed BOOLEAN,
health_declaration_signed_at, height, weight, fitness_level,
goal_focus TEXT[], weekly_days TEXT[], training_goals TEXT[],
goals_description, fitness_background, fitness_experience,
preferred_frequency, current_challenges TEXT[],
training_preferences TEXT[], additional_notes, avatar_url,
gender TEXT, challenge_details JSONB, preference_details JSONB,
created_at

### training_plans
id, coach_id, plan_name, title, assigned_to, series_id,
goal_focus TEXT[], weekly_days TEXT[], difficulty_level,
duration_weeks, start_date, description, status, created_at

### training_sections
id, training_plan_id, name, category, sort_order, color,
coach_notes TEXT, created_at

### exercises
id, section_id, plan_id, name, sort_order,
sets, reps, rounds, weight, rest_time, work_time,
tempo, rpe, static_hold_time, equipment TEXT[],
side, range_of_motion, grip, body_position,
video_url, description, tabata_data, param_order TEXT[],
created_at

### workout_executions
id, trainee_id, plan_id, workout_template_id (nullable),
executed_at, self_rating NUMERIC, completion_percent NUMERIC,
section_ratings JSONB, notes TEXT, feedback_chips TEXT[], created_at

### exercise_set_logs
id, execution_id, exercise_id, set_number,
reps_completed, time_completed, weight_used,
completed BOOLEAN DEFAULT false,
difficulty_rating INTEGER, notes TEXT, created_at

### goals
id, trainee_id, title TEXT, description TEXT,
progress NUMERIC DEFAULT 0, status TEXT,
goal_type TEXT, target_value, current_value, start_value,
unit TEXT, linked_plan_id UUID, target_date DATE,
success_definition TEXT, measurements JSONB DEFAULT '[]',
linked_exercise_id UUID, auto_update BOOLEAN DEFAULT true,
completed_at TIMESTAMPTZ, source TEXT, created_at

### records (personal_records)
id, trainee_id, exercise_id, exercise_name TEXT,
value NUMERIC, unit TEXT, achieved_at TIMESTAMPTZ,
execution_id UUID, created_at

### measurements
id, user_id, date, weight_kg, height_cm, body_fat, notes, created_at

### health_declarations
id, trainee_id, signed_at, content TEXT,
trainee_name TEXT, trainee_id_number TEXT, created_at

### journal_workouts
id, user_id, title, date, notes, overall_rating NUMERIC, created_at

### journal_sections
id, workout_id, name, notes, sort_order, created_at

### journal_exercises
id, section_id, name, parameters TEXT, notes, sort_order, created_at

### notifications
id, user_id, type, title, message, is_read BOOLEAN DEFAULT false, created_at

## RLS Policies
- Coaches INSERT workout_executions for their trainees:
  EXISTS (SELECT 1 FROM users WHERE id=trainee_id AND coach_id=auth.uid())

## Component Map

### THE Workout View
UnifiedPlanBuilder.jsx = ONLY workout view:
- canEdit=true isCoach=true → coach editor
- canEdit=false isCoach=false → trainee active workout

### Training Flow
```
UnifiedPlanBuilder.jsx     — single workout view
SectionCard.jsx            — collapsible section
  - border-RIGHT, unique color by index, NEVER from DB
  - coach_notes above exercises
  - section name 18px bold, shown ONCE
  - shows sectionRating chip (⭐ X/10) after trainee rates
ExerciseCard.jsx           — exercise with per-set inputs
  - tap name → centered modal (detail + set filling)
  - collapse/expand with single tap
  - per-set: reps + ✓ + difficulty 1-10
  - summary: השלמה% + קושי ממוצע
ModernExerciseForm.jsx     — parameter editor
  - 4-col tab grid, no default selected, toggle to close
  - multi-open tabs simultaneously
  - time picker: minutes:seconds
  - "נקה" button per param
  - drag to reorder params (param_order saved to DB)
WorkoutFolderDetail.jsx    — folder detail
  - graph: orange=score, blue=completion%
  - master card labeled "תוכנית המאמן"
  - blank execution → "התחל אימון ▶"
  - completed → read-only accordion
  - action menu ⋮: copy/edit/duplicate/delete
WorkoutExecutionReadOnly.jsx — completed workout view
  - shows reps + difficulty per set
```

### Pages
```
Dashboard.jsx       — Coach home
  - App tabs (מקצועי/פיננסי/צמיחה/אישי): dark pill #1a1a1a
  - גישה מהירה: 4-col grid, small icons
  - פעולות ליבה: diamond shape cards, large icons
CoachHub.jsx        — Hub for app switching
TraineeProfile.jsx  — Coach views trainee (tabs: היכרות/יעדים/מדידות/שיאים/מסמכים/פרטים)
Workouts.jsx        — Trainee workouts
TrainingPlans.jsx   — Coach plans list (filter by trainee name)
Journal.jsx         — מחברת אימונים (coach + trainee, in hamburger menu)
Onboarding.jsx      — 6 steps
  Step 1: פרטים + gender (זכר/נקבה/אחר)
  Step 2: מדידות → measurements table
  Step 3: יעדים → goals table (source=onboarding)
  Step 4: אודות (chips + free text expansion)
  Step 5: הצהרת בריאות → health_declarations + client_status=casual
  Step 6: אישור מפגש (if pending session exists)
  After signing → onboarding_completed=true, never shows again
Login.jsx           — PWA install prompt (light orange, inline)
Sessions.jsx        — מפגשים, tabs: היום/קרובים/החודש/הושלמו
```

## Section Colors (by index, NEVER from DB)
```jsx
const SECTION_COLORS = [
  '#FF6F20','#1E3A5F','#22c55e','#FF6F20CC',
  '#0EA5E9','#F59E0B','#7C3AED','#EF4444','#0D9488','#1E3A5F99'
];
// ALWAYS: SECTION_COLORS[sectionIndex % SECTION_COLORS.length]
```

## Design System
- Primary: #FF6F20 orange
- Background page: #F5F0EB
- Background card: white
- Text: #1a1a1a / #888 secondary
- Border: #F0E4D0
- Font: Barlow / Barlow Condensed
- Direction: RTL always
- Section border: RIGHT side, 3px solid

## Time Display (ALWAYS use formatTime)
```js
// src/lib/formatTime.js
export const formatTime = (seconds) => {
  if (!seconds && seconds !== 0) return '';
  const s = parseInt(seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return sec + " שנ׳";
  if (sec === 0) return m + " דק׳";
  return m + ':' + sec.toString().padStart(2, '0');
};
```
NEVER display raw seconds or apostrophes ('').
Import and use formatTime everywhere time is displayed.

## Workout Execution Flow

### Per-set tracking (trainee):
1. Reps input + ✓ button per set
2. After ✓ → 1-10 difficulty buttons
3. After rating → "קושי X/10" chip
4. All sets done → summary row

### Section popup (fires ONCE per section, never again):
- Slider 1: שליטה 1-10
- Slider 2: אתגר 1-10
- Section score = average both
- Saved to sectionRatings state
- ratedSectionsRef guards against re-firing

### Workout completion popup (dark #1a1a1a):
- Score = average of all section scores → self_rating
- 8 feedback chips + free text
- Buttons: "צפה בתוצאות" + "שכפל לשיפור"
- Saves: workout_executions + exercise_set_logs

### Graph (WorkoutFolderDetail):
- Orange line = self_rating
- Blue dashed = completion_percent/10
- Tooltip: "ציון: X | השלמה: XX%"

## Goals System
- Types: distance/reps/weight_loss/weight_gain/skill/time/body/custom
- Auto-sync: workout → records → goals (syncGoalsFromPR)
- Auto-sync: weight measurement → weight goals
- Goal completion: status='הושג' when current_value >= target_value
- Graph per goal: measurements JSONB array → AreaChart

## Health Declaration
- Shows full document + ID number + date + signature together
- ID number required (9 digits) before signing
- After signing: health_declaration_signed=true + signed_at + client_status=casual
- localStorage backup prevents re-showing
- Coach can view full signed document in מסמכים tab

## Documents Tab
- Coach can delete any document EXCEPT הצהרת בריאות
- הסכם שיתוף פעולה NOT shown by default
- הצהרת בריאות is mandatory and cannot be deleted

## Notifications
- Filtered: is_read=false only
- Dismiss: writes is_read=true + localStorage backup
- Never reappear after dismissal

## Journal (מחברת אימונים)
- Route: /journal (hamburger menu, coach + trainee)
- Free-form: sections + exercises with text parameters
- Rating 1-10 per workout
- Stable keys + onBlur save (keyboard stays open)
- Tables: journal_workouts, journal_sections, journal_exercises

## Prompt Writing Rules
1. Specify exact file path
2. grep -n to find location first
3. One file per prompt when possible
4. Always end with deploy command
5. Print SQL separately for Supabase
6. Never use wrong column names
7. Save tokens: target specific lines/sections

## Keyboard on Mobile
ALWAYS use onBlur (not onChange) to save, stable keys, autoComplete="off" spellCheck={false}
to prevent keyboard dismissal on every keystroke.

## Formatting Rule
STRICT: Never mix Hebrew and English on the same line.
