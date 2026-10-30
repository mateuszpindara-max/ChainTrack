# Frame Brief: Chain lifecycle tracking

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

After selecting a chain in the sidebar, the user does not see its details in
the main view; the click opens a separate chain-management view. The user also
cannot read summarized mileage between waxing marks. (User-confirmed during
framing.)

## Initial Framing (preserved)

- **User's stated cause or approach**: The chain sidebar navigation and the
  standalone management page split chain work away from the dashboard; the
  user wants selection to behave like bike selection.
- **User's proposed direction**: Open chain details in the main view, move
  management behind a cog, show starting and total mileage plus waxing-cycle
  history, set a per-chain threshold, and signal 75%/100% threshold usage in
  the sidebar.
- **Pre-dispatch narrowing**: The user selected the whole chain experience,
  confirmed the click opens a separate management view, and identified
  summarized distance between waxing marks as missing. They described the
  desired result as a full picture of chain state; threshold warnings are part
  of that same result.

## Dimension Map

The observation and requested outcome span these dimensions:

1. **Dashboard navigation and selection** — chain clicks may fail to select a
   chain in the dashboard, unlike bike selection. This is the user's initial
   framing and explains the separate-page symptom.
2. **Waxing-cycle aggregation** — marks and activity facts may exist without
   cycle-level distance, dates, or bike summaries. This could explain why
   chain history is unavailable even after navigation is fixed.
3. **Per-chain wear state and thresholds** — the domain may lack a stored
   threshold and a derived percentage/alert state, making the requested
   warnings a separate missing capability.
4. **Accepted product scope** — existing product decisions may explicitly
   exclude lifecycle metrics, meaning the backlog is reopening a product
   boundary rather than merely exposing an already-accepted feature.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Dashboard navigation alone is the underlying problem | `src/components/DashboardSidebar.tsx` links chain items and the Chains heading to `/chains`; the manager is a separate CRUD page (`src/pages/chains.astro`, `src/components/ChainManager.tsx`). Dashboard selection in `src/lib/strava/dashboard-state.ts` supports summary or bike activities with a bike-scoped chain filter, not a selected-chain detail view. User confirmed the click opens management. | STRONG for the navigation symptom; insufficient for the full requested outcome |
| Raw data is missing, preventing chain history | `chain_waxing_marks` records activity and chain anchors; `activities_with_chain` carries chain identity forward. Activity rows include distance, date, bike, and cumulative bike distance (`supabase/migrations/20261023120000_create_chain_waxing_marks.sql`, `supabase/migrations/20261029120000_add_activity_cumulative_distance.sql`, `src/lib/strava/activity-view.ts`). | WEAK: core facts exist |
| Chain-cycle metrics are not derived or exposed | `ChainView` contains only id, name, starting distance, and created date (`src/lib/chains/chain.ts`). No chain-cycle summary is exposed; PRD Business Logic and Non-Goals explicitly leave mileage-between-waxings and current mileage out of MVP (`context/foundation/prd.md`, “Business Logic” and “Non-Goals”). | STRONG |
| Threshold state and warnings are absent | The chain schema and API expose no per-chain threshold; the sidebar renders names without usage state (`supabase/migrations/20261022120000_create_chains.sql`, `src/lib/chains/chain.ts`, `src/components/DashboardSidebar.tsx`). The requested 75%/100% states exist only in `context/foundation/2dos.md`. | STRONG |
| The request changes accepted product scope | The accepted PRD explicitly excludes chain usage metrics; the archived S-04 brief lists chain metrics as out of scope and as a future follow-up (`context/archive/2026-10-23-assign-chain-and-mark-waxing/plan-brief.md`, “Scope” and “Open Risks & Assumptions”). The current roadmap parks metrics (`context/foundation/roadmap.md`, “Parked”). | STRONG |

## Narrowing Signals

Decisive observations from the user and investigation:

- The chain click really opens the separate manager, confirming a navigation
  defect relative to the intended dashboard interaction.
- The user cannot see summarized distance between waxing marks; raw activity
  and mark facts exist, but no chain-cycle aggregate is exposed.
- The user sees chain navigation, cycle history, current wear, and threshold
  alerts as one outcome: a full picture of chain state.
- The accepted PRD and previous chain plan intentionally excluded these
  metrics, so the broader request is not already covered by the accepted scope.

## Cross-System Convention

ChainTrack already models a waxing mark as the first activity using a freshly
waxed chain and derives the chain carried forward on the same bike. The prior
S-04 implementation kept that derivation in a security-invoker database view
and explicitly deferred metrics. The leading hypothesis therefore matches
the project's existing convention: the lifecycle scope must be made explicit
at the product-requirement level, while preserving the established mark
semantics and owner-scoped data boundaries.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: ChainTrack can record which chain
> is in use on each ride, but it does not yet provide an accepted, end-to-end
> view of a chain's lifecycle, accumulated distance, waxing cycles, and
> threshold status.

The separate manager route is a confirmed navigation problem, but fixing that
alone would still leave the user unable to understand chain wear or upcoming
waxing. The desired behavior adds derived metrics and per-chain threshold
state that the PRD and roadmap currently place outside the accepted MVP scope.
The framing should therefore treat navigation as one visible symptom of a
broader chain-lifecycle capability, not as the whole problem.

## Confidence

- **HIGH** — the user confirmed the navigation symptom and described the
  lifecycle information as one outcome; source code and prior product
  decisions independently confirm the missing metric and threshold layers.

## What Changes for /10x-plan

Plan around the chain-lifecycle outcome and align it with the accepted product
scope, rather than planning only a sidebar/main-view navigation change. Keep
the existing first-ride waxing-mark semantics as established context; the
recommended threshold values and alert behavior remain product questions for
the plan to verify, not assumptions established by this frame.

## References

- Source files: `src/components/DashboardSidebar.tsx`; `src/components/ActivityDashboard.tsx`; `src/lib/strava/dashboard-state.ts`; `src/lib/chains/chain.ts`; `src/pages/chains.astro`; `src/components/ChainManager.tsx`.
- Data model: `supabase/migrations/20261022120000_create_chains.sql`; `supabase/migrations/20261023120000_create_chain_waxing_marks.sql`; `supabase/migrations/20261029120000_add_activity_cumulative_distance.sql`; `src/lib/strava/activity-view.ts`.
- Product decisions: `context/foundation/2dos.md`; `context/foundation/prd.md` (“Business Logic”, “Non-Goals”); `context/foundation/roadmap.md` (“Parked”); `context/archive/2026-10-23-assign-chain-and-mark-waxing/plan-brief.md` (“Scope”, “Open Risks & Assumptions”).
- Investigation tasks: read-only parallel checks for navigation, data-model availability, threshold state, independent diagnosis, and prior chain decisions. (The exploration tool did not expose task IDs.)