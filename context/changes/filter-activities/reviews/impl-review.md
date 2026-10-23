<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Bike Navigation and Activity Overview

- **Plan**: context/changes/filter-activities/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-23
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Import writes can succeed without refreshing dashboard data

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/strava/import.ts:165
- **Detail**: The import route can return 503 after activity writes succeeded, but its generic `failure()` response resets inserted and updated counts to zero. The dashboard throws on non-2xx before calling `refreshAfterSavedChanges()` (`src/components/ActivityDashboard.tsx:123-125`). The user sees a failure while the database has changed, and the bike list and yearly summary can remain stale until another refresh.
- **Fix**: Preserve a saved-changes indicator/count in post-write failure responses and have the dashboard refresh from that signal before presenting the error.
- **Decision**: FIXED — added a `savedChanges` response marker for post-write import failures, refreshes the dashboard before displaying those errors, and added a reducer regression test.

### F2 — Workspace terminal approvals allow all npm exec commands

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .vscode/settings.json:33
- **Detail**: The phase-2 change adds `"npm exec": true` to `chat.tools.terminal.autoApprove`. This was an intentional user-approved workspace setting, but it broadly trusts npm exec invocations, which can execute arbitrary package binaries/scripts without a per-command approval prompt.
- **Fix**: Remove the broad approval or replace it with narrowly scoped command patterns for only the intended executable and arguments.
- **Decision**: ACCEPTED — keep the explicitly approved workspace setting; the user accepts its broader npm exec approval scope.

### F3 — Smoke test checks response codes but not rendered page content

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:39
- **Detail**: The signed-out home and signed-in dashboard smoke steps assert HTTP 200 only. The request helper discards response bodies, so a blank or unintended page could still pass these render assertions. This does not violate the phase contract, which explicitly requires the signed-out root to return 200, but it leaves page rendering less directly proven than the step labels imply.
- **Fix**: Return response text from the smoke helper and assert stable page markers for the public welcome and signed-in dashboard.
- **Decision**: FIXED — capture response bodies and assert the public welcome and signed-in dashboard headings in the smoke test.

## Verification

- `npm test`: PASS, 50 tests after triage fixes.
- `npm run lint`: PASS.
- `npm run check`: PASS, 0 errors, warnings, or hints.
- `npm run build`: PASS.
- `npm run smoke`: PASS, all 9 auth and routing steps; public welcome and dashboard response bodies now include asserted page headings.
- Triage: F1 FIXED; F2 ACCEPTED; F3 FIXED.
- Manual checks: user confirmed phase-3 manual verification; phases 1 and 2 were recorded as confirmed during their implementation closeout.
- Plan boundaries: MATCH. No chain assignment was added; import/sync routes and `sync-contract.ts` remain unchanged; the public welcome component and unrelated styling were preserved. The roadmap and plan tracking updates follow the implementation workflow. The `.vscode` setting is disclosed in F2 and was explicitly approved by the user.
