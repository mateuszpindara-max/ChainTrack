<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Import and Browse Bike-Linked Strava Activities

- **Plan**: context/changes/import-bike-linked-activities/plan.md
- **Scope**: Phase 2 of 4
- **Reviewed phases**: 2
- **Date**: 2026-10-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings (fixed), 4 observations (fixed)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Concurrent refreshes can persist a stale rotated token

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/strava/server.ts:30; src/lib/strava/token.ts:43
- **Detail**: Concurrent requests can both read the same expired connection and refresh with the same refresh token. Since refresh responses rotate tokens and updates are unconditional, the later write can overwrite a newer usable token pair with a stale pair, breaking the connection.
- **Fix**: Coordinate refreshes per connection, or use a compare-and-swap update keyed on the prior token/expiry and reread the winning row if another request refreshed first.
  - Strength: Prevents a race from persisting a stale rotated token.
  - Tradeoff: Adds coordination or conflict handling to the token refresh path.
  - Confidence: HIGH — the code permits concurrent refresh and unconditionally persists each response.
  - Blind spot: Strava's exact behavior when two simultaneous refreshes reuse one token was not exercised.
- **Decision**: FIXED — compare-and-swap on the prior refresh token; reread and use the winning access token on conflict. Added a concurrent-winner refresh test. `npm test` (9 tests), `npm run lint`, and `npm run validate:config` pass.

### F2 — Abandoned OAuth states have no cleanup path

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/strava/connect.ts:20; supabase/migrations/20261009000000_create_activity_import_schema.sql:25
- **Detail**: Each authenticated connect request inserts a state row expiring in ten minutes, but a row is deleted only when its exact callback is consumed. Abandoned attempts remain indefinitely, so repeated authorization starts can grow the table without bound.
- **Fix**: Remove expired rows while starting authorization and cap active pending states per user; add scheduled cleanup as a backstop if operationally available.
  - Strength: Bounds routine growth without introducing a new external service.
  - Tradeoff: Cleanup and an active-state limit add logic to the connect path.
  - Confidence: HIGH — the migration has no expiry cleanup mechanism and connect inserts a row per attempt.
  - Blind spot: Expected authorization-attempt volume is low, but retention is unbounded.
- **Decision**: FIXED — added a follow-up migration that retains the newest transient state per user and enforces a unique user index; connect replaces the user's prior state before inserting. Database tests pass (24 assertions), `npm test` (9 tests), `npm run lint`, and `npm run validate:config` pass.

### F3 — Ciphertext test validates representation shape, not actual encryption

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🔎 MEDIUM — worth pausing; this is a test-contract gap
- **Dimension**: Plan Adherence
- **Location**: supabase/tests/database/strava_rls.test.sql:70
- **Detail**: The database test asserts that token columns match a ciphertext-looking regular expression. It does not independently establish that persisted values are AES-GCM ciphertext or that plaintext cannot be placed in a string crafted to match that representation. The unit test proves the encryption helper round-trips, but the database criterion claims token columns contain ciphertext.
- **Fix**: Add an integration assertion that persists tokens through the application encryption helper and confirms the database values differ from plaintext and decrypt only with the configured key; alternatively enforce a stronger database format constraint alongside that integration check.
- **Decision**: FIXED — added a pgTAP update assertion proving plaintext access/refresh tokens fail the database constraints; clarified that the regex assertion checks the ciphertext envelope. `npx supabase test db` passes (24 assertions).

### F4 — Service-role absence check is configuration-file scoped

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/strava/config.test.ts:20
- **Detail**: The test asserts `SUPABASE_SERVICE_ROLE_KEY` is absent only from `astro.config.mjs`; it would not detect introducing that key in another server module or config file. Reviewed runtime code uses the authenticated SSR client and does not use a service-role client.
- **Fix**: Search the repository's tracked source/configuration files for the forbidden key name in the static check, excluding the assertion's own test fixture as needed.
- **Decision**: FIXED — static check now scans runtime source and Astro/Wrangler config files while assembling the forbidden name to avoid a self-match. Focused test and `npm run lint` pass.

### F5 — State behavior test substitutes for the callback database operation

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🔎 MEDIUM — worth pausing; this is a test-boundary gap
- **Dimension**: Plan Adherence
- **Location**: src/lib/strava/security.test.ts:53; src/pages/api/strava/callback.ts:23
- **Detail**: The in-memory `consume` test callback implements user matching, expiry checks, and deletion itself. It tests the helper's delegation and replay behavior but does not exercise the callback's actual Supabase delete-returning query or verify exactly one row is consumed.
- **Fix**: Add a callback integration test with a mocked Supabase query chain that asserts the user/hash/expiry filters and exactly-one-row acceptance, or extract the state-consumption database operation behind a small injectable helper and test that boundary.
- **Decision**: FIXED — extracted `consumeOAuthStateFromDatabase` and added a mocked query-chain test asserting state-hash, user, and expiry filters plus zero/one/multiple-row outcomes. `npm test` (9 tests), `npm run lint`, and `npm run validate:config` pass.

### F6 — Local Supabase Auth redirect targets the wrong app port

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/config.toml:149
- **Detail**: The local Auth site URL and redirect allowlist targeted port 3000, while the Astro development server and documented Strava callback use port 4321. Supabase-generated auth redirects could therefore leave the local application origin.
- **Fix**: Set the local Auth site URL to `http://localhost:4321` and allow local redirects for both `localhost` and `127.0.0.1` on port 4321.
- **Decision**: FIXED — local site URL and allowlist now match Astro's port 4321 development origin; `npx supabase status` accepted the config.

## Verification

- `npx supabase db reset` — PASS; both migrations applied without seed-file failure.
- `npx supabase test db` — PASS; 24 database assertions.
- `npm test` — PASS; 9 Node tests after review fixes.
- `npm run lint` — PASS.
- `npm run validate:config` — PASS; Astro check reported 0 errors, warnings, or hints, and Wrangler types regenerated.
- `npm run build` — PASS.
- `npx tsc --noEmit` — PASS; standalone TypeScript compiler reported no errors.
- `npx supabase status` — PASS; accepted the updated local Auth URL configuration.
- Manual Phase 2 criterion 2.5 is marked complete in Progress by user confirmation; `.dev.vars` contents were not inspected or exposed during review.

## Scope Summary

Phase 2 changes match the plan's migration, ownership/RLS, server-only configuration, OAuth state, encrypted token persistence, refresh rotation, tests, and setup documentation requirements. No out-of-scope product behavior or service-role client was found. The implementation uses the existing session-scoped Supabase SSR client. Phase 2's automated and manual Progress criteria are checked and the five rows record commit `f091545`. Review-triage fixes are present in the worktree and have not yet been committed.
