# Chain Lifecycle Tracking Implementation Plan

## Overview

Make a chain a main-pane selection, the same way a bike is selected. The chain view shows cycle history, mileage of the active cycle, total mileage, and a per-chain wax threshold. The bike row that has the chain attached turns orange at 75% of the threshold and red at 100%. An explicit stop action ends the chain's attribution. A cog icon in the sidebar opens the manage view in the main pane. The standalone `/chains` page is retired.

This implements the reframed problem in `frame.md`: ChainTrack records which chain is used on each ride, but has no end-to-end view of lifecycle, accumulated distance, waxing cycles, and threshold status.

## Current State Analysis

- Chains are a standalone CRUD page: `src/pages/chains.astro` renders `src/components/ChainManager.tsx`. The sidebar in `src/components/DashboardSidebar.tsx` links chain items to `/chains` with a full navigation.
- The main dashboard (`src/components/ActivityDashboard.tsx`) has two selections: summary and activities (bike plus optional chain filter). Selection state lives in `src/lib/strava/dashboard-state.ts`.
- Waxing marks exist: `chain_waxing_marks` (migration `20261023120000_create_chain_waxing_marks.sql`). The governing-mark rule in view `activities_with_chain` assigns each ride on a bike to the latest mark at or before it. The view also exposes `cumulative_distance_meters` (migration `20261029120000_add_activity_cumulative_distance.sql`).
- No mileage, cycle, threshold, or stop data exists. `chains` has only `id`, `user_id`, `name`, `starting_distance_meters`, `created_at`.
- Types for Supabase tables are hand-written in `src/lib/chains/database.ts`; `Views` and `Functions` are empty records.
- Chain domain logic: `src/lib/chains/chain.ts` (`parseChainInput`, `toChainView`), `src/lib/chains/waxing.ts` (set/clear mark). Routes: `src/pages/api/chains/index.ts`, `src/pages/api/chains/[id].ts`.
- Unit tests run via `npm test` (`node --experimental-strip-types --test src/lib/strava/*.test.ts src/lib/chains/*.test.ts`). pgTAP tests live in `supabase/tests/database/`.
- The PRD (`context/foundation/prd.md`, Polish, draft) contains two conflicting statements: Business Logic says the app computes average mileage between waxings; Non-Goals says the MVP shows no chain metrics. This plan resolves the conflict in Phase 0.

### Key Discoveries:

- Governing-mark attribution in `activities_with_chain` is the single source of truth for which chain a ride belongs to. Cycle and total metrics must reuse it, not re-implement it (`supabase/migrations/20261023120000_create_chain_waxing_marks.sql`).
- The existing lesson in `context/foundation/lessons.md`: paginate Supabase reads that can exceed the 1,000-row limit. Totals must be aggregated in Postgres; only cycle history is paged in the API.
- Shape notes (`context/foundation/shape-notes.md`) define the stop and reattach rules. Stop moves current to total and deactivates the chain. Reattach keeps total and resets the prior cycle; the marked ride counts immediately in the new cycle. The shape-notes auto-switch to average after two periods is rejected; average is information only.
- The `/10x-*` skills and CLAUDE.md require zod for new API input validation. Existing chain routes use `parseChainInput`; new routes use zod.

## Desired End State

- Selecting a chain in the sidebar opens its details in the main pane. Details show status, total mileage, active-cycle mileage, threshold (manual value or suggested default), percent of threshold with level, cycle history (paged), and average completed cycle (only after two completed cycles).
- The cog in the sidebar opens the manage view in the main pane. Create, rename, starting km, and delete work there.
- A bike whose open cycle belongs to a chain turns orange at 75% of the effective threshold and red at 100%. Hovering the bike shows the status text. Chain items are not colored.
- Stop ends the chain: its total is kept, rides after the stop time show no chain, and the chain's alert clears. A new fresh-wax mark on any bike reattaches the chain; prior active-cycle mileage resets and the marked ride counts immediately in the new cycle.
- `/chains` redirects to `/dashboard`. Topbar no longer links to `/chains`.
- Verification: pgTAP and unit tests cover the rules; lint, type check, build, and smoke pass; manual walkthrough confirms navigation, alerts, stop, and reattach.

## What We're NOT Doing

- No automatic waxing detection and no automatic threshold switch to the average.
- No backdating of stop: the stop timestamp is the moment the action is confirmed.
- No change to rides with no bike. They stay outside chain metrics, as before.
- No chain-colored chain items, no UI color scheme rework, no ODO/TRIP labels (out of scope per `context/foundation/2dos.md`).
- No email or push alerts; alerts are visual only.
- No roadmap changes: `context/foundation/roadmap.md` has no item for this change ID, so roadmap sync is a no-op.
- No new standalone chain page; no route other than the `/chains` redirect.

## Implementation Approach

Derive all metrics in SQL so that the TypeScript layer only formats and classifies numbers. Persist stop events and extend the governing-mark rule in `activities_with_chain` to use stop and reattach history and expose its governing-mark id. Build cycle and metric views on top of that. Add small API routes for threshold, stop, metrics, and bike status. Then rewire the dashboard selection, sidebar, and main pane. Retire the page last so the manage view exists before the redirect lands.

Phase 0 wording must be approved before any PRD edit. Phase 1 starts only after the Phase 0 amendment is approved.

## Critical Implementation Details

- Stop history: persist an immutable, user-owned event for every stop. Derive current stopped status and attribution from the ordered stop and reattach history, retaining every stopped interval across repeated stops.
- Order marks by `(ride.started_at, ride.id)` and stops by stop time. A stop closes all open cycles for that chain; only a mark on a ride starting strictly after that stop can reattach it. A mark on a ride at or before the stop is a historical correction, not a reattachment. No mark creation timestamp is needed or invented for existing marks.
- Inserting, reassigning or deleting a historical mark recalculates affected attribution and mileage while preserving every stop boundary; earlier totals may change. A deleted or reassigned reattachment can change subsequent attribution, but cannot erase a stop. Enforce stop and mark mutations through narrowly scoped database functions that check authenticated ownership and lock affected chains in a consistent order, including reassignment. Revoke authenticated direct writes to marks and stop events so concurrent requests and retries cannot bypass these rules. Keep RLS on the underlying tables and explicitly constrain function execution privileges and search paths.
- Stop rule ordering: `activities_with_chain` must be replaced before the new cycle and metric views, because those views read its governing-mark id.
- Cycle end: a cycle ends at the next mark on the same bike, including a null-chain mark, or at the applicable stop event after the cycle start, whichever is earlier. Marks without a bike cannot anchor a cycle. A cycle with neither end is open.
- A chain marked on two bikes without a stop keeps two open cycles. Its active mileage is the sum of open cycles across bikes. Each bike row shows the chain's sum. This is a known consequence of the per-bike model and is documented in the brief.

## Phase 0: PRD Amendment

### Overview

Bring the PRD in line with the agreed behavior before code is written. This phase requires explicit user approval before editing `context/foundation/prd.md`.

### Changes Required:

#### 1. Functional requirements

**File**: `context/foundation/prd.md`

**Intent**: Add FR-009 to FR-012 covering cycle history and mileage, per-chain threshold with suggested default and manual override, bike-row alerts at 75% and 100%, and the stop and reattach rules. Write the text in Polish to match the PRD.

**Contract**: Requirement list gains exactly four entries after FR-008. Each requirement is stated as a user-visible capability with no implementation detail.

#### 2. Non-Goals

**File**: `context/foundation/prd.md`

**Intent**: Remove the Non-Goal that excludes chain metrics (number of waxings, average mileage, current mileage). Keep the other Non-Goals.

**Contract**: The Non-Goals section no longer contains the sentence beginning "MVP nie będzie jeszcze pokazywać metryk łańcucha".

#### 3. Business Logic

**File**: `context/foundation/prd.md`

**Intent**: Rewrite the average-mileage sentence so it states that the average is shown as information after two completed cycles and does not change the threshold.

**Contract**: Business Logic and Non-Goals no longer contradict each other on chain metrics.

### Success Criteria:

#### Automated Verification:

- PRD defines FR-009 to FR-012, each exactly once: `grep -c "FR-009\|FR-010\|FR-011\|FR-012" context/foundation/prd.md` reports four matching requirement lines.
- The removed Non-Goal is gone: `grep "nie będzie jeszcze pokazywać metryk" context/foundation/prd.md` returns nothing.

#### Manual Verification:

- User approves the amended PRD wording before Phase 1 starts.

**Implementation Note**: Pause after this phase for manual approval of the PRD text.

---

## Phase 1: Data Model and SQL Metrics

### Overview

Add a threshold column and persistent stop events, extend the governing-mark rule to use stop history, and build the cycle, metric, and bike-status views. All totals are computed in Postgres.

### Changes Required:

#### 1. Migration for lifecycle columns and views

**File**: `supabase/migrations/20261030120000_add_chain_lifecycle_metrics.sql`

**Intent**: Add `threshold_km` to `chains` and a user-owned stop-event table, replace `activities_with_chain` with the stop-history rule and an exposed `governing_mark_activity_id`, and create `chain_cycles`, `chain_metrics`, and `bike_chain_status` views.

**Contract**:
- `chains.threshold_km numeric(7,1) null`, check `> 0 and <= 100000`. Null means no manual value.
- Stop events retain each stop time and its owning user and chain; protect them with RLS and preserve prior events on reattachment or subsequent stops.
- Revoke authenticated direct insert, update and delete on `chain_waxing_marks` and stop events; provide narrowly scoped database mutation functions with ownership checks, a fixed search path and least-privilege execution grants. Their transactions lock all affected chains in consistent order and preserve idempotency. Migrate the existing waxing route and the new stop route to these functions.
- `activities_with_chain` keeps every existing column and adds `governing_mark_activity_id` (null when unattributed). Attribution follows the stop condition in Critical Implementation Details.
- `chain_cycles` (security_invoker): one row per non-null-chain mark on a bike, with columns `user_id`, `chain_id`, `mark_activity_id`, `bike_id`, `cycle_started_at`, `cycle_ended_at` (nullable), `distance_meters` (sum of rides with that governing mark), `is_open`. Order anchors by `(started_at, activity_id)`; null-chain marks remain boundaries but do not produce chain cycles, and bike-less marks are not anchors.
- `chain_metrics` (security_invoker): one row per chain with `id`, `user_id`, `name`, `starting_distance_meters`, `created_at`, `threshold_km`, `stopped_at` (latest applicable stop, if any), `status` (`active` when an open cycle exists; `stopped` when the latest lifecycle event is a stop and no open cycle exists; `not_started` otherwise), `total_distance_meters` (starting plus all cycles), `active_distance_meters` (sum of open cycles, zero when none), `completed_cycle_count`, `average_completed_distance_meters` (null unless at least two completed cycles).
- `bike_chain_status` (security_invoker): one row per bike with an open cycle: `bike_id`, `user_id`, `chain_id`.
- Grants: select to `authenticated`, matching existing view grants. RLS on `chains` already covers new columns.

#### 2. Database typings

**File**: `src/lib/chains/database.ts`

**Intent**: Add the threshold column, stop-event table and three new views to the hand-written typings.

**Contract**: `chains` Row, Insert, and Update include `threshold_km`; the stop-event table and `chain_cycles`, `chain_metrics`, and `bike_chain_status` views are typed with their columns.

#### 3. Existing waxing mutation and release

**File**: `src/pages/api/strava/activities/[id]/waxing.ts`, `src/lib/chains/waxing.ts`

**Intent**: Move the existing waxing workflow to the database mutation function in the same phase as the permission change.

**Contract**: Preserve existing authentication, validation, idempotency and response behavior for insertion, reassignment and deletion. Add an automated integration regression exercising the existing route against the migrated database. Release the database migration and application change together under a maintenance window that blocks waxing writes during the non-atomic cutover; verify the route before reopening writes. If either deployment fails, keep writes blocked until database permissions and application version are compatible and verified.

#### 4. pgTAP tests

**File**: `supabase/tests/database/chain_lifecycle.test.sql`

**Intent**: Cover the lifecycle rules at the database level. Adjust the plan count in `supabase/tests/database/chain_waxing_marks.test.sql` if its existing assertions change.

**Contract**: Tests cover: stop boundary (rides after a stop show no chain); reattach after stop restores attribution from the new mark; two stop/reattach sequences retain both stopped intervals and historical totals; insertion at, before and after a stop; historical mark reassignment and deletion; equal-time mark ordering, bike-less marks and null-chain boundaries; cycle end at stop; at most one open cycle per bike; totals across two bikes; average null with fewer than two completed cycles and set with two; threshold check constraint rejects 0 and values above 100000; RLS isolation for stop events, `chain_metrics`, `chain_cycles`, and `bike_chain_status`. Verify direct writes are rejected and cross-user function calls cannot mutate data. Add a concurrent stop/mark test that verifies serialization and retry idempotency.

### Success Criteria:

#### Automated Verification:

- Migration applies on a fresh local database: `npx supabase db reset`
- pgTAP suite passes, including any updated `chain_waxing_marks.test.sql` count: `npx supabase test db`; the automated existing-waxing route integration regression also passes against the migrated database.
- Type checking passes after database typings change: `npm run check`

#### Manual Verification:

- Seeded fixture (one chain on two bikes, one stop, one reattach) produces the expected totals in Supabase Studio.

**Implementation Note**: Pause after automated checks pass for manual confirmation before Phase 2.

---

## Phase 2: Domain Logic and API

### Overview

Add pure logic for threshold resolution, wear level, and average, with unit tests. Add the metrics, threshold, stop, and bike-status routes. Extend the chain list to return metric fields.

### Changes Required:

#### 1. Lifecycle domain logic

**File**: `src/lib/chains/lifecycle.ts`

**Intent**: Hold the pure rules used by the UI and routes so they can be unit-tested without a database.

**Contract**:
- `SUGGESTED_THRESHOLD_KM`: constant. Its value is sourced during this phase from a verifiable published wax-interval source, and the source URL and access date are recorded in the brief. If no verifiable source is found, the constant is `null`. The UI then shows no suggestion and requires a manual value. Do not invent a number.
- `effectiveThresholdKm(manualKm, suggestedKm)` returns manual when set, else suggested, else null.
- `wearLevel(activeMeters, thresholdKm)` returns `none` when no threshold, `warning` at or above 75%, `critical` at or above 100%, otherwise `normal`.
- `wearPercent(activeMeters, thresholdKm)` returns a rounded integer or null, uncapped above 100.
- `averageCompletedKm(averageMeters)` converts to one decimal km or null.

#### 2. Chain view and list

**File**: `src/lib/chains/chain.ts`

**Intent**: Preserve the base-chain DTO for CRUD and introduce a separate lifecycle DTO for metric reads.

**Contract**: Keep `ChainView`, `ChainRow`, and `toChainView` mapping base-table rows. Add a lifecycle row, DTO and mapper containing the base fields plus `thresholdKm`, `stoppedAt`, `status`, `totalDistanceMeters`, `activeDistanceMeters`, `completedCycleCount`, and `averageCompletedDistanceMeters`. `parseChainInput` is unchanged. Update `src/pages/dashboard.astro` to load lifecycle rows for its initial sidebar data and update the dashboard hook and sidebar to consume the lifecycle DTO. Until Phase 4, `src/pages/chains.astro` continues to use the base DTO. POST and PATCH in `src/pages/api/chains/index.ts` and `src/pages/api/chains/[id].ts` retain their existing base DTO response shape; `ChainManager` continues to accept it.

#### 3. Metrics, threshold, stop, and bike-status routes

**File**: `src/pages/api/chains/[id]/metrics.ts`, `src/pages/api/chains/[id]/threshold.ts`, `src/pages/api/chains/[id]/stop.ts`, `src/pages/api/chains/bike-status.ts`

**Intent**: Expose the lifecycle to the client. All routes use `createClient(context.request.headers, context.cookies)` and `context.locals.user`, and set `prerender = false`.

**Contract**:
- `GET /api/chains/[id]/metrics?offset=`: returns the chain's metric row and a cycle page of 50 ordered by `(cycle_started_at, mark_activity_id)` descending, with `hasMore`. Not found returns 404. Test equal-time page boundaries for missing or duplicate rows.
- `PATCH /api/chains/[id]/threshold`: zod body `{ thresholdKm: number | null }`, one decimal, greater than 0 and at most 100000. Returns 400 on invalid input, 415 on non-JSON, 404 when not found.
- `POST /api/chains/[id]/stop`: records a new stop event when the chain is active; an already stopped chain returns 200 without adding an event. A subsequent reattachment permits a later stop event.
- The new stop route calls the database mutation function; the existing waxing-mark route was migrated in Phase 1.
- `GET /api/chains/bike-status`: returns `{ statuses: [{ bikeId, chainId, chainName, activeDistanceMeters, thresholdKm, status }] }` from `bike_chain_status` joined with `chain_metrics`. Read deterministically ordered, user-scoped pages server-side until exhausted, then combine the results; test more than 1,000 statuses and cross-user isolation.
- `GET /api/chains` reads from `chain_metrics` and returns lifecycle DTOs, keeping the existing pagination and `hasMore`. Update all paginated list consumers, including `ChainManager`, to accept that shape alongside the base DTO returned by POST and PATCH.

#### 4. Unit tests

**File**: `src/lib/chains/lifecycle.test.ts`, `src/lib/chains/chain.test.ts`

**Intent**: Pin the boundary and fallback rules and the extended mapper.

**Contract**: Tests cover 74.9%, 75%, 99.9%, 100%, and 120% levels; null threshold; zero active distance; manual over suggested; null suggestion; average null below two cycles and rounded to one decimal above; base and lifecycle DTO mapping, dashboard SSR initialization, and unchanged POST/PATCH response contracts.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Type checking passes: `npm run check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Signed-in calls to `GET /api/chains/{id}/metrics` return totals and a paged cycle list; `PATCH` with `thresholdKm: 0` returns 400; repeated `POST .../stop` returns 200 with no change.
- The suggested default is either sourced and recorded in the brief, or the constant is `null` and the brief says so.

**Implementation Note**: Pause after automated checks pass for manual API confirmation before Phase 3.

---

## Phase 3: Main-Pane Navigation and Alerts

### Overview

Make chains a main-pane selection. Add the chain details view, the reused manage view, the sidebar cog, and the bike-row alert state.

### Changes Required:

#### 1. Selection state

**File**: `src/lib/strava/dashboard-state.ts`

**Intent**: Add selection kinds for a chain's details and for the manage view, so the main pane can switch on them.

**Contract**: `DashboardSelection` gains `{kind: "chain"; chainId: string}` and `{kind: "manage-chains"}`. New actions `select-chain` and `select-manage-chains`. `select-bike` and `select-summary` clear the chain selection. `selectionKey` returns `chain:{id}` and `manage-chains`.

#### 2. Query helpers

**File**: `src/lib/strava/dashboard-query.ts`

**Intent**: Keep activity query behavior unchanged for bike selections; add no activity query for chain or manage selections.

**Contract**: `buildActivityQueryString` is not called for the new kinds. The client fetches the chain metrics route for `chain` selections.

#### 3. Data hook

**File**: `src/components/hooks/useDashboardData.ts`

**Intent**: Load bike-status alerts and selected-chain metrics, and keep lifecycle data synchronized after mutations and saved imports or repairs.

**Contract**: Exposes `bikeStatuses` keyed by bike id and a `chainMetrics` state with paged cycles and a `loadMoreCycles` action. Waxing, threshold, stop and successful chain CRUD invalidate affected chain lists, activities, selected metrics and bike status. Reuse the saved-change refresh generation for imports and repairs, including responses reporting saved changes on failure. Abort or key requests so stale responses cannot overwrite newer selection or refresh results. Cover CRUD, saved partial failures and stale responses in focused tests.

#### 4. Chain details component

**File**: `src/components/ChainDetails.tsx`

**Intent**: Show a chain's lifecycle in the main pane: status, total, active mileage, threshold with manual or suggested source, percent and level, cycle history, and average once two cycles are completed.

**Contract**: Threshold editor calls the threshold route; the stop button opens a confirmation with the copy "Stopping ends this chain's cycle. Rides after the stop show no chain until it is marked again. Total mileage is kept." Stop is shown only for `active` status. Empty threshold shows "Set a threshold to see alerts."

#### 5. Manage view in the main pane

**File**: `src/components/ChainManager.tsx`, `src/components/ActivityDashboard.tsx`

**Intent**: Reuse `ChainManager` as an embedded component (no standalone page header) and render it in the main pane for the manage selection.

**Contract**: `ChainManager` accepts an `embedded` prop and notifies the dashboard after successful create, edit or delete so shared data is invalidated; existing delete copy is kept verbatim. `ActivityDashboard` switches its main pane on selection kind: summary → `YearSummary`; activities → existing list; chain → `ChainDetails`; manage-chains → `ChainManager embedded`.

#### 6. Sidebar

**File**: `src/components/DashboardSidebar.tsx`

**Intent**: Chain items select the chain in the main pane. A cog in the Chains heading selects the manage view. Bike rows show the alert state.

**Contract**: Chain items are buttons calling `onSelectChain(chainId)` and show a status label (Active, Stopped, Not started); they are not colored. The bottom "Manage chains" link is removed. The cog button has an accessible name. A bike row whose `bikeStatuses` entry is `warning` gets orange styling, `critical` gets red, and `title` carries the status text, for example "Chain name: 82% of threshold". Neither style applies to chain items.

### Success Criteria:

#### Automated Verification:

- Dashboard state tests pass with new cases for `select-chain`, `select-manage-chains`, `selectionKey`, and clearing on bike selection: `npm test`
- Linting passes: `npm run lint`
- Type checking passes: `npm run check`

#### Manual Verification:

- Clicking a chain in the sidebar opens its details in the main pane, the same way a bike is selected, without leaving the page.
- The cog opens the manage view in the main pane; create, rename, starting km, and delete all work there.
- A bike row turns orange at 75% and red at 100% of the attached chain's effective threshold; hovering shows the status text. Chain items show no color.
- The mobile drawer behaves the same: selecting a chain closes the drawer and shows its details.

**Implementation Note**: Pause after automated checks pass for manual UI confirmation before Phase 4.

---

## Phase 4: Route Consolidation

### Overview

Retire the standalone chain page. Redirect `/chains` to the dashboard and update navigation.

### Changes Required:

#### 1. Redirect page

**File**: `src/pages/chains.astro`

**Intent**: Replace the standalone page with a redirect to `/dashboard`.

**Contract**: The page calls `Astro.redirect("/dashboard")` and renders no UI. `ChainManager` is no longer mounted from this route.

#### 2. Topbar

**File**: `src/components/Topbar.astro`

**Intent**: Remove the `/chains` link.

**Contract**: The Topbar contains no link to `/chains`.

#### 3. Middleware

**File**: `src/middleware.ts`

**Intent**: Keep `/chains` in `PROTECTED_ROUTES` so unauthenticated visitors still go through the auth flow before the redirect.

**Contract**: `PROTECTED_ROUTES` is unchanged.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Smoke test passes: `npm run smoke`

#### Manual Verification:

- Signed-in visit to `/chains` redirects to `/dashboard`; signed-out visit goes through the auth flow first.
- Topbar shows no `/chains` link.

**Implementation Note**: Pause after automated checks pass for manual confirmation before Phase 5.

---

## Phase 5: Final Verification

### Overview

Run the full local gate and walk through the lifecycle scenarios end to end.

### Changes Required:

No code changes. Fix any defects found back in the phase that owns them.

### Success Criteria:

#### Automated Verification:

- Full gate passes in order: `npm run lint && npm run check && npm run build && npm test`
- pgTAP suite passes: `npx supabase test db`

#### Manual Verification:

- Stop a chain: its total is kept, rides after the stop show no chain, and its bike alert clears.
- Reattach the chain with a new fresh-wax mark: prior mileage is kept in total, the prior active cycle resets, and the marked ride counts immediately; a 30 km marked ride displays 30 km active mileage.
- Average appears only after two completed cycles and does not change the threshold.
- Threshold change updates the bike alert without a reload.

---

## Testing Strategy

### Unit Tests:

- Wear level boundaries (74.9%, 75%, 99.9%, 100%, 120%) and null threshold.
- Effective threshold: manual over suggested; null when neither.
- Average: null below two completed cycles; one-decimal rounding above.
- Chain mapper with new fields; dashboard state for new selection kinds.

### Integration Tests:

- pgTAP: stop boundary, reattach, cycle end at stop, one open cycle per bike, totals across bikes, RLS isolation, threshold constraint.
- API: metrics paging, threshold validation (400/415/404), idempotent stop, bike-status shape.

### Manual Testing Steps:

1. Mark a chain on bike A, ride, then mark it on bike B; confirm totals across both bikes.
2. Set a threshold; ride until 75% and then 100% on the attached bike; confirm orange then red and hover text.
3. Stop the chain; confirm rides after the stop show no chain and the bike alert clears.
4. Reattach the chain; confirm prior mileage remains in total and the marked ride counts immediately in the new active cycle.
5. Visit `/chains` while signed in; confirm redirect.
6. Repeat step 2 in the mobile drawer.

## Performance Considerations

- Totals and open-cycle sums are computed in Postgres; the client never sums activity rows.
- Cycle history is paged at 50 rows per request.
- Bike status is one row per bike with an open cycle; its server-side reads are paged and it is refreshed after relevant mutations and imports or repairs that save changes.

## Migration Notes

- Existing marks keep their meaning until a stop event is recorded; no stop events exist initially.
- `threshold_km` defaults to null, so existing chains start with no manual threshold.

## References

- Frame: `context/changes/chain-lifecycle-tracking/frame.md`
- Shape notes (resolved decisions): `context/foundation/shape-notes.md`
- Attribution rule: `supabase/migrations/20261023120000_create_chain_waxing_marks.sql`
- Cumulative distance: `supabase/migrations/20261029120000_add_activity_cumulative_distance.sql`
- Similar implementation: `src/lib/strava/dashboard-state.ts` (selection kinds), `src/pages/api/chains/[id].ts` (route pattern)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 0: PRD Amendment

#### Automated

- [x] 0.1 PRD defines FR-009 to FR-012, each exactly once — 384984b
- [x] 0.2 Removed Non-Goal is gone from the PRD — 384984b

#### Manual

- [x] 0.3 User approves the amended PRD wording — 384984b

### Phase 1: Data Model and SQL Metrics

#### Automated

- [x] 1.1 Migration applies on a fresh local database — e53c263
- [x] 1.2 pgTAP suite passes, including any updated count — e53c263
- [x] 1.3 Type checking passes after database typings change — e53c263

#### Manual

- [x] 1.4 Seeded fixture produces expected totals in Supabase Studio — e53c263

### Phase 2: Domain Logic and API

#### Automated

- [x] 2.1 Unit tests pass — 243efe1
- [x] 2.2 Type checking passes — 243efe1
- [x] 2.3 Linting passes — 243efe1

#### Manual

- [x] 2.4 Signed-in API calls return expected status codes and totals — 243efe1
- [x] 2.5 Suggested default is sourced and recorded, or the constant is null and the brief says so — 243efe1

### Phase 3: Main-Pane Navigation and Alerts

#### Automated

- [x] 3.1 Dashboard state tests pass with new selection cases — 707bd23
- [x] 3.2 Linting passes — 707bd23
- [x] 3.3 Type checking passes — 707bd23

#### Manual

- [x] 3.4 Chain selection opens details in the main pane — 707bd23
- [x] 3.5 Cog opens the manage view and CRUD works there — 707bd23
- [x] 3.6 Bike row alert colors and hover text work; chain items show no color — 707bd23
- [x] 3.7 Mobile drawer behaves the same — 707bd23

### Phase 4: Route Consolidation

#### Automated

- [x] 4.1 Build passes — 7e187c4
- [x] 4.2 Smoke test passes — 7e187c4

#### Manual

- [x] 4.3 Signed-in `/chains` redirects; signed-out visit goes through auth first — 7e187c4
- [x] 4.4 Topbar shows no `/chains` link — 7e187c4

### Phase 5: Final Verification

#### Automated

- [ ] 5.1 Full gate passes in order
- [ ] 5.2 pgTAP suite passes

#### Manual

- [ ] 5.3 Stop scenario behaves as specified
- [ ] 5.4 Reattach scenario behaves as specified
- [ ] 5.5 Average appears only after two completed cycles and does not change threshold
- [ ] 5.6 Threshold change updates the bike alert without reload
