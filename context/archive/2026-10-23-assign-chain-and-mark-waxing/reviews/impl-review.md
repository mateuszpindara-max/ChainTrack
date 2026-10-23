<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Mark Fresh-Wax Rides and Filter Activities by Chain

- **Plan**: context/changes/assign-chain-and-mark-waxing/plan.md
- **Scope**: Full plan (Phases 1-4)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-23
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Broad command auto-approvals are outside the plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .vscode/settings.json:35
- **Detail**: The change adds broad `git remote` and `gh` auto-approvals. These command prefixes can include remote mutations and GitHub operations; they are not limited to the read-only inspection used during implementation. This settings change is outside the plan and unnecessarily reduces confirmation for potentially consequential commands.
- **Fix**: Remove the broad `git remote` and `gh` approvals, or replace them with exact read-only command patterns.
- **Decision**: SKIPPED

### F2 — Waxing refresh drops already-loaded rows above the 500-row cap

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/strava/dashboard-query.ts:27
- **Detail**: `getActivityRefreshLimit` caps a post-save refresh at 500, while load-more can accumulate more than 500 rows. `refreshWaxingActivities` then replaces the current list with only the first refreshed page(s) returned for that capped limit. If the user had loaded more than 500 rides, the rows beyond that point disappear after marking or clearing a ride. The plan explicitly specifies this cap behavior, but it conflicts with the broader acceptance criterion that loaded rides re-label after saving without losing the loaded list state.
- **Fix**: Re-read the prior loaded row count through bounded pages (each request at or below 500) and replace the list only after all pages needed for the refresh succeed.
  - Strength: Preserves all previously loaded rows and the plan's per-request bound.
  - Tradeoff: A save after loading a very large history requires multiple sequential reads.
  - Confidence: HIGH — the existing offset pagination and per-request limit already support this.
  - Blind spot: The hook's reducer behavior for replacing a multi-page refreshed list should be covered by a focused test.
- **Decision**: FIXED — refreshed previously loaded rows in sequential pages, each capped at 500; `npm test`, `npm run check`, and `npm run lint` pass.

### F3 — Roadmap still reports the completed slice as in progress

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/foundation/roadmap.md:47
- **Detail**: S-04 remains `in-progress` even though this change is implemented and all phase checkboxes are complete. Its outcome also retains the earlier end-of-activity waxing wording. The plan explicitly defers roadmap wording alignment to a separate foundation update, so this is not implementation drift, but the roadmap status is now stale.
- **Fix**: Close S-04 in the roadmap and align its outcome in the separately scoped foundation update.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Keep roadmap slices aligned after delivery. The user approved recording the lesson and updating S-04's outcome and status; the roadmap now reflects first-ride fresh-wax carry-forward behavior and marks S-04 done.

## Verification

- `npm test` — PASS, 62 tests.
- `npm run check` — PASS, 0 errors, 0 warnings, 0 hints.
- `npm run lint` — PASS.
- `npm run build` — PASS; Astro noted the existing missing `site` setting and skipped sitemap generation.
- `npx supabase test db` — PASS, 3 files and 114 assertions.
- `npx supabase db reset` — NOT RUN during this review; resets local database state. The plan records it passing in phase 1 at commit `aea8aaf`.
- `npm run smoke` — NOT RUN during this review; its script creates a persistent auth user. The plan records it passing in phase 4 at commit `ad2d34c`.
- Manual acceptance items — all are marked complete in plan progress at `ad2d34c`; not independently repeated during this review.
