<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Bike Navigation and Activity Overview

- **Plan**: context/changes/filter-activities/plan.md
- **Mode**: Deep
- **Date**: 2026-10-23
- **Verdict**: REVISE → SOUND (after triage fixes)
- **Findings**: 2 critical, 5 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING (F3) |
| Lean Execution | PASS |
| Architectural Fitness | WARNING (F5) |
| Blind Spots | WARNING (F4, F6) |
| Plan Completeness | FAIL (F1, F2, F7, F8) |

## Grounding

9/9 existing paths ✓ (3 new files excluded), 6/6 claims ✓, brief↔plan ✓

## Findings

### F1 — Planned API/component tests cannot run in the current test setup

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: 1.2, 2.1, Testing Strategy
- **Detail**: `npm test` is `node --experimental-strip-types --test src/lib/strava/*.test.ts src/lib/chains/*.test.ts`. There is no jsdom, Testing Library or Vitest. API routes import `@/lib/supabase`, which imports `astro:env/server` (src/lib/supabase.ts:3) and cannot load under node, so the planned API and component tests cannot pass as written. Earlier plans promised "Dashboard/API tests" and shipped pure-helper tests instead.
- **Fix A ⭐ Recommended**: Re-scope to pure-helper tests with an injected store, as `MemoryImportStore` does.
  - Strength: Existing pattern, no new dependencies.
  - Tradeoff: React rendering and drawer behavior stay manual.
  - Confidence: HIGH
  - Blind spot: Auth/ownership rest on RLS SQL tests plus smoke.
- **Fix B**: Add Vitest + Testing Library + jsdom with an `astro:env/server` mock.
  - Strength: Real component and route tests.
  - Tradeoff: New devDependencies, a second runner, wider scope.
  - Confidence: MEDIUM
  - Blind spot: Astro 7 / React 19 / ESLint 10 compatibility unverified.
- **Decision**: FIXED (Fix A)

### F2 — Phase 3 Progress doesn't match its Success Criteria

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 Success Criteria / Progress
- **Detail**: Automated bullet 1 bundles lint, check, build and smoke. Bullet 2 has no Progress item. Progress has only 3.1 build and 3.2 smoke, so lint/check are untracked. Phase 1 bullet 1 also drifts from 1.1.
- **Fix**: Split into lint+check / build / smoke bullets, add matching 3.1–3.3, renumber manual to 3.4–3.6.
- **Decision**: FIXED

### F3 — Import/sync responses carry a global activity list that would overwrite a bike-filtered view

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 2 #2
- **Detail**: `setActivities(payload.activities)` (ActivityDashboard.tsx:111) and `activitiesAfterSync` (:138) take the first 100 activities across all bikes (import.ts:157-172, sync.ts:454-476). With a bike selected, this replaces the view with other bikes' rides and resets paging. The plan also forbids changing import/sync.
- **Fix**: Dashboard ignores `payload.activities`/`hasMoreActivities`. After any save it refetches bikes, summary and the selected view's first page.
  - Strength: Honors the scope boundary.
  - Tradeoff: A few extra requests per save.
  - Confidence: HIGH
  - Blind spot: Refetch rule for a `partial` or `failed` outcome that saved pages.
- **Decision**: FIXED

### F4 — Summary endpoint leaves paging, ordering and range limits undecided

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 #3
- **Detail**: "Bounded batches" has no size. No ORDER BY is stated, and offset paging on `started_at` ties can skip or duplicate rows. "Unsupported ranges" is undefined, as is mid-pagination failure behavior. The local-year interval helper has no file, and tests have no way to pin a timezone.
- **Fix**: Pin batch size (≤ 1000, supabase/config.toml:18), order `started_at, id`, require start < end with span ≤ 367 days, return 503 with no partial total on any page error, and name where the local-year helper lives and how tests fix the timezone.
  - Strength: Removes guesswork.
  - Tradeoff: One more constraint to maintain.
  - Confidence: HIGH
  - Blind spot: Workers subrequest limits unverified.
- **Decision**: FIXED

### F5 — Whole dashboard shell lands in one existing island; drawer mechanism undecided

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 #2
- **Detail**: ActivityDashboard.tsx is ~330 lines. The plan adds summary, two paginated sidebar lists, selection state, a drawer and refresh orchestration there, ignoring the `src/components/hooks/` convention (CLAUDE.md). There is no drawer or dialog precedent in src.
- **Fix**: Name the units (`DashboardSidebar`, `YearSummary`, a data hook in `src/components/hooks/`) and use native `<dialog>` + `showModal()` for the mobile drawer.
  - Strength: Testable hook logic, built-in focus handling, no new dependency.
  - Tradeoff: Slide-over styling needs CSS; sidebar markup rendered in two places.
  - Confidence: MEDIUM
  - Blind spot: Tailwind 4 transition behavior unverified.
- **Decision**: FIXED

### F6 — Client async races and first-paint states not specified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2
- **Detail**: The summary needs the browser timezone, so it loads only after hydration, and the plan gives no placeholder or error state for it. `loadMoreActivities` (`offset=${activities.length}`, :143-157) has no cancellation, so with bike switches and post-sync refetches a stale response can land in the wrong list.
- **Fix**: Key each fetch by (selection, refresh generation) and discard stale responses. Reset list and offset on selection change. Give summary and sidebar independent loading/error/retry states.
  - Strength: Prevents wrong-list bugs.
  - Tradeoff: A little more state.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Decision**: FIXED

### F7 — Activity filter parameter and unknown-bike behavior undecided

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 #2
- **Detail**: The parameter name, the "All bikes" encoding, and the response for a well-formed UUID the user doesn't own are left to the implementer.
- **Fix**: `?bikeId=<uuid>`; absent means All; unowned UUID returns 200 with an empty page; non-UUID returns 400.
- **Decision**: FIXED

### F8 — Cited "accepted" lesson has no rule

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State / References
- **Detail**: `lessons.md` has empty `Rule:` and `Applies to:` for the pagination lesson. It also cites dashboard.astro:28, which this plan removes, and import.ts:113, which remains.
- **Fix**: Complete the lesson via `/10x-lesson`.
- **Decision**: SKIPPED (lesson not captured; run `/10x-lesson` later)
