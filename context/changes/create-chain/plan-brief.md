# Create a Chain — Plan Brief

> Full plan: `context/changes/create-chain/plan.md`

## What & Why

Let a signed-in user create, list, edit and delete their own bicycle chains on a protected `/chains` page (roadmap S-03, FR-004). Chains are the entity that S-04 will attach to activities and waxing marks, so this change delivers only the entity and its management.

## Starting Point

Activities and bikes are imported from Strava and shown on `/dashboard`; auth, middleware route protection, RLS-per-user tables and pgTAP tests already exist. Nothing chain-related exists in code or schema.

## Desired End State

A user opens `/chains`, adds a chain with a name and optional starting kilometers, sees only their own chains newest first, can edit or delete them, and cannot create two chains whose names match ignoring case.

## Key Decisions Made

| Decision          | Choice                                                         | Why                                                                 | Source |
| ----------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- | ------ |
| Stored fields     | Name + optional starting km                                    | Starting km gives used chains a baseline; no bike link needed       | Plan   |
| Starting km means | Lifetime total only; since-last-wax starts at 0                | Keeps the shape-notes rule that current mileage starts at zero      | Plan   |
| Km input          | Optional, blank = 0, max 1 decimal, 0-100,000 km, stored in m  | Same unit as `distance_meters` and the existing formatter           | Plan   |
| Name uniqueness   | Unique per user, ignoring case; trimmed, 1-60 chars            | Keeps chains distinguishable for S-04 picker and S-05 filter        | Plan   |
| Lifecycle         | Deferred (no status column)                                    | Stop/reattach rules belong with the later metrics work              | Plan   |
| Operations        | Create, list, edit (name and km), delete                       | Typos and wrong baselines are fixable without recreating            | Plan   |
| Delete            | Hard delete with inline confirm; S-04 FKs will cascade         | Chosen behavior; S-04 must update the confirm copy                  | Plan   |
| Placement         | Separate `/chains` page, linked from dashboard and home        | Isolates chain management from the activity island                  | Plan   |
| Duplicate check   | Database unique index, API maps `23505` to 409                 | Race-free; no read-then-write                                       | Plan   |
| List reads        | Limit+1 offset pagination, 100 per page                        | Honors the Supabase pagination lesson                               | Plan   |

## Scope

**In scope:** `chains` table with RLS; validation module; `/api/chains` and `/api/chains/[id]`; `/chains` page and island; navigation links; pgTAP and unit tests.

**Out of scope:** assigning chains to activities, waxing, filters, lifecycle and metrics, bike linkage, soft delete, new dependencies (`zod`).

## Architecture / Approach

The database enforces ownership, name uniqueness and value ranges. A pure module `src/lib/chains/chain.ts` parses input and maps rows to views, shared by the API and the island. Thin API routes map validation and database errors to 400/404/409 responses. `chains.astro` loads the first page on the server and hands it to a React island, as `dashboard.astro` does.

## Phases at a Glance

| Phase                                | What it delivers                                              | Key risk                                            |
| ------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------- |
| 1. Chains table and RLS              | Migration and pgTAP test                                      | Case-insensitive unique index and check boundaries  |
| 2. Validation module and chain API   | Shared parser, list/create/edit/delete endpoints, unit tests  | Mapping error codes; km rounding and boundaries     |
| 3. Chains page and navigation        | Protected page, island with confirm-delete, links             | Keeping UI state consistent with pagination         |

**Prerequisites:** Local Supabase (`npx supabase start`, needs Docker), Node 22.14.0.
**Estimated effort:** ~3 sessions across 3 phases.

## Open Risks & Assumptions

- `lower(name)` handles ASCII case reliably; non-ASCII case folding follows the database collation.
- S-04 must choose `on delete cascade` FKs and update delete copy, otherwise delete will not match the agreed behavior.
- Changing starting km later shifts totals that future metrics display.

## Success Criteria (Summary)

- A user can create, edit and delete chains and sees only their own.
- Same-name chains (any case) are rejected with a clear message.
- `npx supabase test db`, `npm test`, `npm run lint`, `npm run check` and `npm run build` pass.
