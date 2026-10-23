# Mark Fresh-Wax Rides and Filter Activities by Chain Implementation Plan

## Overview

Roadmap S-04 (US-01, FR-005, FR-006, FR-008). The user marks the **first ride on a freshly waxed chain** for a bike. That chain then applies to every later ride on the same bike until the next mark. The dashboard shows each ride's chain, lets the user set or clear a mark inline on a row, and filters a bike's rides by chain.

The PRD's FR-005, FR-006, US-01, acceptance criteria, business logic, FR-008 rationale and non-goal now describe the agreed model: the user marks the first ride on fresh wax, and the chain carries forward to later rides on the same bike. The roadmap outcome still uses the older end-of-activity wording and should be aligned separately.

## Current State Analysis

- No chain-to-activity relation exists. `chains` has `unique (user_id, id)` ready for composite FKs. `activities` has only its primary key and `unique (user_id, strava_activity_id)`.
- Activity ids are stable across Strava repair: the repair upsert updates by `(user_id, strava_activity_id)` and never replaces rows. Strava-side deletions physically delete activities after a verified run, so dependent rows must cascade.
- The dashboard selection is `summary | activities{bikeId}`. The activities endpoint filters by bike in the database query, pages by offset with a limit-plus-one read, and returns no chain data. The sidebar chain entries only link to `/chains`.
- `ActivityView` is also produced by the Strava import and sync routes. Those responses carry a legacy activity list that the dashboard ignores.
- The hand-written Supabase types use `Relationships: []`, so embedded joins do not type-check. Views are declared as `Record<string, never>`.
- The S-03 plan said a chain delete must remove its assignments and waxing marks with `on delete cascade`. With carry-forward, that would silently relabel rides with an earlier chain. This plan supersedes that rule (see Key Discoveries).

## Desired End State

A signed-in user opens a bike's activity list and sees, per ride, the chain in effect. Marked rides are labelled as fresh-wax rides. The user picks a chain on a ride to mark it, or clears the mark, and the visible rides re-label correctly without losing scroll position. A chain select above the list (shown only once a bike is selected) filters that bike's rides to a chain or to "No chain". Deleting a chain from `/chains` leaves rides after its marks showing "No chain".

Verification: the database tests, unit tests, lint, type check, build and smoke test pass, and the manual walk-through in Phase 4 succeeds.

### Key Discoveries:

- `supabase/migrations/20261022120000_create_chains.sql:11` provides `unique (user_id, id)` on `chains`. `activities` needs the same constraint (additive, since `id` is already unique) for a composite ownership FK from the marks table.
- `supabase/migrations/20261016150000_apply_strava_sync_page_atomically.sql:71-86` upserts activities on conflict without changing `id`. A mark keyed by activity id survives repair.
- `supabase/migrations/20261016130000_add_strava_repair_finalization.sql:92` deletes Strava-removed activities. The mark FK to `activities` must cascade, as S-02 requires for activity-linked tables.
- `supabase/config.toml:36` pins Postgres 17. Both `security_invoker` views and `on delete set null (column)` for composite FKs are available.
- `supabase/config.toml:18` sets `max_rows = 1000`. Per `context/foundation/lessons.md`, every new list read must be bounded and paginated below that limit.
- `src/pages/api/strava/activities.ts:27-45` shows the store-injected read pattern. `src/pages/api/chains/[id].ts` shows the route pattern (401, UUID check, JSON content type 415, 404 on missing or foreign rows, 503 on store errors).
- `src/lib/strava/dashboard-state.ts:3` and `selectionKey` define the selection model, and `isCurrentDashboardRequest` discards stale responses. `src/components/hooks/useDashboardData.ts:65-84` validates activity page payloads field by field and must learn the new fields.
- The S-03 archive plan (`context/archive/2026-10-22-create-chain/plan.md`) required cascade for waxing marks and a delete-copy update. The chain-delete rule changes to "marks stay, chain cleared", but the copy update at `src/components/ChainManager.tsx:425` is still required.

## What We're NOT Doing

- Chain metrics (wax count, average mileage, mileage since last wax). These are PRD non-goals for the MVP and have no roadmap slice yet. A future metrics slice should measure from the marked ride inclusive.
- A stored per-ride chain assignment or editing a chain on an unmarked ride. A chain is only introduced by a fresh-wax mark.
- Chain filtering in the sidebar, or a chain filter while "All bikes" or the summary is selected. Bike and chain filters combine only as "one bike, one chain".
- Bulk marking, undo timers or optimistic updates.
- Linking chains to bikes or restricting a chain to one bike.
- Editing shape notes or roadmap wording. The roadmap outcome still says waxing happens at the end of an activity; align it with the PRD in a separate foundation update.
- Changing the legacy activity lists returned by the Strava import and sync responses. They keep returning no chain data.
- New dependencies (no zod, no browser or component test tooling), soft delete or background sync.

## Implementation Approach

The database owns the derivation. A new `chain_waxing_marks` table stores one mark per activity. A security-invoker view `activities_with_chain` exposes each activity with the chain in effect for it. Filtering, ordering and pagination stay in Postgres queries. A single idempotent write route sets or clears a mark. The dashboard keeps its existing single-selection state, adds a chain filter that is valid only with a bike, and after every successful save re-reads the already loaded rows so every derived label is correct.

Phases are ordered database, server contract, client state and hook, then UI, so each phase can be verified on its own before the next builds on it.

## Critical Implementation Details

### Security

The view must be created with `security_invoker = true`. Without it the view runs as its owner and bypasses RLS on `activities`, `chains` and `chain_waxing_marks`, exposing other users' rides. The pgTAP tests must prove isolation through the view, not only through the tables.

### Timing & lifecycle

The activities endpoint will read the new view for every list request. The migration must reach the hosted database before the application version that reads the view is deployed, otherwise the dashboard activity list fails with a 503.

### State sequencing

After a successful save, the re-read must use the selection key captured when the save started and must run only after the write response arrives. Mark controls stay locked while a save or its re-read is in flight, so responses cannot interleave. A response for a selection that has since changed is discarded by the existing request-key check.

### Performance constraints

The in-place re-read requests as many rows as are loaded, bounded by a cap well below `max_rows` (the cap plus the extra probe row must stay under 1,000). If more rows are loaded than the cap, the re-read returns the first cap rows with `hasMore` true and the user loads further pages as usual.

## Phase 1: Database contract

### Overview

Create the storage and the derived read model for fresh-wax marks, with row-level security and tests covering carry-forward, ownership and both delete paths.

### Changes Required:

#### 1. Waxing marks migration

**File**: `supabase/migrations/20261023120000_create_chain_waxing_marks.sql`

**Intent**: Add the marks table, ownership constraints, RLS, and the view that derives a ride's chain. Also add the missing `unique (user_id, id)` on `activities` so marks can use a composite ownership FK like the existing tables.

**Contract**:

- `activities`: add `unique (user_id, id)`.
- `chain_waxing_marks`: `activity_id` is the primary key, so each ride has at most one mark. Columns `user_id` (not null, references `auth.users` with cascade) and nullable `chain_id`. Composite FK `(user_id, activity_id)` to `activities (user_id, id)` with `on delete cascade`. Composite FK `(user_id, chain_id)` to `chains (user_id, id)` with `on delete set null (chain_id)`. A mark with a null chain means "chain removed". An index on `(user_id, chain_id)` supports chain deletes.
- RLS on, one policy for all operations to `authenticated` with `auth.uid() = user_id` in both `using` and `with check`, and explicit grants, matching the `chains` migration.
- View `activities_with_chain`, `security_invoker = true`, select granted to `authenticated`. Columns: `id`, `user_id`, `bike_id`, `name`, `distance_meters`, `started_at`, `chain_id`, `chain_name`, `is_waxing_start`.
- Derivation rule, which later phases depend on. For an activity with a bike, the governing mark is the latest mark whose activity (a) belongs to the same user, (b) currently has the same bike, and (c) sorts at or before the ride when ordered by `(started_at, id)` ascending. `chain_id` and `chain_name` come from that mark's chain, or are null when there is no governing mark or its chain was removed. `is_waxing_start` is true when the ride itself holds a mark, including a mark whose chain was removed. Activities without a bike get null chain fields and never govern others.

#### 2. Database tests

**File**: `supabase/tests/database/chain_waxing_marks.test.sql`

**Intent**: Prove the derivation, isolation and delete behavior with the same two-user pgTAP setup used by `chains_rls.test.sql`.

**Contract**: Cases to cover:

- Ownership: a user reads only their own marks and view rows, cannot insert a mark for another user, and cannot reference another user's chain or activity.
- Uniqueness: a second mark on the same activity is rejected.
- Derivation: rides before the first mark show no chain. The marked ride is flagged and carries its chain. Later rides carry it until the next mark. Marks on one bike never affect another bike.
- Tie order: rides with equal `started_at` resolve by id.
- Anchor changes: a ride moved to another bike, or hidden, stops governing its old bike.
- Chain delete: marks remain with a null chain and the flag, and rides after them show no chain.
- Activity delete cascades its mark, and a repair-style upsert on an existing activity keeps its mark.

### Success Criteria:

#### Automated Verification:

- Migrations apply cleanly from scratch: `npx supabase db reset`
- Database tests pass, including the new waxing-marks file: `npx supabase test db`

#### Manual Verification:

- On a locally seeded database with rides on two bikes, the derived view shows each ride's chain carrying forward from the marked ride and never crossing bikes.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Server contract

### Overview

Extend the activities read with chain data, a chain filter and a bounded page size, and add the write route that sets or clears a mark. Business rules live in store-injected pure helpers with in-memory tests.

### Changes Required:

#### 1. Activity row and view shape

**File**: `src/lib/strava/activity-view.ts`

**Intent**: Carry chain data through the row-to-view mapping without breaking the import and sync routes that also call `toActivityViews`.

**Contract**: `ActivityRow` gains optional `chain_id`, `chain_name` and `is_waxing_start`. `ActivityView` gains `chainId: string | null`, `chainName: string | null` and `isWaxingStart: boolean`. `toActivityViews` defaults missing values to null/false, so existing call sites compile unchanged. Update existing test fixtures that build `ActivityView`.

#### 2. Query parsing and paging

**File**: `src/lib/strava/dashboard-query.ts`

**Intent**: Add the chain filter and the page-size parameter, keeping validation hand-written like the existing parsers.

**Contract**:

- `chainId` query parameter is a UUID or the literal `none`. It is rejected with 400 unless `bikeId` is also present.
- `limit` query parameter is an integer from 1 to a defined cap (500) and defaults to `DASHBOARD_PAGE_SIZE`. The read still asks for one extra row to compute `hasMore`.
- `DashboardActivityStore.readActivities` input gains the chain filter. `getActivityPage` takes the offset, bike, chain filter and limit (an options object is acceptable; update callers and tests). Chain names arrive with the rows, so no new store method is needed.

#### 3. Activities endpoint

**File**: `src/pages/api/strava/activities.ts`

**Intent**: Read from `activities_with_chain` so every row carries its chain, and apply the chain filter in the query rather than after paging.

**Contract**: Same ordering (`started_at desc, id desc`), same visibility rule (rows without a bike excluded), same 401 and 503 behavior. `chainId=<uuid>` filters on the derived chain, and `chainId=none` filters on a null derived chain. Invalid combinations return 400. Declare the view's row type in the typed database definition used by the route.

#### 4. Waxing mark rules

**File**: `src/lib/chains/waxing.ts`

**Intent**: Validate input and apply the set-or-clear rule against an injected store, so route behavior is testable without Supabase.

**Contract**:

- `parseWaxingMarkInput(input)` accepts exactly `{ chainId: <uuid> | null }` and rejects anything else.
- `setWaxingMark(store, userId, activityId, chainId)` returns a typed outcome: saved with the resulting chain or null, activity not found, or chain not found. The activity must belong to the user and have a bike. A hidden activity counts as not found.
- A non-null chain id upserts the mark, replacing any existing chain on that ride. Null deletes the mark. Repeating the same request is a no-op success.

#### 5. Waxing route

**File**: `src/pages/api/strava/activities/[id]/waxing.ts`

**Intent**: Expose `PUT` for setting or clearing the mark on one ride, following the chains route conventions.

**Contract**: `PUT /api/strava/activities/{id}/waxing` with `{ "chainId": uuid | null }`. 401 when signed out, 400 for an invalid id or body, 415 for a non-JSON content type, 404 when the activity or chain is missing or not the user's, 503 on store errors, and 200 with `{ waxing: { activityId, chainId } }` on success. `prerender = false`. Writes use the signed-in user's client so RLS applies, and a foreign chain id fails the ownership FK and maps to 404.

#### 6. Typed database definitions

**File**: `src/lib/chains/database.ts` and `src/lib/strava/sync-database.ts`

**Intent**: Describe the marks table and the view for the typed client without `any`.

**Contract**: Add `chain_waxing_marks` with the existing `Table` helper and declare the `activities_with_chain` view under `Views`. Choose the placement that avoids duplicating the activities and bikes row types; routes keep casting as the existing ones do.

#### 7. Tests

**File**: `src/lib/chains/waxing.test.ts`, `src/lib/strava/dashboard-query.test.ts`, `src/lib/strava/activity-view.test.ts`

**Intent**: Cover the new rules with node:test and in-memory stores.

**Contract**: Input parsing (valid UUID, null, extra keys, wrong types). `setWaxingMark` outcomes (set, replace, clear, repeat, hidden or foreign activity, foreign chain). Filter parsing (UUID, `none`, rejected without bike). Limit parsing (default, bounds, cap) and `hasMore` with a custom limit. View defaults for missing chain fields.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Type checking passes: `npm run check`
- Linting passes: `npm run lint`

#### Manual Verification:

- With the local stack running and a signed-in session, a PUT to the waxing route saves and clears a mark, and a bike-filtered activities request returns the derived chain fields.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Dashboard state and data hook

### Overview

Teach the dashboard state and data hook about the chain filter, saving a mark, and the in-place re-read, keeping the testable logic in pure helpers.

### Changes Required:

#### 1. Selection model with chain filter

**File**: `src/lib/strava/dashboard-state.ts`

**Intent**: Add a chain filter to the activities selection that exists only when a bike is selected.

**Contract**: The `activities` selection carries a chain filter of "any chain", "no chain" or a specific chain id. A non-"any" filter is valid only with a non-null `bikeId`. The request key distinguishes bike and chain filter. A new `select-chain-filter` action sets it and is ignored when no bike is selected. Selecting a bike, All bikes or the summary resets it to "any chain". Existing stale-response discarding is unchanged.

#### 2. Request building and refresh sizing

**File**: `src/lib/strava/dashboard-query.ts`

**Intent**: Put the client-side parameter building and the re-read size rule in pure helpers so they can be tested without React.

**Contract**: A helper builds the activities query string from the selection, offset and optional limit. A second helper returns the re-read limit as the loaded row count, at least one page and at most the cap.

#### 3. Data hook

**File**: `src/components/hooks/useDashboardData.ts`

**Intent**: Wire the filter into activity loading and add the save-and-refresh flow.

**Contract**:

- Initial load and load-more include the chain filter parameter.
- `isActivityPage` validates the new view fields.
- New `selectChainFilter(filter)`.
- New `saveWaxingMark(activityId, chainId | null)` PUTs the mark. On success it re-reads rows from offset 0 with the refresh limit under the same filters and dispatches the existing `activities-loaded` action using the request key captured at save start, so nothing flashes to a loading state.
- Per-ride save state and error text are exposed. A failed save leaves the list unchanged. A failed re-read after a successful save shows a "saved, but the list could not be refreshed" message with a retry that reloads the list.
- Saving and re-reading lock all mark controls.

#### 4. Tests

**File**: `src/lib/strava/dashboard-state.test.ts`, `src/lib/strava/dashboard-query.test.ts`

**Intent**: Cover selection transitions and the pure helpers.

**Contract**: Selection keys differ per bike and chain filter. Selecting a chain filter without a bike is ignored. Switching bike resets the filter. Stale responses for an old filter are ignored. Query string building covers every combination. Refresh limit sizing covers below one page, above the cap and exact boundaries.

### Success Criteria:

#### Automated Verification:

- State and request-building tests pass: `npm test`
- Type checking passes after the hook changes: `npm run check`
- Linting passes after the hook changes: `npm run lint`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: Dashboard UI and acceptance

### Overview

Show chains on rides, add the inline mark control and the chain filter, update the chain delete copy, and verify the whole flow.

### Changes Required:

#### 1. Chain filter and ride rows

**File**: `src/components/ActivityDashboard.tsx`

**Intent**: Surface the derived chain on each ride, give each row an inline control to set or clear a fresh-wax mark, and add the chain filter above the list.

**Contract**:

- Chain filter: a labelled select above the list, rendered only when a bike is selected. Options are "All chains", each chain from the already loaded chains section, and "No chain". It reuses the chains section's loading and error states and its retry. Filter changes go through `selectChainFilter`.
- Row display: the existing name, bike, distance and date remain. Each row also shows the chain in effect, or "No chain". Rides holding a mark carry a text label ("Fresh wax") so they are identifiable without color. A mark whose chain was removed shows "Chain removed".
- Row control: a labelled select with "Not a fresh-wax ride" plus each chain. Choosing a chain calls `saveWaxingMark`. Choosing the empty option clears the mark. On a ride whose mark lost its chain, the select shows a disabled "Chain removed" option as its current value while the empty option and every chain stay selectable. The control is disabled while any save or re-read runs, and shows a saving state and an inline error with `role="alert"`. Focus stays on the control after saving.
- Empty state for a chain filter with no matches reads distinctly from the bike-only empty state.

#### 2. Chain delete copy

**File**: `src/components/ChainManager.tsx`

**Intent**: The delete confirmation currently says only "Deleting this chain cannot be undone." (line 425). It must state that rides it was marked on will show no chain afterward.

**Contract**: Copy update only. The delete request and API are unchanged, because the set-null FK performs the data change.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npm run check`
- Unit tests pass: `npm test`
- Production build succeeds: `npm run build`
- Auth-flow smoke test passes against a running local server: `npm run smoke`

#### Manual Verification:

- Marking a ride shows that ride and every later ride on the same bike carrying the chain, until the next mark on that bike, and rides on other bikes are unaffected.
- The chain filter appears only when a bike is selected, lists the correct rides for a chain and for "No chain", and resets when the bike changes.
- After setting or clearing a mark, loaded rides re-label correctly without losing scroll position, and rides that no longer match the active chain filter drop out.
- Deleting a chain from `/chains` shows copy about marked rides. Afterward the rides it covered show "No chain" and the former marked ride shows "Chain removed" and can be re-marked or cleared.
- The controls work by keyboard only, saving and error messages are announced, and the layout is usable at mobile width.
- After a Strava repair run with a connected account, existing marks and chains on rides are unchanged.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Waxing input parsing and `setWaxingMark` outcomes against an in-memory store.
- Chain filter and limit parsing, `getActivityPage` with chain filter and custom limit, and view defaults.
- Selection transitions, request-key behavior and the refresh-size helper.

### Integration Tests:

- pgTAP covers the risk-heavy part: carry-forward derivation, tie order, per-bike independence, anchor changes, ownership isolation through the view, chain delete, activity delete and repair-style upserts.
- `npm run smoke` confirms the dashboard still renders for a signed-in user.

### Manual Testing Steps:

1. Seed two bikes with several rides each and two chains. Mark a ride on bike 1 with chain X. Confirm later rides on bike 1 show X and bike 2 is untouched.
2. Mark a later ride with chain Y. Confirm rides from that ride onward show Y and the earlier rides still show X.
3. Clear the first mark and confirm those rides show "No chain".
4. Filter bike 1 by X, by Y and by "No chain". Edit marks while filtered and confirm the list re-reads correctly.
5. Delete chain X from `/chains` and confirm the copy and the resulting labels.

## Performance Considerations

The view derives each ride's chain per row. At personal-history scale (thousands of rides, tens of marks) this is a small cost. The `(user_id, chain_id)` index supports chain deletes. No activity index is added in this change. Revisit if list reads become slow.

## Migration Notes

The migration is additive: one new table, one view, one new unique constraint on a column pair that is already unique, and one index. Apply it to the hosted database before deploying the code that reads the view. Existing activities have no marks, so every ride initially shows "No chain". The S-03 delete rule (cascade for waxing marks) is replaced by "set chain empty" for marks only. Marks still cascade when their activity is deleted.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-04) and `context/foundation/prd.md` (US-01, FR-005, FR-006, FR-008)
- Prior plans: `context/archive/2026-10-22-create-chain/plan.md`, `context/archive/2026-10-16-refresh-activities-safely/plan.md`, `context/archive/2026-10-23-filter-activities/plan.md`
- Lesson: `context/foundation/lessons.md` (paginate reads that can exceed `max_rows`)
- RLS test template: `supabase/tests/database/chains_rls.test.sql`
- Route pattern: `src/pages/api/chains/[id].ts`; read pattern: `src/pages/api/strava/activities.ts:27-45`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database contract

#### Automated

- [x] 1.1 Migrations apply cleanly from scratch: `npx supabase db reset` — aea8aaf
- [x] 1.2 Database tests pass, including the new waxing-marks file: `npx supabase test db` — aea8aaf

#### Manual

- [x] 1.3 On a locally seeded database with rides on two bikes, the derived view shows each ride's chain carrying forward from the marked ride and never crossing bikes. — aea8aaf

### Phase 2: Server contract

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — 81e49b6
- [x] 2.2 Type checking passes: `npm run check` — 81e49b6
- [x] 2.3 Linting passes: `npm run lint` — 81e49b6

#### Manual

- [x] 2.4 With the local stack running and a signed-in session, a PUT to the waxing route saves and clears a mark, and a bike-filtered activities request returns the derived chain fields. — 81e49b6

### Phase 3: Dashboard state and data hook

#### Automated

- [x] 3.1 State and request-building tests pass: `npm test`
- [x] 3.2 Type checking passes after the hook changes: `npm run check`
- [x] 3.3 Linting passes after the hook changes: `npm run lint`

### Phase 4: Dashboard UI and acceptance

#### Automated

- [ ] 4.1 Linting passes: `npm run lint`
- [ ] 4.2 Type checking passes: `npm run check`
- [ ] 4.3 Unit tests pass: `npm test`
- [ ] 4.4 Production build succeeds: `npm run build`
- [ ] 4.5 Auth-flow smoke test passes against a running local server: `npm run smoke`

#### Manual

- [ ] 4.6 Marking a ride shows that ride and every later ride on the same bike carrying the chain, until the next mark on that bike, and rides on other bikes are unaffected.
- [ ] 4.7 The chain filter appears only when a bike is selected, lists the correct rides for a chain and for "No chain", and resets when the bike changes.
- [ ] 4.8 After setting or clearing a mark, loaded rides re-label correctly without losing scroll position, and rides that no longer match the active chain filter drop out.
- [ ] 4.9 Deleting a chain from `/chains` shows copy about marked rides. Afterward the rides it covered show "No chain" and the former marked ride shows "Chain removed" and can be re-marked or cleared.
- [ ] 4.10 The controls work by keyboard only, saving and error messages are announced, and the layout is usable at mobile width.
- [ ] 4.11 After a Strava repair run with a connected account, existing marks and chains on rides are unchanged.
