# Safe Strava Synchronization and Reconciliation — Implementation Plan

## Overview

Extend S-01's one-time import with two manual post-import operations: import activities whose Strava IDs are not yet stored locally, and repair the complete local history against Strava. The modes share resumable bounded pagination, but only repair mode updates existing rows or removes provider-deleted activities.

## Current State Analysis

- `src/pages/api/strava/import.ts` rejects the initial import after `initial_import_completed_at` is set. Its page cursor and five-page batches only resume an incomplete initial import.
- `src/lib/strava/import.ts` fetches `/athlete/activities` using page-number pagination. It updates eligible activity rows only when encountered; activities without an unambiguous bike are skipped and their IDs are not retained.
- `supabase/migrations/20261009000000_create_activity_import_schema.sql` requires a non-null `bike_id`. Activity rows store Strava ID, name, distance, start date, bike relation, and local ownership/creation fields. Uniqueness on `(user_id, strava_activity_id)` supports idempotent writes.
- `src/components/ActivityDashboard.tsx` shows “Initial import complete” instead of an operation after completion. The activity list already pages local rows, and the application has no webhook endpoint or subscription setup.
- The roadmap S-02 and `context/foundation/shape-notes.md` currently specify later manual sync as new-only. The user's clarified S-02 contract adds whole-history repair, bike reassignment, and provider-deletion handling.
- Strava's `after`/`before` activity-list parameters filter by activity start time, not record creation or modification. A date watermark cannot discover a newly visible activity with an old start date.
- Strava pagination permits up to 200 items per page but explicitly warns a short page may not be the last. Complete traversal requires continuing until an empty page.
- Strava webhooks can report create/delete and a limited set of updates, but documented update fields omit gear assignment; delivery retries are bounded. The user selected list traversal instead.

## Desired End State

After the initial import, the authenticated user can open one “Synchronize” menu and choose “Import new” or “Repair full history.” Import new scans the provider list so old-dated newly visible IDs can be discovered, but inserts only eligible IDs not already stored and leaves existing rows untouched. Repair refreshes current persisted fields and bike links across all history, retains existing-but-unmatched activities in a hidden state, and physically removes provider-deleted activities and dependent records only after a complete, verified scan.

Both operations are user-triggered, bounded to five provider pages per request, resumable after failure, idempotent by source ID, and explicitly report progress, counts, partial results, and failures. No activity is deleted based on a partial scan or an ambiguous provider error.

### Key Discoveries:

- `src/pages/api/strava/import.ts` currently has a completion gate and a compare-and-swap page cursor for initial-import continuation.
- The PRD requires manual refresh, deduplication, and truthful failure reporting; shape notes currently constrain later sync to new activities.
- The current importer stops on a short page, but Strava's general pagination guidance says to continue until an empty page for complete traversal.
- Chain assignment and waxing will later attach user-entered data to activities; the user explicitly chose to remove those dependent records when the corresponding Strava activity is deleted.
- No service-role client, webhook infrastructure, or background synchronization is needed for this plan.

## What We're NOT Doing

- Webhook subscription/callback infrastructure; the user selected list traversal for discovering new activity IDs.
- Background, scheduled, or automatic synchronization. Both operations remain explicit user actions.
- Changes to Strava data, disconnect UI, new Strava permissions, or production deployment.
- Importing additional provider fields beyond the activity fields currently persisted by ChainTrack.
- Creating chain/waxing product workflows; deletion behavior must remain compatible with those future dependent records.

## Implementation Approach

Add a new authenticated sync contract with `new` and `repair` modes instead of reopening the initial-import endpoint. Persist one active per-user run, its mode and next page, accumulated counts, and the IDs seen during repair. Each request processes at most five pages; a run ends only after an empty provider page. New mode checks each returned page against local source IDs and inserts only unknown eligible activities. Repair mode upserts current provider fields and bike relations, records all provider IDs including unmatched ones, then verifies locally stored IDs absent from the completed list before deleting confirmed provider-deleted rows and their dependents. The dashboard exposes both modes through one menu and resumes the active mode after a partial batch.

## Critical Implementation Details

### Safe repair finalization

The provider page scan is not an atomic snapshot. Stage observed IDs, serialize sync runs per user, and do not delete anything until an empty page proves the traversal ended. Before deleting a local row absent from the staged set, re-fetch it by ID with the authenticated athlete's required read scope: a returned activity is retained/refreshed, a verified not-found is deleted, and authorization, rate-limit, or transient failures leave the row intact and make the result partial. Final deletion and dependent-record cleanup must be a single RLS-safe database operation.

## Phase 1: Sync State and Data Contract

### Overview

Add the durable run state and database representation needed to distinguish an active synchronization from the completed initial import, and align product artifacts with the clarified S-02 outcome.

### Changes Required:

#### 1. Add sync-run and unmatched-activity schema

**File**: `supabase/migrations/`, `supabase/tests/database/strava_rls.test.sql`

**Intent**: Store resumable run state and repair-scan membership without relying on process memory or the initial-import cursor. Preserve activities that still exist in Strava but no longer have an unambiguous bike.

**Contract**: Add user-owned sync-run state with a `new` or `repair` mode, status, next page, result counters, and one-active-run-per-user invariant. Add user-owned staged provider IDs for repair runs with cleanup after finalization. Make the activity bike relation nullable to represent a present-but-unmatched source activity; all new tables retain RLS and user-scoped grants. Ensure a confirmed activity deletion removes dependent activity records as selected by the user.

#### 2. Update the S-02 product contract

**File**: `context/foundation/prd.md`, `context/foundation/shape-notes.md`, `context/foundation/roadmap.md`

**Intent**: Keep the canonical requirements consistent with the two-mode behavior and explicit deletion policy.

**Contract**: Document new-ID discovery independent of activity start date, full-history refresh of currently persisted provider fields and bike links, hidden unmatched activities, physical deletion of Strava-deleted activity data after complete verification, and user-triggered execution. Update S-02's roadmap outcome and status to `planning`; leave unrelated roadmap entries untouched.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies the additive migration without a missing seed-file failure.
- Database tests prove sync-run and staged-ID ownership/RLS, one-active-run constraints, nullable bike behavior, and safe dependent deletion semantics.
- `npm run lint` and `npm run check` pass after schema/type generation changes.

#### Manual Verification:

- The S-02 wording in PRD, shape notes, roadmap, and this plan agrees on both modes, hidden unmatched rows, and hard-delete behavior.

## Phase 2: Import Newly Visible Activities

### Overview

Add the “Import new” mode. It must find newly visible activity IDs regardless of their start date while avoiding updates to rows already present in ChainTrack.

### Changes Required:

#### 1. Add bounded new-only sync service and API

**File**: `src/lib/strava/`, `src/pages/api/strava/sync.ts`, `src/lib/strava/import.test.ts`

**Intent**: Reuse the current provider normalization and bike matching while separating new-only semantics from the initial import and repair behavior.

**Contract**: Accept an authenticated `new` mode request or continuation for the same active run. Traverse `/athlete/activities` from page 1 through an empty terminal page, in batches of at most five pages, and refresh the authenticated athlete's bike catalogue. For each provider page, compare source IDs with the current user's local IDs; insert eligible unknown IDs only. Do not update existing activities or delete local records in this mode. Skip and report unknown activities whose bike is missing or ambiguous; a later run can import them if they become eligible. Return cumulative inserted/skipped counts, continuation/completion state, and truthful failure results. Persist and compare-and-swap cursor progress so retries do not duplicate rows or regress the run.

#### 2. Add the new-import dashboard choice

**File**: `src/components/ActivityDashboard.tsx`, `src/pages/dashboard.astro`

**Intent**: Let a user start the new-only mode after initial import and clearly continue a bounded run.

**Contract**: Replace the completed-import dead end with one “Synchronize” menu containing “Import new” and “Repair full history.” In this phase, wire “Import new,” preserve its mode on continuation, and show loading, inserted/skipped counts, complete, partial, and failed states without exposing tokens.

### Success Criteria:

#### Automated Verification:

- Mocked tests prove new mode discovers a late-visible old-dated activity, inserts it once, and does not update an already stored activity's fields or bike link.
- Tests prove a bounded run resumes at its saved page, continues to an empty terminal page even after a short non-empty page, and remains idempotent after request failure.
- Tests prove bike-less/unknown-bicycle activities are counted and not written; a later eligible scan can import their previously unknown IDs.
- `npm run lint` and `npm run check` pass.

#### Manual Verification:

- After initial import, the user can choose “Import new,” see progress/results, and continue a partial run without triggering repair mode.

## Phase 3: Repair Full History and Remove Deleted Activities

### Overview

Add the whole-history repair mode, including current-field updates, changed bike assignments, hidden unmatched state, and safe provider-deletion cleanup.

### Changes Required:

#### 1. Reconcile current provider activity state

**File**: `src/lib/strava/`, `src/pages/api/strava/sync.ts`, `src/pages/api/strava/activities.ts`, `src/lib/strava/import.test.ts`

**Intent**: Bring all locally persisted provider-managed fields and bike links into agreement with Strava, including arbitrary-age activities and activities previously imported with a bike.

**Contract**: Repair mode traverses every provider page through an empty terminal page, upserts source ID, name, distance, start date, and the current bike link, and stages every source ID whether or not it has a usable bike. If an activity still exists but has a missing or ambiguous bike, retain the local source record with a null bike relation and exclude it from the bike-linked activity list. Do not alter local row identity, ownership, or local creation metadata.

#### 2. Verify and remove provider-deleted records

**File**: `src/lib/strava/`, `src/pages/api/strava/sync.ts`, `supabase/migrations/`, `supabase/tests/database/strava_rls.test.sql`

**Intent**: Reflect Strava deletions while protecting local rows from partial scans, changing page offsets, revoked access, and transient errors.

**Contract**: Only after a repair run has reached an empty page, process local source IDs absent from the staged set. Re-fetch each candidate by ID using the current authenticated athlete connection and required read scope. Retain and refresh a returned activity; delete only a verified not-found candidate. Any authorization, rate-limit, provider, or malformed-response error leaves that candidate intact and makes the result partial. Finalize removals and dependent-record cleanup atomically under the authenticated user's RLS boundary; remove associated chain/waxing records if they exist. Clear staging and close the run only after finalization.

#### 3. Complete repair results and dashboard behavior

**File**: `src/components/ActivityDashboard.tsx`, `src/pages/dashboard.astro`, `src/pages/api/strava/activities.ts`

**Intent**: Make the repair operation and its destructive results explicit while preserving the user's selected single-menu interaction.

**Contract**: Wire “Repair full history” through the same sync menu and resumable run contract. Report inserted, updated, skipped/unmatched, and removed counts; on partial results, preserve saved progress and provide continuation. Hide unmatched activities from the ordinary bike-linked list, show the sync outcome, and reload the local paginated list coherently after completion.

### Success Criteria:

#### Automated Verification:

- Fixture tests prove an old stored activity's name, distance, start date, and bike assignment are refreshed; an unmatched existing activity is retained with no bike and omitted from the bike-linked list.
- Tests prove provider-deleted activities and dependent records are removed only after a complete empty-page scan and verified per-ID absence.
- Tests prove a partial page scan, non-empty short page, concurrent run conflict, 401/403, 404 ambiguity handling, 429/5xx, timeout, and malformed page never cause unverified mass deletion.
- Database tests prove the finalize operation is user-scoped and atomic, including dependent-row deletion.
- Dashboard/API tests cover mode selection, continuation, success counts, failure/partial states, and local activity-list refresh.

#### Manual Verification:

- On the connected account, a full repair updates a representative old activity after its name/distance/date/bike is changed in Strava, hides a still-present activity with no clear bike, and removes a deleted activity from the list only after the full repair completes.

## Phase 4: End-to-End Verification and Acceptance

### Overview

Verify both manual modes, run all repository checks, and confirm the destructive repair contract against a real Strava account without deploying.

### Changes Required:

#### 1. Run regression and sync-specific validation

**File**: `package.json`, `src/lib/strava/` tests, `supabase/tests/database/strava_rls.test.sql`

**Intent**: Gate the change on provider-fixture behavior, database safety, and the existing app/auth foundation.

**Contract**: Keep automated provider calls mocked. Run the test suite, database reset and database tests, lint, Astro/Wrangler configuration validation, production build, and the existing smoke test against a local Supabase preview.

#### 2. Complete real-account acceptance

**Owner**: [WSPÓLNIE]

**Intent**: Confirm that both user-triggered operations behave as agreed with actual Strava data.

**Contract**: Test Import new with a newly visible activity; exercise an old-dated new record using deterministic fixture evidence if no suitable real record exists. Change persisted fields and bike assignment on a representative old Strava activity, run Repair full history, and verify current values. Confirm a present-but-unmatched activity is hidden but recoverable, and a deleted activity plus its dependent records is removed only after a complete scan. Verify partial/failure paths do not delete unverified data and no token appears in browser output, URLs, Git, or logs.

### Success Criteria:

#### Automated Verification:

- `npm test`, `npx supabase db reset`, `npx supabase test db`, `npm run lint`, `npm run validate:config`, `npm run build`, and `npm run smoke` pass.
- Automated fixture coverage proves both sync modes, duplicate safety, pagination continuation, current-field/bike repair, hidden unmatched rows, and verified deletion behavior.

#### Manual Verification:

- The user confirms the single menu offers both modes, each mode has clear progress/counts/failure states, and repair reflects current Strava state without deleting rows after an incomplete or ambiguous scan.

## Testing Strategy

### Unit Tests:

- Mock Strava profile/activity pages for late-visible old-dated IDs, unknown IDs, short non-terminal pages, empty terminal pages, duplicate IDs, changed fields, changed gear, missing/ambiguous gear, and empty history.
- Test new mode's insert-only contract and repair mode's current-field update contract separately.
- Test continuation after provider failure, rate-limit handling, compare-and-swap cursor conflicts, resumed counts, and no deletion before run completion.
- Test missing local IDs through per-ID 200, verified 404 under valid ownership/scopes, 401/403, 429, 5xx, timeout, and malformed payload outcomes.

### Integration Tests:

- Apply migrations and assert RLS for sync runs and staged IDs, one active run per user, nullable bike state, and atomic user-scoped finalization.
- Exercise a full repair with seeded local activities and mocked provider pages; assert changed fields, bike remapping, unmatched retention, dependent deletion, and no deletion after partial traversal.
- Exercise overlapping requests to prove only one per-user run advances at a time and stale continuations cannot regress progress.

### Manual Testing Steps:

1. Complete the initial import and open the dashboard synchronization menu.
2. Choose “Import new”; verify only previously unknown eligible Strava IDs are inserted, including a late-visible old-dated fixture.
3. Change an old Strava activity's name, distance, date, and bike; choose “Repair full history” and confirm the local row updates.
4. Remove a bike assignment from a still-existing activity; verify it is retained but hidden from the bike-linked list.
5. Delete a Strava activity and run repair; verify the activity and linked dependent data are removed only after the scan and ID verification finish.
6. Simulate a provider failure mid-run and confirm it is resumable and does not remove unverified local rows.
7. Confirm secrets and tokens do not appear in URLs, browser output, logs, or tracked files.

## Performance Considerations

Import new scans all Strava activity pages because `after` is based on activity date and cannot discover old-dated late appearances; it writes only IDs not already stored. Repair scans the same list and performs additional per-ID reads only for local candidates absent from the completed scan. Bound each request to five list pages, persist run state between requests, obey Strava read limits, and stop on transient/provider errors rather than retrying in a tight loop. The accepted tradeoff is full-list read cost in both modes in exchange for the requested discovery guarantee.

## Migration Notes

Additive migration only. Existing rows keep their source identity and provider values; the initial-import completion marker remains distinct from post-import sync-run state. Make `bike_id` nullable so repair can represent a still-existing unmatched activity without displaying it as bike-linked. Sync-run and staged-ID rows are per-user/RLS-protected and must be cleaned after completion or explicit stale-run recovery. A confirmed provider deletion is a hard delete per user decision, including dependent chain/waxing data; no such child tables exist yet, so future activity-linked tables must honor this deletion contract. Rollback must not drop user activity or sync data after accepted real-account runs.

## References

- Frame Brief: `context/changes/refresh-activities-safely/frame.md`
- Original S-01 implementation: `context/changes/import-bike-linked-activities/plan.md`
- Product requirements: `context/foundation/prd.md` (FR-003)
- Resolved product decisions: `context/foundation/shape-notes.md`
- Roadmap S-02: `context/foundation/roadmap.md`
- Activity schema: `supabase/migrations/20261009000000_create_activity_import_schema.sql`
- Current import service/API: `src/lib/strava/import.ts`, `src/pages/api/strava/import.ts`
- Strava activity list and pagination: https://developers.strava.com/docs/reference/#api-Activities-getLoggedInAthleteActivities and https://developers.strava.com/docs/
- Strava activity lookup: https://developers.strava.com/docs/reference/#api-Activities-getActivityById
- Strava API limits: https://developers.strava.com/docs/rate-limits/

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Sync state and data contract

#### Automated

- [x] 1.1 `npx supabase db reset` applies the additive sync-state migration. — 1bc711c
- [x] 1.2 Database tests prove sync-state ownership, active-run uniqueness, nullable bike behavior, and atomic dependent deletion. — 1bc711c
- [x] 1.3 `npm run lint` and `npm run check` pass. — 1bc711c

#### Manual

- [x] 1.4 The S-02 contract in PRD, shape notes, roadmap, and implementation plan agrees on both modes, unmatched activities, and deletion behavior. — 1bc711c

### Phase 2: Import newly visible activities

#### Automated

- [x] 2.1 Fixture tests discover an old-dated new ID, insert it once, and leave existing rows unchanged. — 380577a
- [x] 2.2 Bounded continuation reaches an empty page, resumes safely after failure, and reports skipped activities. — 380577a
- [x] 2.3 Tests prove bike-less/unknown-bicycle activities are counted and not written; a later eligible scan can import their previously unknown IDs. — 380577a
- [x] 2.4 `npm run lint` and `npm run check` pass. — 380577a

#### Manual

- [x] 2.5 “Import new” works after initial import and clearly reports or continues a partial run. — 380577a

### Phase 3: Repair full history and remove deleted activities

#### Automated

- [x] 3.1 Tests refresh all persisted provider fields and bike assignment, while retaining unmatched rows hidden from the bike-linked list.
- [x] 3.2 Tests delete only verified provider-deleted rows and dependents after a complete scan; partial/error cases preserve unverified rows.
- [x] 3.3 Tests prove a partial page scan, concurrent run conflict, and provider failures never cause unverified deletion.
- [x] 3.4 Database tests prove finalization is user-scoped and atomic, including dependent-row deletion.
- [x] 3.5 Dashboard/API tests cover repair selection, counts, continuation, and list refresh.

#### Manual

- [x] 3.6 Repair updates a representative old Strava activity and removes a deleted activity only after complete verification.

### Phase 4: End-to-end verification and acceptance

#### Automated

- [ ] 4.1 `npm test`, `npx supabase db reset`, `npx supabase test db`, `npm run lint`, `npm run validate:config`, `npm run build`, and `npm run smoke` pass.
- [ ] 4.2 Automated fixture coverage proves both sync modes, duplicate safety, pagination continuation, current-field/bike repair, hidden unmatched rows, and verified deletion behavior.

#### Manual

- [ ] 4.3 The user accepts both sync modes, unmatched/deleted behavior, and confirms no Strava secret or token is exposed.