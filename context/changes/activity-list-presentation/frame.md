# Frame Brief: Activity List Presentation

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

"lista fresh-wax mark psuje wyglad" (the activity list's fresh-wax mark harms its appearance). The reported scope is the activity list, and the user says the row-scanning concern applies to all rows.

## Initial Framing (preserved)

- **User's stated cause or approach**: The fresh-wax mark/list is what makes the activity view look worse.
- **User's proposed direction**: Hide the fresh-wax mark by default and use a small marking button or icon; put ride title and date together, bike on the next line, then chain, fresh-wax status, ride distance, and cumulative distance with labels on the left and values on the right; format bike, chain, and fresh-wax status as labels.
- **Pre-dispatch narrowing**: Both fresh-wax clutter and activity-row scanning are equally concerning; scope is the activity list only; the problem is present across all rows; unmarked rows visibly include the mark selector. Cumulative distance is part of the concern and means the bike's total distance from its first activity through that ride.

## Dimension Map

The observation could originate at either of these dimensions:

1. **Persistent mark-control density** — a visible selector on every row consumes space and attention even when a ride is unmarked. ← initial framing
2. **Row information hierarchy and completeness** — ride identity, date, bike, chain, and distance are split between row regions, and the requested bike-total distance is absent.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Persistent mark-control density is the main origin | `src/components/ActivityDashboard.tsx:488-533` renders a labeled select for every activity; its default option is "Not a fresh-wax ride". An independent read found it increases row height and space even for unmarked rides. The archived design intentionally chose inline controls but named dense mobile rows as a risk (`context/archive/2026-10-23-assign-chain-and-mark-waxing/plan-brief.md:28,49`). | STRONG |
| Broader row hierarchy/completeness is an independent origin | `src/components/ActivityDashboard.tsx:494-507` distributes title/bike/chain and distance/date into separate regions. `src/lib/strava/activity-view.ts:17-27` carries per-ride distance but no cumulative bike total; the API selects only `distance_meters` (`src/pages/api/strava/activities.ts:35`). The requested layout and cumulative distance are explicit in `context/foundation/2dos.md:5-8`. | STRONG |

## Narrowing Signals

- The user confirmed the issue is the activity list only, affects all rows, and includes the visible selector on ordinary unmarked rides.
- The user confirmed the cumulative value means bike total through the current ride, not mileage since fresh wax.
- Two hypothesis investigations and an independent read found selector density is real but cannot explain the missing metric; the row hierarchy/completeness issue is also present.

## Cross-System Convention

The project-local prior is mixed: the S-04 implementation deliberately chose an inline select on each ride to keep marking in the activity list, while its brief explicitly recorded dense mobile rows as a risk. No project rule specifies whether an editing control should remain visible for every row. The convention evidence supports treating persistent controls and information hierarchy as separate factors, not treating the selector as the only possible cause.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: Activity rows combine a persistent fresh-wax editor with a distributed information hierarchy and omit the requested per-bike cumulative distance, so reducing the mark's prominence alone would leave the reported list-scanning and information-completeness concerns unresolved.

The original framing correctly identifies the fresh-wax control as a source of visual density: it is present even on unmarked rides. However, the user's clarified scope also includes every row's scanability and a missing bike-total value. The problem is therefore broader than fresh-wax visibility, but remains confined to activity-list presentation and the data needed to show that requested total.

## Confidence

- **MEDIUM** — direct code evidence supports both dimensions and user answers clarify the intended cumulative measure. The original framing is partly correct; project-local convention confirms the control was intentional but does not establish a default-visibility rule.

## What Changes for /10x-plan

Plan for the activity row as a whole: its persistent marking control, information hierarchy, and availability of bike-total distance. Do not frame the work as only hiding or restyling the fresh-wax mark; keep bike-total distance distinct from chain mileage since waxing.

## References

- Source files: `context/foundation/2dos.md:3-9`; `src/components/ActivityDashboard.tsx:488-533`; `src/lib/strava/activity-view.ts:17-27`; `src/pages/api/strava/activities.ts:35`; `context/archive/2026-10-23-assign-chain-and-mark-waxing/plan-brief.md:28,49`.
- Related research: none.
- Investigation tasks: two dimension-specific read-only subagent investigations and one independent cross-system read; task IDs were not exposed in this session.