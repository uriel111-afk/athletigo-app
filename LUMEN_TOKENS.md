# Lumen Token Rulebook — Phase 0

The single source of truth for the multi-phase Lumen migration. Every
later phase consults this file to convert a hardcoded color into the
right CSS variable. The tokens themselves live in `src/index.css`
(inside the `@layer base { :root { … } }` block).

## Rules

- Replace **only** color, background, and shadow values. Never touch
  layout, spacing, font, border-radius, or component logic.
- A `#FFFFFF` / `#fff` used as a **card background** maps to
  `var(--ag-card-bg)`. A `#fff` used as **text on a dark / orange CTA**
  stays literal `#fff` — that's intentional contrast, not a surface.
- A `#000` / `rgba(0,0,0,…)` inside a `box-shadow` stays literal —
  shadow tints are not surface colors.
- Tailwind color utilities (`bg-white`, `text-gray-500`, etc.) are
  out of scope for this rulebook. The audit found very few of them
  inside `src/`; address those case-by-case during component work.
- If a value is not listed in the map below, leave it where it is and
  add it to **TODO: unmapped** at the bottom. Do not invent a token.

## Canonical cream

Two cream values exist in the codebase:

| Value | Count | Status |
|---|---|---|
| `#FBF3EA` | 3 | **canonical** — matches the existing `--cream` token, what `body { background-color }` already resolves to |
| `#FFF9F0` | 105 | **legacy** — pre-Lumen warm cream, every occurrence migrates to `var(--ag-bg)` |

The canonical cream is `#FBF3EA`, fronted by `var(--ag-bg)`.

## Canonical card shadow

The Lumen dual neumorphic shadow lives in the existing `--shadow-out`
token and is the value `.ag-card` already uses:

```
9px 9px 22px rgba(186,154,108,0.40),
-10px -10px 26px 3px rgba(255,255,255,1),
-2px -2px 6px rgba(255,255,255,0.95)
```

Fronted by `var(--ag-card-shadow)`.

## Direct map — hex → token

Use this table 1:1. Numbers are total `grep` hits across `src/pages/`
and `src/components/` (Phase 0 audit).

| Hex (any case) | Hits | Token | Notes |
|---|---|---|---|
| `#FF6F20` | 1097 | `var(--ag-accent)` | brand orange |
| `#FFFFFF` / `#FFF` / `#fff` | 566 / 87 | `var(--ag-card-bg)` | **only when used as a card / surface background**. As text on a dark or orange CTA, keep literal `#fff`. |
| `#888` / `#888888` | 500 + 8 | `var(--ag-text-soft)` | secondary text |
| `#1A1A1A` / `#1a1a1a` | 360 | `var(--ag-text)` | primary text |
| `#F0E4D0` | 352 | `var(--ag-border)` | hairline border |
| `#FFF9F0` | 105 | `var(--ag-bg)` | legacy cream → canonical cream |
| `#FBF3EA` | 3 | `var(--ag-bg)` | canonical cream |
| `#16A34A` | 103 | `var(--ag-success)` | green |
| `#DC2626` | 85 | `var(--ag-error)` | red |
| `#EAB308` | 23 | `var(--ag-warning)` | amber |
| `#3B82F6` | 26 | `var(--ag-blue)` | info / link blue |
| `#7F47B5` | 16 | `var(--ag-purple)` | purple accent |
| `#FFF0E4` | 37 | `var(--ag-accent-bg)` | soft orange surface |
| `#E8E0D8` | 25 | `var(--ag-chip-border)` | unselected chip outline |

## Method-color map (used later by `ExerciseCard`)

| Hex | Token | Method |
|---|---|---|
| `#FF6F20` | `var(--ag-method-basic)` | regular sets |
| `#7F47B5` | `var(--ag-method-superset)` | superset |
| `#EAB308` | `var(--ag-method-combo)` | combo |
| `#3B82F6` | `var(--ag-method-circuit)` | circuit |
| `#DC2626` | `var(--ag-method-tabata)` | tabata |
| `#8B1A1A` | `var(--ag-method-restpause)` | rest-pause |

These resolve through their respective semantic tokens — swapping the
method palette later is a one-line change.

## Token-existence audit

Every token the brief asked for, and where the value already lived
before Phase 0. Tokens marked **alias** are pure pointers added in
Phase 0; tokens marked **added** introduce a new value not present
under any prior name.

| New token | Pre-existing equivalent | Phase 0 action |
|---|---|---|
| `--ag-bg` | already aliased to `--cream` (#FBF3EA) | kept, **no change** |
| `--ag-card-bg` | `--card` / `--ag-surface` | **alias** → `var(--card)` |
| `--ag-card-radius` | `--ag-radius-card` exists but equals 24px (`--r-lg`) | **added** at 14px per spec; existing 24px token stays for `.ag-card` consumers |
| `--ag-card-shadow` | `--shadow-out` / `--ag-shadow-high` | **alias** → `var(--shadow-out)` |
| `--ag-accent` | `--orange` / `--ag-orange` | **alias** → `var(--orange)` |
| `--ag-accent-bg` | `--orange-soft` / `--ag-orange-soft` | **alias** → `var(--orange-soft)` |
| `--ag-text` | `--ink` / `--ag-text-primary` | **alias** → `var(--ink)` |
| `--ag-text-soft` | `--muted` exists but equals #9A8F82 (brown-tinted) | **added** at #888888 — the value the JSX actually uses 508 times |
| `--ag-border` | `--border` / `--ag-line` | **alias** → `var(--border)` |
| `--ag-chip-border` | none | **added** #E8E0D8 |
| `--ag-success` | `--green` | **alias** → `var(--green)` |
| `--ag-error` | `--red` | **alias** → `var(--red)` |
| `--ag-warning` | `--amber` | **alias** → `var(--amber)` |
| `--ag-purple` | `--purple` | **alias** → `var(--purple)` |
| `--ag-blue` | `--blue` | **alias** → `var(--blue)` |
| `--ag-method-basic` | none | **alias** → `var(--orange)` |
| `--ag-method-superset` | none | **alias** → `var(--purple)` |
| `--ag-method-combo` | none | **alias** → `var(--amber)` |
| `--ag-method-circuit` | none | **alias** → `var(--blue)` |
| `--ag-method-tabata` | none | **alias** → `var(--red)` |
| `--ag-method-restpause` | none | **alias** → `var(--burgundy)` |

Nothing was renamed. Every existing consumer of `--cream`, `--card`,
`--orange`, `--ag-orange`, `--ag-radius-card`, etc. keeps compiling
without changes.

## TODO: unmapped recurring values

These hex values appear ≥ 25 times across `src/` but were NOT added
to the canonical layer in Phase 0. Leave them in place for now; a
later phase will either fold them into existing tokens (when they're
near-duplicates) or introduce a new token if the design intends them
as distinct.

| Hex | Hits | Suspected role / nearest canonical |
|---|---|---|
| `#000000` | 175 | usually inside shadow `rgba()` — keep literal in shadows |
| `#E0E0E0` | 143 | light grey hairline — review against `var(--ag-border)` |
| `#7D7D7D` | 119 | secondary text variant — likely folds into `var(--ag-text-soft)` |
| `#6B7280` | 113 | tailwind gray-500 — likely folds into `var(--ag-text-soft)` |
| `#FFF5EE` | 97 | accent-bg variant — likely folds into `var(--ag-accent-bg)` |
| `#FAFAFA` | 91 | off-white surface — review against `var(--ag-card-bg)` |
| `#4CAF50` | 76 | material green — likely folds into `var(--ag-success)` |
| `#E5E7EB` | 69 | tailwind gray-200 — likely folds into `var(--ag-border)` |
| `#9CA3AF` | 67 | tailwind gray-400 — likely folds into `var(--ag-text-soft)` |
| `#AAA` | 54 | grey text — likely folds into `var(--ag-text-soft)` |
| `#666` | 54 | grey text — likely folds into `var(--ag-text-soft)` |
| `#CCC` | 51 | grey hairline / disabled — likely folds into `var(--ag-border)` |
| `#555` | 48 | grey text — likely folds into `var(--ag-text)` if near-black, else `var(--ag-text-soft)` |
| `#FFE5D0` | 44 | warm peach surface — review against `var(--ag-accent-bg)` |
| `#FEE2E2` | 42 | red-50 status background — candidate for a future `--ag-error-bg` |
| `#2196F3` | 40 | material blue — likely folds into `var(--ag-blue)` |
| `#E8F5E9` | 38 | green-50 status background — candidate for a future `--ag-success-bg` |
| `#374151` | 38 | tailwind gray-700 — review against `var(--ag-text)` |
| `#FFF8F3` | 37 | accent-bg variant — likely folds into `var(--ag-accent-bg)` |
| `#F7F3EC` | 36 | cream variant — likely folds into `var(--ag-bg)` |
| `#F5F5F5` | 36 | neutral light surface — review against `var(--ag-card-bg)` or a new neutral token |
| `#F44336` | 35 | material red — likely folds into `var(--ag-error)` |
| `#D1D5DB` | 34 | tailwind gray-300 — likely folds into `var(--ag-border)` |
| `#F0F0F0` | 29 | light grey surface — review against `var(--ag-card-bg)` |
| `#3FA06B` | 27 | green text variant — likely folds into `var(--ag-success)` |
| `#EEE` | 26 | grey hairline — likely folds into `var(--ag-border)` |
| `#DDD` | 26 | grey hairline — likely folds into `var(--ag-border)` |
| `#999` | 27 | grey text — likely folds into `var(--ag-text-soft)` |

When a later phase decides one of these is in fact a distinct surface
(e.g. status-row backgrounds), promote it to its own token in
`:root` and add a row to the Direct Map table. Otherwise fold it
into the nearest semantic token already listed above.

## Where the tokens live

`src/index.css`, inside the `@layer base { :root { … } }` block
starting around line 127 ("AthletiGo Lumen visual language"). The
Phase 0 semantic alias layer is the last block in that `:root`, after
the legacy `--ag-*` aliases.
