<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Import and Browse Bike-Linked Strava Activities

- **Plan**: context/changes/import-bike-linked-activities/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 1 observation

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

### F1 — Activity reads silently stop at the Supabase row limit

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:28; src/pages/api/strava/import.ts:113; supabase/config.toml:18
- **Detail**: Both dashboard activity reads select all matching rows without range/cursor pagination. The configured Supabase API maximum is 1,000 rows, so histories above that size are silently truncated in the initial dashboard and the import response even though the importer may have saved more.
- **Fix**: Add range/cursor pagination to both read paths and make the UI load subsequent activity pages.
  - Strength: Keeps displayed history complete without raising a global response-size limit.
  - Tradeoff: Adds a paginated list interaction and another API/read boundary.
  - Confidence: HIGH — the configuration explicitly caps returned rows at 1,000 and both queries are unbounded.
  - Blind spot: The target user's current history size was not measured.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Paginate Supabase reads that can exceed max_rows. Added 100-item paginated dashboard/API reads with a has-more probe; `npm run check`, `npm test` (14 tests), `npm run lint`, `npm run build`, and the 8-step preview smoke test pass.

### F2 — Full-history import remains available after completion

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/components/ActivityDashboard.tsx:115
- **Detail**: The connected-state button remains labeled “Import activities” after a complete result and always invokes the full-history importer. This exposes routine post-import refresh, which the plan explicitly excludes; retries are only needed for incomplete imports.
- **Fix**: Persist whether the initial import completed and hide or replace the full-history action after completion, while retaining retry access for partial/failed imports.
  - Strength: Enforces the S-01 boundary across page reloads and prevents routine full-history API work.
  - Tradeoff: Requires durable import-completion state and a distinct retry state.
  - Confidence: HIGH — the button is unconditional for every connected dashboard render.
  - Blind spot: No durable import-completion marker currently exists.
- **Decision**: FIXED — added `initial_import_completed_at`; a complete import persists the marker and the endpoint rejects another full-history import, while partial/failed imports remain retryable. `npm run check`, `npm test` (14 tests), `npm run lint`, `npx supabase db reset`, `npx supabase test db` (24 assertions), `npm run build`, and the 8-step preview smoke test pass.

### F3 — Planned dashboard and API tests are absent

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: N/A (planned tests); src/lib/strava/activity-view.test.ts:5
- **Detail**: Phase 3 requires dashboard/API tests for the required fields, kilometer display, local date, and newest-first ordering. Existing view tests cover the formatting/order helper, but there are no tests of the dashboard state/rendering or the API's queried response shape and failure behavior.
- **Fix**: Add focused dashboard/API tests that exercise the user-visible states and the endpoint's result mapping and query behavior.
  - Strength: Verifies the actual UI/API boundary required by Phase 3 rather than only its pure helper.
  - Tradeoff: Requires a small test seam or a project-supported component/route test harness.
  - Confidence: HIGH — no dashboard/API test file or test harness use exists in the reviewed feature files.
  - Blind spot: The manually completed dashboard acceptance checklist covers the visual states but is not repeatable in CI.
- **Decision**: SKIPPED

### F4 — Deployment guidance still treats Strava as future work

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/deployment/deployment-plan.md:114; context/changes/deployment/deployment-plan.md:144; README.md:166
- **Detail**: The deployment-plan edits leave the production Worker secret checklist with only Supabase variables and retain a section titled “Later activity-provider integration,” although Strava is now implemented. README documents the four Strava secrets separately, but its deployment summary also names only the two Supabase secrets. The deployment-doc edits were not listed in this feature plan and now conflict with its shipped behavior.
- **Fix**: Update the deployment checklist and README deployment summary to include the four Strava Worker secrets and remove or rewrite the stale future-integration section.
- **Decision**: FIXED — updated the production Worker checklist and README to name all six required secrets, and replaced the stale future-provider section with Strava callback and acceptance guidance. `git diff --check` passes.

### F5 — The entire history import runs in one unbounded request

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🔎 MEDIUM — worth pausing; this is a reliability boundary
- **Dimension**: Architecture
- **Location**: src/lib/strava/import.ts:104
- **Detail**: The service fetches every page sequentially and performs page persistence inside one synchronous request, with no maximum page count or durable cursor. A sufficiently large history or slow provider/database response can exhaust request/runtime limits; retry starts again at page one, so a deterministic limit can prevent forward progress. This follows the plan's all-pages-in-one-import design, so the plan itself shares the risk.
- **Fix**: Import bounded batches and persist a next-page cursor so a later request can safely continue from the last committed page.
- **Decision**: FIXED — each request now processes at most five pages; a database cursor resumes the next batch, advances with compare-and-swap, and marks completion only at the terminal page. The plan and importer tests were updated. `npm test` (14 tests), `npm run lint`, `npm run check`, `npx supabase db reset`, `npx supabase test db` (24 assertions), `npm run build`, and the 8-step preview smoke test pass.

## Verification

- `git check-ignore .dev.vars` — PASS; the file is ignored. Its contents were not inspected.
- `npx supabase db reset` — PASS; both migrations applied.
- `npx supabase test db` — PASS; 24 assertions.
- `npm test` — PASS; 14 tests.
- `npm run lint` — PASS.
- `npm run validate:config` — PASS; Astro check reported 0 errors, warnings, or hints, and Wrangler types generated.
- `npm run build` — PASS.
- `BASE_URL=http://127.0.0.1:4321 npm run smoke` — PASS; all 8 auth-flow steps passed against the production preview.
- Manual criteria in Progress are marked complete. The real Strava authorization/import and secret-exposure acceptance were not repeated during this review; prior recorded completion was relied upon without reading local secrets.

## Scope Summary

Phases 1–4 were reviewed. F1, F2, F4, and F5 were fixed during triage; F1 was also recorded in `context/foundation/lessons.md`. F3's missing dashboard/API-level tests were skipped and remain the only unresolved finding. The import plan now specifies five-page bounded batches, durable cursor resumption, compare-and-swap progress, and terminal completion. Validation passed with 14 tests, lint, Astro check, standalone TypeScript, migration reset, 24 database assertions, build, and an 8-step preview smoke test. The deployment guidance edits were additional to the original feature path list and were corrected to match the implemented integration.