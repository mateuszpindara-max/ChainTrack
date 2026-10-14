# Import and Browse Bike-Linked Strava Activities — Implementation Plan

## Overview

Implement S-01: let an authenticated user connect a Strava account, explicitly import the available activity history, and browse activities linked to a known bike. The plan starts with the user's Strava app and local secret setup because access is not ready and the user chose that setup as a prerequisite to implementation.

## Current State Analysis

- Supabase SSR auth and the authenticated-user middleware exist, but the client only reads `SUPABASE_URL` and `SUPABASE_KEY` in [src/lib/supabase.ts](../../../src/lib/supabase.ts); protected paths are maintained in [src/middleware.ts](../../../src/middleware.ts).
- [src/pages/dashboard.astro](../../../src/pages/dashboard.astro) is a placeholder. There is no Strava integration, bike/activity schema, migration, activity API, or activity list.
- [supabase/config.toml](../../../supabase/config.toml) enables migrations and seeding, but `schema_paths` is empty and the configured `seed.sql` is absent. Local migration verification needs to work without that missing seed file.
- The accepted S-01 contract is in [context/foundation/prd.md](../../foundation/prd.md) and [context/foundation/shape-notes.md](../../foundation/shape-notes.md): import bikes and all available history, preserve the source activity ID, show name/distance/date/bike newest-first, and skip activities without a clear bike while informing the user. Re-sync must not create duplicates.
- The [roadmap](../../foundation/roadmap.md) marks this slice blocked on Strava access and app configuration. The user confirmed access is not ready and selected user setup before implementation.
- The [deployment plan](../deployment/deployment-plan.md) says not to add a Supabase `service_role` key. Keep all Strava credentials in server-only environment configuration and encrypt OAuth tokens before storing them in the user's RLS-protected data.
- Strava's [authentication guide](https://developers.strava.com/docs/authentication/) documents OAuth authorization-code exchange, token expiry and rotating refresh tokens. The [API reference](https://developers.strava.com/docs/reference/) documents `activity:read_all` for private activities, `profile:read_all` for detailed athlete data including bikes, activity `gear_id`, and distance in meters.

## Desired End State

An authenticated user can connect Strava and then deliberately start the first full-history import from the dashboard. The dashboard lists activities newest-first with their name, distance, date, and matched bike. Activities without an unambiguous bike are not saved and are included in a visible skipped count.

The import is paginated and idempotent by Strava activity ID and application user. A failed import reports failure; a failure after successful pages preserves those rows, reports a partial result, and allows a safe retry. Strava access and refresh tokens remain encrypted at rest and never enter rendered HTML, browser responses, URLs, or logs.

### Key Discoveries:

- `src/lib/supabase.ts` creates a cookie-aware server client with the user's session; database rows must rely on RLS rather than a service-role client.
- `supabase/` has no application migration or RLS precedent. The first migration must establish ownership policies for every new table.
- Strava may rotate the refresh token during token refresh; persist the newest token with its expiry before using it for later calls.
- Strava permits `localhost` and `127.0.0.1` callback targets, so the user can prepare local OAuth before a production Worker URL exists.

## What We're NOT Doing

- Recurring/manual refresh of new activities after a completed initial import; that is S-02 (`refresh-activities-safely`). Retrying an incomplete first import remains in scope and must be idempotent.
- Chain creation, chain assignment, waxing records, or activity filters (S-03–S-05).
- Background synchronization, webhooks, multi-user product workflows, or admin roles.
- A Strava disconnect UI or a production deployment. The user may revoke access in Strava; deployment remains governed by the existing deployment workflow.
- Importing full Strava activity details, route/stream data, or fields not needed by S-01.

## Implementation Approach

After the user-owned access prerequisite is complete, add the first Supabase schema with per-user RLS and a unique `(user_id, strava_activity_id)` identity. Use the existing authenticated SSR client for database requests. Store OAuth token values only as versioned AES-GCM ciphertext, using a new server-only encryption secret; do not introduce `SUPABASE_SERVICE_ROLE_KEY`.

Implement a server-side OAuth authorization-code flow with validated state and the minimum required scopes (`activity:read_all`, `profile:read_all`). The dashboard shows connection state and a separate initial-import action. The import service fetches all pages, imports bikes, matches activities through `gear_id`, persists eligible rows page-by-page, and returns complete/partial/failed counts. Automated tests use fixtures and mocked HTTP; a real Strava account is used only in the human acceptance check.

## Critical Implementation Details

### OAuth and secret lifecycle

Use `GET /api/strava/connect`, `GET /api/strava/callback`, and authenticated `POST /api/strava/import`. Bind the OAuth callback to the signed-in application user, validate and consume a one-time `state` value, and reject authorization responses that do not grant both required scopes. Store access token, refresh token, expiry, athlete ID, and granted scopes in a user-owned connection row; encrypt token values with a fresh AES-GCM IV and keep the encryption key server-only. When Strava returns a rotated refresh token, atomically replace the old token and expiry before subsequent requests.

### Import and retry behavior

Follow Strava activity pagination to exhaustion. Persist each successful page using the stable Strava activity ID; on later-page failure, return an explicit partial result and preserve already saved rows. A retry starts the initial history import again and upserts by the unique source key, so it cannot duplicate activities. Do not add a button or job for routine post-import refresh.

## Phase 1: Strava access and local configuration

### Overview

The user completes the external prerequisite before implementation begins. The agent does not begin Phase 2 until the Strava app exists, local credentials are available, and the local callback is configured.

### Changes Required:

#### 1. Create and configure the Strava application

**Owner**: [CZŁOWIEK]

**Intent**: Establish real Strava API access for the account that will be used to validate S-01.

**Contract**: Register a Strava developer app, retain its Client ID and Client Secret privately, configure `localhost` as the local callback domain, and prepare the callback URL `http://localhost:4321/api/strava/callback`. The app must allow the requested `activity:read_all` and `profile:read_all` scopes. Do not send credentials or tokens in chat.

#### 2. Configure local server secrets

**Owner**: [CZŁOWIEK]

**Intent**: Make credentials available to local server code without tracking or exposing them.

**Contract**: Add `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI`, and a randomly generated 32-byte `STRAVA_TOKEN_ENCRYPTION_KEY`, represented as exactly 64 hexadecimal characters, to the ignored `.dev.vars` file. Keep the key available for recovery; losing it requires reconnecting Strava. Never add these values to tracked files, client code, logs, or the agent conversation.

### Success Criteria:

#### Automated Verification:

- `git check-ignore .dev.vars` confirms the local secrets file is ignored.

#### Manual Verification:

- [CZŁOWIEK] The Strava developer app exists, the target account is available for authorization, and the Client ID and Client Secret are stored privately.
- [CZŁOWIEK] `.dev.vars` contains the local callback and the required Strava/encryption values without exposing them in Git or chat.

**Implementation Note**: Stop after this prerequisite until the user confirms it is complete; no implementation begins before that confirmation.

## Phase 2: Owned data model and secure Strava connection

### Overview

Add the migration, ownership guarantees, token protection, OAuth routes, and server configuration needed to connect the signed-in ChainTrack user to Strava.

### Changes Required:

#### 1. Establish the local migration baseline

**File**: `supabase/config.toml`, `supabase/migrations/<timestamp>_create_activity_import_schema.sql`

**Intent**: Create a reproducible local schema for bikes, activities, and Strava connection state before adding API behavior.

**Contract**: Add tables keyed to the authenticated Supabase user, including a short-lived OAuth state table, a unique `(user_id, strava_activity_id)` activity constraint, bike-to-activity ownership-safe references, and RLS policies that prevent cross-user reads or writes. Store only a hash of each random OAuth state nonce, with its initiating user and expiry. Resolve the missing configured `seed.sql` so local `supabase db reset` can apply migrations without an absent seed file; do not add unrelated demo data.

#### 2. Add server-only OAuth and token protection

**File**: `astro.config.mjs`, `src/lib/strava/`, `src/pages/api/strava/`

**Intent**: Implement the browser redirect and callback while keeping Strava credentials and bearer tokens inside server code.

**Contract**: Declare the Strava client credentials, redirect URI, and encryption key as server-only environment fields. Validate the encryption key as exactly 64 hexadecimal characters and decode it to exactly 32 bytes before AES-GCM import. Add connect/callback handlers that require the ChainTrack user, validate OAuth state and granted scopes, exchange the one-use code, encrypt tokens with AES-GCM, and persist only ciphertext plus expiry/athlete/scope metadata through the user's RLS-scoped Supabase client. At connect, create a cryptographically random state nonce and store its hash, initiating user, and short expiry. At callback, require the same authenticated user and atomically delete the matching unexpired state row; accept the callback only if exactly one row was consumed. Refresh expired tokens server-side and persist the latest rotated refresh token. Do not add or use a Supabase service-role key.

#### 3. Document configuration and tests

**File**: `README.md`, `package.json`, `src/lib/strava/` tests

**Intent**: Make the new local setup reproducible and test security-sensitive behavior without calling Strava from CI.

**Contract**: Document required local/Worker secrets and callback configuration without example secret values. Add a built-in Node test command (or the established project test runner if one appears during implementation) for encryption, state validation, scope rejection, token refresh rotation, and missing configuration.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies the new migration locally without failing on the missing seed file.
- Automated database checks prove users can access only their own bikes, activities, OAuth state, and encrypted connection rows; token columns contain ciphertext rather than plaintext.
- OAuth and encryption tests cover expired, replayed, and mismatched-user state, denied/missing scopes, malformed encryption-key encoding, missing server configuration, and persisting the newest refresh token after rotation.
- A static configuration check confirms `SUPABASE_SERVICE_ROLE_KEY` is absent and all Strava variables are server-only.

#### Manual Verification:

- [CZŁOWIEK] Local secrets remain in ignored `.dev.vars`; none are requested in chat or printed in test/build output.

## Phase 3: Initial history import and activity list

### Overview

Import the user's bikes and all available history on an explicit user action, then show only activities whose bike can be matched unambiguously.

### Changes Required:

#### 1. Implement the paginated import service

**File**: `src/lib/strava/`, `src/pages/api/strava/import.ts`

**Intent**: Fetch Strava profile bikes and every activity page, then persist the smallest canonical record needed by S-01.

**Contract**: Use the authenticated token with the approved scopes. Normalize the source activity ID, name, distance in meters, start date, and bike `gear_id`; match `gear_id` to a bike from the authenticated athlete profile. Upsert bikes and eligible activities under the current application user. Skip missing/unmatched bike IDs and return inserted/updated/skipped counts plus a complete, partial, or failed outcome.

#### 2. Add the connect/import and activity-list UI

**File**: `src/pages/dashboard.astro`, `src/components/`

**Intent**: Replace the placeholder dashboard with the first usable activity workflow.

**Contract**: Show Strava connection status; present a distinct “Import activities” action after connection; show loading/submission feedback and complete, partial, failed, empty, and skipped-activity states. List activity name, distance in kilometers, local activity date, and bike newest-first. Do not add recurring refresh, chain controls, or filters.

#### 3. Cover pagination, matching, retries, and display

**File**: `src/lib/strava/` tests, dashboard/API tests

**Intent**: Prove the import contract against deterministic provider fixtures, including interrupted history imports.

**Contract**: Use mocked Strava responses and database fixtures; never require live Strava credentials in automated tests. Cover multi-page history, bike matches, missing/unmatched bikes, duplicate source IDs, a failure after one or more saved pages, safe retry, and newest-first presentation.

### Success Criteria:

#### Automated Verification:

- Mocked import tests fetch every page, match bikes by source ID, and exclude activities with missing or unmatched bike IDs while reporting their count.
- A repeated import and a retry after a later-page failure preserve saved rows without duplicate `(user_id, strava_activity_id)` records and return an explicit partial result.
- Dashboard/API tests verify the required activity fields, kilometer display, local date, and newest-first ordering.

#### Manual Verification:

- [AGENT AI] The dashboard has a separate initial-import action and clear connected, loading, empty, success, partial, failure, and skipped-activity states; routine refresh and S-02 controls are absent.

## Phase 4: End-to-end verification and user acceptance

### Overview

Run repository checks and verify the full authorization/import flow against the user's real Strava account, without deploying or changing production settings.

### Changes Required:

#### 1. Validate the local feature and auth regression surface

**File**: `package.json`, repository validation scripts

**Intent**: Gate completion on both the new behavior and the existing Astro/Supabase foundation.

**Contract**: Run the new test command, `npm run lint`, `npm run validate:config`, `npm run build`, and `npm run smoke` against a configured local Supabase preview. Automated tests remain mocked and do not contact Strava.

#### 2. Complete the real-account acceptance check

**Owner**: [WSPÓLNIE]

**Intent**: Confirm that the external credentials, callback, scopes, and actual Strava data satisfy S-01.

**Contract**: The user authorizes the app locally, grants both requested read scopes, starts the import from the dashboard, and compares the visible bikes and imported history with Strava. If an activity without a bike exists, confirm it is omitted and counted. If not, rely on the automated fixture for that branch. The user confirms no token appears in the URL, browser response, page source, Git status, or logs.

### Success Criteria:

#### Automated Verification:

- The new test command, `npm run lint`, `npm run validate:config`, `npm run build`, and `npm run smoke` pass in the configured local environment.

#### Manual Verification:

- [CZŁOWIEK] Real Strava authorization succeeds with both required scopes and the dashboard imports the available history, showing the expected bike-linked activities newest-first.
- [WSPÓLNIE] The visible skipped count matches the tested bike-less/unmatched case when present, and no Strava token or secret is exposed to browser output, URLs, Git, or logs.

## Testing Strategy

### Unit Tests:

- Use Node's built-in test runner for token encryption/decryption, fresh IVs, OAuth state validation, scope validation, and Strava response mapping.
- Stub `fetch` for authorization exchange, expired access token refresh, rotating refresh token, paginated activities, `401`, `403`, `429`, `5xx`, timeout, malformed response, and empty history.

### Integration Tests:

- Apply the schema with local Supabase and verify RLS using separate authenticated users; one user must not read or mutate another user's records.
- Exercise partial page persistence and retry against the local database with mocked provider responses.
- Keep Strava live calls out of CI and the existing smoke test.

### Manual Testing Steps:

1. Complete the Phase 1 Strava app and local secret checklist.
2. Sign in to ChainTrack, connect Strava, and grant `activity:read_all` plus `profile:read_all`.
3. Start the explicit initial import; compare bike names and representative activity names, dates, and distances with Strava.
4. Confirm newest-first ordering and the skipped count for activities with no matching bike, if the account has any.
5. Confirm credentials and tokens are absent from browser output, URLs, logs, and tracked files.

## Performance Considerations

The PRD targets one low-volume user, so a background job is not warranted for this slice. Fetch bounded pages sequentially and persist after each successful page. If Strava returns a rate-limit or transient error, stop rather than repeatedly retrying; return a partial/failed result and let the user retry safely.

## Migration Notes

This adds new tables; no existing application data needs conversion. Enable RLS and uniqueness in the migration before exposing reads/writes. The migration is additive; do not drop the new tables during rollback after real user data has been accepted. Local reset must not depend on the currently missing `supabase/seed.sql`.

## References

- Slice research: [research.md](research.md)
- Product requirements: [context/foundation/prd.md](../../foundation/prd.md)
- Resolved product decisions: [context/foundation/shape-notes.md](../../foundation/shape-notes.md)
- Roadmap and blocker: [context/foundation/roadmap.md](../../foundation/roadmap.md)
- Existing credential/deployment guardrails: [deployment-plan.md](../deployment/deployment-plan.md)
- Strava OAuth and token lifecycle: [Authentication](https://developers.strava.com/docs/authentication/)
- Strava API fields and endpoints: [API reference](https://developers.strava.com/docs/reference/)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Strava access and local configuration

#### Automated

- [x] 1.1 `git check-ignore .dev.vars` confirms the local secrets file is ignored. — 9718e02

#### Manual

- [x] 1.2 [CZŁOWIEK] The Strava developer app exists, the target account is available for authorization, and the Client ID and Client Secret are stored privately. — 9718e02
- [x] 1.3 [CZŁOWIEK] `.dev.vars` contains the local callback and the required Strava/encryption values without exposing them in Git or chat. — 9718e02

### Phase 2: Owned data model and secure Strava connection

#### Automated

- [x] 2.1 `npx supabase db reset` applies the new migration locally without failing on the missing seed file. — f091545
- [x] 2.2 Automated database checks prove users can access only their own bikes, activities, and encrypted connection rows; token columns contain ciphertext rather than plaintext. — f091545
- [x] 2.3 OAuth tests cover invalid state, denied/missing scopes, missing server configuration, and persisting the newest refresh token after rotation. — f091545
- [x] 2.4 A static configuration check confirms `SUPABASE_SERVICE_ROLE_KEY` is absent and all Strava variables are server-only. — f091545

#### Manual

- [x] 2.5 [CZŁOWIEK] Local secrets remain in ignored `.dev.vars`; none are requested in chat or printed in test/build output. — f091545

### Phase 3: Initial history import and activity list

#### Automated

- [x] 3.1 Mocked import tests fetch every page, match bikes by source ID, and exclude activities with missing or unmatched bike IDs while reporting their count. — 2890ed0
- [x] 3.2 A repeated import and a retry after a later-page failure preserve saved rows without duplicate `(user_id, strava_activity_id)` records and return an explicit partial result. — 2890ed0
- [x] 3.3 Dashboard/API tests verify the required activity fields, kilometer display, local date, and newest-first ordering. — 2890ed0

#### Manual

- [x] 3.4 [AGENT AI] The dashboard has a separate initial-import action and clear connected, loading, empty, success, partial, failure, and skipped-activity states; routine refresh and S-02 controls are absent. — 2890ed0

### Phase 4: End-to-end verification and user acceptance

#### Automated

- [x] 4.1 The new test command, `npm run lint`, `npm run validate:config`, `npm run build`, and `npm run smoke` pass in the configured local environment. — 0f0f627

#### Manual

- [x] 4.2 [CZŁOWIEK] Real Strava authorization succeeds with both required scopes and the dashboard imports the available history, showing the expected bike-linked activities newest-first. — 0f0f627
- [x] 4.3 [WSPÓLNIE] The visible skipped count matches the tested bike-less/unmatched case when present, and no Strava token or secret is exposed to browser output, URLs, Git, or logs. — 0f0f627
