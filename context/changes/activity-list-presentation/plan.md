# Activity List Presentation Implementation Plan

## Overview

Rework the activity rows so a ride's identity, bike, chain, fresh-wax status, ride distance, and cumulative bike distance form a compact, scannable hierarchy. Replace the persistent full-width fresh-wax select with an always-visible icon button that expands the existing editor only when requested.

## Current State Analysis

`ActivityDashboard.tsx` currently separates the ride title, bike and chain from the distance/date region and renders a labelled select in every row. `ActivityView` carries the ride distance but no cumulative bike total. The activities endpoint reads the security-invoker `activities_with_chain` view and applies bike/chain filters and newest-first pagination in the database. A cumulative value computed from only the selected page or chain-filtered rows would therefore be incorrect.

The selected UI scope and cumulative-distance meaning are settled in `frame.md`: this applies to all activity rows, and cumulative distance is the bike's total from its first activity through the current ride. Equal timestamps are ordered by ascending activity ID for this total. The existing display order remains newest-first.

## Desired End State

Each row presents the ride title and date together, the bike on the next line, and chain, fresh-wax status, ride distance, and cumulative bike distance as compact labelled values with labels on the left and values on the right. Bike, chain, and fresh-wax state are visually formatted as labels. A compact fresh-wax icon remains visible on every row; activating it expands the existing labelled select editor inline, preserving its set/clear and save feedback behavior.

The cumulative value is calculated from all earlier rides on that bike through the current ride, independent of the selected chain filter or activity page. The value is absent only when no bike association exists. Verify totals across page boundaries, across chain filters, and for rides sharing a timestamp.

### Key Discoveries:

- `src/components/ActivityDashboard.tsx` owns activity-row layout and the current per-row waxing select.
- `src/lib/strava/activity-view.ts` is the shared raw-row to client-view contract; its defaults also keep import/sync call sites compatible.
- `src/pages/api/strava/activities.ts` selects from the security-invoker `activities_with_chain` view and filters/paginates rows; cumulative distance must be computed before those filters.
- `supabase/tests/database/chain_waxing_marks.test.sql` already verifies the view's row isolation and equal-time chain ordering, making it the local pattern for database-level assertions.
- `src/lib/strava/dashboard-query.test.ts` and `activity-view.test.ts` cover activity paging and view mapping. `useDashboardData` validates the activity response shape and must accept the new field.

## What We're NOT Doing

- Changing the activity list's scope, existing filters, or newest-first ordering.
- Calculating chain mileage since waxing; the new value is lifetime bike distance through the ride.
- Changing chain assignment, fresh-wax persistence, or the API used to save a mark.
- Adding a preference to hide the icon, a modal editor, or a new dependency.
- Redesigning the dashboard's overall color palette or other pages.

## Implementation Approach

Add the cumulative field to the existing activity view in a new migration, using a per-user/per-bike running total ordered by `(started_at, id)` ascending and including the current activity. Carry that field through the typed database view, API selection, activity row/view mapping, and client response validation. Because the database computes the total before API filters and pagination, both the chain-filtered list and later pages retain the same all-history value. Then reshape the activity row and place the existing mark select behind an always-visible icon button that expands it inline.

## Critical Implementation Details

### Cumulative total and query filtering

The cumulative window must operate over the complete activity set visible through the security-invoker view, partitioned by user and bike, before the API applies its optional chain filter and page range. Use `(started_at, id)` ascending with an inclusive current row; the activity list itself remains newest-first. This preserves totals for old rides on a later page and for rows returned by a chain filter.

### Editor state and accessibility

The closed state must not render the full select. Keep the icon button visible and keyboard reachable on every row, with an accessible name that identifies the activity and action. Activating it reveals the existing select; keep set/clear options, disabled-while-saving behavior, error/status announcements, and focus restoration after save. The row should remain usable at narrow viewport widths.

## Phase 1: Cumulative Distance Data Contract

### Overview

Expose a deterministic cumulative bike distance on each activity row, calculated across all bike history and delivered consistently through the existing database/API/client contract.

### Changes Required:

#### 1. Activity view migration and database typing

**File**: `supabase/migrations/<new_timestamp>_add_activity_cumulative_distance.sql`

**Intent**: Extend the existing activity view without rewriting an already-applied migration. Compute the bike-wide cumulative distance through each activity while retaining the current chain fields and security-invoker behavior.

**Contract**: The view exposes a numeric cumulative-distance field. The total is partitioned by `user_id` and `bike_id`, uses ascending `started_at` then ascending activity `id`, and includes the current ride. Existing columns and RLS behavior remain unchanged.

**File**: `src/lib/strava/sync-database.ts`

**Intent**: Keep the typed Supabase view definition aligned with the migrated view.

**Contract**: Add the cumulative field to `activities_with_chain.Row` with the database's numeric representation.

#### 2. Activity row and client response contract

**File**: `src/pages/api/strava/activities.ts`

**Intent**: Include the view's cumulative value in activity page responses without changing authentication, filtering, sorting, or pagination.

**Contract**: Select the added field from `activities_with_chain`; chain and bike filters and the existing descending list order remain unchanged.

**File**: `src/lib/strava/activity-view.ts`

**Intent**: Carry the cumulative value from database row to activity view while preserving existing callers that build views from import/sync rows.

**Contract**: Add the database-row field and a numeric client-view field. For legacy call sites without a cumulative value, use an explicit nullable/optional representation rather than fabricating a total.

**File**: `src/components/hooks/useDashboardData.ts`

**Intent**: Validate the cumulative value as part of the activity page payload.

**Contract**: Accept the chosen nullable representation and reject malformed non-null values, alongside the existing activity response checks.

#### 3. Cumulative-distance tests

**File**: `supabase/tests/database/chain_waxing_marks.test.sql`

**Intent**: Extend existing database view assertions to prove the total is bike-specific, includes the current ride, orders equal-time rides by ascending ID, and is based on complete history.

**Contract**: Include a case where an older ride's total is correct even when queried as an isolated activity, plus same-time and separate-bike assertions. Update the pgTAP plan count.

**File**: `src/lib/strava/activity-view.test.ts` and `src/lib/strava/dashboard-query.test.ts`

**Intent**: Cover the cumulative field's mapping and ensure the page helper preserves the value returned for rows from the store.

**Contract**: Include cumulative values in test fixtures and verify the mapped value, null/legacy behavior, chain-filter independence, and pagination response.

### Success Criteria:

#### Automated Verification:

- Database migrations apply cleanly: `npx supabase db reset`
- Database tests pass, including the updated chain-waxing view test: `npx supabase test db`
- Unit tests pass: `npm test`
- Type checking passes: `npm run check`
- Linting passes: `npm run lint`

#### Manual Verification:

- A ride's cumulative value includes its own distance and every earlier ride on that bike, but no ride on another bike.
- Filtering by chain or loading a later activity page does not change a ride's cumulative value.
- Equal-time activities accrue in ascending activity-ID order while the list remains newest-first.

**Implementation Note**: After completing this phase and its automated verification, pause for human confirmation of the manual data checks before proceeding.

## Phase 2: Activity Row and Mark Editor

### Overview

Restructure each activity row around the requested information hierarchy and remove the always-open fresh-wax select from the resting row.

### Changes Required:

#### 1. Activity row presentation and editor interaction

**File**: `src/components/ActivityDashboard.tsx`

**Intent**: Make ride details scannable in the requested three-line order and keep ordinary unmarked rows visually compact. The mark action remains discoverable without leaving a full editor open on every row.

**Contract**:

- First line: ride title and date together.
- Second line: bike name, styled as a label.
- Third line: chain, fresh-wax status, ride distance, and cumulative bike distance. Labels align left and numeric values align right; bike, chain, and fresh-wax status use label styling.
- The mark icon button is visible and keyboard reachable on every row. It expands the existing labelled select inline only after activation.
- Preserve existing chain choices, clearing behavior, saving lock, status/error announcements, and focus behavior. Marked and removed-chain states remain identifiable in text, not color alone.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run check`
- Linting passes: `npm run lint`
- Unit tests pass: `npm test`

#### Manual Verification:

- The title/date, bike, and metric/status rows follow the approved order with labels on the left and values on the right.
- The full select is absent until its icon is activated; activating the icon expands the editor and set, clear, save, and error states still work.
- Keyboard-only users can open and operate the editor, receive save/error announcements, and return focus to the row action.
- The row remains readable without horizontal overflow at mobile widths and uses the existing dashboard visual language.

**Implementation Note**: After completing this phase and its automated verification, pause for human confirmation of the UI walkthrough before proceeding.

## Phase 3: End-to-End Acceptance

### Overview

Run the full repository checks and confirm that the new row presentation and cumulative values work together with the existing activity browsing and mark-saving flows.

### Changes Required:

#### 1. Regression and acceptance verification

**Files**: Existing activity tests, database tests, and dashboard UI

**Intent**: Verify the shipped activity-list experience across normal, filtered, paginated, marked, and narrow-screen states; update any focused test fixtures required by the new response field.

**Contract**: Do not change unrelated Strava import/sync behavior or existing activity selection/filter semantics. Resolve only regressions introduced by the new cumulative field or row presentation.

### Success Criteria:

#### Automated Verification:

- Database tests pass: `npx supabase test db`
- Unit tests pass: `npm test`
- Type checking passes: `npm run check`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`
- Auth-flow smoke check passes against a running local server: `npm run smoke`

#### Manual Verification:

- Walk through all-bike and selected-bike activity lists, including a chain filter and a later page, and confirm totals remain bike-wide and stable.
- Mark, clear, and re-mark a ride using the expanded editor; confirm the compact row returns after saving and existing labels remain correct.
- Review desktop and mobile widths for overflow, readable metric alignment, visible keyboard focus, and clear text labels.

**Implementation Note**: After automated checks pass, pause for human acceptance of the end-to-end UI walkthrough.

## Testing Strategy

### Unit Tests:

- Activity row mapping preserves cumulative distance and supports legacy call sites without a computed total.
- Activity page mapping and payload validation preserve a valid cumulative number and reject invalid response data.
- Existing paging and chain-filter tests continue to pass with the expanded row contract.

### Integration Tests:

- pgTAP verifies lifetime bike totals, inclusive current-ride distance, ascending-ID tie order, per-bike isolation, and results independent of API page/chain filtering.
- `npm run smoke` confirms the signed-in dashboard still renders after the contract change.

### Manual Testing Steps:

1. Use a bike with multiple rides and confirm each total equals all same-bike distances from its first ride through that ride.
2. Compare the same ride in all-bike, bike-filtered, chain-filtered, and later-page views; its total must remain identical.
3. Use rides sharing a start timestamp and confirm ascending activity ID determines their cumulative order.
4. Open and close the mark editor with mouse and keyboard, then set and clear a mark and inspect feedback and focus.
5. Review the list at desktop and mobile widths.

## Performance Considerations

The view adds a per-row running aggregate over the user's activities partitioned by bike. Validate the query through the existing database reset/tests and keep filtering and pagination in the endpoint; do not fetch full activity history into the client to calculate totals.

## Migration Notes

Ship the additive migration before deploying code that selects the new view column. The migration must replace/recreate the view while preserving its existing column contract and `security_invoker = true` option.

## References

- Frame brief: `context/changes/activity-list-presentation/frame.md`
- User requirements: `context/foundation/2dos.md`
- Existing activity view and row: `supabase/migrations/20261023120000_create_chain_waxing_marks.sql`; `src/components/ActivityDashboard.tsx`
- Activity data contract and API: `src/lib/strava/activity-view.ts`; `src/lib/strava/sync-database.ts`; `src/pages/api/strava/activities.ts`
- Existing view tests: `supabase/tests/database/chain_waxing_marks.test.sql`; `src/lib/strava/activity-view.test.ts`; `src/lib/strava/dashboard-query.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Cumulative Distance Data Contract

#### Automated

- [x] 1.1 Database migrations apply cleanly: `npx supabase db reset` — 4f3a606
- [x] 1.2 Database tests pass, including the updated chain-waxing view test: `npx supabase test db` — 4f3a606
- [x] 1.3 Unit tests pass: `npm test` — 4f3a606
- [x] 1.4 Type checking passes: `npm run check` — 4f3a606
- [x] 1.5 Linting passes: `npm run lint` — 4f3a606

#### Manual

- [x] 1.6 A ride's cumulative value includes its own distance and every earlier ride on that bike, but no ride on another bike. — 4f3a606
- [x] 1.7 Filtering by chain or loading a later activity page does not change a ride's cumulative value. — 4f3a606
- [x] 1.8 Equal-time activities accrue in ascending activity-ID order while the list remains newest-first. — 4f3a606

### Phase 2: Activity Row and Mark Editor

#### Automated

- [x] 2.1 Type checking passes: `npm run check` — 3aafc8d
- [x] 2.2 Linting passes: `npm run lint` — 3aafc8d
- [x] 2.3 Unit tests pass: `npm test` — 3aafc8d

#### Manual

- [x] 2.4 The title/date, bike, and metric/status rows follow the approved order with labels on the left and values on the right. — 3aafc8d
- [x] 2.5 The full select is absent until its icon is activated; activating the icon expands the editor and set, clear, save, and error states still work. — 3aafc8d
- [x] 2.6 Keyboard-only users can open and operate the editor, receive save/error announcements, and return focus to the row action. — 3aafc8d
- [x] 2.7 The row remains readable without horizontal overflow at mobile widths and uses the existing dashboard visual language. — 3aafc8d

### Phase 3: End-to-End Acceptance

#### Automated

- [x] 3.1 Database tests pass: `npx supabase test db`
- [x] 3.2 Unit tests pass: `npm test`
- [x] 3.3 Type checking passes: `npm run check`
- [x] 3.4 Linting passes: `npm run lint`
- [x] 3.5 Production build succeeds: `npm run build`
- [x] 3.6 Auth-flow smoke check passes against a running local server: `npm run smoke`

#### Manual

- [x] 3.7 Walk through all-bike and selected-bike activity lists, including a chain filter and a later page, and confirm totals remain bike-wide and stable.
- [x] 3.8 Mark, clear, and re-mark a ride using the expanded editor; confirm the compact row returns after saving and existing labels remain correct.
- [x] 3.9 Review desktop and mobile widths for overflow, readable metric alignment, visible keyboard focus, and clear text labels.