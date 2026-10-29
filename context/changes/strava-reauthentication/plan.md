# Add Strava Reauthentication Option — Implementation Plan

## Overview

Add a way for a signed-in user to reauthorize Strava after an authorization failure, and after the specifically selected synchronization invalid-response message. Reuse the existing OAuth flow, preserve local history and import progress, and keep the existing same-athlete restriction.

## Current State Analysis

- `src/components/ActivityDashboard.tsx` shows a connect link only when the connection is absent. A connected user has no reauthorization action. Synchronization errors are rendered as ordinary result messages; the invalid-response message is created client-side when the response fails validation.
- `src/pages/api/strava/connect.ts` already starts authenticated OAuth, stores a one-use state, and requests the required scopes.
- `src/pages/api/strava/callback.ts` validates the callback and scopes, rejects a different athlete, and redirects successful authorization to `/dashboard?strava=connected`.
- `src/lib/strava/server.ts` upserts encrypted tokens and scopes without including initial-import progress fields in the update. The callback therefore has an existing path to rotate credentials without resetting local history or progress.
- Current callback denial, invalid state, provider, and persistence failures return raw HTTP error responses rather than returning the user to the dashboard with a status.
- Strava tests use Node's built-in test runner (`npm test`); dashboard and API callback do not have a dedicated component or route test harness.

## Desired End State

When a synchronization response indicates an authorization failure, or the dashboard encounters the exact selected invalid-response message, the user can start Strava authorization again from the dashboard. A successful callback refreshes credentials for the same athlete and returns to a clear success status; cancellation or failure returns to the dashboard with a safe status and retry path. Existing activities, chain links, import progress, and sync-run state remain unchanged, and a different athlete is still rejected.

### Key Discoveries:

- `src/pages/api/strava/connect.ts` is the established OAuth entry point and already binds authorization state to the signed-in user.
- `src/pages/api/strava/callback.ts` already enforces athlete identity with `canReconnectStravaAthlete` before saving new tokens.
- `src/lib/strava/server.ts` saves token and scope fields without resetting import progress; no schema change is indicated.
- The exact UI message `The Strava synchronization returned an invalid response.` is produced in `src/components/ActivityDashboard.tsx`; the user explicitly chose it as an additional reauthorization trigger despite the possibility that OAuth will not fix a malformed response.
- `package.json` defines `npm test`, `npm run check`, and `npm run lint` as available verification commands.

## What We're NOT Doing

- Allowing a different Strava athlete to take over an existing local history.
- Deleting or rebuilding activities, chain assignments, initial-import progress, or sync runs.
- Adding a new database table, migration, secret, scope, or background refresh mechanism.
- Treating every network, provider, rate-limit, or application error as an authorization failure.
- Changing the behavior of the separate production Supabase status diagnosis.
- Deploying or changing production Strava configuration as part of this implementation.

## Implementation Approach

Keep the existing authorization start and token persistence paths. Make authorization failure distinguishable from unrelated synchronization failures, return callback outcomes to the dashboard using a safe status (never OAuth codes, state, or tokens), and expose a reauthorization action only for the agreed cases. Preserve the existing same-athlete guard and verify that both successful and unsuccessful reauthorization leave local activity and import state intact.

## Phase 1: Define Reauthorization Outcomes

### Overview

Establish a safe and explicit contract for recognized Strava authorization failures and callback results, reusing the existing OAuth routes and preserving the same-athlete invariant.

### Changes Required:

#### 1. Classify authorization outcomes and callback return status

**File**: `src/pages/api/strava/sync.ts`, `src/pages/api/strava/import.ts`, `src/pages/api/strava/callback.ts`, `src/lib/strava/sync-contract.ts`

**Intent**: Distinguish provider authorization rejection from unrelated sync/import failures so the dashboard can offer the agreed recovery action. Return callback denial and failure to the dashboard with a safe, allowlisted status; successful callback continues to report success.

**Contract**: Response/status fields must not include provider payloads, OAuth `code`/`state`, access or refresh tokens, or secret values. Keep the existing authenticated user binding, one-use OAuth state, required scopes, and same-athlete rejection. Include the exact invalid-response message as a separate user-selected dashboard trigger rather than classifying malformed API data as proof of an authorization failure.

#### 2. Add focused regression coverage for outcomes and preservation

**File**: `src/lib/strava/security.test.ts`, relevant Strava tests under `src/lib/strava/`, and focused tests for extracted response/status logic if needed

**Intent**: Verify the authorization-versus-other-error contract, callback outcomes, and the invariant that reauthorization cannot switch athletes or reset local import progress.

**Contract**: Tests use the existing Node test runner and must cover same-athlete success, different-athlete rejection, denied/missing-scope return status, and preservation of history/progress fields. Keep test fixtures free of real tokens and secrets.

### Success Criteria:

#### Automated Verification:

- `npm test` passes with focused regression coverage for authorization outcomes, callback status mapping, same-athlete enforcement, and preserved import progress.
- `npm run check` passes after the response/status contract changes.

#### Manual Verification:

- A reviewer confirms callback-returned statuses are allowlisted and do not expose OAuth query values, provider payloads, tokens, or secrets.
- A reviewer confirms a different Strava athlete remains blocked before any connection update.

**Implementation Note**: Pause after Phase 1 for human review of the error/status contract before wiring the dashboard action.

## Phase 2: Expose Recovery in the Dashboard

### Overview

Show the reauthorization action for a recognized authorization failure and for the exact selected invalid-response message, then make callback success, cancellation, and failure understandable and retryable from the dashboard.

### Changes Required:

#### 1. Add contextual reauthorization action and callback feedback

**File**: `src/components/ActivityDashboard.tsx`, `src/pages/dashboard.astro`

**Intent**: Provide a clear action to repeat Strava OAuth only after the agreed triggers, while retaining the existing initial-connect action for users without a connection. Display safe callback outcomes on the dashboard and preserve the current synchronization result context where applicable.

**Contract**: Reuse `/api/strava/connect`; do not create a second OAuth endpoint. The recovery action is available after a recognized authorization failure or the exact `The Strava synchronization returned an invalid response.` message. Success, cancellation, and failure statuses must be allowlisted, presented without sensitive URL values, and allow retry after a failed/cancelled attempt.

#### 2. Verify dashboard flow and data preservation

**File**: `src/components/ActivityDashboard.tsx` and focused tests for any extracted dashboard decision logic

**Intent**: Cover when the action is visible and verify that a successful reconnect returns the user to the connected dashboard without discarding existing data or progress.

**Contract**: No reauthorization action for unrelated network/provider errors; no visible action is required merely because the connection is already healthy. After same-athlete reauthorization, existing activities, chain associations, initial-import progress, and sync-run state remain intact. A different athlete continues to receive a safe failure status.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, including focused checks that the recovery action is enabled for only the two agreed triggers and is absent for unrelated errors.
- `npm run check` and `npm run lint` pass.
- `git diff --check` reports no whitespace errors, and the change introduces no database migration or secret-bearing value.

#### Manual Verification:

- From a connected dashboard, simulate an authorization failure and confirm the reauthorization action and safe recovery message appear.
- Confirm the exact selected invalid-response message also offers reauthorization, while an unrelated network or provider failure does not.
- Complete OAuth for the same athlete and confirm the dashboard reports success and existing activities, chain assignments, import progress, and sync state remain present.
- Cancel or deny OAuth and confirm the user returns to the dashboard with a safe status and can retry.
- Attempt authorization for a different athlete and confirm it is rejected without changing the existing connection or history.

## Testing Strategy

### Unit Tests:

- Test allowlisted callback result/status mapping for success, denial/cancellation, and failure.
- Test the response classification that exposes reauthorization only for an authorization failure and the explicitly selected invalid-response message.
- Retain and exercise same-athlete acceptance and different-athlete rejection.
- Verify token reauthorization updates do not reset import progress or local history-related state.

### Integration Tests:

- Use focused route-level tests or extracted pure decision helpers with mocked Supabase and provider responses; do not make real Strava requests.
- Run `npm test`, `npm run check`, and `npm run lint`.

### Manual Testing Steps:

1. On a connected account, trigger an authorization failure and confirm the dashboard exposes the reauthorization action.
2. Trigger the exact invalid-response message and an unrelated network/provider failure; confirm only the agreed cases show the action.
3. Reauthorize the same athlete, then cancel/deny once; verify success and retry feedback, and check that local activities, chain links, and import/sync progress remain unchanged.
4. Attempt a different athlete and confirm the existing connection remains unchanged.

## Performance Considerations

The change reuses the existing redirect-based OAuth flow and adds no polling, background work, or additional routine dashboard queries. Error classification must not add provider calls to dashboard rendering.

## Migration Notes

No database migration is expected. Existing OAuth state and connection tables are reused; the implementation must preserve existing connection and import-progress fields.

## References

- `src/components/ActivityDashboard.tsx` — existing connect action, synchronization result handling, and invalid-response message.
- `src/pages/api/strava/connect.ts` — authenticated OAuth initiation and one-use state creation.
- `src/pages/api/strava/callback.ts` — callback validation, athlete binding, token save, and current success redirect.
- `src/lib/strava/server.ts` — encrypted token persistence without import-progress fields.
- `src/lib/strava/security.ts` and `src/lib/strava/security.test.ts` — required scopes, state validation, and athlete-reconnect rule.
- `package.json` — test, check, and lint commands.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Define Reauthorization Outcomes

#### Automated

- [x] 1.1 `npm test` passes with focused regression coverage for authorization outcomes, callback status mapping, same-athlete enforcement, and preserved import progress. — 361def1
- [x] 1.2 `npm run check` passes after the response/status contract changes. — 361def1

#### Manual

- [x] 1.3 A reviewer confirms callback-returned statuses are allowlisted and do not expose OAuth query values, provider payloads, tokens, or secrets. — 361def1
- [x] 1.4 A reviewer confirms a different Strava athlete remains blocked before any connection update. — 361def1

### Phase 2: Expose Recovery in the Dashboard

#### Automated

- [x] 2.1 `npm test` passes, including focused checks that the recovery action is enabled for only the two agreed triggers and is absent for unrelated errors.
- [x] 2.2 `npm run check` and `npm run lint` pass.
- [x] 2.3 `git diff --check` reports no whitespace errors, and the change introduces no database migration or secret-bearing value.

#### Manual

- [x] 2.4 From a connected dashboard, simulate an authorization failure and confirm the reauthorization action and safe recovery message appear.
- [x] 2.5 Confirm the exact selected invalid-response message also offers reauthorization, while an unrelated network or provider failure does not.
- [x] 2.6 Complete OAuth for the same athlete and confirm the dashboard reports success and existing activities, chain assignments, import progress, and sync state remain present.
- [x] 2.7 Cancel or deny OAuth and confirm the user returns to the dashboard with a safe status and can retry.
- [x] 2.8 Attempt authorization for a different athlete and confirm it is rejected without changing the existing connection or history.
