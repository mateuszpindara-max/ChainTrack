# Safe Strava Synchronization and Reconciliation — Plan Brief

> Full plan: `context/changes/refresh-activities-safely/plan.md`
> Frame brief: `context/changes/refresh-activities-safely/frame.md`

## What & Why

ChainTrack has a one-time import lifecycle but the user needs two distinct post-import outcomes—discover every newly visible Strava activity regardless of its start date, and reconcile the complete historical set so current persisted fields, bike links, and deletions match Strava. The current completed-import gate blocks both, and activity-date filters cannot reliably discover old-dated late appearances.

## Starting Point

The initial import uses five-page resumable batches and an `initial_import_completed_at` marker. Existing activity rows are upserted by Strava ID only when encountered and only when a clear bike match exists; there is no post-import sync run or deletion reconciliation.

## Desired End State

After initial import, the dashboard offers a single “Synchronize” menu with “Import new” and “Repair full history.” Import new traverses the provider list but inserts only eligible IDs not yet stored; repair updates current persisted fields and bike links, retains unmatched rows hidden, and hard-deletes provider-deleted records plus their dependent data after a complete scan and ID verification.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| New activity discovery | Scan paginated Strava list; write only unknown IDs | Strava date filters cannot guarantee discovery of old-dated late appearances | Plan |
| Repair coverage | Whole Strava history, any activity age | User needs historical corrections beyond a recent window | Frame |
| Provider fields | Refresh all fields currently persisted plus bike link | Preserves the existing S-01 data contract while correcting bike assignment | Frame |
| Unmatched bike | Retain source row, clear bike relation, hide from bike-linked list | Keeps a present activity recoverable if its bike is assigned later | Plan |
| Strava deletion | Hard-delete local activity and dependent chain/waxing data | Matches the user's explicit deletion choice | Plan |
| Delete timing | Automatic only after full empty-page traversal and per-ID verification | Prevents partial scans and page shifts from causing unverified deletion | Plan |
| UI | One menu with two explicit modes | Separates operation scope without adding competing controls | Plan |
| Background sync/webhooks | Excluded | User selected manual list traversal; webhook coverage is partial and bounded | Frame / Plan |

## Scope

**In scope:** Per-user resumable sync runs; new-only list scan with insert-only writes; full-history field/bike repair; hidden unmatched activities; verified provider deletion and dependent cleanup; clear menu/results; deterministic tests and manual account acceptance.

**Out of scope:** Webhook subscriptions, background jobs, activity-date watermark semantics, Strava write operations, new provider fields, production deployment, chain creation or waxing workflows.

## Architecture / Approach

An authenticated sync API accepts `new` or `repair` mode and runs at most five Strava pages per request. Both modes scan until an empty page and resume through per-user persisted run state. New mode inserts only unknown eligible IDs. Repair mode upserts all current persisted fields, stages every provider ID, retains unmatched records hidden, then verifies local IDs absent from the completed scan before atomically deleting confirmed missing records and their dependents.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Sync state and data contract | RLS-protected run/staging state and unmatched-activity representation | Migration correctness and one-active-run invariant |
| 2. Import newly visible activities | Resumable insert-only mode and its menu action | Reads all pages to find old-dated new IDs; API rate limits |
| 3. Repair full history | Current-field/bike updates, unmatched retention, verified hard deletion | False deletion if scan is incomplete or provider read fails |
| 4. End-to-end acceptance | Full regression suite and real-account checks | Real Strava behavior and destructive cleanup validation |

**Prerequisites:** Existing Strava connection with `activity:read_all` and `profile:read_all`; local Supabase available for migration/database checks.
**Estimated effort:** Approximately 4–6 focused sessions across four phases; the database finalization and pagination tests are the largest pieces.

## Open Risks & Assumptions

- Import new reads every provider activity page, even though it writes only unknown IDs; this is the accepted cost of finding old-dated late appearances without webhooks.
- Strava's page-number listing is not an atomic snapshot. The plan verifies absent local IDs individually and preserves any candidate whose verification is inconclusive.
- Hard deletion is intentionally destructive, including future chain/waxing data attached to the activity.
- Strava's 404 can also mean unauthorized. Deletion verification must only interpret it as absence with the authenticated owner's required scopes established; other access errors preserve the local row.

## Success Criteria (Summary)

- Import new discovers old-dated newly visible IDs, inserts them once, and leaves known local rows untouched.
- Repair refreshes persisted fields and bike links, hides still-present unmatched activities, and deletes only verified absent activities after complete traversal.
- Both modes resume safely after partial failures, preserve user ownership, and report accurate results without exposing tokens.