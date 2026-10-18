# Frame Brief: Post-Import Strava Activity Synchronization and Reconciliation

> Framing step before /10x-plan. This document captures what is actually at issue, separated from the initial assumption.

## Reported Observation

> Po udanym initial imporcie użytkownik nie może pobrać nowych aktywności ani poprawić lokalnych danych po zmianie aktywności w Stravie; powinien móc importować tylko nowe aktywności oraz naprawić dane zmienione w Stravie, w tym przypisanie roweru.

## Initial Framing (preserved)

- **User's stated cause or approach**: Po udanym imporcie blokada ponownego pobierania ma zapobiegać ponownemu pobraniu całej historii.
- **User's proposed direction**: Obsłużyć dwa przypadki: import tylko nowych aktywności oraz naprawę aktywności, której dane w Stravie zostały zmienione.
- **Pre-dispatch narrowing**: Oba przypadki są równie ważne. Naprawa ma odświeżyć wszystkie pola już przechowywane przez ChainTrack i przypisanie roweru; ma obejmować usunięcia ze Stravy oraz aktywności w dowolnym wieku. „Nowa” oznacza rekord nowo widoczny w Stravie także wtedy, gdy jego data jazdy jest stara. Naprawa ma objąć całą historię. Aktywność usunięta w Stravie ma zniknąć z listy ChainTrack.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Import lifecycle** — the completed initial-import marker may be acting as a permanent prohibition on all subsequent synchronization.
2. **Provider discovery semantics** — activity-date filters may not identify records newly appearing with an old start date.
3. **Local reconciliation** — upserts can refresh encountered rows, but skipped records and provider deletions may have no reconciliation state.
4. **Provider event coverage** — notifications may cover some creates, updates, and deletes, but not every field required by historical repair.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| The initial-import lifecycle is the only supported import path | `src/pages/api/strava/import.ts` returns 409 after `initial_import_completed_at`; `src/components/ActivityDashboard.tsx` replaces the action with “Initial import complete.” | STRONG |
| Activity-date filtering can discover every newly visible record | Strava's List Athlete Activities reference defines `after`/`before` as filters on when an activity took place; it documents page-number pagination, not a creation/update cursor. This cannot identify a newly visible record whose ride date is old. | STRONG |
| Existing writes reconcile all local/provider state | `src/pages/api/strava/import.ts` upserts encountered eligible rows; `src/lib/strava/import.ts` skips missing/ambiguous bike associations without retaining skipped IDs; no inspected route removes locally stored rows absent from Strava. | STRONG |
| Strava webhooks alone cover the requested sync behavior | Official Webhook Events documentation includes create/delete and update notifications for title, type, and privacy; gear assignment is not among the documented update fields. No webhook subscription or callback exists in this repository. | NONE as a complete explanation or solution; partial provider coverage exists |

## Narrowing Signals

- Both post-import scenarios have equal priority.
- A newly visible activity counts as new even when its start date predates the last sync.
- Historical repair is a whole-history operation, not limited to the selected activity or a recent window.
- Repair refreshes the fields ChainTrack currently persists plus bike assignment.
- A Strava-deleted activity should no longer appear in ChainTrack's list.

## Cross-System Convention

The repository has no post-import synchronization or reconciliation pattern to reuse. Strava documents both date-filtered activity listing and webhooks. Its webhook contract is partial for this need: create/delete events are available, while documented activity updates cover title, type, and privacy, not gear assignment. Strava retries an unacknowledged event up to three total attempts and documents one subscription per application; the docs do not establish a replayable, durable change log. Neither the existing date cursor nor webhook coverage alone establishes the requested complete behavior.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: ChainTrack has a one-time import lifecycle but the user needs two distinct post-import outcomes—discover every newly visible Strava activity regardless of its start date, and reconcile the complete historical set so current persisted fields, bike links, and deletions match Strava.

The completion marker currently closes the only import route, while the page cursor and Strava's activity-date filter do not represent newly appearing records or arbitrary historical edits. Upserts can refresh rows only when encountered, skipped activities are not retained for targeted follow-up, and no provider-deletion reconciliation exists. The plan must preserve the distinction between new-record discovery and whole-history repair, while defining safe completion and removal behavior.

## Confidence

- **HIGH** — code paths directly confirm the permanent post-import gate and upsert/skip-only behavior; the user clarified the required age, data, and deletion boundaries; official provider documentation and an independent code review confirm the discovery limits.

## What Changes for /10x-plan

Plan S-02 as a post-import synchronization capability with two separately understood outcomes: importing records newly visible in Strava, including old-dated late appearances, and reconciling all historical persisted activity fields and deletions. The plan must account for the documented limits of date filters and webhook update fields rather than assuming either alone satisfies the contract.

## References

- Source files: `src/pages/api/strava/import.ts`; `src/lib/strava/import.ts`; `src/components/ActivityDashboard.tsx`; `supabase/migrations/20261014140000_add_strava_initial_import_completion.sql`
- Product and roadmap: `context/foundation/prd.md` (FR-003); `context/foundation/roadmap.md` (S-02); `context/foundation/shape-notes.md`
- Prior implementation review: `context/changes/import-bike-linked-activities/reviews/impl-review.md`
- Strava List Athlete Activities: https://developers.strava.com/docs/reference/#api-Activities-getLoggedInAthleteActivities
- Strava Webhook Events: https://developers.strava.com/docs/webhooks/
- Investigation tasks: two read-only agents independently traced provider pagination and local reconciliation; official Strava API reference and webhook documentation were checked.