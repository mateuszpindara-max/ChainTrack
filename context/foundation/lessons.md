# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Paginate Supabase reads that can exceed max_rows

- **Context**: `src/pages/dashboard.astro:28`; `src/pages/api/strava/import.ts:113`; `supabase/config.toml:18`.
- **Problem**: Activity reads do not paginate, so results above the configured 1,000-row limit are silently truncated.
- **Rule**:
- **Applies to**:

## Keep roadmap slices aligned after delivery

- **Context**: `context/foundation/roadmap.md` S-04; `context/foundation/prd.md` requirements for S-04.
- **Problem**: The slice remained `in-progress` and described end-of-ride waxing after its implementation and PRD had moved to first-ride fresh-wax marking.
- **Rule**:
- **Applies to**:
