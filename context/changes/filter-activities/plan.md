# Bike Navigation and Activity Overview Implementation Plan

## Overview

Replace the signed-in dashboard's global activity list with a yearly activity overview and a left sidebar containing imported bikes and manually managed chains. Users can choose All bikes or a specific bike to view paginated activities; chain assignment and chain-based activity filtering move to S-04.

## Current State Analysis

- `/dashboard` is protected and server-renders the first 100 bike-linked activities before mounting `ActivityDashboard`; the React island presents a flat activity list, Strava connection/import/synchronization controls, and a Chains link (`src/pages/dashboard.astro`, `src/components/ActivityDashboard.tsx`).
- The activity API is authenticated, owner-scoped, ordered newest-first and paginated at 100 rows, but it does not accept a bike filter (`src/pages/api/strava/activities.ts`). `ActivityView` carries a bike name but not a bike ID (`src/lib/strava/activity-view.ts`).
- Initial import and both synchronization modes upsert the authenticated athlete's bikes. Activity rows reference a bike; repair may retain activities with a null bike ID, which normal lists hide (`src/lib/strava/import.ts`, `src/pages/api/strava/import.ts`, `src/pages/api/strava/sync.ts`).
- Chains have owner-scoped CRUD and a separate `/chains` manager, but there is no chain-to-activity relation. S-04 remains responsible for the chain workflow; this change will not add assignments.
- The public `/` route renders the starter welcome page regardless of session. The smoke test expects that behavior and expects an authenticated dashboard after sign-in (`src/pages/index.astro`, `scripts/smoke.mjs`).
- The accepted lesson requires paginating Supabase reads that may exceed its 1,000-row maximum (`context/foundation/lessons.md`).

## Desired End State

A signed-in user lands on `/dashboard`, which opens an overview with prominent cards for the number of bikes ridden in the current local calendar year and total distance in that year. A sidebar lists All bikes, every imported bike and the user's chains; choosing All bikes or a bike shows the corresponding newest-first activity list, while a bike with no visible activities has a clear empty state. The sidebar becomes an accessible drawer on small screens. Signed-out visitors continue to see the public welcome page at `/`.

The existing Strava connection, import, new-activity synchronization and full-history repair actions remain available on the dashboard. Importing or synchronizing refreshes the bike list and yearly totals. The chain section links to existing chain management; chain assignment and filtering by chain are implemented with S-04, not here.

### Key Discoveries:

- Bikes are automatically upserted from Strava's athlete bike list during initial import and synchronization (`src/pages/api/strava/import.ts`, `src/pages/api/strava/sync.ts`).
- Activities are already owner-filtered, newest-first and paginated; adding an optional bike filter can preserve the existing API contract and pagination (`src/pages/api/strava/activities.ts`).
- A client activity view currently lacks `bikeId`, and the dashboard only looks up bikes for the first activity page; a complete sidebar needs a separate owner-scoped, paginated bike list.
- Chain-based filtering has no persisted relationship yet, so it cannot be delivered without expanding into S-04's data model and assignment workflow.
- The home smoke expectations need to change only for authenticated sessions; anonymous `/` remains public.

## What We're NOT Doing

- Assigning a chain to an activity, recording waxing, or filtering activities by chain; these belong to S-04 under the revised roadmap scope.
- Changing Strava import, synchronization, bike matching, or handling of activities without an unambiguous bike.
- Editing or deleting Strava bikes in ChainTrack; bikes continue to be sourced from Strava.
- Adding background synchronization, bike CRUD, or chain-to-bike relationships.
- Removing the public welcome experience for signed-out visitors.

## Implementation Approach

Keep the existing Astro SSR route and React dashboard island. Add an authenticated paginated bike-list endpoint, extend the activity endpoint with a validated All/specific-bike filter, and add an owner-scoped summary endpoint that pages through activity rows for the requested local-calendar-year interval and aggregates unique ridden bike IDs and meters server-side. The client derives the interval from the browser's local calendar year and refreshes summary/sidebar data after Strava operations. The dashboard island then presents overview, bike-filtered activity, Strava actions, and chain navigation in one responsive shell. Keep `/` public for signed-out users and redirect signed-in users to `/dashboard`. Route files stay thin: request parsing, validation, page reads (through an injected store, like `ImportStore` in `src/lib/strava/import.ts`) and dashboard selection/refresh state live in pure helpers under `src/lib/strava/`, so they run under the existing `npm test` (node:test, no DOM or `astro:env/server`).

## Phase 1: Bike-filtered data and yearly summary

### Overview

Expose the imported bike list, per-bike activity pages and yearly summary through authenticated, owner-scoped API behavior without changing import semantics.

### Changes Required:

#### 1. Bike list endpoint

**File**: `src/pages/api/strava/bikes.ts`

**Intent**: Provide every bike imported for the signed-in user so the sidebar does not depend on which bikes happen to occur in the first activity page.

**Contract**: `GET` requires an authenticated user, validates `offset` as a safe integer in the established range, returns bikes ordered by name then ID in pages of 100 with `hasMore`, and queries only rows belonging to that user.

#### 2. Bike-filtered activity endpoint

**Files**: `src/pages/api/strava/activities.ts`, `src/lib/strava/dashboard-query.ts`, `src/lib/strava/dashboard-query.test.ts`

**Intent**: Let the dashboard reuse the current activity API for All bikes and a selected bike.

**Contract**: Accept an optional `?bikeId=<uuid>` filter: an absent parameter means All bikes, a non-UUID value returns 400, and a well-formed UUID the user does not own returns 200 with an empty page (no existence leak). Preserve authentication, user scoping, null-bike exclusion, newest-first ordering, page size, and limit-plus-one `hasMore` behavior. A selected bike filter is applied in the database query, not after fetching a page. Parsing of `offset` and the bike filter, and the paging query for both this route and `bikes.ts`, live in `dashboard-query.ts` behind an injected store so they are testable without the route.

#### 3. Yearly overview summary

**Files**: `src/pages/api/strava/dashboard-summary.ts`, `src/lib/strava/dashboard-summary.ts`, `src/lib/strava/dashboard-summary.test.ts`

**Intent**: Calculate the overview cards without sending the user's full activity history to the browser.

**Contract**: The API accepts a validated start-inclusive/end-exclusive ISO timestamp interval generated from the browser's current local calendar year. Both instants must parse, `start` must precede `end`, and the span may not exceed 367 days (a local year plus a DST shift); anything else is a 400. It reads only the signed-in user's activities in that interval, pages database reads in batches of 1,000 (the `max_rows` limit in `supabase/config.toml`) ordered by `started_at` then `id`, ignores null bike links, and returns the number of distinct ridden bikes and summed distance meters. Any failed page read returns 503 with no partial totals. The local-year interval builder lives in `dashboard-summary.ts`; its tests pin the timezone (for example by setting `TZ`) so year-boundary instants and empty activity sets are covered deterministically.

### Success Criteria:

#### Automated Verification:

- Unit tests (`npm test`) cover yearly summary aggregation, distinct bike counting, null-bike exclusion, local-year boundaries, and empty results.
- Helper tests (`npm test`) cover user-ID scoping, selected-bike filtering (including an unowned UUID returning an empty page), invalid filter/range input, and offset pagination using an in-memory store.
- `npm run lint` and `npm run check` pass.

#### Manual Verification:

- API requests for All bikes and a selected bike return only the expected user's activities, ordered newest-first across pages; signed-out requests receive 401.
- Summary values match visible current-local-year activities at the start/end of the year and show zero for a year with no rides.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

## Phase 2: Overview, sidebar, and responsive activity views

### Overview

Replace the global activity list with a year summary, sidebar navigation and selected-bike activity view while preserving Strava workflows and chain management.

### Changes Required:

#### 1. Dashboard server data

**File**: `src/pages/dashboard.astro`

**Intent**: Load the complete imported bike and chain navigation data for the authenticated dashboard rather than deriving the bike menu from one activity page.

**Contract**: Query the first page of bikes and chains for the current user using their existing ownership boundaries and deterministic ordering. Pass those collections, their `hasMore` state, and existing Strava connection/sync state to the dashboard island; do not preload an unfiltered activity list for the overview.

#### 2. Dashboard workspace and sidebar

**Files**: `src/components/ActivityDashboard.tsx`, `src/components/DashboardSidebar.tsx`, `src/components/YearSummary.tsx`, `src/components/hooks/useDashboardData.ts`, `src/lib/strava/dashboard-state.ts`, `src/lib/strava/dashboard-state.test.ts`

**Intent**: Turn the existing dashboard island into the signed-in overview and navigation shell, retaining import and synchronization feedback.

**Contract**: The default view shows two prominent summary values: unique bikes with visible activity in the current local calendar year and the total distance of those activities. The Bikes section contains All bikes and every imported bike; selecting one loads its activity list from the filtered API, and bikes with no visible activities remain selectable with an empty state. Load additional bike and chain pages through their paginated APIs so no sidebar entries disappear beyond the first 100. The Chains section shows the user's chains; selecting the section or a chain entry opens existing `/chains` management. Import, new-activity sync and full-history repair actions remain available. Their responses still carry a global first-page `activities` list and `hasMoreActivities`; the dashboard ignores both (it no longer applies `activitiesAfterSync` to the list) and, whenever a response reports saved changes (`inserted + updated + removed > 0`, or a `complete` outcome), refetches the first bikes page, the summary and the selected view's first activity page through the filtered APIs. The import/sync routes and `sync-contract.ts` stay unchanged. Keep accessible loading, error, empty and status announcements; summary, bikes, chains and activities each have independent loading, error and retry states so one failure does not blank the others, and the summary shows a loading state until its first response (it needs the browser timezone, so it is fetched after hydration). Every fetch is keyed by (selection, refresh generation); responses for a stale key are discarded, and a selection change resets the list and offset. On desktop use a left sidebar; on narrow screens provide an accessible drawer that can be operated by keyboard and closed after navigation. Preserve visible focus styles. Selection and refresh state transitions (All bikes, selected bike, empty bike, summary, post-save refresh) live in the pure `dashboard-state.ts` helper, driven by the `useDashboardData` hook; `ActivityDashboard.tsx` keeps the Strava actions and composes `YearSummary` and `DashboardSidebar`. The mobile drawer is a native `<dialog>` opened with `showModal()` (built-in focus trap, Escape and inert background); it closes on selection and returns focus to its trigger. The same sidebar content renders inline from the `md` breakpoint up.

#### 3. Shared page styling and layout

**Files**: `src/pages/dashboard.astro`, `src/styles/global.css` only if needed

**Intent**: Give the dashboard shell stable responsive layout dimensions while staying consistent with current app conventions.

**Contract**: The activity list remains readable beside the sidebar on desktop and occupies the available content width on mobile. Do not change unrelated public welcome styling or shared UI tokens.

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npm run check` pass.
- Helper tests (`npm test`) cover dashboard selection/refresh state: summary, All bikes, selected bike, empty-bike state, refresh after import/synchronization, and discarding of stale responses. Rendering and drawer behavior are verified manually.
- Existing chain management and Strava response/synchronization tests pass with the new dashboard props and state flow.

#### Manual Verification:

- The default dashboard shows the yearly bike-count and distance summary rather than a global list of all activities.
- All bikes shows all visible bike-linked activities; selecting a bike shows only its activities; a bike without activities remains visible and displays an empty state.
- The sidebar lists automatically imported bikes and manually created chains; its chain navigation opens chain management.
- Initial import, new-activity sync and history repair retain their existing status/error feedback and refresh the visible bike list and summary when they save changes.
- On desktop the sidebar stays left of the content; on mobile the drawer opens, supports keyboard navigation, and closes after a selection.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

## Phase 3: Signed-in home routing and acceptance

### Overview

Make the dashboard the signed-in entry point while preserving `/` as the public welcome for signed-out visitors, then verify the complete navigation and authentication flow.

### Changes Required:

#### 1. Signed-in root redirect

**File**: `src/pages/index.astro`

**Intent**: Send an authenticated user directly to the application dashboard instead of showing the public welcome page again.

**Contract**: Redirect authenticated users to `/dashboard`; render the existing welcome experience unchanged when no user is signed in.

#### 2. Smoke coverage

**File**: `scripts/smoke.mjs`

**Intent**: Keep the auth smoke test aligned with the new root behavior.

**Contract**: Verify signed-out `/` returns 200, successful sign-in redirects to `/dashboard`, signed-in `/` redirects to `/dashboard`, signed-in dashboard renders, sign-out returns to `/`, and signed-out `/dashboard` redirects to `/auth/signin`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npm run check` pass.
- `npm run build` passes.
- `npm run smoke` passes and proves the public-root and signed-in-root behaviors and the existing sign-in/sign-out redirects.

#### Manual Verification:

- Signed out, `/` continues to show the public welcome and `/dashboard` redirects to sign-in.
- Signed in, `/` redirects to `/dashboard`; summary, Bikes selection, Chains navigation, Strava actions and responsive sidebar work together.
- After importing a bike or activity, the new bike and current-year summary appear without requiring a full page reload.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

## Testing Strategy

### Unit Tests:

- Summary aggregation counts unique non-null bike IDs and sums distances within the requested interval.
- Interval and activity API validation reject invalid filters, malformed timestamps and unsupported ranges.
- Dashboard state helper tests cover All bikes, selected-bike filtering, empty bikes, and summary refresh after successful Strava operations.
- All helper tests run with `npm test`.

### Integration Tests:

- Helper tests with an in-memory store verify user-ID scoping and stable offset pagination for both All bikes and a selected bike. Cross-user isolation relies on the existing RLS tests (`supabase/tests/database/strava_rls.test.sql`); 401 handling is checked manually.
- Smoke test covers public home, authenticated redirect, dashboard rendering and sign-out regression.
- Existing import, sync, repair and chain tests remain green.

### Manual Testing Steps:

1. Sign in and confirm `/` opens `/dashboard` with the current-local-year bike and distance summary.
2. Choose All bikes and then individual bikes; compare activity rows, ordering and empty-bike behavior.
3. Import or synchronize Strava data and verify the sidebar and summary refresh.
4. Open Chains from the sidebar, create/edit/delete a chain, then return to the dashboard.
5. Repeat the navigation using keyboard only on desktop and through the drawer on a narrow viewport.
6. Sign out and confirm the public welcome and protected-dashboard redirect remain correct.

## Performance Considerations

The summary reads only the selected calendar year's activity columns and paginates database reads in bounded batches, honoring the Supabase row limit. Activity and bike navigation endpoints remain paginated; no full activity history is sent merely to render summary cards.

## Migration Notes

No database schema change is expected. Existing bike and activity data remain the source of truth; nullable bike links produced by repair remain excluded from normal activity lists and summary counts. Chain assignment and chain-based filtering remain out of scope until S-04.

## References

- Product requirements: `context/foundation/prd.md` (FR-007, FR-008; FR-008 scope moved to S-04 by product decision)
- Roadmap: `context/foundation/roadmap.md` (S-04 and S-05)
- Accepted pagination lesson: `context/foundation/lessons.md`
- Activity route and view: `src/pages/api/strava/activities.ts`, `src/lib/strava/activity-view.ts`
- Dashboard and import: `src/pages/dashboard.astro`, `src/components/ActivityDashboard.tsx`, `src/pages/api/strava/import.ts`, `src/pages/api/strava/sync.ts`
- Smoke flow: `scripts/smoke.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bike-filtered data and yearly summary

#### Automated

- [x] 1.1 Unit tests (`npm test`) cover yearly summary aggregation, distinct bike counting, null-bike exclusion, local-year boundaries, and empty results. — 064e3d8
- [x] 1.2 Helper tests (`npm test`) cover user-ID scoping, selected-bike filtering (including an unowned UUID returning an empty page), invalid filter/range input, and offset pagination. — 064e3d8
- [x] 1.3 Lint and type check pass: `npm run lint`, `npm run check`. — 064e3d8

#### Manual

- [x] 1.4 All-bikes and selected-bike API responses are correctly scoped and paginated, and signed-out requests receive 401. — 064e3d8
- [x] 1.5 Summary values are correct for local-year boundary instants and zero-ride years. — 064e3d8

### Phase 2: Overview, sidebar, and responsive activity views

#### Automated

- [x] 2.1 Helper tests (`npm test`) cover dashboard selection/refresh state: summary, All bikes, selected bike, empty state, post-sync refresh, and stale-response handling.
- [x] 2.2 Lint and type check pass: `npm run lint`, `npm run check`.
- [x] 2.3 Existing chain management and Strava response/synchronization tests pass with the new dashboard props and state flow.

#### Manual

- [x] 2.4 The default dashboard shows the yearly summary instead of a global activity list.
- [x] 2.5 All bikes and selected-bike views show the expected activities; imported bikes without activities remain visible with an empty state.
- [x] 2.6 Sidebar bike and chain sections are present, and chain navigation opens chain management.
- [x] 2.7 Strava import, new sync and history repair retain feedback and refresh the bike list and summary after saving.
- [x] 2.8 Desktop sidebar and mobile drawer are keyboard-operable and show loading, error, empty and status states clearly.

### Phase 3: Signed-in home routing and acceptance

#### Automated

- [ ] 3.1 Lint and type check pass: `npm run lint`, `npm run check`.
- [ ] 3.2 Production build succeeds: `npm run build`.
- [ ] 3.3 Smoke test passes and proves public-root and signed-in-root behavior: `npm run smoke`.

#### Manual

- [ ] 3.4 Signed-in root redirects to dashboard; signed-out root remains public and protected dashboard redirects to sign-in.
- [ ] 3.5 Import/synchronization updates dashboard bikes and summary without a full reload.
- [ ] 3.6 Signed-in summary, bike selection, chain navigation, Strava actions and responsive sidebar work together end-to-end.
