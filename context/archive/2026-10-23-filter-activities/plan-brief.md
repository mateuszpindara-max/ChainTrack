# Bike Navigation and Activity Overview — Plan Brief

> Full plan: `context/changes/filter-activities/plan.md`

## What & Why

Replace the global activity list on the signed-in dashboard with an overview of this year's riding and sidebar navigation by bike. Bikes remain automatically sourced from Strava; chains remain manually managed. Selecting All bikes or one bike opens the matching activity list, while chain assignment and chain-based filtering are moved to S-04.

## Starting Point

The protected `/dashboard` currently loads and shows one flat, paginated list of all bike-linked activities. Strava import already upserts bikes, the activity API is owner-scoped and paginated but has no bike filter, and the chain manager is a separate page. The public `/` welcome is shared by signed-in and signed-out users today.

## Desired End State

After sign-in, `/dashboard` is the main application screen: large summary values show distinct bikes ridden and total distance during the current local calendar year. A left sidebar offers All bikes, every imported bike, and a Chains section linking to chain management; selected-bike activity lists stay newest-first and paginated. On mobile, the sidebar becomes a keyboard-accessible drawer. Signed-out visitors continue to see the public welcome page.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Signed-in entry | `/` redirects to `/dashboard`; signed-out `/` stays public | Keeps the welcome available to new visitors while making the dashboard the signed-in home | Plan |
| Default dashboard | Year overview with prominent bike-count and distance values | Gives the signed-in user an immediate summary instead of another global activity list | Plan |
| Bike navigation | Include All bikes and every Strava-imported bike; empty bikes remain selectable | The sidebar reflects the full automatically imported bike list and explains empty results | Research + Plan |
| Activity selection | All bikes or a selected bike shows a newest-first paginated list | Fulfills the bike-filter workflow without changing activity identity or ordering | PRD + Plan |
| Summary interval | Current calendar year in the browser's local timezone | Matches the user's meaning of “this year” and the UI's local activity dates | Plan |
| Chain navigation | Chains section opens existing manual chain management | Keeps the current chain workflow available without inventing an activity assignment | Plan |
| Chain filtering scope | Chain assignment and chain-based filtering are part of S-04, not this change | S-05 must not be marked complete before a chain-to-activity relationship exists | User decision |
| Mobile navigation | Accessible slide-out drawer | Preserves sidebar navigation without squeezing the activity list on narrow screens | Plan |
| Strava workflow | Preserve connect, initial import, new sync, repair, and feedback; refresh dashboard data after saves | The new navigation must not regress the existing import and maintenance flow | Research + Plan |

## Scope

**In scope:** bike list API, selected-bike activity filtering, current-local-year summary API, dashboard overview and sidebar, chain-management navigation, responsive drawer, signed-in root redirect, smoke and pure-helper test coverage.

**Out of scope:** chain-to-activity assignment, waxing, chain-based activity filtering, bike CRUD, background sync, changes to Strava matching rules, and removing the signed-out welcome page.

## Architecture / Approach

The Astro dashboard continues to use authenticated server context. New owner-scoped endpoints provide paginated bikes, filtered activities and a paginated server-side summary for a browser-local year interval. The React dashboard island owns selected-bike navigation and responsive drawer state while preserving existing Strava controls. The root route checks the authenticated user and redirects only signed-in visitors.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Bike-filtered data and yearly summary | Paginated bike and activity APIs plus local-year summary | Boundary timestamps and paged aggregation must stay correct and owner-scoped |
| 2. Overview, sidebar, and responsive activity views | Main dashboard shell, Bikes/Chains sections, and mobile drawer | Existing Strava state and feedback must survive the UI restructure |
| 3. Signed-in home routing and acceptance | Root redirect, smoke coverage, and end-to-end acceptance | Public welcome and protected app routing must remain distinct |

**Prerequisites:** S-01, S-02 and S-03 are complete; S-04 is not required for this scope because chain assignment/filtering moves there.
**Estimated effort:** About 2–3 implementation sessions across three phases, including focused helper tests and manual viewport/auth checks.

## Open Risks & Assumptions

- Summary range endpoints are generated in the browser's local timezone and sent as UTC instants; tests must cover year boundaries and empty data.
- All imported bikes may include bikes without visible activities; those remain selectable and show an explicit empty state.
- Chains will be visible in the sidebar but will not filter activities until S-04 provides the assignment relation.

## Success Criteria (Summary)

- The dashboard opens to a useful current-year summary, not a global activity list.
- All bikes and individual bike selections show correctly scoped, newest-first activities; imported empty bikes remain visible.
- Strava import/synchronization refreshes the dashboard, signed-in `/` redirects to it, and signed-out welcome/auth behavior remains intact.
