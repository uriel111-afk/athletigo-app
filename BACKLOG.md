# BACKLOG

Items deferred from a recent change set — to be verified or addressed manually before the next round of automated edits.

## PageLoader coverage audit (added 2026-05-10)

After unifying the boot splash + `PageLoader` to the new branded spec
(cream `#FFF9F0`, ATHLETIGO wordmark, pulse logo, `app-ready` event
dispatched from `AuthContext`), the following pages were **not** verified
manually as showing `<PageLoader />` while their data hydrates. If any of
these renders an empty / partially-skeleton screen during initial load,
add `if (loading) return <PageLoader />` to it.

- [ ] **TraineeProfile** — all 12 tabs (היכרות / יעדים / מדידות / שיאים / מסמכים / פרטים / מפגשים / חבילות / תוכניות / התקדמות / הערות / היסטוריה)
- [ ] **Notifications** — confirmed uses queries; needs verification while empty / first paint
- [ ] **Leads (CRM)** — `/lifeos/leads`
- [ ] **Reports** — `/reports`
- [ ] **PlanBuilder** — `/planbuilder` and `UnifiedPlanBuilder` mount
- [ ] **Sessions list** — `/sessions`
- [ ] **Packages list** — `/allusers` package tab + standalone packages views

The user will check each page in the browser post-deploy and report back
which screens (if any) flash empty content or show a skeleton placeholder
that should route through `PageLoader` instead.
