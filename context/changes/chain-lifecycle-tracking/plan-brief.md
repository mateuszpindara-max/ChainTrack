# Chain Lifecycle Tracking — Plan Brief

> Full plan: `context/changes/chain-lifecycle-tracking/plan.md`
> Frame brief: `context/changes/chain-lifecycle-tracking/frame.md`

## What & Why

ChainTrack records which chain is used on each ride but gives no end-to-end view of a chain's lifecycle, accumulated distance, waxing cycles, or threshold status. This change makes a chain a main-pane selection like a bike, adds cycle history and mileage, a per-chain threshold, bike-row alerts at 75% and 100%, an explicit stop, and a cog-driven manage view.

## Starting Point

Chains are a standalone CRUD page at `/chains`, linked from the sidebar. Waxing marks already attribute rides per bike through the `activities_with_chain` view. No mileage, cycle, threshold, or stop data exists.

## Desired End State

Selecting a chain opens its details in the main pane. The bike row carrying the chain turns orange at 75% of its threshold and red at 100%. Stop ends attribution, and a fresh-wax mark reattaches the chain with prior mileage kept and the marked ride counted immediately in the new cycle. `/chains` redirects to the dashboard.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Active model | Per bike, governing marks; cycle ends at next mark on same bike | Reuses the shipped attribution rule and avoids a second model | Research |
| Total mileage | Starting km plus all rides attributed to the chain, across bikes | Matches the user's requirement for mileage across bikes | Plan |
| Stop action | Explicit stop; total kept, active cycle closed, chain inactive | Shape notes require it and the user confirmed it | Frame |
| Rides after stop | Show no chain and do not count until a new mark | User chose attribution ends at stop | Plan |
| Reattach | Keeps prior total; resets the old cycle and counts the marked ride immediately | Inclusive fresh-wax ride counts toward the new cycle | Plan |
| Threshold | Manual value; suggested default when sourced, otherwise none | Avoids inventing a wax interval number | Plan |
| Average | Information only after two completed cycles; threshold unchanged | User rejected the shape-notes auto-switch | Plan |
| Alerts | Orange at 75%, red at 100%, on the bike row carrying the chain | User chose bike-row coloring with hover text | Plan |
| Cycle start | Fresh-wax ride counts toward the new cycle | User chose inclusive start | Plan |
| `/chains` | Redirect to `/dashboard`; manage view moves to main pane behind cog | Single navigation surface, matches bike selection | Plan |
| PRD | Amend in Phase 0 (FR-009 to FR-012); remove conflicting Non-Goal | PRD contradicts itself on chain metrics | Plan |
| Metric computation | Postgres views, security_invoker | Matches existing convention and avoids the 1,000-row limit | Research |

## Scope

**In scope:**
- PRD amendment (Phase 0, needs approval)
- Migration: `threshold_km`, persistent stop events, extended attribution view, cycle and metric views
- Lifecycle domain logic and routes (metrics, threshold, stop, bike status), with separate base CRUD and lifecycle DTOs
- Sidebar selection, cog manage view, bike-row alert state, chain details pane
- `/chains` redirect and Topbar update
- pgTAP and unit tests

**Out of scope:**
- Automatic waxing detection, automatic threshold switch to average
- Backdated stop; rides with no bike; alerts beyond visual status (no email or push)
- UI color rework, ODO/TRIP labels
- Roadmap changes (no roadmap item for this change)

## Architecture / Approach

The governing-mark rule in `activities_with_chain` uses persistent stop and reattach history and exposes its mark id. On top of it, `chain_cycles` sums distance per mark, `chain_metrics` computes totals and active mileage per chain, and `bike_chain_status` lists the one open cycle per bike. Routes expose metrics, threshold, stop, and bike status. The client loads bike status for the sidebar and metrics for the selected chain. TypeScript only formats and classifies numbers, via pure functions in `lifecycle.ts`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 0. PRD amendment | FR-009 to FR-012; conflicting Non-Goal removed | Needs your approval before editing |
| 1. Data model and SQL metrics | Columns, lifecycle views, pgTAP, existing waxing route migration | Stop boundaries and coordinated database/application cutover |
| 2. Domain logic and API | Wear levels, routes, extended chain list | Threshold default may stay empty if no source is verifiable |
| 3. Main-pane navigation and alerts | Chain details, manage view, sidebar alerts | CRUD and saved sync changes must invalidate shared lifecycle data |
| 4. Route consolidation | `/chains` redirect, Topbar update | Low |
| 5. Final verification | Full gate and lifecycle walkthrough | Manual steps are the only check on UI behavior |

**Prerequisites:** Local Supabase running (Docker) for `npx supabase db reset` and `npx supabase test db`; Node 22.14.0; approval of Phase 0 wording before the PRD is edited, and approval of the amendment before Phase 1 starts.
**Estimated effort:** ~4-5 sessions across 6 phases.

## Open Risks & Assumptions

- The suggested threshold default has no verified source yet. If none is found in Phase 2, the constant stays `null` and the threshold must be entered manually. This is not blocking.
- A chain marked on two bikes without a stop keeps two open cycles. Active mileage is the sum across bikes, so both bike rows show the same chain total. This follows from the per-bike model.
- Stop uses the moment the action is confirmed; a stop cannot be backdated in this change.
- Stop events persist across repeated stops and reattachments. A mark on a ride at or before a stop is a historical correction, not a reattachment; only a ride starting strictly after the stop can reopen the chain.
- Historical mark edits recalculate earlier attribution and mileage without erasing stop boundaries. Database functions enforce serialized stop and mark mutations; authenticated direct table writes are revoked.
- Phase 1 deploys the migration and existing waxing route together under a write-blocking maintenance window; do not reopen writes until the route is verified against the migrated database.
- Cycle anchors follow ride start and activity ID ordering; null-chain marks remain boundaries, and bike-less marks do not anchor cycles.
- Bike-status reads page through all user-scoped results to avoid Supabase's row limit.
- Assumption: rides with no bike stay outside chain metrics, as before.
- The shape-notes auto-switch to average is overridden by the interview. Shape notes are not edited; this brief is the record.
- Existing pgTAP count in `chain_waxing_marks.test.sql` may change because the attribution view is replaced.

## Success Criteria (Summary)

- Selecting a chain opens its details in the main pane, and the cog opens the manage view.
- A bike row turns orange at 75% and red at 100% of the attached chain's threshold, with status text on hover.
- Stop keeps prior mileage, ends attribution, and clears the alert; reattach resets the old cycle and counts the marked ride immediately (30 km for a 30 km ride).
- `/chains` redirects to `/dashboard`; the full gate, pgTAP suite, and manual walkthrough pass.
