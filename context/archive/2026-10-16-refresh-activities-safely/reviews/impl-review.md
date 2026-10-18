<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Safe Strava Synchronization and Reconciliation

- **Plan**: `context/changes/refresh-activities-safely/plan.md`
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-16
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Repair is not bound to the Strava athlete that produced local history

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/strava/callback.ts:75`; `src/pages/api/strava/sync.ts:132`; `src/lib/strava/import.ts:538`
- **Detail**: OAuth can replace the stored `athlete_id`, but the sync route checks only scopes and `initial_import_completed_at`; it does not compare the connected athlete with the athlete whose activities were initially imported or whose active run was created. The import completion marker remains on the connection row when the callback upserts the new athlete. Repair treats a per-ID 404 as verified absence. Reconnecting another athlete can therefore make the old athlete's private activity IDs appear absent and permit their deletion; new mode can also mix the two athletes' histories.
- **Fix**: Persist the source athlete ID with the imported-history baseline and each sync run, and reject sync when the current connection does not match; require an explicit reset/reimport path to switch athletes.
- **Decision**: FIXED — Added an athlete identity baseline and run identity, blocked different-athlete OAuth reconnects, and reject mismatched provider profiles before writes or deletion. `npm test` (32 tests), `npm run lint`, `npm run check`, and `npx supabase test db` (53 assertions) pass. Legacy baseline IDs are backfilled from the currently stored connection because the prior schema did not preserve original athlete identity.

### F2 — Tracked terminal auto-approvals include broad mutating commands

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: `.vscode/settings.json:14`
- **Detail**: The workspace settings auto-approve commands including `git add`, `git checkout`, `npx supabase`, and `git commit`. These approvals are unrelated to the synchronization contract and can allow staging, discarding, database-reset, or commit operations without the usual confirmation. The final `git commit` approval was explicitly selected for inclusion during closeout, but the broader command approvals remain a separate workspace policy risk.
- **Fix**: Remove broad approvals for mutating commands and use exact, narrowly scoped command patterns only where the workflow requires them.
- **Decision**: SKIPPED — User chose to leave the workspace terminal approval settings unchanged.

### F3 — API and dashboard test criterion is marked complete without route/component coverage

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `context/changes/refresh-activities-safely/plan.md:287`; `src/lib/strava/sync-contract.test.ts:13`
- **Detail**: Progress item 3.5 claims dashboard/API coverage for mode selection, continuation, result counts, failure states, and list refresh. The added sync-contract tests exercise pure helper functions; the import tests exercise the sync service with memory stores. They do not call the API route or render/interact with the dashboard. The direct concurrency test also uses a stale cursor, rather than overlapping requests, and timeout behavior is not directly exercised. The plan's criteria at lines 161–163 therefore exceed the observable added coverage.
- **Fix**: Add focused API-route and dashboard tests, plus tests that exercise overlapping continuation requests and an actual timeout signal; only mark the corresponding criteria complete once those behaviors are covered.
- **Decision**: SKIPPED — User chose not to add direct API-route, dashboard, overlapping-request, or timeout tests in this review pass.

### F4 — Concurrent page writes can make reported sync counts inaccurate

- **Severity**: 👀 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/strava/sync.ts:298`; `src/lib/strava/import.ts:488`
- **Detail**: Repair classifies inserted versus updated rows with a separate read before upsert, while cursor advancement happens afterward using compare-and-swap. Concurrent continuations can both write the same page before one loses the cursor race. The row writes remain idempotent and the cursor cannot regress, but the request that advances the run can classify a row based on a stale pre-read, making cumulative inserted/updated counts inaccurate.
- **Fix**: Serialize page writes and cursor advancement in one database operation, or have the database return authoritative inserted/updated counts as part of the serialized write.
- **Decision**: FIXED — Added `apply_strava_sync_page`, which locks and validates the run cursor before atomically writing page activities, repair staging IDs, counts, and cursor/status. Stale-page behavior is covered in new/repair memory-store tests and pgTAP checks; null arguments are rejected by the strict function contract.

### F5 — Repair does not disclose hard deletion before starting

- **Severity**: 👀 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `src/components/ActivityDashboard.tsx:229`
- **Detail**: Selecting “Repair full history” immediately starts a scan that can hard-delete locally stored activities and dependent records after verification. The UI reports removal counts afterward, but the action point does not disclose this destructive effect. The plan and user acceptance authorize deletion, but they do not establish that the consequence is clear before invocation.
- **Fix**: Add concise confirmation text or change the action copy to disclose that verified Strava deletions are also removed locally before starting repair.
- **Decision**: FIXED — The repair option now explains before invocation that activities confirmed deleted on Strava, along with linked data, are removed locally.

## Verification

- Review follow-up: `npm test` PASS (34 tests); `npm run lint` PASS; `npm run validate:config` PASS (49 files, 0 diagnostics); `npm run build` PASS (existing sitemap warning only); `npx supabase migration up --local` PASS; `npx supabase test db` PASS (65 assertions). The atomic-page and strict-null migrations were applied without resetting the local database.

- `npm test`: PASS, 28 tests.
- `npx supabase db reset`: FAIL, exit 1 after all migrations applied; the CLI reported the local Storage container unhealthy during final health checks. Local Postgres and Storage subsequently reported healthy, and no second reset was attempted.
- `npx supabase test db`: PASS, 52 assertions against the reset database.
- `npm run lint`: PASS.
- `npm run validate:config`: PASS; Astro reported zero errors, warnings, or hints, and Wrangler types generated.
- `npm run build`: PASS; Astro emitted the existing non-blocking warning that sitemap generation is skipped without `site` configured.
- `npm run smoke`: PASS, all 8 auth-flow checks.
- Manual account acceptance: user-confirmed; not independently repeated during review.

## Summary

The two sync modes, resumable pagination, hidden unmatched rows, and verified deletion path generally match the plan. The paginated activity endpoint does filter out null-bike rows. The roadmap's `in-progress` status matches the implementation workflow's start-of-work status sync. Deployment/readme updates are related operational documentation; no production deployment was performed. The local database reset applied every migration but returned nonzero because of a transient Storage health check, while the subsequent database suite passed.