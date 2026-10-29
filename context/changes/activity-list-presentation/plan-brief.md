# Activity List Presentation — Plan Brief

> Full plan: `context/changes/activity-list-presentation/plan.md`
> Frame brief: `context/changes/activity-list-presentation/frame.md`

## What & Why

Activity rows combine a persistent fresh-wax editor with a distributed information hierarchy and omit the requested per-bike cumulative distance, so reducing the mark's prominence alone would leave the reported list-scanning and information-completeness concerns unresolved. This plan reorganizes the entire row and adds the missing lifetime bike total through the current ride.

## Starting Point

The dashboard currently separates ride title, bike, chain, distance, and date across row regions and displays a full fresh-wax select on every ride. The activity API reads a security-invoker database view, then applies chain filtering and newest-first pagination; the response contains ride distance but no cumulative bike total.

## Desired End State

Rows show title/date together, bike beneath, and chain, fresh-wax state, ride distance, and cumulative bike distance as labelled values. The mark icon stays visible on each row, while its select editor expands only when activated. Each cumulative value includes every ride on the same bike through the current ride, regardless of chain filter or page.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Scope | Whole activity row; all rows | Fresh-wax control density and missing row information are both causes | Frame |
| Cumulative meaning | Bike total from first activity through current ride, inclusive | This is the clarified value, not mileage since waxing | Frame |
| Equal-time order | Ascending activity ID | Gives the cumulative value a deterministic rule | Plan |
| Icon visibility | Always visible on every row | Discoverable on touch and keyboard without hover | Plan |
| Editor interaction | Expand the existing select inline after icon activation | Removes resting control density while retaining established choice behavior | Plan |
| Calculation ownership | Database view before API filters and pagination | Prevents page or chain selection from changing a lifetime total | Plan |
| List ordering | Preserve newest-first activity list | Presentation request does not change browsing semantics | Plan |

## Scope

**In scope:** cumulative bike distance in the activity view/API/client contract; activity row hierarchy and label/value alignment; compact icon-triggered inline mark editor; regression tests and manual acceptance.

**Out of scope:** chain mileage since waxing, new filters, altered list ordering, mark persistence changes, palette redesign, other pages, or new dependencies.

## Architecture / Approach

An additive database migration extends the existing security-invoker view with a per-user/per-bike running total ordered by start time and ascending activity ID. The API carries that value through its current filtered, paginated response; the activity view and payload validator preserve the typed contract. The dashboard then reorganizes each row and expands the existing select only when the persistent icon is activated.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Cumulative Distance Data Contract | Database view, API/type propagation, and tests for whole-history totals | Calculating after chain filtering or pagination would produce wrong totals |
| 2. Activity Row and Mark Editor | Requested hierarchy and compact icon-triggered inline editor | Keeping control accessible without restoring row clutter |
| 3. End-to-End Acceptance | Full checks and filtered/paginated/mobile walkthrough | Contract regressions across UI and data paths |

**Prerequisites:** Local Supabase with Docker for migration and pgTAP checks; Node version pinned in `.nvmrc`.
**Estimated effort:** 3 phases, one `/10x-implement` run per phase.

## Open Risks & Assumptions

- The running aggregate may add query cost as activity history grows; verify it with local database tests and avoid moving full-history calculation into the browser.
- The migration must reach the database before app code selects the new view column.
- The cumulative number is represented in meters internally and formatted consistently with existing distance values.

## Success Criteria (Summary)

- Activity rows follow the requested title/date, bike, and labelled metrics hierarchy with no full mark select visible at rest.
- The always-visible icon opens the existing editor accessibly, and mark set/clear feedback continues to work.
- Cumulative bike totals remain correct across chain filters, pagination, bikes, and equal-time rides.