---
name: athletigo-app-dev
description: >
  Complete technical reference for developing the AthletiGo PWA (React + Vite + Supabase + Vercel). Use this skill ALWAYS when writing code, fixing bugs, creating prompts for Claude Code, or making any technical decision about the AthletiGo app. Trigger aggressively — any mention of the app, code, database, timers, exercises, plans, UI, pages, components, or features should load this skill. Contains: tech stack, file structure, DB schema, component map, completed features, pending features, known bugs, design system, prompt-writing rules, and current session state.
---

# AthletiGo App Development — Complete Reference

## CURRENT SESSION STATE (May 2026)

**Major work just completed — workout flow redesign + progress system:**

The trainee/coach workout view has been completely rebuilt with a "lined-page" design + set-filling + derived status + autosave + unified progress graph. Coach editing still works via a single "עריכה" menu. Tabata/superset detection and toggle-only flow work. Workout duplication now creates clean copies (no leaked completion state). Completion popup z-index bug fixed.

**Open bug right now (the one to tackle next):**
Tapping a trainee in the coach's trainees list redirects to the COACH's own profile instead of the selected trainee. Navigation/id-resolution bug. A diagnostic prompt has been prepared. This is what to fix when resuming.

**Backlog from the audit (in priority order):**
1. **MEDIUM:** exercise.completed / section.completed leak between sessions on the "open the same workout the next day" path (same family as the duplicate-fix that already shipped, but for a different path).
2. **MEDIUM:** unguarded .toFixed() in less-trafficked screens (MyPlan history compare, BaselineFormDialog, PhysicalMetricsManager, several LifeOS stats).
3. **LOW:** ~158 console.log statements across 41 files (high-frequency in TabataTimer, WorkoutFolderDetail, AllUsers, Sessions, Leads, AuthContext).

The audit found **0 critical bugs** — the system is stable. The above are improvements, not blockers.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Backend | Supabase (Postgres + Auth + Realtime + Edge Functions) |
| Hosting | Vercel (auto-deploy from GitHub `main`) |
| Repo | github.com/uriel111-afk/athletigo-app |
| Domain | athletigo-coach.com (DNS via IONOS) |
| PWA | manifest.json + service worker |

## Key IDs & Credentials

| Item | Value |
|---|---|
| Supabase Project | rrxcycidsojncpqlagsf |
| Supabase URL | https://rrxcycidsojncpqlagsf.supabase.co |
| Coach User ID | 67b0093d-d4ca-4059-8572-26f020bef1eb |
| Coach Email | uriel111@gmail.com |
| Test Trainee Email | athletigo@gmail.com |
| Deploy URL | athletigo-app.vercel.app → athletigo-coach.com |
| Local repo path | C:\Users\URIEL\Downloads\athletigo-app |

## Workflow Pattern

1. Claude writes prompt in English (plain text or code block — NEVER as a downloadable file)
2. User pastes into Claude Code (VS Code terminal)
3. Claude Code commits + pushes; Vercel auto-deploys via curl webhook
4. User tests on mobile (must close + reopen PWA for cache to refresh)

**User's ADHD-oriented preferences:** very short replies, buttons over typing, prescriptive direction, one step at a time, never mix Hebrew + English on the same line. Always insist on verification before moving to next step.

## base44 is NOT deprecated

`src/api/base44Client.js` is a thin wrapper around Supabase. It exposes `base44.entities.EntityName.create/update/list/filter/get/delete` which all call `supabase.from('table_name')` underneath. All references route through Supabase. Do NOT replace base44 calls with direct Supabase — it works.

## Database Schema — Correct Column Names

### users
id, full_name, email, phone, role, coach_id, birth_date, status, avatar_url, created_at

### sessions
id, coach_id, trainee_id, date, time, status, type, service_id, price, notes, created_at

### client_services (packages)
id, coach_id, trainee_id, package_name, package_type, total_sessions, used_sessions, remaining_sessions, final_price, payment_method, status, start_date, end_date, expires_at, created_at

### exercises
id, name, section_id, plan_id, sort_order, sets, reps, rounds, weight, rest_time, work_time, tempo, rpe, static_hold_time, rest_between_sets, rest_between_exercises, equipment (array), side, range_of_motion, grip, body_position, video_url, description, children, tabata_data, tabata_preview, completed, created_at

**CRITICAL — column name mapping, do NOT use wrong names:**
- rest_time (NOT rest)
- work_time (NOT work)
- description (NOT notes)
- body_position (NOT position)
- range_of_motion (NOT rom)
- children (NOT sub_exercises)
- tabata_data (NOT tabata_config) — stored as TEXT, requires JSON.parse() with try/catch
- tabata mode values: `"חזרות"/"סופרסט"/"טבטה"`
- DB_MAP entry: `tabata → tabata_data` (NOT tabata_blocks)

### training_plans
id, coach_id, name, status, series_id (links duplicates), created_at

### plan_sections / training_sections
id, plan_id, name, sort_order, completed

### workout_executions (per performance — duplicates share plan_id)
id, plan_id, trainee_id, executed_at, completion_percent, self_rating, section_ratings (JSONB), exercise_summaries (JSONB), notes, feedback_chips, created_at

### exercise_set_logs (per-set log within an execution)
id, execution_id, exercise_id, set_number, reps_completed, time_completed, weight_used, completed, difficulty_rating, notes, created_at

### notifications
id, user_id, type, message, is_read, data (jsonb), scheduled_at, trainee_id, created_at

### leads
id, coach_id, full_name, phone, email, status, source, notes, created_at

### attendance_log
id, session_id, trainee_id, status, notes, created_at

### session_participants
For multi-participant sessions (group training).

**Realtime is enabled on 11 tables.**

## Workout System — Current Architecture (post-redesign)

### Lined-page design
- Shared between coach and trainee (same view, coach has edit affordances)
- Section colors via existing `getSectionColor(index)` + `softTint` helper
- Each exercise: orange index square (Barlow Condensed) + name + derived status pill
- Open exercise: warm cream bg (#F8F3E9) + 4px right rail (#FF6F20) + 12px gap below
- Closed exercise: white + 4px grey right rail (#D8D8D8) + 1px outer border
- Number-before-word RTL everywhere: `"3 סטים"`, `"10 חזרות"`, `"60 שנ' עבודה"`
- All numbers Barlow Condensed 24px, weight 700, #1a1a1a
- Trailing word: Barlow 13px, weight 600, #777

### Set-filling (trainee only, derived from exercise.sets)
- Sets row: N ✓-toggle boxes (40×38, dashed when not done, green #4CAF50 + ✓ when done)
- Reps row: N number inputs (white bg, orange border, Barlow Condensed 22px)
- Time row (when work_time + no reps): N "actual seconds" inputs writing to `time_completed`
- Tabata/superset: ONLY ✓-toggles, no numeric inputs; closed shows only `"{N} תרגילים"` pill
- Horizontal scroll for many sets (boxes never shrink, label pinned right outside scroll)
- Live summary pill: amber tint <100%, green at 100%, Barlow Condensed percent

### Derived status (no manual checkbox)
- `none` (0 sets done) → `"לא בוצע"` (#888 / hollow #ccc)
- `partial` (some) → `"חלקי"` (#b8821f / filled #E0A030)
- `done` (all sets ticked) → `"הושלם"` (#2e7d32 / filled #4CAF50)
- **Rule:** all sets ticked = done even if rep target not met
- Shown to BOTH coach (read-only) and trainee
- Tabata uses the same unified set-toggle status logic

### Coach edit menu (NOT scattered icons)
- Single "עריכה" button on section header → opens 2-col grid menu
- Items: ערוך סקשן · שנה שם · שכפל · הזז למעלה · הזז למטה · מחק (red)
- Each calls the EXISTING handler (`onEditSection`, `onRenameSection`, `onDuplicateSection`, `onMoveSection(-1/1)`, `onDeleteSection`)
- "ערוך" per exercise → opens existing `ModernExerciseForm` via `onEdit(exercise)` → `setEditingExercise + setShowExerciseDialog(true)`

### Tabata/superset detection
`getVariant()` checks `exercise.mode` first, then falls back to parsing `tabata_data`:
- Has sub_exercises + clock_settings/work_time/rounds → `'tabata'`
- Has sub_exercises + container_type list/superset/combo → `'list'`
- Has sub_exercises only → `'list'`
- Else → `'normal'`

### Autosave + resume
- Debounce ~3 seconds after any setLogs change
- Trainee-only (`canEdit === true` skips)
- Uses existing `saveWorkoutExecution` (UnifiedPlanBuilder ~1316-1394)
- `loadActiveExecution` (~line 438) rebuilds setLogs from `exercise_set_logs` on mount
- Same execution row if interrupted (not a new one) — keyed by `currentExecutionId`

### Workout duplication (just fixed)
`createDuplicatedExecution` in `src/lib/workoutExecutionApi.js`:
- Inserts a fresh workout_executions row, same plan_id (graphs still group)
- **Resets `exercises.completed = false` AND `training_sections.completed = false`** for the plan
- No exercise_set_logs / exercise_summaries / section_ratings carried over
- The duplicate is a new execution row → setLogs empty → status `"לא בוצע"`, 0% → fresh data point

### UnifiedProgressGraph (replaces the 3 old graphs)
- Single graph at the BOTTOM of WorkoutFolderDetail.jsx, full-bleed (`ResponsiveContainer width="100%"`)
- Level selector: `כל האימון` + chip per exercise
- Metric selector: `אחוז הצלחה` / `חזרות` / `קושי`
- Data: `workout_executions.completion_percent`, `exercise_summaries` (per-exercise reps/pct), `self_rating` for difficulty
- All `.toFixed`/division calls null-guarded with `Number.isFinite` — legacy executions don't crash, just skip
- Detail panel (selected point) + 3 tiles (שיא / ממוצע / מגמה)
- The 3 old graph components (`ImprovementGraph`, `ExerciseProgressGraph`, `SectionProgressGraph`) are dead code in the file — tree-shaken at build

### Completion popup (z-index bug just fixed)
- Was passing `zIndex: 1000` which dropped below shadcn Dialog default (`11001`) and got covered by overlay (`11000`)
- Fix: removed the inline override; defaults now win
- Sliders (control/challenge), notes textarea, המשך/ביטול all work

## File Structure — Key Files

```
src/
  api/base44Client.js                       — Supabase wrapper (legacy, do not replace)
  lib/
    supabaseClient.js                       — Supabase init
    tabataSounds.js                         — Timer sounds
    workoutExecutionApi.js                  — save/load workout executions, duplicate, helpers
                                              readSectionRating(v), readExerciseSummary(execRow, exerciseId)
                                              createDuplicatedExecution(plan, traineeId)
  
  pages/
    Dashboard.jsx                           — Coach home
    TraineeProfile.jsx                      — Coach views trainee (~3000 lines, the redirect bug is here)
    PlanBuilder.jsx                         — Build training plans + exercises
    MyPlan.jsx                              — Trainee plan view (has unguarded toFixed — audit MEDIUM)
    Reports.jsx                             — Unified reports + financial
    Login.jsx                               — Login screen
    Notifications.jsx                       — Notifications page
    Leads.jsx                               — CRM leads
    Clocks.jsx                              — Timer selection
    Workouts.jsx                            — Workout list, handleDuplicateExecution
    
  components/
    training/
      UnifiedPlanBuilder.jsx                — Main workout view, single component for coach+trainee
                                              autosave useEffect ~1496-1518, loadActiveExecution ~438
                                              saveWorkoutExecution ~1316-1394, toggleSetDone, updateSetLog
      SectionCard.jsx                       — Section header, edit menu, accent color
      ExerciseCard.jsx                      — Exercise card, lined-page render, set-fill rows, status pill
                                              buildParamItems (shared), renderInlineNumberLabel,
                                              getVariant, getSubExercises, parseTabataData
      WorkoutFolderDetail.jsx               — Duplicates history page + UnifiedProgressGraph
      ModernExerciseForm.jsx                — The exercise editor (DO NOT REWRITE)
    
    Header.jsx                              — Top bar
    TabataTimer.jsx                         — Full Tabata timer
    TimerFooterBar.jsx                      — Minimized timer bar
    MiniTimerBar.jsx                        — Timer controls inside dialogs
    NotificationPopup.jsx                   — Realtime notification toast
    PageLoader.jsx                          — Unified loading screen
    
  hooks/
    useFormDraft.js                         — Form draft persistence
    useServiceDeduction.js                  — Package session deduction
    
  contexts/
    ClockContext.jsx                        — Clock state management

migrations/
  2026-04-29-sessions-coach-notes.sql       — NOT YET RUN
  2026-04-30-long-term-infrastructure.sql   — NOT YET RUN
```

## Design System

| Element | Value |
|---|---|
| Primary color | #FF6F20 (orange) |
| Background | #FFF9F0 (warm cream) — but lined-page uses #FCFBF7 |
| Cards | white, borderRadius 14px (legacy) / 8-10px (lined-page) |
| Text primary | #1a1a1a |
| Text secondary | #888 / #777 |
| Success | #16a34a / #2e7d32 / #4CAF50 |
| Error | #dc2626 / #a32d2d |
| Warning | #EAB308 / #E0A030 |
| Border | #F0E4D0 (legacy) / #EDE6D4 / #EFE9D8 / #E8DEC4 (lined-page) |
| Font heading | Barlow Condensed |
| Font body | Barlow |
| Direction | RTL always |

### Lined-page palette specifically
| Surface | Color |
|---|---|
| Paper / outer | #FCFBF7 |
| Header band | #FFFFFF with bottom border 3px #FF6F20 |
| Section row tint | softTint(accentColor, 0.1) — section accent color at 10% over cream |
| Exercise wrapper (open) | #F8F3E9 |
| Exercise wrapper (closed) | #FFFFFF |
| Exercise header band (open) | #F0E9D6 |
| Right rail (open) | 4px solid #FF6F20 |
| Right rail (closed) | 4px solid #D8D8D8 |
| Outer borders | #E5DFC9 / #EDE6D4 / #E8DEC4 |
| Hairlines | #EFE9D8 |
| Vertical margin rule | 1px #E8A98C opacity 0.4 at right:20px |
| Pill bg (normal) | #FFF0E4 |
| Pill bg (emphasized) | #FFE8D6 |
| Pill text | #993C1D |
| Status `none` | bg #F7F3EA, dot hollow #ccc, text #888 |
| Status `partial` | bg #FFF6E6, dot #E0A030, text #b8821f |
| Status `done` | bg #EAF7EA, dot #4CAF50, text #2e7d32 |
| Set box (done) | border 2px #4CAF50, bg #F1FAF1 |
| Set box (not done) | border 2px dashed #C9B89A, bg #FCFBF7 |
| Reps/time input | white bg, orange 2px #FF6F20 border |

## Status Normalization

Sessions and packages store status in BOTH Hebrew and English. Always handle both:

```javascript
const isCompleted = (s) => ['completed','הושלם','present','הגיע'].includes((s?.status||'').toLowerCase());
const isCancelled = (s) => ['cancelled','בוטל','absent','לא הגיע'].includes((s?.status||'').toLowerCase());
const isPending = (s) => ['pending','ממתין','scheduled','מתוכנן','confirmed','מאושר'].includes((s?.status||'').toLowerCase());
const isActivePkg = (p) => ['active','פעיל','ליעפ'].includes((p?.status||'').toLowerCase());
```

## Remaining Sessions Helper

```javascript
const getRemaining = (pkg) => {
  if (pkg.remaining_sessions != null) return Number(pkg.remaining_sessions);
  if (pkg.sessions_remaining != null) return Number(pkg.sessions_remaining);
  return Math.max(0, (Number(pkg.total_sessions)||0) - (Number(pkg.used_sessions)||0));
};
```

## Trainee Fetching — No role filter

Do NOT filter trainees by `role='trainee'` — some have `role='user'` or null. Instead derive from packages+sessions:

```javascript
const traineeIds = [...new Set([
  ...packages.map(p => p.trainee_id),
  ...sessions.map(s => s.trainee_id)
].filter(Boolean))];
const { data: trainees } = await supabase.from('users').select('*').in('id', traineeIds);
```

## Z-Index Hierarchy

| Layer | Z-Index |
|---|---|
| Timer bar (minimized) | 12000 |
| shadcn Dialog content (default) | 11001 |
| shadcn Dialog overlay | 11000 |
| Timer full screen | 10000 |
| Bottom nav | 1000 |

**CRITICAL:** Do NOT pass `zIndex` overrides to `DialogContent` — it can drop the modal below the overlay (this is the bug just fixed). Let the primitive default win.

## Dialog Rules

1. Dialogs close ONLY via X button or successful save
2. NO `onClick={onClose}` on backdrop
3. All timer layers have `stopPropagation` on click/pointer/touch
4. When timer bar is visible, dialog backdrop bottom = 80px (CSS var `--timer-bar-height`)
5. Form drafts save to localStorage on EVERY keystroke (no debounce)
6. Drafts include trainee context (`traineeId` + `traineeName`)
7. DraftPrompt asks "resume or new?" when reopening

## Sound System (tabataSounds.js)

- Work start: `playActionMelody()` — 4 ascending notes, gain 0.7
- Rest start: `playSlowPulse()` — 3 pulses + bass 100Hz + ping 1200Hz, gain 0.95
- Play/resume: `playSoftBreath()` — gain 0.4
- Pause: `playPauseSound()` — descending 440→220Hz, gain 0.35

## Strict Formatting Rule (USER PREFERENCE)

**NEVER mix Hebrew and English on the same line.** English (tool names, commands, field names) must appear on a separate line or in a code block from Hebrew text.

## Prompt Writing Rules for Claude Code

1. Always start with `STEP 1 — INVESTIGATE (show, no change)`. Run `grep -n` / `cat` first to verify assumptions.
2. Show current state before changing.
3. Use CORRECT DB column names (see schema above).
4. Include `npm run build` + `git add -A && git commit -m "..." && git push`.
5. End with a Report section listing specific confirmations to verify.
6. Include `CONSTRAINTS / DO NOT CHANGE` section to prevent side effects.
7. For UI: include full inline styles (app uses no CSS framework, no Tailwind in app shell).
8. For forms: ensure draft persistence + no backdrop close.
9. For timers: ensure stopPropagation on all event types.
10. Tell Claude Code to STOP AND REPORT if it can't find the field/handler/data it expected — never invent DB columns.
11. Reuse existing handlers/parsers — do NOT reimplement. Examples: `handleSetToggle`, `onSetLogChange`, `getSubExercises`, `parseTabataData`, `buildParamItems`, `readExerciseSummary`, `readSectionRating`, `createDuplicatedExecution`, `saveWorkoutExecution`, `loadActiveExecution`, `getSectionColor`.
12. Single-step prompts only. Big features → split into investigate → build → verify.

## Critical Architectural Principles (locked-in)

- App designed for **decades of data collection** (100,000+ records per trainee).
- `UnifiedPlanBuilder` is the SINGLE workout view for both coach (`canEdit=true`) and trainee (`canEdit=false`).
- `series_id` on training_plans groups duplicates → progress graphs.
- `base44Client` with column-retry is the legacy Supabase wrapper — do NOT replace.
- Number-before-word RTL is shared via `renderInlineNumberLabel(value, trailing)`.
- All param data flows through ONE function: `buildParamItems`. Never edit its shape or order.
- Coach editing happens via the EXISTING `ModernExerciseForm` (never rewrite editing).
- Plan-level `exercises.completed` and `training_sections.completed` are shared across executions — must be reset on duplicate (already done) and likely on the day-after path (open MEDIUM bug).

## Supabase Auth Settings

- Allow new users to sign up: ON
- Confirm email: OFF
- Verify JWT with legacy secret: OFF

## Meshulam Payment Integration

- `MESHULAM_USER_ID=470162`
- Edge Functions `payment-create` and `payment-webhook` deployed
- Single session payment, package purchase, package renewal — needs full API integration verification

## Completed Features (high-level)

### Coach side
Dashboard, trainee management, session CRUD + linking to packages, package CRUD + auto-deduction, training plans (PlanBuilder + sections + exercises + Tabata), unified reports, notifications page, realtime notification popup, reminders, daily challenges, birthday reminders, LastSessionAlert, 48hr follow-up after sending plan, Leads/CRM page, multi-participant sessions, full document signing system (3 agreements + health declaration + signature canvas + photo consent), baseline measurement system (dual-save to `baselines` and `results_log`), goals tab with bidirectional linking to records, Training Challenges page.

### Trainee side
Home with daily challenge + streak, plans view, sessions view (approve/reject/reschedule), records page, profile, exercise execution flow, plan scoring + comparison chart, **NEW lined-page workout view with set-filling, derived status, autosave, resume**.

### Timer system
Tabata (full UI with phase title 48px, round 36px, time 120px), Countdown, Stopwatch, EMOM, AMRAP, minimized bar with play/pause/skip, MiniTimerBar inside dialogs, Web Audio API sounds, vibration, background notifications, Wake Lock.

### Infrastructure
PWA icons, favicon, loading screen, login screen, OG/Twitter meta tags, realtime sync on 11 tables, form draft persistence (16 forms), 2FA on GitHub.

### Progress system (NEW)
- `workout_executions.section_ratings` JSONB stores `{control, challenge, avg, notes}`
- `workout_executions.exercise_summaries` JSONB per-exercise reps/pct/avg_difficulty
- `readSectionRating(v)` and `readExerciseSummary(execRow, exerciseId)` helpers
- UnifiedProgressGraph: level selector × metric selector × null-safe series

## Pending / Open

### Right now (next prompt to run)
- **Trainee profile redirect bug** — tapping a trainee opens the COACH's profile. Investigate `TraineeProfile.jsx` + the trainees-list onClick handler.

### After that (MEDIUM)
- exercise.completed / section.completed leak on day-after workout-open path (same family as the duplicate fix)
- Unguarded `.toFixed()` in MyPlan history compare, BaselineFormDialog, PhysicalMetricsManager, several LifeOS stats
- Hardware back button bug (deferred to its own session) — Pattern A `useStepBack(active, onBack)` hook, phased rollout starting with trainee workout flow, ~10-12 files

### LOW
- ~158 `console.log` statements across 41 files — high-frequency cleanup in TabataTimer, WorkoutFolderDetail, AllUsers, Sessions, Leads, AuthContext, App.jsx, main.jsx, AuthContext.jsx, [UPB], [ExerciseCard], "rendering section", "tabata_data_parsed"

### Migrations not yet run
- `migrations/2026-04-29-sessions-coach-notes.sql`
- `migrations/2026-04-30-long-term-infrastructure.sql`

### Features not built
- Meshulam payment full integration verification
- Group training feature
- Coach profile page design
- Leads page redesign
- Logout button on trainee profile + coach dashboard → login screen
- EMOM/AMRAP full verification

## Approved Storyboard (locked)

The user has approved the following final design — do not deviate without a new approval:

**א. Sections closed:** color per section (border-right + soft tinted row bg via `softTint(accentColor, 0.1)`), section name in Barlow weight 700 #1a1a1a, `· {N} תרגילים` in section accent color, single `"עריכה"` button for coach (replaces icon cluster).

**ב. Section open — exercises with summary:** orange index square (Barlow Condensed), name 15px weight 700, summary pills (#FFF0E4 / #993C1D), derived status pill on the left, chevron #C9A24A.

**ג. Exercise open — set-filling:** ✓ toggle boxes for sets row, number inputs for reps row, time input row for time-based, plain rows for other params (weight, etc), live summary pill at bottom (amber <100% / green =100%), 4px orange right rail wrapper.

**ד. Section completion popup:** "סיימת את {section name} 💪", control slider (0-10), challenge slider (0-10), notes field, "שמור והמשך" button. All sit on opaque #FFF content above dimmed backdrop (z-index 11001 / 11000).

**ה. Single UnifiedProgressGraph at bottom of WorkoutFolderDetail:** full-bleed width, level + metric selectors, big chart with labeled points, detail panel, 3 tiles (שיא / ממוצע / מגמה). One graph for everything.

## Workflow Constants

- All Claude Code prompts must be plain text in chat or in a code block — NEVER as a downloadable file.
- User works phone-first with copy-paste.
- Always verify on mobile after Vercel deploys (~1 min) + PWA cache refresh (close + reopen app).
- One step at a time, never bundle multiple features into one prompt.
- When something doesn't work as expected: investigate first, fix only after the report.
