# Plan Execution Engine — Inspection Report

**Generated**: 2026-04-29 · read-only audit, no code changes.

---

## 1. קבצים רלוונטיים

### API helpers / data layer

| Path | Role |
| --- | --- |
| `src/api/base44Client.js` | Wraps `supabase` with a generic `createEntity(tableName)` factory (CRUD + filter). The actual `.from('training_plans')` / `.from('training_sections')` / `.from('exercises')` calls live behind these helpers. |
| `src/api/entities.js` | Re-exports `base44.entities.*` to consumers. |
| `src/lib/sectionTypes.js` | Hardcoded section categories, focus mapping. Read-only metadata, no DB calls. |
| `src/lib/recordExercises.js` | Exercise-name canonical list for the records flow (different domain from training-plan exercises). |

### Entity → table mapping (from `base44Client.js` lines 318-340)

```
TrainingPlan            → training_plans
TrainingSection         → training_sections
TrainingPlanAssignment  → training_plan_assignments
Exercise                → exercises
ExerciseExecution       → exercise_executions
```

### UI — builder / editor (write surfaces)

| Path | Role |
| --- | --- |
| `src/pages/PlanBuilder.jsx` | Standalone builder page (deep-linked editor). |
| `src/components/training/UnifiedPlanBuilder.jsx` | The 1,233-line core editor — owns plan/section/exercise CRUD via base44 entities. **The single source of truth for write logic.** |
| `src/components/training/PlanFormDialog.jsx` | Create/edit metadata only (plan_name, description, goal_focus, weekly_days, assignment). Sections/exercises are added in UPB. |
| `src/components/training/SectionCard.jsx` | Section row in the builder. |
| `src/components/workout/SectionForm.jsx` | Section name + category + description form fields. |
| `src/components/workout/ModernExerciseForm.jsx` | The exercise-parameter editor. Defines `ALL_PARAMETERS` + DB_MAP. |
| `src/components/plans/PlanEditorDialog.jsx` | Modal that wraps `UnifiedPlanBuilder` for in-context (TraineeProfile) editing. |

### UI — display only (read surfaces)

| Path | Role |
| --- | --- |
| `src/components/training/ExerciseCard.jsx` | Trainee/coach display of a single exercise — `buildChips()` here is the canonical render. |
| `src/components/training/ExerciseExecutionModal.jsx` | Trainee execution full-screen view. |
| `src/components/ExerciseExecution.jsx` | Inline execution component. |
| `src/components/training/CompactPlanCard.jsx` | Plan summary card. |
| `src/components/training/TraineePlanGroup.jsx` | Coach view of plans grouped by trainee. |
| `src/components/plans/PlanCard.jsx` | New 3-level plans card (rendered on TraineeProfile plans tab). |
| `src/pages/MyPlan.jsx` | Trainee's own plan view. |
| `src/pages/TrainingPlanView.jsx` | Public/shared single-plan view. |

---

## 2. מבנה Plans (`training_plans` table)

### Fields written by the codebase

Source: `src/pages/TrainingPlans.jsx:206-294` (createPlanMutation), `:295+` (updatePlanMutation), `src/components/training/PlanFormDialog.jsx`.

| Field | Type (inferred) | Notes |
| --- | --- | --- |
| `id` | UUID | DB-generated. |
| `plan_name` | TEXT | Visible name. |
| `title` | TEXT | Mirror of `plan_name` written alongside on every create — legacy column kept in sync (line 222-223). |
| `description` | TEXT | Optional. |
| `goal_focus` | TEXT[] (array) | Always wrapped to `['כוח']` if missing (line 213-215). |
| `weekly_days` | TEXT[] | Stripped before write in `updatePlanMutation` (line 298) — column doesn't exist on every install. |
| `assigned_to` | UUID (users.id) | The trainee. Null = unassigned/template. |
| `assigned_to_name` | TEXT | Snapshot of trainee name at assignment time. |
| `created_by` | UUID (users.id) | Coach. |
| `created_by_name` | TEXT | Coach name snapshot. |
| `start_date` | DATE | Defaults to "today". |
| `status` | TEXT | Hebrew values: `'פעילה'` (active), `'טיוטה'` (draft), `'הושלמה'` (completed), `'ארכיון'` (archived), `'deleted'` (soft-delete). |
| `is_template` | BOOLEAN | True for reusable templates. |
| `series_id` | UUID? | Optional FK to a `program_series` row. |
| `parent_plan_id` | UUID? | Used by `MyPlan.jsx:30` (`plan.parent_plan_id || plan.id`) to group derived plans. |
| `progress_percentage` | NUMERIC? | Read in `MyPlan.jsx`; computed externally. |
| `exercises_count` | NUMERIC? | Read by `getPlanProgress`. |
| `created_at` | TIMESTAMPTZ | DB-generated. |
| `updated_at` | TIMESTAMPTZ? | Sometimes touched on update. |

### Fields explicitly **stripped** by `updatePlanMutation` (line 298)

```js
const { weekly_days, coach_id, created_date, training_days, difficulty, ...safeData } = data;
```

So `coach_id`, `created_date`, `training_days`, `difficulty` are **legacy / non-existent** columns the form might surface but the DB doesn't store.

---

## 3. מבנה Sections (`training_sections` table)

### א. Storage shape

**Separate table** with FK to `training_plan_id`. *Not* JSONB nested in the plan.

Confirmed by `UnifiedPlanBuilder.jsx:54`:
```js
const rows = await base44.entities.TrainingSection.filter(
  { training_plan_id: plan.id }, 'order'
);
```

### ב. Identity

`id` is a stable UUID generated by Postgres. Referenced by `e.training_section_id === s.id` joins everywhere (e.g. `UnifiedPlanBuilder.jsx:147, 226, 253, 319, 322, 422`).

### ג. Section fields

From `src/components/workout/SectionForm.jsx:7-103` and `UnifiedPlanBuilder.jsx:332`:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | DB-generated. |
| `training_plan_id` | UUID | FK → `training_plans.id`. |
| `section_name` | TEXT | The display name. **Note**: Older code occasionally references `section.name` — but the canonical write column is `section_name`. |
| `description` | TEXT | Free text. |
| `category` | TEXT | Hebrew preset name from `sectionTypes.js`: `'חימום'` / `'תנועתיות'` / `'כוח'` / `'גמישות'` / `'מותאם אישית'` / etc. |
| `icon` | TEXT | Emoji string copied from the category preset. |
| `color_theme` | TEXT | Hex string from the preset (e.g. `#FF6F20`). |
| `order` | INTEGER | Drives display order. Sometimes `sort_order` is also referenced as a fallback (`PlanCard.jsx:74`: `a.order ?? a.sort_order ?? 0`). |
| `created_at` | TIMESTAMPTZ | DB-generated. |

### ד. Order

Stored as integer column `order` on each row. `UnifiedPlanBuilder.jsx:213-214` swaps two sections' `order` values to reorder. The query passes `'order'` as the second arg to `.filter(...)` for ascending sort.

---

## 4. מבנה Exercises (`exercises` table)

### א. Storage shape

**Separate table**. FK columns:
- `training_section_id` (UUID → `training_sections.id`) — required for the join.
- `training_plan_id` (UUID → `training_plans.id`) — denormalized for direct plan-scoped queries (`MyPlan.jsx:22`: `e.training_plan_id === plan.id`).

Both FKs are written on every insert (`UnifiedPlanBuilder.jsx:594-595`):
```js
training_plan_id: plan.id,
training_section_id: currentSection.id,
```

### ב. Identity

UUID `id`, DB-generated.

### ג. Exercise parameters — full inventory

Two contracts in play:

#### Form-side parameter IDs (from `ModernExerciseForm.jsx:27-50` `ALL_PARAMETERS`)

#### DB-side column names (after `DB_MAP` rewrite at line 56-60)

```js
const DB_MAP = {
  reps:           "reps",
  weight_kg:      "weight",
  load_type:      "weight_type",
  foot_position:  "leg_position",
  static_hold:    "static_hold_time",
  notes:          "description",
  tabata:         "tabata_blocks",
};
```

| Form param | DB column | Type | Always present? | Notes |
| --- | --- | --- | --- | --- |
| `sets` | `sets` | TEXT/INT | No | Default form value `"3"`. |
| `reps` | `reps` | TEXT/INT | No | Default `"10"`. |
| `rounds` | `rounds` | TEXT/INT | No | Default `"3"`. Time/circuit work. |
| `work_time` | `work_time` | TEXT/INT (seconds) | No | Default `"30"`. |
| `rest_time` | `rest_time` | TEXT/INT (seconds) | No | Default `"30"`. |
| `rest_between_sets` | `rest_between_sets` | TEXT/INT (sec) | No | Default `"60"`. |
| `rest_between_exercises` | `rest_between_exercises` | TEXT/INT (sec) | No | Default `"15"`. |
| `rpe` | `rpe` | TEXT/INT | No | 1–10. |
| `weight_kg` | **`weight`** | TEXT/NUMERIC | No | Renamed via DB_MAP. |
| `load_type` | **`weight_type`** | TEXT | No | Defaults to `"bodyweight"` (English) on writes — see `UnifiedPlanBuilder.jsx:589`. Form values are Hebrew. |
| `tempo` | `tempo` | TEXT | No | Default `"3010"` (4-digit eccentric/bottom/concentric/top, no separator). |
| `static_hold` | **`static_hold_time`** | TEXT/INT (sec) | No | Renamed via DB_MAP. |
| `body_position` | `body_position` | TEXT | No | Hebrew preset list. |
| `foot_position` | **`leg_position`** | TEXT | No | Renamed via DB_MAP. |
| `side` | `side` | TEXT | No | `'דו־צדדי'` / `'ימין'` / `'שמאל'` / `'לסירוגין'`. |
| `range_of_motion` | `range_of_motion` | TEXT | No | Default `'מלא'`. |
| `grip` | `grip` | TEXT | No | Default `''`. |
| `equipment` | `equipment` | TEXT | No | Free-text or preset. |
| `notes` | **`description`** | TEXT | No | Renamed via DB_MAP. **Important**: the `notes` UI label saves into DB column `description`. |
| `video_url` | `video_url` | TEXT | No | URL. |
| `mode` | `mode` | TEXT | Yes (default `"חזרות"`) | Reps mode vs Time mode vs Tabata. |
| `weight_type` | `weight_type` | TEXT | Yes (default `"bodyweight"`) | Duplicate path with `load_type`/`weight_type` mapping — set by `UnifiedPlanBuilder.jsx:589`. |
| `name` | `name` | TEXT | Yes | Mirrors `exercise_name` — written on save (`UnifiedPlanBuilder.jsx:591`). |
| `exercise_name` | `exercise_name` | TEXT | Yes | The visible name. Both `name` and `exercise_name` are written. |
| `order` | `order` | INTEGER | Yes | Set on insert from `sectionExercises.length + 1` (`UnifiedPlanBuilder.jsx:586`). |
| `completed` | `completed` | BOOLEAN | Yes (default `false`) | Trainee progress. |
| `tabata_preview` | `tabata_preview` | TEXT | No | Human-readable summary string. |
| `tabata_data` | `tabata_data` | TEXT (stringified JSON) | No | Container payload (see below). |
| `children` | `children` | JSONB? | No | Sub-exercise list (canonical column per CLAUDE.md). |
| `exercise_list` | `exercise_list` | JSONB? | No | Alternate alias on some installs. |
| `sub_exercises` | `sub_exercises` | JSONB? | No | Legacy direct array column. |
| `tabata_blocks` | `tabata_blocks` | JSONB? | No | Legacy tabata block array (different from `tabata_data`). |
| `training_plan_id` | `training_plan_id` | UUID | Yes | FK. |
| `training_section_id` | `training_section_id` | UUID | Yes | FK. |
| `created_at` | `created_at` | TIMESTAMPTZ | Yes (DB) | |

### Container exercises (lists / tabata)

`UnifiedPlanBuilder.jsx:566-583` shows two distinct container shapes:

1. **Sub-exercises array → `tabata_data` JSON string**
   ```js
   tabata_data = JSON.stringify({
     container_type: "tabata" | "list",
     sub_exercises: subExercises,
   });
   ```
2. **Legacy tabata blocks → `tabata_data` JSON string**
   ```js
   tabata_data = JSON.stringify({ blocks });
   ```

Reading code (`ExerciseCard.jsx:96-105`) coalesces across **four** legacy field names:
- `ex.children` (canonical)
- `ex.exercise_list` (alias)
- `ex.sub_exercises` (legacy direct column)
- `ex.tabata_data.sub_exercises` / `.blocks` (embedded)

### Time-based vs reps-based — variant fields

Driven by `mode` field:
- `mode: "חזרות"` → uses `sets` + `reps` + `weight` + `tempo`
- `mode: "זמן"` → uses `work_time` + `rest_time` + `rounds`
- `mode: "טבטה"` → uses `tabata_data` payload + optional `tabata_blocks` legacy

The form lets the coach pick any subset; nothing on the DB enforces the variant.

### ד. Order within section

Stored as `order` integer on the exercise row. New exercises get `order = sectionExercises.length + 1` on insert (`UnifiedPlanBuilder.jsx:586`). Reorder swaps `order` values between two rows (`UnifiedPlanBuilder.jsx:234-235`).

---

## 5. דוגמה אמיתית

**No mock plan / fixture is shipped in code.** Closest things to a sample are:

- `defaultPlanForm` at `src/components/training/PlanFormDialog.jsx:24` — empty plan-form scaffold (no sections/exercises).
- `defaultExercise` shapes inside `ModernExerciseForm.jsx:741-742` — empty exercise placeholder.

### Conceptual plan example (built from the schema above)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "plan_name": "תוכנית כוח לפלג גוף עליון",
  "title":     "תוכנית כוח לפלג גוף עליון",
  "description": "3 סקשנים — חימום, כוח, מתיחות",
  "goal_focus": ["כוח", "מסת שריר"],
  "assigned_to":      "770e8400-e29b-41d4-a716-446655440111",
  "assigned_to_name": "ישראל ישראלי",
  "created_by":       "67b0093d-d4ca-4059-8572-26f020bef1eb",
  "created_by_name":  "אוריאל",
  "start_date":   "2026-04-29",
  "status":       "פעילה",
  "is_template":  false,
  "series_id":    null,
  "parent_plan_id": null,
  "created_at":   "2026-04-29T08:00:00Z",

  "sections": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440aaa",
      "training_plan_id": "550e8400-e29b-41d4-a716-446655440000",
      "section_name": "חימום",
      "description":  "5 דקות אירובי + מובילטי כתפיים",
      "category":     "חימום",
      "icon":         "🔥",
      "color_theme":  "#FF6F20",
      "order":        0,

      "exercises": [
        {
          "id": "880e8400-e29b-41d4-a716-446655441111",
          "training_plan_id":    "550e8400-...",
          "training_section_id": "660e8400-...",
          "exercise_name": "ריצה קלה",
          "name":          "ריצה קלה",
          "mode":          "זמן",
          "work_time":     "300",
          "rounds":        "1",
          "weight_type":   "bodyweight",
          "order":         0,
          "completed":     false,
          "tabata_data":   null,
          "children":      null
        }
      ]
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440bbb",
      "training_plan_id": "550e8400-...",
      "section_name": "כוח עליון",
      "category":     "כוח",
      "icon":         "💪",
      "color_theme":  "#4D4D4D",
      "order":        1,

      "exercises": [
        {
          "id": "880e8400-e29b-41d4-a716-446655442222",
          "training_section_id": "660e8400-...bbb",
          "training_plan_id":    "550e8400-...",
          "exercise_name": "פושאפ עם הפסקה",
          "name":          "פושאפ עם הפסקה",
          "mode":          "חזרות",
          "sets":          "3",
          "reps":          "10",
          "weight":        null,
          "weight_type":   "bodyweight",
          "tempo":         "3010",
          "rest_between_sets": "60",
          "body_position": "תמיכה",
          "side":          "דו־צדדי",
          "range_of_motion": "מלא",
          "rpe":           "7",
          "description":   "ירידה איטית, עצירה במקסימום",
          "video_url":     "https://youtu.be/example",
          "order":         0,
          "completed":     false
        },
        {
          "id": "880e8400-e29b-41d4-a716-446655443333",
          "training_section_id": "660e8400-...bbb",
          "training_plan_id":    "550e8400-...",
          "exercise_name": "טבטה כתפיים",
          "name":          "טבטה כתפיים",
          "mode":          "טבטה",
          "tabata_preview": "פיק • דד באג • סופרמן",
          "tabata_data":   "{\"container_type\":\"tabata\",\"sub_exercises\":[{\"exercise_name\":\"פיק\",\"work\":20,\"rest\":10},{\"exercise_name\":\"דד באג\",\"work\":20,\"rest\":10},{\"exercise_name\":\"סופרמן\",\"work\":20,\"rest\":10}]}",
          "order":         1,
          "completed":     false
        }
      ]
    }
  ]
}
```

> **Note:** the `sections[].exercises` nesting above is for **reading clarity in this report**. On the wire, every exercise/section is its own row in its own table; the codebase reconstructs the tree on the client (`MyPlan.jsx:21-23`, `UnifiedPlanBuilder.jsx:147`, `PlanCard.jsx:73-77`).

---

## 6. תצוגת תרגיל קיימת

### א. נתיב

`src/components/training/ExerciseCard.jsx`

The `buildChips()` helper (lines 41-75) is the single source of what gets rendered as chips next to an exercise name.

### ב. מוצג כיום (per chip, in render order)

| Chip | DB column | Format |
| --- | --- | --- |
| סטים | `sets` | `${value} סטים` |
| חזרות | `reps` | `${value} חזרות` |
| סבבים | `rounds` | `${value} סבבים` |
| עבודה | `work_time` | `30 שנ׳` / `1 דק׳` / `1:30` |
| מנוחה | `rest_time` | same time format |
| מנ׳ סטים | `rest_between_sets` | same |
| מנ׳ תרגילים | `rest_between_exercises` | same |
| החזקה | `static_hold_time` | same |
| משקל | `weight` | `${value} ק"ג` |
| עומס | `weight_type` | only if `!== "bodyweight"` |
| RPE | `rpe` | `RPE ${value}` |
| טמפו | `tempo` | raw 4-digit string (e.g. `"3010"`) |
| מנח גוף | `body_position` | raw |
| רגליים | `leg_position` | raw |
| צד | `side` | only if `!== "דו־צדדי"` |
| אחיזה | `grip` | raw |
| ציוד | `equipment` | raw |
| טווח | `range_of_motion` | only if `!== "מלא"` |

Plus separate sections of the card render: exercise name, optional video link, sub-exercise list (children/exercise_list/sub_exercises), tabata_data summary, focus/description (separate from the chip row).

### ג. חבוי ב-data ולא מוצג

Fields the DB carries but `buildChips` doesn't surface as a chip:

| Column | Why it's hidden |
| --- | --- |
| `mode` | Used to drive form variant; never shown on the card. Could surface as "חזרות / זמן / טבטה" badge. |
| `description` | Rendered separately as the "💡 ..." italic line in the surrounding card markup, not as a chip. (Note: `description` is the DB column behind the form's `notes` field — same data.) |
| `completed` | Powers a checkmark / strikethrough elsewhere, not a chip. |
| `tabata_preview` | Raw summary string — used in the surrounding markup, not as a chip. |
| `tabata_data` | JSON blob — parsed by the sub-exercise renderer. |
| `tabata_blocks` | Legacy. |
| `weight_type === "bodyweight"` | Suppressed (default). Could surface as a "משקל גוף" chip when the coach wants to highlight it. |
| `range_of_motion === "מלא"` | Suppressed (default). |
| `side === "דו־צדדי"` | Suppressed (default). |
| `created_at` | Not user-relevant on the card. |

So the only column that's truly **never** rendered is `mode` — every other column is either shown as a chip, as a separate display block, or intentionally suppressed when on its default value.

---

## 7. הערות לבונה

### Three legacy field names for sub-exercises co-exist
`children` (canonical), `exercise_list` (alias), `sub_exercises` (legacy direct column), and additionally `tabata_data.sub_exercises` / `tabata_data.blocks` embedded in the JSON blob. Any new code reading sub-exercises **must** coalesce all four shapes — `ExerciseCard.jsx:96-114` is the reference implementation.

### `notes` form field maps to `description` DB column
`DB_MAP` rewrites `notes → description` on write. Grepping for `description` may turn up references to either the public exercise note OR the plan/section description. The exercise card's "💡" italic line reads `ex.description` (or, for legacy, `ex.notes` / `ex.focus_points`).

### `name` and `exercise_name` are both written
`UnifiedPlanBuilder.jsx:591` sets `name: exerciseData.exercise_name || exerciseData.name || "תרגיל"` while `exerciseData` itself is spread above so `exercise_name` lands too. The display side reads `ex.exercise_name || ex.name`. Stale rows that wrote only one column still render correctly.

### Plan ↔ Section ↔ Exercise — three separate tables, NOT JSONB
The codebase is consistent on this. There's no `plans.sections` JSONB column. The hierarchy is reassembled on the client via `e.training_section_id === s.id` and `s.training_plan_id === p.id` joins.

### `training_plan_id` is denormalized on Exercise rows
Exercises carry both `training_section_id` (the parent section) AND `training_plan_id` (the parent plan, redundantly). This means a plan-scoped exercise query (`MyPlan.jsx:22`) doesn't have to join through sections. Side-effect: a section reparented to another plan needs all its exercise rows updated.

### `goal_focus` is `TEXT[]` on most installs but legacy rows store comma-string
`PlanFormDialog.jsx:36-37` defensively splits on `, ` if the value isn't already an array. Any reader should `Array.isArray(plan.goal_focus) ? plan.goal_focus : (plan.goal_focus || '').split(', ')`.

### `status` value vocabulary
| Value | Where set | Meaning |
| --- | --- | --- |
| `'פעילה'` | `TrainingPlans.jsx:248` | Default on create. |
| `'טיוטה'` | UPB | Draft. |
| `'הושלמה'` | UPB | Coach-marked complete. |
| `'ארכיון'` | UPB | Archived. |
| `'deleted'` | `TrainingPlans.jsx:1057` | Soft-delete; queries should filter `.neq('status', 'deleted')`. |

### `coach_id` does NOT exist on `training_plans`
`updatePlanMutation` at `TrainingPlans.jsx:298` strips `coach_id` from the payload — referencing it on writes will be silently dropped. The canonical owner field is `created_by`.

### `weekly_days`, `training_days`, `difficulty` are stripped on write
Same line as above. UI may collect these but the DB doesn't keep them.

### `tempo` is stored as a 4-character string with no separators
The form default is `"3010"` (3 sec eccentric, 0 hold, 1 sec concentric, 0 hold top). The display chip just renders the raw string. **No 4-input editor exists today.** The user's spec from an earlier round mentioned a 4-field tempo editor — that would be a real refactor and would need a migration to convert existing strings.

### `is_tabata` flag does not exist
The codebase identifies tabata exercises via `mode === 'טבטה'` AND/OR presence of `tabata_data` / `tabata_blocks`. There's no boolean `is_tabata` column.

### RLS / access control
Not visible from the codebase audit alone. The base44 wrapper relies on the standard Supabase RLS that's active on the project. `UnifiedPlanBuilder.jsx:1036+` runs a defensive `freshExercises = await base44.entities.Exercise.filter({ training_plan_id: plan.id })` after sensitive writes — this would silently return an empty array if RLS denies, with no error toast. New code that depends on a successful read after a write should explicitly check the array length and surface an error if it's unexpected.

### `series_id` column may not exist on every install
PlanFormDialog passes it through, but I didn't see a migration in `migrations/` adding it. Worth confirming on production with an information_schema query before depending on it.

### `program_series` table is referenced but not part of this audit
`series_id` FKs into a `program_series` row. Code path lives in `TrainingPlans.jsx` create/update mutations and `SeriesFormDialog.jsx`. Out of scope for "plans → sections → exercises" but worth flagging if the user moves to series-driven plan generation.

---

End of report.
