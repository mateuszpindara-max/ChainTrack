# Import and Browse Bike-Linked Strava Activities — Plan Brief

> Full plan: `context/changes/import-bike-linked-activities/plan.md`
> Research: `context/changes/import-bike-linked-activities/research.md`

## What & Why

This change delivers S-01: connect a signed-in ChainTrack user to Strava, import the available bike-linked history, and show it newest-first. Activities without a clear bike are skipped and counted; interrupted imports retain completed pages and can be retried without duplicates.

## Starting Point

The app has Supabase SSR authentication and a protected placeholder dashboard, but no Strava connection, application schema, RLS policies, import endpoint, or activity list. Strava app access is not ready, and the user chose to complete access setup before implementation starts.

## Desired End State

The user connects Strava and explicitly starts the first import. The dashboard shows each imported activity's name, distance, date, and bike, with understandable complete/partial/failure feedback and a count of omitted activities. OAuth tokens are encrypted at rest, handled only by server code, and protected by per-user database policies.

## Key Decisions Made

| Decision               | Choice                                                                                     | Why                                                                                       | Source           |
| ---------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ---------------- |
| Prerequisite order     | User creates/configures Strava app and local secrets before implementation                 | Strava access is the roadmap blocker and credentials are not ready                        | Plan + roadmap   |
| Initial import trigger | Separate user action after Strava connection                                               | User chose a clear, deliberate start for the full-history import                          | Plan             |
| History scope          | Import all available activity pages and bikes; skip activities without an exact bike match | Preserves the accepted first-sync and bike-link rules                                     | Shape notes      |
| Partial failure        | Keep successful pages, report an incomplete result, and allow an idempotent retry          | Preserves fetched data without claiming full success                                      | Plan             |
| Duplicate identity     | Unique user + Strava activity ID; upsert on retry                                          | Strava provides a stable activity ID and the PRD forbids duplicates                       | PRD + Strava API |
| OAuth scopes           | `activity:read_all` and `profile:read_all` only                                            | Needed for private activities and detailed athlete bike data                              | Strava docs      |
| Token storage          | Versioned AES-GCM ciphertext with a server-only key; no Supabase service-role key          | Follows the existing deployment credential guardrail while keeping raw tokens server-only | Deployment plan  |
| Automated/live tests   | Mock Strava in CI; one real-account acceptance test by the user                            | Keeps automated validation deterministic and secrets out of CI                            | Plan             |

## Scope

**In scope:** Strava OAuth, encrypted token persistence and refresh, bike/activity schema with RLS, full initial history import, deduplication, skipped-bike reporting, activity list, tests, and the user's setup/acceptance actions.

**Out of scope:** routine incremental refresh (S-02), chain creation or assignment, waxing, filters, background sync, Strava disconnect UI, and production deployment.

## Architecture / Approach

The Astro Worker performs OAuth and Strava API calls server-side. The authenticated Supabase SSR client writes user-owned rows under RLS; OAuth tokens are AES-GCM encrypted with a separate server-only key, so no service-role key is introduced. An explicit dashboard action starts a paginated, page-by-page upsert; a retry after partial failure is safe because activities are unique by user and Strava ID.

## Phases at a Glance

| Phase                                     | What it delivers                                              | Key risk                                                      |
| ----------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| 1. Strava access and local configuration  | User-owned app setup, callback, and ignored local secrets     | External access must be ready before code starts              |
| 2. Owned data model and secure connection | RLS schema, encrypted OAuth tokens, callback and tests        | Token rotation or ownership mistakes could expose/lose access |
| 3. Initial import and activity list       | Full paginated import, bike matching, retry states, dashboard | Provider failures can interrupt a long history import         |
| 4. End-to-end verification and acceptance | Automated checks and user validation with real Strava data    | Live acceptance depends on user authorization and scopes      |

**Prerequisites:** The user registers a Strava developer app, obtains Client ID/Secret, configures the local `localhost` callback, generates a 32-byte encryption key, and stores values in ignored `.dev.vars`. Secrets must never be pasted into chat. The plan gives the exact variable names and callback URI.

**Estimated effort:** About 3–5 implementation sessions, plus user setup and real-account acceptance; external waiting time is excluded.

## Open Risks & Assumptions

- Strava may deny requested scopes or limit access; implementation must verify the granted scopes and fail clearly. The prerequisite/acceptance gates expose this before completion.
- Loss of the AES-GCM key makes stored tokens unreadable and requires reconnecting Strava; keep a recovery copy outside the repository.
- The production Worker callback URL is not confirmed. This plan validates locally; production configuration/deployment remains outside S-01.

## Success Criteria (Summary)

- The user sees all imported bike-linked activities newest-first with name, distance, date, and bike.
- Activities without a matching bike are omitted and counted; partial imports are never reported as complete.
- Repeating or retrying an import creates no duplicate activity and no Strava token is exposed to the browser or repository.
