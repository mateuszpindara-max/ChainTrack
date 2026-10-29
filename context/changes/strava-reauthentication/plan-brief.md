# Strava Reauthentication — Plan Brief

> Full plan: `context/changes/strava-reauthentication/plan.md`

## What & Why

Add a way to reauthorize Strava after a recognized authorization failure and after the specifically selected synchronization invalid-response message. The existing OAuth flow can replace credentials for the same Strava athlete, but the connected dashboard currently offers no recovery action and callback failures do not return with a dashboard status.

## Starting Point

`/api/strava/connect` already starts authenticated OAuth, and the callback enforces the existing athlete binding before saving tokens. Token persistence does not overwrite import-progress fields; the missing pieces are clear callback outcomes, distinguishing recovery cases, and a contextual dashboard action.

## Desired End State

The dashboard offers reauthorization for the agreed error cases and explains success, cancellation, or failure without exposing OAuth values. Reconnecting the same athlete updates credentials while preserving local activities, chain links, import progress, and sync-run state. Switching to another athlete remains blocked.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Complexity and interview budget | LOW; six substantive questions total | Existing OAuth and token persistence cover the core operation; only the UX trigger and error handling needed user decisions | Plan |
| When to offer reauthorization | After a recognized Strava authorization failure, and after the exact `The Strava synchronization returned an invalid response.` message | The user wants a recovery action for both; the malformed-response case is intentionally included even though OAuth may not fix it | Plan |
| Existing data and progress | Preserve them | Reauthorization should refresh credentials, not restart or delete the user's history | Plan |
| Athlete identity | Same athlete only | Prevents attaching existing history and sync state to a different Strava account | Plan |
| Callback failure and cancellation | Return to dashboard with safe status and retry path | Keeps the user in the app and makes the outcome recoverable | Plan |
| Existing OAuth integration | Reuse `/api/strava/connect` and its callback | Avoids duplicating security-sensitive OAuth state and callback logic | Research / Plan |

## Scope

**In scope:** distinguish authorization failures; provide allowlisted callback outcomes; add a contextual dashboard reauthorization action; test same-athlete enforcement, status handling, and preservation of history/progress.

**Out of scope:** athlete switching, deleting or rebuilding history, schema migrations, additional secrets/scopes, background refresh, blanket reauthorization after unrelated errors, production configuration changes, and deployment.

## Architecture / Approach

Keep the current authenticated OAuth entry point and callback. The sync/import APIs expose a safe recovery signal for authorization failures; the dashboard also recognizes the exact selected invalid-response message. Callback completion, cancellation, and failure return through allowlisted dashboard statuses. Token updates remain scoped to the current user and same athlete.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Define Reauthorization Outcomes | Safe authorization/error distinction, dashboard-return statuses, and regression coverage for identity and data preservation | Misclassifying unrelated provider errors as authorization failures |
| 2. Expose Recovery in the Dashboard | Contextual reauthorization action, success/cancel/failure feedback, and end-to-end regression checks | OAuth may not resolve the explicitly included invalid-response case |

**Prerequisites:** Existing Strava OAuth configuration and a signed-in test account; no production access or migration is required.
**Estimated effort:** One focused implementation and verification session, subject to availability of a test account for manual OAuth verification.

## Open Risks & Assumptions

- The selected invalid-response message is caused by client-side response validation; reauthorizing may not correct the underlying malformed response. It remains an explicit user-approved trigger.
- Manual confirmation of provider denial/cancellation and real OAuth return behavior needs a Strava test account and working local configuration.
- “Preserve progress” includes the existing initial-import cursor/completion and active sync-run data; the implementation must not reset or delete them.

## Success Criteria (Summary)

- The dashboard offers reauthorization for the two agreed triggers, not for unrelated network/provider errors.
- Same-athlete reauthorization updates credentials without losing activities, chain links, import progress, or sync state; another athlete remains rejected.
- OAuth success, cancellation, and failure return safe, understandable statuses with a retry path and no sensitive callback data exposed.
