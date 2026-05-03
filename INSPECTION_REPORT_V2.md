# INSPECTION REPORT V2 — Training Plans System

Read-only inspection. No code edits.
Date: 2026-04-30.

---

## 1. File map

### Pages
| File | Lines | Role |
|------|------:|------|
| `src/pages/PlanBuilder.jsx` | 1046 | Standalone 3-step wizard route (`/PlanBuilder?planId=...`). Coach-only. |
| `src/pages/TrainingPlans.jsx` | 1366 | Coach plans list + create/edit. Uses `UnifiedPlanBuilder` for editing. |
| `src/pages/MyPlan.jsx` | 690 | Trainee-facing list. Opens a plan in `UnifiedPlanBuilder` (read-only by default). |
| `src/pages/ActivePlans.jsx` | 403 | "Active plans" listing. |
| `src/pages/TrainingPlanView.jsx` | 106 | Thin route → mounts `UnifiedPlanBuilder`. |

### Plan builders / editors (2 parallel implementations)
- `src/pages/PlanBuilder.jsx` — wizard (route)
- `src/components/training/UnifiedPlanBuilder.jsx` (1233 lines) — embedded editor used by MyPlan / TrainingPlans / TrainingPlanView / `PlanEditorDialog`

### Cards / forms
- `src/components/plans/PlanCard.jsx` (347)
- `src/components/plans/PlanEditorDialog.jsx` (137) — full-screen dialog wrapping `UnifiedPlanBuilder`
- `src/components/training/SectionCard.jsx` (225)
- `src/components/training/ExerciseCard.jsx` (367) — has separate **coach view** + **trainee view** branches
- `src/components/training/CompactPlanCard.jsx`
- `src/components/training/PlanFormDialog.jsx`
- `src/components/training/TraineePlanGroup.jsx`
- `src/components/workout/SectionForm.jsx`
- `src/components/workout/ModernExerciseForm.jsx`
- `src/components/training/ExerciseExecutionModal.jsx`
- `src/pages/SectionTemplates.jsx`

### API layer
- **No dedicated `plansApi.js` or `lib/plans.js` helper.** Queries are inlined in pages/components.
- `src/api/entities.js` re-exports thin entity wrappers:
  - `TrainingPlan = base44.entities.TrainingPlan` → tablename `training_plans`
  - `TrainingSection = base44.entities.TrainingSection` → tablename **`training_sections`** (NOT `plan_sections` — CLAUDE.md skill text says `plan_sections`, that's stale)
  - `Exercise = base44.entities.Exercise` → tablename `exercises`
- `base44Client.createEntity()` provides `.create / .update / .delete / .list / .filter / .get` with **42703 column-retry** (drops unknown columns and retries up to 6×).

### Direct supabase calls in plans flow
- `PlanBuilder.jsx` lines 251 / 257 (training_plans), 296 / 455 (exercises), 265 / 288 / 297 / 310 (training_sections)
- `TrainingPlans.jsx` lines 1033 (insert) / 1057 (soft-delete via status='deleted')

---

## 2. Plan API "helper" — fields touched

There's no central helper. Field set as written by `PlanBuilder.savePlanDetails()` (line 235) — closest thing to a canonical payload:

**training_plans payload (write):**
- `plan_name`
- `title` (mirror of plan_name)
- `goal_focus` (TEXT[] of focus IDs)
- `weekly_days` (TEXT[] of Hebrew day names)
- `description`
- `status` (Hebrew: `'פעילה'` / `'deleted'` etc.)
- `created_by` (uuid)
- `created_by_name`
- `assigned_to` (single trainee uuid — only the first selectee is written here; the multi-select UI exists but only the first row gets persisted to this column)
- `assigned_to_name`
- `created_at` / `updated_at`

**training_plans columns referenced elsewhere (read):**
- `parent_plan_id` — used as lineage root for "improvement metrics" (`MyPlan.jsx:30`, `TraineeProfile.jsx:3181`). Set on **duplicate** (`MyPlan.jsx:421`).
- `series_id` + `order_in_series` — group plans into a series. Read in `MyPlan.jsx:476-481`. Written in `TrainingPlans.jsx:233/250` and `PlanFormDialog.jsx:30`.

---

## 3. PlanBuilder.jsx (1046 lines)

### Type
Standalone **route** (`/PlanBuilder?planId=...`), full-page wizard. Uses `useNavigate` and reads `planId` from `location.search`. Not a dialog.

### Flow — 3 steps (controlled by local `step` state, default `1`)
**Step 1 — plan metadata** (line ~520)
  - Trainee multi-select (only `selectedTrainees[0]` actually persists)
  - Plan name (required to enable save)
  - Focus areas (8 hardcoded chips: כוח / גמישות / טכניקה / סבולת / מיומנות / שיקום / כושר / שיא)
  - Weekly days (Hebrew day chips)
  - Description (textarea)
  - **Draft persistence**: localStorage saves step-1 form on every keystroke (line 118 comment), cleared once `planId` is set

**Step 2 — sections + exercises**
  - Auto-creates 4 default sections on a fresh plan: `warmup / mobility / strength / flexibility` (line 16, line 263)
  - Sections sortable via `dnd-kit` (PointerSensor, vertical strategy)
  - Each section: editable name/icon/category, draggable, deletable; deleting cascades exercises
  - Exercises: per-section list, add/edit via inline form, 21 possible params (see §5)

**Step 3 — finish**
  - Sends `plan_created` notifications to each selected trainee
  - Dispatches `data-changed` window event
  - That's it — no "publish" / "draft" status flag toggle

### What works
- Wizard saves plan and creates sections/exercises live to DB
- Drag-and-drop section reorder (writes `order` back to DB)
- 42703 column-retry (via `base44.entities.Exercise.create/update`) — unknown columns get stripped, save succeeds anyway
- Tabata serialization: writes to `tabata_data` (TEXT/JSON), reads from both `tabata_data` and legacy `tabata_config`
- Difficulty stored as `[קושי: X]` prefix in `description` and parsed back on read (no dedicated `difficulty_level` column)
- Hebrew param keys → English DB columns mapped explicitly in `addExercise`/`updateExercise`
- Sub-exercises stored in `children` (canonical), read from any of `children` / `exercise_list` / `sub_exercises` / `tabata_data.sub_exercises|blocks` (4-shape compatibility)

### What's broken / suboptimal
- **Multi-trainee select is fake** — UI lets you pick many trainees, but only `selectedTrainees[0]` is persisted to `assigned_to`. The other selections only drive the step-3 notification fanout. There's no row-per-trainee model.
- **Notifications insert lacks `coach_id`** (line 464) — only `user_id` is set; flatter than the rest of the notifications surface.
- **Direct supabase usage instead of base44 entity** for `training_sections` and a few `exercises.delete` calls — those skip the column-retry safety net.
- **Two parallel builders** (`PlanBuilder.jsx` route + `UnifiedPlanBuilder.jsx` component) with overlapping logic. `UnifiedPlanBuilder` is the path used from the trainee side and from in-place dialogs.
- **`status` field accepts both Hebrew and English values** (`'פעילה'` written here; `'deleted'` written in `TrainingPlans.jsx:1057`). No normalization layer.
- No "save draft / preview / publish" lifecycle — plan is live the moment step-2 starts.

---

## 4. Trainee-facing plan view

**Path:** `MyPlan.jsx` → user clicks plan card → `setSelectedPlan(plan)` → renders `<UnifiedPlanBuilder plan={plan} isCoach={false} canEdit={createdByMe} />` (line 676). Trainee scopes:
- **Coach plans** — `canEdit=false` → fully read-only
- **My plans (created by trainee themselves)** — `canEdit=true`

### Sections rendered via `SectionCard.jsx`
- White card, `borderLeft: 3px solid sectionType.color` (color comes from `sectionTypes` lookup, NOT a DB column)
- Header: 40×40 emoji circle (`section.icon || '📌'`) + `section_name` + category + exercise count + "הושלם" badge if `section.completed`
- Click → expand/collapse exercise list
- No private notes surface for trainee

### Exercises rendered via `ExerciseCard.jsx` — TRAINEE VIEW (line 294)
- Container card: `background #F7F6F3, borderRight 3px green/orange depending on `exercise.completed`
- Title (`exercise_name || name`) + RPE pill if set
- **Param pills — only first 5** (`chips.slice(0, 5)`). 16 possible chip types are computed but anything past index 4 is silently dropped.
- Container exercises (`mode: טבטה|סופרסט|קומבו`) show numbered sub-exercise list
- Single complete-toggle button (writes `completed: true` and pings coach via `notifyExerciseCompleted`)
- `notes = description || coach_notes || notes` — **no separation between coach-private and trainee-visible**

### Visible parameters to trainee (chips)
sets, reps, rounds, work_time, rest_time, rest_between_sets, rest_between_exercises, static_hold_time, weight, weight_type, rpe, tempo, body_position, leg_position, side, grip, equipment, range_of_motion — but **only the first 5** of these in trainee view.

### What's missing
- No coach-private notes channel — `coach_private_notes` column exists on `sessions`, **NOT on plans/sections/exercises**. Anything the coach writes in `description`/`notes` is shown to the trainee.
- No trainee-set/rep logging during execution (only a binary "completed" toggle)
- No "skipped" / "modified" state — only completed-yes/no
- More than 5 params silently truncated
- No video preview button on the trainee card directly (despite `video_url` being stored)
- No swap/substitute exercise flow
- No execution timer integration on trainee view (Tabata blocks just show a label)

---

## 5. Exercise parameter table

| Param (UI key, Hebrew) | DB column | Type | Always present? | Shown to trainee? |
|------------------------|-----------|------|-----------------|-------------------|
| שם | `exercise_name` + `name` (mirror) | TEXT | Required | Yes (title) |
| סטים | `sets` | TEXT/INT | Optional | First 5 chips |
| חזרות | `reps` | TEXT/INT | Optional | First 5 chips |
| סבבים | `rounds` | TEXT/INT | Optional | First 5 chips |
| זמן עבודה | `work_time` | TEXT (seconds) | Optional | First 5 chips |
| זמן מנוחה | `rest_time` | TEXT (seconds) | Optional | First 5 chips |
| משקל (ק״ג) | `weight` | TEXT/NUM | Optional | First 5 chips |
| (no UI in PlanBuilder) | `weight_type` | TEXT | Optional | First 5 chips (if not `'bodyweight'`) |
| RPE (קושי) | `rpe` | TEXT/INT | Optional | RPE pill (always shown if present) |
| טמפו | `tempo` | TEXT (e.g. "3-1-2-0") | Optional | First 5 chips |
| מנ׳ בין סטים | `rest_between_sets` | TEXT (seconds) | Optional | First 5 chips |
| מנ׳ בין תרגילים | `rest_between_exercises` | TEXT (seconds) | Optional | First 5 chips |
| החזקה סטטית | `static_hold_time` | TEXT (seconds) | Optional | First 5 chips |
| ציוד נדרש | `equipment` | TEXT[] / TEXT | Optional | First 5 chips |
| רמת קושי | (encoded in `description` as `[קושי: X]`) | TEXT prefix | Optional | NOT as separate chip; bleeds into notes |
| מנח גוף | `body_position` | TEXT | Optional | First 5 chips |
| (no UI in PlanBuilder) | `leg_position` | TEXT | Optional | First 5 chips |
| צד | `side` | TEXT (ימין/שמאל/דו-צדדי/לסירוגין) | Optional | First 5 chips (suppressed if `'דו־צדדי'`) |
| טווח תנועה | `range_of_motion` | TEXT (מלא/חלקי/חצי) | Optional | First 5 chips (suppressed if `'מלא'`) |
| אחיזה | `grip` | TEXT | Optional | First 5 chips |
| וידאו | `video_url` | TEXT | Optional | Not surfaced as a chip; not surfaced in trainee view at all |
| דגשים | `description` (NOT `notes`) | TEXT | Optional | Yes (notes block) |
| טבטה | `tabata_data` (TEXT/JSON) + `tabata_preview` (TEXT) | JSON serialized | Optional | "טבטה" badge + sub-list |
| רשימת תרגילים | `children` (TEXT/JSON) | JSON-serialized array | Optional | Numbered sub-list |
| (system) | `training_section_id` | UUID | Required | — |
| (system) | `training_plan_id` | UUID | Required | — |
| (system) | `order` | INT | On insert (set to `(sec.exercises||[]).length`) | — |
| (system) | `completed` | BOOL | Default false; toggled by trainee | — |
| (system) | `mode` | TEXT (טבטה / סופרסט / קומבו) | Optional | Drives container UI |

**Read-only fallback columns referenced by UI:** `coach_notes`, `notes`, `exercise_list`, `sub_exercises`, `tabata_config` — read-compatible aliases, not written by the current builder.

---

## 6. Field existence check

| Field | Where requested | Reality |
|-------|----------------|---------|
| `parent_plan_id` | training_plans | ✅ EXISTS. Read in `MyPlan.jsx:30,319`, `TraineeProfile.jsx:3181-3184`. Written on duplicate (`MyPlan.jsx:421`) — sets the new plan's `parent_plan_id` to original's `parent_plan_id || id` so a chain of duplicates shares one root. |
| `folder_id` | (any plans table) | ❌ DOES NOT EXIST. The word "folder" appears only as UI-side grouping for records/goals (`recordGrouping.js`, TraineeProfile goal cards). No plan-folder concept in the schema or code. |
| `trainee_can_edit` | (any plans table) | ❌ DOES NOT EXIST. No reference anywhere in `src/`. The current model: trainee can edit a plan iff `plan.created_by === user.id` (boolean derived from ownership, no flag). |
| `coach_private_notes` | sections or exercises | ❌ DOES NOT EXIST on plan/section/exercise tables. Column **does** exist on `sessions` and is used (`SessionFormDialog.jsx`, `SessionDetailDialog.jsx`). For plans, the only "notes" channels are `description`, `notes`, `coach_notes` — all of which are visible to the trainee. |
| `color` (sections) | training_sections | ⚠️ POTENTIALLY EXISTS but unused-by-PlanBuilder. Single read site: `PlanBuilder.jsx:707` does `section.color || type.color`, falling back to the section-type lookup. Never written by the builder. The base44 column-retry would silently drop it on save anyway. Treat as "absent in practice." |

---

## 7. Notable architectural concerns

1. **Two parallel plan builders** — `PlanBuilder.jsx` (wizard route) and `UnifiedPlanBuilder.jsx` (embedded). They use overlapping payload shapes but diverge on details (trainee assignment, status values).
2. **No central plans helper** — every consumer hits supabase or base44 entities directly with its own filter/sort logic. A plan-fetching helper that inlines section+exercise joins would centralize the 6+ in-page implementations.
3. **No trainee-instructions vs coach-private split** — the system has only one notes channel per exercise. Coach can't write something only she sees.
4. **First-5-chip cap on trainee view** is silent. If a coach loads a richer exercise (RPE + 6 params), some get hidden with no indicator.
5. **Status field carries Hebrew + English values interchangeably** with no normalization layer.
6. **`assigned_to` is a single uuid** despite multi-select UI — duplicates the row N times via series? Actually no: it just persists the first trainee.
7. **Tabata blob carries another exercise-list shape** — adds a 4th sub-exercise-list source to merge. Should be consolidated into `children`.
8. **Difficulty encoded in description as `[קושי: X]`** — fragile string parsing on every read; would benefit from a `difficulty_level` column.

---

## 8. Verification

`git status` (after creating only the report):

Expected: only `INSPECTION_REPORT_V2.md` should appear as untracked. No file edits, no migration creation, no helper creation.

---

**STOP** — report ready. No further changes.
