---
date: 2026-10-09T00:00:00Z
researcher: GitHub Copilot
git_commit: aa20b6f
branch: main
repository: ChainTrack
topic: "Import bike-linked activities"
tags: [research, codebase, strava, activity-import, supabase, auth]
status: complete
last_updated: 2026-10-09
last_updated_by: GitHub Copilot
---

# Research: Import bike-linked activities

**Date**: 2026-10-09T00:00:00Z  
**Researcher**: GitHub Copilot  
**Git Commit**: aa20b6f  
**Branch**: main  
**Repository**: ChainTrack

## Research Question

What is the current codebase state for the `import-bike-linked-activities` slice, and what evidence exists about the Strava integration and the activity data contract that S-01 depends on?

## Summary

The repository is currently auth-ready but not activity-ready. The app configures a Supabase SSR client for authentication and a middleware guard for `/dashboard`, but the codebase has no Strava client, no activity sync API, and no activity/chain schema under [supabase](supabase). The product requirements and roadmap both say S-01 must import Strava data, skip activities without a clear bike assignment, and keep future refreshes deduplicated, yet the current repo does not contain the implementation or data-model wiring to satisfy those requirements. The active roadmap item remains blocked by the missing external Strava access and the missing application data contract.

## Detailed Findings

### Auth and app foundation are present, but activity logic is not

- The app has a Supabase server client configured only for session/auth handling, with `SUPABASE_URL` and `SUPABASE_KEY` loaded from `astro:env/server` and cookie-based session plumbing in [src/lib/supabase.ts](src/lib/supabase.ts#L1-L21).
- The request middleware only protects `/dashboard` and resolves the authenticated user from Supabase, then redirects unauthenticated users to the sign-in page in [src/middleware.ts](src/middleware.ts#L1-L25).
- The only API surface currently visible under [src/pages/api](src/pages/api) is auth-related: [src/pages/api/auth](src/pages/api/auth) contains sign-in, sign-out, and sign-up handlers; there is no activity sync route or Strava import endpoint in the inspected codebase.

### Product requirements explicitly require Strava import and deduplication

- The PRD states that the primary product flow is: log in, fetch activities with an assigned bike, view them newest-first, create a chain, and assign it to the activity in [context/foundation/prd.md](context/foundation/prd.md#L37-L66).
- The same document names the must-have integration requirements as FR-002 (“download data from an external activity source”), FR-003 (“manually trigger refresh”), and the non-functional requirement that re-sync must not create duplicate activities in [context/foundation/prd.md](context/foundation/prd.md#L68-L97).
- The shaping notes make the import rules explicit: the first sync should pull bikes and the full activity history, and later manual syncs should pull only new activities; activities without a clearly assigned bike are deliberately skipped and surfaced to the user in [context/foundation/shape-notes.md](context/foundation/shape-notes.md#L6-L23).

### The roadmap marks the slice as blocked, and the blocker is external access

- The roadmap identifies S-01 as `import-bike-linked-activities`, lists the outcome as importing and browsing bike-linked activity name, distance, date and bike, and sets its status to `blocked` in [context/foundation/roadmap.md](context/foundation/roadmap.md#L37-L87).
- The blockers section states that Strava access and the application data necessary to connect are still unconfirmed, and the owner is the user; the status is blocked specifically because that external dependency is not yet ready in [context/foundation/roadmap.md](context/foundation/roadmap.md#L79-L87).

### The repo has no activity schema or Strava implementation yet

- The app’s dependency list in [package.json](package.json#L1-L68) contains Supabase, Astro, and Cloudflare tooling, but no Strava SDK or activity-sync package.
- The [supabase](supabase) directory currently contains configuration and snippets only; the migration layer is absent, and a repo-wide search found no `activities`, `chains`, `bikes`, or `strava` implementation in the source tree.
- This means the product contract for the activity records is not represented in code yet: there is no database model for imported activities, no bike-chain assignment table, and no source integration path to fetch Strava rides.

## Code References

- [src/lib/supabase.ts](src/lib/supabase.ts#L1-L21) - Supabase SSR client for auth-only session management.
- [src/middleware.ts](src/middleware.ts#L1-L25) - Middleware that redirects unauthenticated users away from the dashboard.
- [src/pages/api/auth](src/pages/api/auth) - Current API surface is limited to auth operations.
- [context/foundation/prd.md](context/foundation/prd.md#L37-L97) - Must-have Strava import and deduplication requirements.
- [context/foundation/shape-notes.md](context/foundation/shape-notes.md#L6-L23) - Import rules for initial sync and bike-less activities.
- [context/foundation/roadmap.md](context/foundation/roadmap.md#L37-L87) - S-01 status and blocker details.
- [package.json](package.json#L1-L68) - Current app dependencies, with no Strava integration library.
- [supabase](supabase) - No migration-based schema or activity model is present in the checked-in repo.

## Architecture Insights

The app is structurally ready for a single-user auth flow and SSR pages, but the product’s defining data pipeline is still absent. The definitive gap is not the UI; it is the missing external-import behavior and the missing data contract for activity records and their bike assignments. In other words, S-01 is blocked by both a product prerequisite (Strava access) and a technical prerequisite (database/API implementation), which matches the roadmap status.

## Historical Context (from prior changes)

No prior research artifact for this change was present in the active change folder before this write, so no historical conclusion is being carried forward from earlier work.

## Related Research

Not applicable; no sibling research artifacts for the same topic were present under the current change directory at the time of writing.

## Open Questions

- Does the user already have a valid Strava app configuration and API access to supply to the app?
- Are the required Supabase tables for bikes, activities, and chain assignments already defined outside this repo, or are they still to be created?
- Which exact Strava activity fields will be accepted as the canonical data contract for the first import?
