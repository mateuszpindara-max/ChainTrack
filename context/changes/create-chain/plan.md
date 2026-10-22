# Create a Chain Implementation Plan

## Overview

Add chain management for a signed-in user (roadmap S-03, FR-004): a protected `/chains` page where the user creates, lists, edits and deletes their own chains. A chain has a name and an optional starting mileage. This is the only new persisted entity; assignment to activities, waxing and filtering belong to S-04 and S-05.

## Current State Analysis

- No chain concept exists in `src/` or `supabase/migrations/`. The only mention of "chain" in code is the product label in `src/components/ActivityDashboard.tsx:175`.
- Per-user tables already follow one shape: `user_id` FK to `auth.users` with `on delete cascade`, an RLS policy `auth.uid() = user_id` for `authenticated`, explicit grants, and a `unique (user_id, id)` constraint so later tables can use composite FKs (`supabase/migrations/20261009000000_create_activity_import_schema.sql:1-55`).
- API routes export `prerender = false`, read `context.locals.user`, build a Supabase client with `createClient`, return 401 JSON when unauthenticated, and validate input by hand (`src/pages/api/strava/activities.ts:7-41`). `zod` is mentioned in `CLAUDE.md` but is not in `package.json`, so validation stays hand-written.
- The dashboard loads data server-side in the Astro page and hands it to a React island, which then fetches further pages (`src/pages/dashboard.astro`, `src/components/ActivityDashboard.tsx`).
- `/dashboard` is protected through `PROTECTED_ROUTES` in `src/middleware.ts:4`.
- RLS is verified with pgTAP in `supabase/tests/database/strava_rls.test.sql`; unit tests run with `node --test` over `src/lib/strava/*.test.ts` only (`package.json` `test` script).
- Lesson in `context/foundation/lessons.md`: Supabase reads that can exceed `max_rows` (1,000) must be paginated.

## Desired End State

A signed-in user opens `/chains` and can:

- create a chain by entering a name and, optionally, starting kilometers already on the chain;
- see only their own chains, newest first;
- edit a chain's name and starting kilometers;
- delete a chain after an explicit confirmation.

Two chains of the same user cannot share a name, ignoring case and leading/trailing whitespace. Another user's chains are never visible or modifiable. Verified by `npx supabase test db`, `npm test`, `npm run lint`, `npm run check`, `npm run build`, and the manual steps below.

### Key Discoveries:

- `bikes` already uses `unique (user_id, id)` for composite FKs (`20261009000000_create_activity_import_schema.sql:8`); `chains` repeats it so S-04 can reference chains the same way.
- Distances are stored as `distance_meters` and rendered with one decimal by `formatDistanceKm` (`src/lib/strava/activity-view.ts`); chain mileage reuses the same unit and formatter.
- The activities list uses limit+1 offset pagination (`activities.ts:19-30`); the chain list mirrors it to honor the pagination lesson.
- Astro's default origin check covers form-type POSTs only; JSON endpoints still must reject non-JSON bodies.

## What We're NOT Doing

- Assigning a chain to an activity, marking waxing, or filtering by chain (S-04, S-05).
- Chain lifecycle (active/stopped/reattach), current-mileage-since-wax, wax counts or averages (deferred; PRD non-goals).
- Linking a chain to a bike.
- Soft delete or archive.
- Automatic chain assignment.
- Adding `zod` or another validation dependency.
- Treating starting kilometers as "since last wax": it is lifetime total mileage only; distance since the last wax begins at zero.

## Implementation Approach

Build bottom-up so each layer is verifiable alone: the database enforces ownership, name uniqueness and value ranges; a pure TypeScript module owns parsing and validation so client and server share one rule set and it can be unit-tested; thin API routes map validation and database errors to HTTP responses; the page is a server-loaded Astro page with one React island. The database is the authority for uniqueness (unique index, error code `23505` mapped to 409), not a read-then-write check.

Decided values:

- **Name**: trimmed, 1-60 characters. Uniqueness key is `(user_id, lower(name))`.
- **Starting km**: optional; blank means 0; non-negative; at most one decimal place; at most 100,000 km; stored as `starting_distance_meters`.
- **Duplicate**: same user, same name ignoring case; renaming a chain to a different casing of its own name is allowed.
- **Edit**: full replacement of name and starting km using the create rules.
- **Delete**: hard delete after an inline confirmation step.
- **List order**: `created_at desc, id desc`, page size 100, `hasMore` via limit+1.

---

## Phase 1: Chains table and row-level security

### Overview

Introduce the `chains` table with ownership isolation, constraints and tests, so later phases can rely on the database for correctness.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261022120000_create_chains.sql`

**Intent**: Create `public.chains` owned by a user, with RLS and grants matching the existing per-user tables, and enforce name and mileage rules in the database.

**Contract**: Columns `id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `name text not null`, `starting_distance_meters double precision not null default 0`, `created_at timestamptz not null default now()`. Constraints: `name = btrim(name)` and `char_length(name) between 1 and 60`; `starting_distance_meters` between 0 and 100,000,000; `unique (user_id, id)`; unique index on `(user_id, lower(name))`. RLS enabled; one `for all to authenticated` policy using `auth.uid() = user_id` for both `using` and `with check`; `grant select, insert, update, delete` to `authenticated`.

#### 2. RLS and constraint test

**File**: `supabase/tests/database/chains_rls.test.sql`

**Intent**: Prove isolation and the constraints, following the structure of `strava_rls.test.sql`.

**Contract**: pgTAP script in a transaction with two users. Covers: each user reads only their own chains; inserting for another user fails with `42501`; updating or deleting another user's chain affects zero rows; same user cannot insert the same name in a different case (`23505`); a second user can reuse that name; blank, untrimmed, 61-character, negative and above-cap values are rejected (`23514`); 60-character name and boundary mileage values are accepted.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset`
- Database tests pass, including the new file: `npx supabase test db`

#### Manual Verification:

- In local Supabase Studio, the `chains` table shows RLS enabled with the single policy and the unique `(user_id, lower(name))` index.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Validation module and chain API

### Overview

Add the shared validation and view logic, the API endpoints, and unit tests, with all inputs validated server-side.

### Changes Required:

#### 1. Chain domain module

**File**: `src/lib/chains/chain.ts`

**Intent**: One place for turning raw input into a valid chain payload and a database row into a view, usable from the API and the React island.

**Contract**: Exports a parse function taking unknown `{ name, startingKm }` and returning either `{ name, startingDistanceMeters }` or per-field error messages; a `ChainView` type `{ id, name, startingDistanceMeters, createdAt }`; a row-to-view mapper; a km-to-meters conversion that rounds to whole meters to avoid floating-point drift (for example 12.3 km becomes 12,300 m). Name rules: string, trimmed, 1-60 characters. Km rules: blank, `null` or missing means 0; accepts a number or numeric string; rejects negatives, non-finite values, values above 100,000, and more than one decimal place. Reuse `formatDistanceKm` from `src/lib/strava/activity-view.ts` for display instead of adding a new formatter.

#### 2. Database typing

**File**: `src/lib/chains/database.ts`

**Intent**: Typed table definition for `chains` so API and page queries are type-checked without touching the Strava-specific database type.

**Contract**: A `ChainsDatabase` type with the `chains` Row/Insert/Update shapes in the same style as `StravaSyncDatabase` (`src/lib/strava/sync-database.ts`); consumers cast the Supabase client as `dashboard.astro` does.

#### 3. Collection endpoint

**File**: `src/pages/api/chains/index.ts`

**Intent**: List and create the caller's chains.

**Contract**: `export const prerender = false`. `GET ?offset=` returns `{ chains: ChainView[], hasMore: boolean }`; offset must be a safe integer from 0 to 1,000,000 (400 otherwise); ordered `created_at desc, id desc`; range `offset..offset+100` with limit+1 to compute `hasMore`; filtered by `user_id`. `POST` requires `Content-Type: application/json` (415 otherwise), parses the body with the domain module, inserts with `user_id` from the session, returns `201 { chain }`. Responses: 401 when signed out, 400 with `{ message, fieldErrors }` for invalid input, 409 `{ message: "You already have a chain with that name.", fieldErrors: { name } }` on Postgres `23505`, 503 for other database errors.

#### 4. Item endpoint

**File**: `src/pages/api/chains/[id].ts`

**Intent**: Edit and delete one of the caller's chains.

**Contract**: `export const prerender = false`. `id` must be a UUID (400 otherwise). `PATCH` takes `{ name, startingKm }` with the create rules, updates filtered by both `id` and `user_id`, returns `200 { chain }`; 404 when no row matched; 409 on `23505`. `DELETE` filtered by `id` and `user_id`, returns 204; 404 when no row matched. Both require JSON content type where a body exists and return 401 when signed out.

#### 5. Unit tests and test script

**File**: `src/lib/chains/chain.test.ts`, `package.json`

**Intent**: Lock the validation boundaries and widen the `test` script so chain tests run in CI.

**Contract**: Tests with `node --test` cover: name trimming; 1, 60 accepted and 0, 61 rejected; blank km becomes 0; `"12.3"` and `12.3` become 12,300 m; `"12.34"`, `-1`, `100000.1`, `"abc"` and `NaN` rejected; `100000` and `0` accepted; row-to-view mapping. Update the `test` script glob to include `src/lib/chains/*.test.ts`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npm run check`

#### Manual Verification:

- With a signed-in session cookie, `POST /api/chains` creates a chain, repeating it with a different-case name returns 409, and `GET /api/chains` lists it.
- `PATCH` and `DELETE` on another user's chain id return 404.
- Requests without a session return 401.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Chains page and navigation

### Overview

Deliver the user-visible workflow: a protected `/chains` page with create, list, edit and delete, reachable from the dashboard and home.

### Changes Required:

#### 1. Route protection

**File**: `src/middleware.ts`

**Intent**: Require sign-in for the new page using the existing mechanism.

**Contract**: Add `"/chains"` to `PROTECTED_ROUTES`; no other behavior change.

#### 2. Page

**File**: `src/pages/chains.astro`

**Intent**: Load the first page of the user's chains on the server and render the island, mirroring `dashboard.astro`.

**Contract**: Reads `Astro.locals.user`, queries `chains` filtered by `user_id` with the same ordering and limit+1 range as the API, and passes `initialChains`, `initialHasMore` and `initialLoadError` to the island with `client:load`, inside `Layout`.

#### 3. React island

**File**: `src/components/ChainManager.tsx`

**Intent**: Create form, list, inline edit, inline delete confirmation, and load-more, with clear status and error messages.

**Contract**: Props `initialChains`, `initialHasMore`, `initialLoadError`. Create form fields: name (required) and starting km (optional, numeric, step 0.1, min 0). Uses the shared parse function for client-side hints; the server remains authoritative. API 409 shows the duplicate-name message on the name field. Created chains are prepended; edits replace in place; deletes remove the row. Delete uses an inline "Delete / Confirm delete / Cancel" step; copy states that deletion cannot be undone. Load-more calls `GET /api/chains?offset=<loaded count>`. Status and errors are announced with `role="status"` / `aria-live="polite"`, matching the dashboard; controls are keyboard operable with visible focus styles consistent with `ActivityDashboard.tsx`. Starting km is displayed with `formatDistanceKm`.

#### 4. Navigation

**File**: `src/components/ActivityDashboard.tsx`, `src/components/Topbar.astro`

**Intent**: Make the page discoverable from the two places a signed-in user lands.

**Contract**: Add a "Chains" link to `/chains` in the dashboard header beside Sign out and in the signed-in branch of the topbar beside "Dashboard"; `ChainManager` header links back to `/dashboard`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npm run check`
- Production build succeeds: `npm run build`
- Smoke test still passes against a running server: `npm run smoke`

#### Manual Verification:

- Signed out, `/chains` redirects to `/auth/signin`.
- Signed in, creating a chain with only a name shows 0.0 km; creating one with `12.3` shows 12.3 km.
- Creating "Winter" then "winter " (or "WINTER") is rejected with the duplicate-name message.
- Editing a chain's name and km updates the row; changing "Winter" to "WINTER" on the same chain succeeds.
- Deleting requires the confirm step; Cancel keeps the chain.
- A second account sees none of the first account's chains.
- The page is usable by keyboard only and status messages are announced.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- Name and starting-km validation boundaries, km-to-meters conversion, row-to-view mapping (`src/lib/chains/chain.test.ts`).

### Integration Tests:

- pgTAP RLS and constraint test (`supabase/tests/database/chains_rls.test.sql`).
- Existing `npm run smoke` auth flow stays green.

### Manual Testing Steps:

1. Sign in, open `/chains`, create a chain with only a name, then one with starting km.
2. Try the same name in a different case; confirm rejection.
3. Edit, then delete with Cancel and with Confirm.
4. Sign in as a second user and confirm isolation.
5. Sign out and confirm `/chains` redirects.

## Performance Considerations

Chains per user are expected to be few. The list is still paginated (limit+1, 100 per page) per the Supabase pagination lesson; the unique index on `(user_id, lower(name))` also serves ownership lookups.

## Migration Notes

New table only; no existing data is changed. S-04 must reference `chains (user_id, id)` with `on delete cascade` for assignment and waxing records (the chosen delete behavior) and must update the delete confirmation copy in `ChainManager.tsx` to say that assignments and waxing marks are removed too. Starting km is lifetime total mileage; the later metrics change must treat it as the base of total mileage and start current-since-wax at zero.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-03, FR-004)
- Product decisions: `context/foundation/prd.md`, `context/foundation/shape-notes.md`
- Lesson: `context/foundation/lessons.md` (paginate Supabase reads)
- Schema pattern: `supabase/migrations/20261009000000_create_activity_import_schema.sql:1-55`
- RLS test pattern: `supabase/tests/database/strava_rls.test.sql`
- API pattern: `src/pages/api/strava/activities.ts:7-41`
- Server-loaded island pattern: `src/pages/dashboard.astro`, `src/components/ActivityDashboard.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Chains table and row-level security

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — 2ba9bb2
- [x] 1.2 Database tests pass, including the new file: `npx supabase test db` — 2ba9bb2

#### Manual

- [x] 1.3 In local Supabase Studio, the `chains` table shows RLS enabled with the single policy and the unique `(user_id, lower(name))` index. — 2ba9bb2

### Phase 2: Validation module and chain API

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — 44c10c4
- [x] 2.2 Lint passes: `npm run lint` — 44c10c4
- [x] 2.3 Type check passes: `npm run check` — 44c10c4

#### Manual

- [x] 2.4 With a signed-in session cookie, `POST /api/chains` creates a chain, repeating it with a different-case name returns 409, and `GET /api/chains` lists it. — 44c10c4
- [x] 2.5 `PATCH` and `DELETE` on another user's chain id return 404. — 44c10c4
- [x] 2.6 Requests without a session return 401. — 44c10c4

### Phase 3: Chains page and navigation

#### Automated

- [x] 3.1 Lint passes: `npm run lint`
- [x] 3.2 Type check passes: `npm run check`
- [x] 3.3 Production build succeeds: `npm run build`
- [x] 3.4 Smoke test still passes against a running server: `npm run smoke`

#### Manual

- [x] 3.5 Signed out, `/chains` redirects to `/auth/signin`.
- [x] 3.6 Signed in, creating a chain with only a name shows 0.0 km; creating one with `12.3` shows 12.3 km.
- [x] 3.7 Creating "Winter" then "winter " (or "WINTER") is rejected with the duplicate-name message.
- [x] 3.8 Editing a chain's name and km updates the row; changing "Winter" to "WINTER" on the same chain succeeds.
- [x] 3.9 Deleting requires the confirm step; Cancel keeps the chain.
- [x] 3.10 A second account sees none of the first account's chains.
- [x] 3.11 The page is usable by keyboard only and status messages are announced.
