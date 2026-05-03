---
name: athletigo-app-dev
description: >
  Complete technical reference for developing the AthletiGo PWA (React + Vite + Supabase + Vercel). Use this skill ALWAYS when writing code, fixing bugs, creating prompts for Claude Code, or making any technical decision about the AthletiGo app. Trigger aggressively — any mention of the app, code, database, timers, exercises, plans, UI, pages, components, or features should load this skill.
---

# AthletiGo App Development — Complete Technical Reference
Updated: 2026-04-30

## Tech Stack
- Frontend: React 18 + Vite (PWA via vite-plugin-pwa)
- Backend: Supabase (Postgres + Auth + Realtime + Edge Functions)
- Hosting: Vercel (auto-deploy from GitHub `main`)
- Repo: github.com/uriel111-afk/athletigo-app
- Domain: athletigo-coach.com (DNS via IONOS)
- DnD: @dnd-kit/core + @dnd-kit/sortable
- Charts: recharts + hand-rolled SVG (StepMilestones, ActivityHeatmap, GoalProgressRing, HeroSparkline)
- Data: @tanstack/react-query
- UI primitives: shadcn/ui (Dialog, Tabs, Select, Button, Input, Label, Textarea)
- Animation: framer-motion
- Toasts: sonner

## Key IDs
- Supabase Project: rrxcycidsojncpqlagsf
- Supabase URL: https://rrxcycidsojncpqlagsf.supabase.co
- Coach User ID: 67b0093d-d4ca-4059-8572-26f020bef1eb
- Coach Email: uriel111@gmail.com
- Test Trainee: athletigo@gmail.com

## base44 is a Supabase wrapper — NOT deprecated
`src/api/base44Client.js` wraps Supabase. **All references route through Supabase.** Do NOT replace. Provides:
- `Entity.create / update / delete / list / filter / get`
- **42703 column-retry**: drops unknown columns from payload and retries up to 6× — lets the app survive missing-column states between deploys.

## DB Schema — CORRECT table + column names

**Plan tables (verified against `INSPECTION_REPORT_V2.md` and live code):**
- `training_plans` (NOT `plans`)
- `training_sections` (NOT `plan_sections`)
- `exercises`

### users
id, full_name, email, phone, role, coach_id, birth_date, status, avatar_url, created_at, client_status (canonical: onboarding/casual/active/suspended/former), client_type, all_time_pbs (JSONB)

### sessions
id, coach_id, trainee_id, date, time, status, type, service_id, price, notes, coach_private_notes, payment_status, created_at

### client_services (packages)
id, coach_id, trainee_id, package_name, package_type, total_sessions, used_sessions, remaining_sessions, final_price, payment_method, status, start_date, end_date, expires_at, created_at

### training_plans
id, plan_name, title, goal_focus (TEXT[]), weekly_days (TEXT[]), description, status, created_by, created_by_name, assigned_to, assigned_to_name, parent_plan_id, series_id, order_in_series, **trainee_can_edit, best_score, execution_count, coach_private_notes** (last 4 from migration `2026-04-30-plan-execution-engine.sql` — NOT YET RUN), created_at, updated_at

### training_sections
id, training_plan_id, section_name, icon, category, order, completed, **color, coach_private_notes** (last 2 from migration `2026-04-30-plan-execution-engine.sql` — NOT YET RUN), created_at

### exercises (28 params — see full table below)
Saves through `base44.entities.Exercise` with column-retry. Read with `select('*')` everywhere.

### workout_executions (NEW — migration not yet run)
id, plan_id, trainee_id, series_id, status (in_progress/completed/abandoned), started_at, completed_at, abandoned_at, total_avg_score, total_exercises, completed_exercises, trainee_feedback, created_at, updated_at

### section_executions (NEW)
id, workout_execution_id, section_id, challenge_score (1-10), control_score (1-10), avg_score, completed_at

### exercise_executions
**Two schemas exist.** Older one (`add_exercise_executions_and_followups.sql`, IS RUN) has `id, trainee_id, plan_id, exercise_id, exercise_name, sets_completed, mastery_rating, difficulty, reflection, created_at`. New one (in `2026-04-30-plan-execution-engine.sql`, NOT YET RUN) has `id, workout_execution_id, section_id, exercise_id, is_completed, trainee_note, completed_at`. Migration uses `CREATE TABLE IF NOT EXISTS` — running