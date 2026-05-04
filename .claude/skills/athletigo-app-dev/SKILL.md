---
name: athletigo-app-dev
description: >
  Complete technical reference for developing the AthletiGo PWA (React + Vite + Supabase + Vercel). Use this skill ALWAYS when writing code, fixing bugs, creating prompts for Claude Code, or making any technical decision about the AthletiGo app.
---

# AthletiGo App Development — Complete Reference

## Tech Stack
| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Backend | Supabase (Postgres + Auth + Realtime) |
| Hosting | Vercel (auto-deploy from GitHub main) |
| Repo | github.com/uriel111-afk/athletigo-app |
| Domain | athletigo-coach.com |
| PWA | manifest.json + service worker |

## Key IDs
| Item | Value |
|---|---|
| Supabase Project | rrxcycidsojncpqlagsf |
| Coach ID | 67b0093d-d4ca-4059-8572-26f020bef1eb |
| Coach Email | uriel111@gmail.com |
| Test Trainee | athletigo@gmail.com |
| Vercel Hook | https://api.vercel.com/v1/integrations/deploy/prj_5UisHw6yXTG36RgmN7UDIfqbbngM/27hqgYETQd |

## Deploy Command (always end prompts with this)
```
npm run build && git add -A && git commit -m "fix/feat: description" && git push origin main && curl --ssl-no-revoke -X POST "https://api.vercel.com/v1/integrations/deploy/prj_5UisHw6yXTG36RgmN7UDIfqbbngM/27hqgYETQd"
```

## Database Schema

### users
id, full_name, email, phone, role, coach_id, birth_date,
client_status, onboarding_completed, onboarding_completed_at,
onboarding_summary, health_declaration_signed, health_declaration_signed_at,
height, weight, fitness_level, goal_focus TEXT[], weekly_days TEXT[],
training_goals TEXT[], goals_description, fitness_background,
fitness_experience, preferred_frequency, current_challenges TEXT[],
training_preferences TEXT[], additional_notes, avatar_url, created_at

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
video_url, description, tabata_data, created_at

### workout_executions
id, trainee_id, plan_id, workout_template_id (nullable),
executed_at, self_rating NUMERIC, completion_percent NUMERIC,
section_ratings JSONB, notes TEXT, feedback_chips TEXT[], created_at

### exercise_set_logs
id, execution_id, exercise_id, set_number,
reps_completed, time_completed, weight_used,
completed BOOLEAN DEFAULT false,
difficulty_rating INTEGER,
notes TEXT, created_at

### goals
id, trainee_id, title TEXT, description TEXT,
progress NUMERIC DEFAULT 0,
status TEXT ('פעיל'/'הושג'/'בוטל'),
source TEXT DEFAULT 'manual', created_at

### measurements
id, user_id, date, weight_kg, height_cm, body_fat, notes, created_at

### notifications
id, user_id, type, title, message, is_read BOOLEAN DEFAULT false, created_at

### health_declarations
id, trainee_id, signed_at, content, created_at

## CRITICAL Column Names
- rest_time (NOT rest)
- work_time (NOT work)
- plan_name (NOT name for training_plans)
- training_sections (NOT plan_sections)
- training_plan_id (NOT plan_id in sections)
- tabata_data (NOT tabata_config)
- body_position (NOT position)
- client_status (NOT status for users)
- workout_template_id IS nullable — always upsert with onConflict:'id'

## Client Status Flow
```
onboarding → casual → active → suspended → graduated
```
- 'onboarding' = English canonical value
- After onboarding + health declaration → 'casual'
- Coach changes status manually

## RLS Policies (important)
- Coaches can INSERT workout_executions for their trainees:
  EXISTS (SELECT 1 FROM users WHERE users.id = workout_executions.trainee_id AND users.coach_id = auth.uid())

## Key Components Map

### Training Flow
```
UnifiedPlanBuilder.jsx      — THE single workout view
  canEdit=true isCoach=true   → coach editor (edit buttons, add section)
  canEdit=false isCoach=false → trainee active workout (checkboxes, ratings)

SectionCard.jsx             — collapsible section
  - border-RIGHT (not left) with unique color by index
  - coach_notes textarea above exercises (below section name)
  - section name: 18px bold, shown ONCE only
  - 10-color palette by index, never from DB

ExerciseCard.jsx            — exercise with per-set inputs
  - Per-set: reps input + ✓ button + difficulty 1-10 rating
  - After all sets done: summary row (השלמה% + קושי ממוצע)

ModernExerciseForm.jsx      — exercise parameter editor
  - 4-column grid tabs (never horizontal scroll)
  - No default tab selected (activeParam starts null)
  - Toggle tab: tap again to close
  - Multi-open tabs simultaneously
  - Time picker: shows minutes:seconds
  - "נקה" button to clear each parameter
  - Parameters summary as stacked rows below tabs

WorkoutFolderDetail.jsx     — folder detail
  - Improvement graph: dual line (orange=score, blue=completion%)
  - Master card labeled "תוכנית המאמן"
  - Execution cards: blank→"התחל אימון▶", completed→read-only accordion

WorkoutExecutionReadOnly.jsx — completed workout view
  - Shows per-set values + difficulty ratings
  - Section rating badges

SwipeableCard.jsx           — swipe-left reveals edit+delete (coach only)
FullscreenChart.jsx         — fullscreen modal for any graph
```

### Pages
```
Dashboard.jsx               — Coach home
TraineeProfile.jsx          — Coach views trainee (plans tab = folder view)
Workouts.jsx + WorkoutsInner — Trainee "אימונים" tab
TrainingPlans.jsx           — Coach plans list
Progress.jsx                — 6 graphs dashboard
Onboarding.jsx              — 6-step onboarding
Login.jsx                   — Login (logo 130px, mobile install prompt)
```

## Section Colors (10 unique, by index)
```jsx
const SECTION_COLORS = [
  '#FF6F20', // כתום מותג
  '#1E3A5F', // נייבי כהה
  '#22c55e', // ירוק
  '#FF6F20CC',// כתום שקוף
  '#0EA5E9', // תכלת
  '#F59E0B', // זהב
  '#7C3AED', // סגול
  '#EF4444', // אדום
  '#0D9488', // טורקיז
  '#1E3A5F99' // נייבי בהיר
];
// ALWAYS use: SECTION_COLORS[sectionIndex % SECTION_COLORS.length]
// NEVER use section.color from DB
```

## Design System
| Element | Value |
|---|---|
| Primary | #FF6F20 orange |
| Background | white |
| Text primary | #1a1a1a |
| Text secondary | #888 |
| Border | #F0E4D0 |
| Font | Barlow / Barlow Condensed |
| Direction | RTL always |
| Section border | RIGHT side, 3px solid, color by index |

## Workout Execution Flow (complete)

### Active workout (trainee):
1. Open folder → tap "התחל אימון"
2. Sections collapsible, exercises listed
3. Each exercise: per-set rows (if sets>1)
   - Input: reps completed
   - Button: ✓ mark done (turns orange)
   - After ✓: show 1-10 difficulty rating buttons
   - After rating: show "קושי X/10" chip with ✕ to clear
4. All sets done → summary: "השלמה: XX% · קושי ממוצע: X.X/10"
5. All exercises in section done → section popup:
   - Slider 1: כמה שליטה הרגשת? (1-10)
   - Slider 2: כמה זה אתגר אותך? (1-10)
   - Section score = average of both
6. All sections done → workout completion popup (dark #1a1a1a):
   - Score: orange 48px
   - 8 feedback chips (multi-select)
   - Free text textarea
   - Buttons: "צפה בתוצאות" + "שכפל לשיפור"
7. Save: workout_executions + exercise_set_logs (with difficulty_rating)

### Graphs:
- Orange line = self_rating (manual score)
- Blue dashed line = completion_percent/10 (normalized)
- Tooltip: "ציון: X | השלמה: XX%"

## Onboarding Flow
Step 1: פרטים (name, phone, birth_date, address, emergency contact)
Step 2: מדידות (height_cm, weight_kg) → also inserts into measurements table
Step 3: יעדים (training_goals TEXT[]) → also seeds goals table with source='onboarding'
Step 4: אודות (fitness_experience, frequency, challenges, preferences)
Step 5: הצהרת בריאות → signs health_declarations + sets client_status='casual'
Step 6: סיום → generates onboarding_summary via generateTraineeSummary()

Auto-redirect: if onboarding_completed=false AND client_status='onboarding' → /onboarding

## Add New Trainee (simplified)
Coach enters: full_name + email + password only.
Created with: role='trainee', client_status='onboarding', onboarding_completed=false
Trainee logs in → auto-redirected to onboarding.

## Prompt Writing Rules
1. Specify exact file path
2. Use grep -n to find location first
3. Keep prompts focused (one file when possible)
4. Always end with deploy command
5. Print SQL separately for manual Supabase execution
6. Never use wrong column names

## Formatting Rule
STRICT: Never mix Hebrew and English on the same line.
