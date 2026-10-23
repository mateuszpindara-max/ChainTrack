# Mark Fresh-Wax Rides and Filter Activities by Chain — Plan Brief

> Full plan: `context/changes/assign-chain-and-mark-waxing/plan.md`

## What & Why

Roadmap S-04. The user marks the first ride on a freshly waxed chain on a bike. That chain then applies to later rides on that bike until the next mark. Rides show their chain, and a bike's rides can be filtered by chain. This delivers the manual tracking logic that a future metrics slice needs for mileage since the last wax.

## Starting Point

Chains exist (S-03) and bike-linked activities are listed and filtered by bike (S-01, S-02, filter-activities). Nothing connects a chain to an activity, the activities endpoint returns no chain data, and the sidebar chain entries only link to `/chains`.

## Desired End State

Inside a bike's activity list, each ride shows the chain in effect and marked rides are labelled "Fresh wax". An inline select on each row sets or clears a mark, and the visible rides re-label correctly. A chain select above the list, shown only after a bike is chosen, filters to a chain or to "No chain". Deleting a chain leaves its rides showing "No chain".

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Wax model | One mark per wax cycle, on the first ride with the fresh chain | Matches how the user tracks waxing and avoids per-ride assignment. |
| Chain on later rides | Derived: latest mark on the same bike at or before the ride | One action per wax cycle, with no stored per-ride chain to keep consistent. |
| Waxing timing | First ride on the fresh wax, not "end of activity" | The PRD now matches the user's rule; the roadmap outcome remains a separate follow-up. |
| Storage | `chain_waxing_marks` table plus a security-invoker view | Filtering and paging stay in the database, and the view cannot bypass RLS. |
| Chain delete | Marks stay with the chain emptied; rides show "No chain" | Cascading would silently relabel rides with an earlier chain; this supersedes the S-03 cascade rule. |
| Activity delete | Mark cascades | Meets the S-02 contract for activity-linked data. |
| Filter | Chain select above the list, only with a bike chosen; All chains, each chain, No chain | User asked for no sidebar filter and a bike-scoped one. |
| Row controls | Inline select on each row | Keeps the browse-and-mark flow on one screen. |
| After saving | Re-read the loaded rows (bounded), keep scroll | A mark relabels many rides, so patching one row would show wrong chains. |
| Test depth | pgTAP plus node unit tests; manual UI check | Follows repo conventions, with the riskiest logic in the database. |

## Scope

**In scope:** marks table, derived view and RLS; activities read with chain fields, chain filter and bounded limit; a PUT route for setting or clearing a mark; selection state, hook and UI for the filter and row controls; updated chain delete copy.

**Out of scope:** chain metrics, stored per-ride assignment, sidebar chain filter, bulk or optimistic marking, chain-to-bike links, PRD edits, changes to import and sync payloads, new dependencies.

## Architecture / Approach

Postgres derives each ride's chain in a view. The API reads the view with the filters applied in the query and writes marks through one idempotent route under the user's RLS. The dashboard keeps its single-selection state and adds a bike-scoped chain filter. After a save, the client re-reads the same number of loaded rows so every derived label is correct.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Database contract | Marks table, derived view, RLS, pgTAP tests | The view bypassing RLS if not security-invoker |
| 2. Server contract | Chain fields and filter on the activities read, bounded limit, PUT route | Keeping import and sync routes compiling |
| 3. State and hook | Chain filter selection, save action, in-place re-read | Interleaved saves and stale responses |
| 4. UI and acceptance | Row controls, filter select, delete copy, manual walk-through | Dense rows on mobile; clear wording for carried-forward chains |

**Prerequisites:** S-01 and S-03 are complete. Local Supabase is available for database tests.
**Estimated effort:** 4 phases, one `/10x-implement` run each.

## Open Risks & Assumptions

- Marks anchor to the ride's current bike. A ride that is deleted, hidden or moved by Strava stops anchoring its old bike, and later rides there revert to the earlier mark.
- Deploy order: the migration must reach the hosted database before the code that reads the view.
- The roadmap S-04 outcome still describes waxing at the end of an activity; align it with the updated PRD wording.
- A future chain-metrics slice should compute mileage from the marked ride inclusive.

## Success Criteria (Summary)

- A user can mark a ride, see the chain carried forward on that bike, and clear or move the mark without wrong labels.
- A bike's rides can be filtered by chain or by "No chain".
- Deleting a chain never shows a chain that was not used.
