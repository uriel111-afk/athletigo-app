# Card3Levels Pattern

Three-level visual escalation for any list of content units (sessions, packages,
plans, goals, baselines, etc). The same shell + composition rules apply to every
domain; only the inner slot wrappers change.

## The three levels

| Level | Component        | Purpose                                                      |
| ----- | ---------------- | ------------------------------------------------------------ |
| 1     | `CardClosed`     | Compact list-row card. Click toggles to Level 2.             |
| 2     | `CardOpen`       | Inline expanded summary. CTA escalates to Level 3.           |
| 3     | `DetailDialog`   | Full-screen modal. Edit (coach) / read-only (trainee).       |

All three live in `src/components/ui/Card3Levels/` and are domain-agnostic.

## Why three levels

* **Closed** — scannable. Trainee skims their next 5 sessions; coach scrolls 30
  packages. Visual density matters more than detail.
* **Open** — peek without commitment. Coach taps a package row and sees the
  next 3 facts (price / remaining / expiring) without diving into a modal.
* **Detail** — the editing surface. Form fields live here, not in the open
  body. Backdrop click is ignored on purpose; a stray tap shouldn't drop the
  user out mid-edit.

## Coach vs Trainee

The Detail dialog accepts a `viewerRole` prop (`'coach' | 'trainee'`). The
generic `DetailDialog` doesn't consume it — it's plumbed through to the
domain-specific child so the child can:

* Toggle between read-only and editable inputs.
* Hide entire sections (e.g. coach private notes) for the trainee. Use a
  rendering-time `if (isCoach) { ... }` rather than a CSS hide so the field
  never reaches the DOM.
* Swap the footer button set (single "סגור" for trainee, "שמור / ביטול" for
  coach, action triplet for pending sessions on the trainee side).

## Reference implementation: Sessions

`src/components/sessions/SessionCardClosed.jsx`
`src/components/sessions/SessionCardOpen.jsx`
`src/components/sessions/SessionDetailDialog.jsx`

```jsx
const [openId, setOpenId]     = useState(null);
const [detailRow, setDetail]  = useState(null);

{sessions.map((s) => (
  <React.Fragment key={s.id}>
    <SessionCardClosed
      session={s}
      otherParty={traineeMap[s.trainee_id]}
      viewerRole="coach"
      onClick={() => setOpenId(openId === s.id ? null : s.id)}
      onStatusChange={(session, newStatus) =>
        handleSessionStatusChange(session, newStatus)
      }
    />
    <SessionCardOpen
      isOpen={openId === s.id}
      session={s}
      onOpenDetail={() => setDetail(s)}
    />
  </React.Fragment>
))}

<SessionDetailDialog
  session={detailRow}
  otherParty={detailRow ? traineeMap[detailRow.trainee_id] : null}
  viewerRole="coach"
  isOpen={!!detailRow}
  onClose={() => setDetail(null)}
  onSaved={() => queryClient.invalidateQueries({ queryKey: ['sessions'] })}
/>
```

Trainee surface is identical except `viewerRole="trainee"` and the
`otherParty` becomes the coach. Trainee also passes `onTraineeApprove` /
`onTraineeReschedule` / `onTraineeCancel` callbacks for pending sessions.

## How to apply this pattern to a new domain

1. **Create three wrappers under `src/components/<domain>/`:**
   * `<Domain>CardClosed.jsx`  — composes `<CardClosed>` with domain-specific
     children (the row title + meta line) and a `leftBadge` slot for status
     pills, payment marks, etc.
   * `<Domain>CardOpen.jsx`    — composes `<CardOpen>` with a 3–5-line summary
     of the row (icons + facts).
   * `<Domain>DetailDialog.jsx` — composes `<DetailDialog>` with five
     standard sections:

     A. Status (always visible; editable for coach, read-only for trainee).
     B. Core fields (date / type / location / price / etc).
     C. Public notes — visible to both sides.
     D. **Private notes (coach-only)** — orange-tinted, only rendered when
        `viewerRole === 'coach'`. The DB column should be a separate
        `<domain>_private_notes` field; the trainee-facing SELECT must omit
        it (see *Trainee SELECT field-filtering* below).
     E. Attachments / history / linked rows — optional.

2. **Save handler** — coach branch updates the row with the diff in one
   `update().eq('id', row.id)` call. The dialog calls `onSaved(payload)` so
   the parent invalidates the right react-query keys.

3. **Footer logic**
   * Coach: `[ביטול | שמור שינויים]`.
   * Trainee on a pending row: `[✓ אישור | 📅 שינוי תאריך | ✕ ביטול]` —
     use the `onTrainee*` callback props the parent passes through.
   * Trainee on a settled row: single `[סגור]`.

## Trainee SELECT field-filtering

The private-notes column is hidden by **two** layers:

* **Frontend** — `SESSION_FIELDS_TRAINEE` in `src/lib/sessionHelpers.js`
  enumerates the columns a trainee surface is allowed to read. Use it in
  `.select(SESSION_FIELDS_TRAINEE)` instead of `.select('*')` on every
  trainee-side query.
* **DB (recommended follow-up)** — add a column-level RLS policy that hides
  `<domain>_private_notes` from any caller other than the coach. Belt and
  suspenders: even if a future query forgets to use the field list, RLS
  refuses to ship the value.

For new domains, mirror this with `<DOMAIN>_FIELDS_TRAINEE` constants.

## File checklist for a new domain

```
src/components/<domain>/<Domain>CardClosed.jsx
src/components/<domain>/<Domain>CardOpen.jsx
src/components/<domain>/<Domain>DetailDialog.jsx
src/lib/<domain>Helpers.js          ← FIELDS_TRAINEE / FIELDS_COACH constants
migrations/<date>-<domain>-private-notes.sql   ← if private notes are needed
```

## Pattern non-goals

* **Not a state container.** The pattern owns chrome; the parent owns
  open/close state, edit-target state, query invalidation, and any
  domain-side cascades (notifications, package deduction, etc).
* **Not a router.** Deep links to a row's Detail view should set the
  parent's `detailRow` state from a URL param; the dialog itself doesn't
  push history.
* **Not a multi-row editor.** One row at a time. Bulk operations belong on
  the list, not in the dialog.
