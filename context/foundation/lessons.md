# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Paginate Supabase reads that can exceed max_rows

- **Context**: `src/pages/dashboard.astro:28`; `src/pages/api/strava/import.ts:113`; `supabase/config.toml:18`.
- **Problem**: Activity reads do not paginate, so results above the configured 1,000-row limit are silently truncated.
- **Rule**:
- **Applies to**:
