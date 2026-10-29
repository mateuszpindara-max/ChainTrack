---
change_id: production-strava-status
title: Diagnose unavailable production Strava status
status: implementing
created: 2026-10-29
updated: 2026-10-29
archived_at: null
---

## Notes

The production dashboard shows `Connection status unavailable` on the first production run, and the Strava account could not be connected. Local development works. The user initially suspects mismatched databases, secrets, or Strava API configuration. Keep this investigation separate from the independent UI, Chains, and Bikes work in `context/foundation/2dos.md`.