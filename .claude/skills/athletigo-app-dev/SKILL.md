---
name: athletigo-app-dev
description: >
  Complete technical reference for developing the AthletiGo PWA (React + Vite + Supabase + Vercel). Use this skill ALWAYS when writing code, fixing bugs, creating prompts for Claude Code, or making any technical decision about the AthletiGo app. Trigger aggressively — any mention of the app, code, database, timers, exercises, plans, UI, pages, components, or features should load this skill.
---

# AthletiGo App Development — Complete Reference

## Tech Stack
- Frontend: React 18 + Vite
- Backend: Supabase (Postgres + Auth + Realtime + Edge Functions)
- Hosting: Vercel (auto-deploy from GitHub)
- Repo: github.com/uriel111-afk/athletigo-app
- Domain: athletigo-coach.com (DNS via IONOS)

## Key IDs
- Supabase Project: rrxcycidsojncpqlagsf
- Supabase URL: https://rrxcycidsojncpqlagsf.supabase.co
- Coach User ID: 67b0093d-d4ca-4059-8572-26f020bef1eb
- Coach Email: uriel111@gmail.com
- Test Trainee: athletigo@gmail.com

## base44 is a Supabase wrapper — NOT deprecated
src/api/base44Client.js wraps supabase calls. All 463 references route through Supabase. Do NOT replace.

## DB Schema — CORRECT Column Names

### users
id, full_name, email, phone, role, coach_id, birth_date, status, avatar_url, created_at

### sessions
id, coach_id, trainee_id, date, time, status, type, service_id, price, notes, created_at

### client_services (packages)
id, coach_id, trainee_id, package_name, package_type, total_sessions, used_sessions, remaining_sessions, final_price, payment_method, status, start_date, end_date, expires_at, created_at

### exercises — CRITICAL column names:
id, name, section_id, plan_id, sort_order, sets, reps, rounds, weight,
rest_time (NOT rest), work_time (NOT work), tempo, rpe,
static_hold_time, rest_between_sets, rest_between_exercises,
equipment (array), side, range_of_motion (NOT rom),
grip, body_position (NOT position), video_url,
description (NOT notes), children (NOT sub_exercises),
tabata_data (NOT tabata_config), tabata_preview, created_at

### training_plans
id, coach_id, name, status, created_at

### plan_sections
id, plan_id, name, sort_order

### notifications
id, user_id, type, message, is_read, data (jsonb), scheduled_at, trainee_id, created_at

### exercise_executions
id, trainee_id, plan_id, exercise_id, exercise_name, sets_completed, mastery_rating, difficulty, reflection, created_at

### leads
id, coach_id, full_name, phone, email, status, source, notes, created_at

## Status Normalization — always handle both Hebrew and English:
completed/הושלם/present/הגיע = completed
cancelled/בוטל/absent/לא הגיע = cancelled
pending/ממתין/scheduled/מתוכנן/confirmed/מאושר = pending
active/פעיל/ליעפ = active package

## Remaining Sessions:
Check remaining_sessions first, then sessions_remaining, then calculate total-used.

## Trainee Fetching — NO role filter!
Do NOT filter by role='trainee'. Derive from packages+sessions:
const traineeIds = [...new Set([...packages.map(p=>p.trainee_id), ...sessions.map(s=>s.trainee_id)].filter(Boolean))];
Or use JOIN: supabase.from('sessions').select('*, trainee:trainee_id(id, full_name)')

## Design System
- Primary: #FF6F20 (orange)
- Background: #FFF9F0 (warm cream)
- Cards: white, borderRadius 14px, boxShadow 0 2px 6px rgba(0,0,0,0.04)
- Text: #1a1a1a primary, #888 secondary
- Success: #16a34a, Error: #dc2626, Warning: #EAB308
- Border: #F0E4D0
- Selected chip: bg #FF6F20 color white
- Font: Barlow / Barlow Condensed
- Direction: RTL always

## Z-Index
Timer bar: 12000, Dialog backdrop: 11000, Dialog content: 11001, Timer full screen: 10000

## Dialog Rules
1. Close ONLY via X button or save — NO onClick on backdrop
2. Timer layers: stopPropagation on click/pointer/touch
3. Form drafts save on EVERY keystroke (no debounce)
4. Drafts include traineeId + traineeName

## Timer Sounds (tabataSounds.js)
- Work start: playActionMelody() gain 0.7
- Rest start: playSlowPulse() gain 0.95 + bass 100Hz + ping 1200Hz
- Resume: playSoftBreath() gain 0.4
- Pause: playPauseSound() 440→220Hz gain 0.35

## Key Files
- src/api/base44Client.js — Supabase wrapper
- src/lib/supabaseClient.js — Supabase init
- src/lib/tabataSounds.js — Timer sounds
- src/pages/Dashboard.jsx — Coach home
- src/pages/TraineeProfile.jsx — Coach views trainee
- src/pages/PlanBuilder.jsx — Training plans
- src/pages/Reports.jsx — Unified reports
- src/pages/Login.jsx — Login screen
- src/components/TabataTimer.jsx — Tabata timer
- src/components/TimerFooterBar.jsx — Minimized bar
- src/components/MiniTimerBar.jsx — Timer inside dialogs
- src/components/ChallengeBank.jsx — Daily challenges
- src/components/PageLoader.jsx — Unified loading

## Logo Files
- public/logo-transparent.png — Triangle (transparent bg)
- public/athletigo-text.png — ATHLETIGO text
- public/logoR-black.png — Full logo for login
- public/icon-*.png — PWA icons (white bg)
- public/favicon-*.png — Favicons (transparent bg)

## Formatting Rule
STRICT: Never mix Hebrew and English on the same line.

## Prompt Rules for Claude Code
1. Start with grep/cat to find relevant code
2. Use CORRECT DB column names
3. Include npm run build + git add -A + commit + push
4. End with Report section
5. Include DO NOT CHANGE section
6. For save bugs: add console.log before/after supabase
7. For UI: full inline styles (no CSS framework)
8. For forms: draft persistence + no backdrop close
9. For timers: stopPropagation on all events
