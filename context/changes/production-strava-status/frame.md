# Frame Brief: Production Strava Status

> Framing step before /10x-plan. This document captures what is actually at issue, separated from what was initially assumed.

## Reported Observation

> "obecnie wszystko ladnie dziala na localhoscie, ale na proukcji pojwaia sie info ze nie moze sprawdzic statusu synchronizacji."

User clarification: the dashboard displays `Connection status unavailable`; the Strava account connection has not succeeded. The issue was present on the first production run. Whether bikes, chains, or activities load correctly has not been checked.

## Initial Framing (preserved)

- **User's stated cause or approach**: "perwnie musimy uspojnic bazy, sprawdzic sekrreety, ustawienia po stronie strava api"
- **User's proposed direction**: "wdrazamy wszystko na produkcje. [...] przeprowadz mnie przez to"
- **Pre-dispatch narrowing**: Initially selected the full 2dos list as the rollout scope, then confirmed investigating only the production status symptom first; UI, Chains, and Bikes remain separate topics. Chose the dashboard's `Connection status unavailable` label, reported that Strava connection did not succeed, and said other dashboard data was not checked. Reported that the symptom existed from the first production run.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Dashboard connection lookup** — the authenticated query against `strava_connections` returns a database error, which directly maps to the displayed unavailable state.
2. **Production Supabase schema or access policy** — the production project may lack the expected table/column or authenticated read policy; local migrations define these, but repository files do not establish production migration state.
3. **Worker-to-Supabase runtime configuration or project identity** — production values may point at a different project or may not allow the same authenticated query. Strava OAuth settings alone do not explain this dashboard label if the connection lookup succeeds.
4. **Strava OAuth connection setup** — redirect, client configuration, scopes, or provider exchange may prevent creating a connection row, but a successful lookup with no row should display `Not connected`, not `Connection status unavailable`.

The user's initial framing spans dimensions 2–4; the literal dashboard state lands first at dimension 1.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Dashboard's `strava_connections` lookup is failing | `src/pages/dashboard.astro` initializes the state as `unavailable`, sets `not-connected` only when `maybeSingle()` succeeds with no row, and keeps `unavailable` on `connectionError`. `src/components/ActivityDashboard.tsx` renders that state as `Connection status unavailable`. | STRONG for the immediate code path; production cause unknown |
| Production schema/migrations/RLS differ from local | `supabase/migrations/20261009000000_create_activity_import_schema.sql` creates `strava_connections` with an authenticated-user RLS policy. Later migrations add import and sync state. The deployment runbook still lists production Supabase setup as a human step; no production migration state was available. | WEAK; plausible, unverified |
| Worker environment points at the wrong/incomplete Supabase project | `src/lib/supabase.ts` constructs the database client from server-only `SUPABASE_URL` and `SUPABASE_KEY`. The deployment runbook requires these Worker values, but their deployed values and project identity cannot be inspected from repository evidence. | WEAK; plausible, unverified |
| Strava client configuration is the direct cause of the displayed dashboard state | Strava configuration is checked during OAuth in `src/pages/api/strava/connect.ts` and token use in `src/lib/strava/server.ts`. A successful dashboard connection-row query with no row takes the `not-connected` branch instead. | NONE for this exact dashboard label; may separately explain failed OAuth |
| Active sync-run query is the source of the dashboard label | `src/pages/dashboard.astro` handles active-run errors separately and leaves `connectionStatus` unchanged. The POST sync endpoint has a different error, `Could not check saved synchronization progress`, in `src/pages/api/strava/sync.ts`. | NONE for the confirmed dashboard label |

## Narrowing Signals

- The user confirmed the exact dashboard state is `Connection status unavailable`, rather than the POST endpoint's saved-progress error.
- The user has not succeeded in connecting Strava; this is consistent with a failed OAuth setup but does not by itself explain why the dashboard connection-row lookup errors.
- The dashboard's code distinguishes a database error from an absent connection row. If the query succeeds with no row, the UI says `Not connected`.
- The issue was present at first production use. The user's hypothesis that migrations/configuration may be inconsistent remains possible, but no production log, query error, or migration history was supplied.
- The remaining UI, Chains, and Bikes requests are product changes, not evidence for the production status symptom; the existing deployment runbook is a separate rollout artifact.

## Cross-System Convention

This dashboard treats a failed database lookup as `unavailable` and a successful lookup with no connection row as `not-connected`. The runbook in `context/changes/deployment/deployment-plan.md` keeps production Supabase, Worker secrets, Strava callback configuration, and deploy verification as explicit separate checks. That supports checking the actual failing boundary before changing Strava settings or applying migrations. Production logs and Supabase migration status are not present in the repository.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: identify why the authenticated production dashboard cannot successfully read the user's Strava connection record from its configured Supabase project.

The visible dashboard message points to the connection lookup error path, not directly to an absent Strava connection. A successful lookup with no row would be rendered as `Not connected`. Production schema/RLS, Worker project configuration, and a transient database/API error remain plausible origins; the failed OAuth connection may also be a separate issue. The UI, Chains, and Bikes changes should not be folded into this diagnosis.

## Confidence

- **MEDIUM** — the immediate failing code path is clear, and the user confirmed the exact label; the underlying production error is unavailable, so its root cause is not established.
- Before `/10x-plan`, verify whether dashboard bikes/chains load and obtain the sanitized error/status for the `strava_connections` request from the Worker/Supabase logs. Compare production migration history and project identity without sharing secret values. If the `strava_connections` query succeeds, revisit the exact message and request that produced it.

## What Changes for /10x-plan

Plan diagnosis of the production `strava_connections` read and its environment/database prerequisites, not a blanket update of all secrets or Strava settings. Keep successful lookup with no row (OAuth not yet connected) distinct from lookup failure; plan any UI/Chains/Bikes work separately.

## References

- Source files: `src/pages/dashboard.astro` (connection lookup and active-run lookup); `src/components/ActivityDashboard.tsx` (displayed label); `src/lib/supabase.ts` and `astro.config.mjs` (server configuration); `src/pages/api/strava/connect.ts` and `src/lib/strava/server.ts` (OAuth configuration); `src/pages/api/strava/sync.ts` (distinct sync endpoint error).
- Database: `supabase/migrations/20261009000000_create_activity_import_schema.sql`; `supabase/migrations/20261016120000_add_strava_sync_runs.sql`.
- Deployment context: `context/changes/deployment/deployment-plan.md`, sections "Etap 6: Supabase i sekrety aplikacji", "Etap 8: pierwszy deploy, test produkcyjny i rollback", and "Integracja Strava".
- Related scope: `context/foundation/2dos.md`.
- Investigation tasks: sync-status path trace; planned-work dependency check; production schema/RLS hypothesis; Worker configuration hypothesis; independent symptom-path check.