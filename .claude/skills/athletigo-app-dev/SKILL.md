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
npm run build && git add -A && git commit -m "fix/feat: description" && git push origin main
curl --ssl-no-revoke -X POST "https://api.vercel.com/v1/integrations/deploy/prj_5UisHw6yXTG36RgmN7UDIfqbbngM/27hqgYETQd"
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
coach_notes, created_at

### exercises
id, section_id, plan_id, name, sort_order,
sets, reps, rounds, weight, rest_time, work_time,
tempo, rpe, static_hold_time, equipment TEXT[],
side, range_of_motion, grip, body_position,
video_url, description, tabata_data, created_at

### workout_executions
id, trainee_id, plan_id, workout_template_id (nullable),
executed_at, self_rating NUMERIC, completion_percent NUMERIC,
section_ratings JSONB, notes, feedback_chips TEXT[], created_at

### exercise_set_logs
id, execution_id, exercise_id, set_number,
reps_completed, time_completed, weight_used,
completed BOOLEAN, difficulty_rating INTEGER, notes, created_at

### goals
id, trainee_id, title, description, progress NUMERIC,
status ('פעיל'/'הושג'/'בוטל'), source, created_at

### measurements
id, user_id (or trainee_id), date, weight_kg, height_cm,
body_fat, notes, created_at

### notifications
id, user_id, type, title, message, is_read, created_at

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

## Client Status Flow
```
onboarding → casual (מזדמן) → active (פעיל) → suspended → graduated
```
- 'onboarding' = English canonical value (not Hebrew)
- After onboarding + health declaration → 'casual'
- Coach changes status manually after that

## Key Components Map

### Training Flow (most important)
```
UnifiedPlanBuilder.jsx     — THE workout view for coach+trainee
  canEdit=true, isCoach=true  → coach editor
  canEdit=false, isCoach=false → trainee active workout
  
SectionCard.jsx            — collapsible section with exercises
ExerciseCard.jsx           — exercise with per-set inputs
ModernExerciseForm.jsx     — exercise parameter editor
WorkoutFolderDetail.jsx    — folder detail (graph + master + executions)
WorkoutExecutionReadOnly.jsx — completed workout view
SwipeableCard.jsx          — swipe-left to reveal actions
```

### Pages
```
Dashboard.jsx              — Coach home
TraineeProfile.jsx         — Coach views trainee
Workouts.jsx               — Trainee "אימונים" tab
TrainingPlans.jsx          — Coach plans list
Progress.jsx               — Progress + graphs
Onboarding.jsx             — New trainee onboarding (6 steps)
Login.jsx                  — Login screen
```

## Design System
| Element | Value |
|---|---|
| Primary | #FF6F20 orange |
| Background | white |
| Text | #1a1a1a |
| Text secondary | #888 |
| Border | #F0E4D0 |
| Font | Barlow / Barlow Condensed |
| Direction | RTL always |
| Section colors | 10-color palette, unique per section, border-RIGHT |

### Section Color Palette
```jsx
const SECTION_COLORS = [
  '#FF6F20','#3B82F6','#22c55e','#A855F7','#EF4444',
  '#F59E0B','#06B6D4','#EC4899','#84CC16','#F97316'
];
```

## Completed Features (as of May 2026)

### Workout Flow (complete)
- Folder hierarchy: list → folder detail → active workout
- Per-set inputs with reps completed
- Per-set difficulty rating 1-10 (after marking set done)
- Section completion popup: 2 sliders (שליטה + אתגר)
- Workout completion: chips feedback + free text + dual graph
- Save to workout_executions + exercise_set_logs
- Duplicate workout button (coach + trainee)
- Improvement graph: orange=score, blue=completion%
- Read-only view for completed executions

### Plan Editor (complete)
- UnifiedPlanBuilder: single component for all views
- Section: collapsible, color border-right, coach notes field
- Exercise: ModernExerciseForm with 4-col tab grid
- Parameter tabs: multi-open, toggle to close, no default selected
- Time picker: shows minutes:seconds
- Parameters summary rows below exercise
- Long-press rename section/exercise
- Swipe-left delete on cards (coach only)
- PlanMetadataEditor bottom sheet (goals, days, difficulty, duration, start_date)

### Trainee Experience (complete)
- Onboarding 6 steps → saves to users + measurements + goals
- Story summary → users.onboarding_summary → "היכרות" tab
- Profile tabs: היכרות, יעדים, מדידות, מסמכים, פרטים
- Status: onboarding → casual after health declaration

### Coach Experience (complete)  
- TraineeProfile with folder view in "תוכניות" tab
- New trainee: 3 fields only (name + email + password)
- Coach can edit/delete plans from trainee profile
- Coach can duplicate workout for trainee
- RLS: coaches can INSERT workout_executions for their trainees

### Graphs (complete)
- 6 graphs on Progress page: summary cards, improvement, goals bars, weight line, weekly attendance, training type donut
- All graphs: tap to open fullscreen (FullscreenChart.jsx)
- Dual-line improvement graph: score + completion%

## Known Pending Issues
- Parameter "?" display (field name mismatch — needs investigation)
- Workout popup fires on mount (hasInteractedRef guard added, verify)
- Supabase disk I/O approaching limit (optimize queries)

## Prompt Writing Rules

1. Always specify exact file: `File: src/components/training/SectionCard.jsx`
2. Use grep to find location before changing: `grep -n "term" file.jsx`
3. Include correct DB column names
4. Always end with build+commit+deploy command
5. Keep prompts focused — one file when possible
6. For SQL: print it separately for manual Supabase execution
7. Never use wrong column names (see CRITICAL section above)

## Formatting Rule
STRICT: Never mix Hebrew and English on the same line.
