# Repair Editor ESLint Diagnostics — Plan Brief

> Full plan: `context/changes/repair-eslint-errors/plan.md`

## What & Why

Resolve the unsafe-type diagnostics currently reported by the editor across the workspace. Because repository ESLint, TypeScript, Astro, and unit-test commands pass, the plan first identifies the source of the editor mismatch, then corrects only that cause while preserving strict rules and application behavior.

## Starting Point

The editor reported 149 entries in a global snapshot, concentrated in four Strava files: `src/lib/strava/import.test.ts`, `src/components/ActivityDashboard.tsx`, `src/pages/api/strava/callback.ts`, and `src/pages/api/strava/sync.ts`. The messages largely cascade from unresolved imported types; direct `npm run lint`, `npx tsc --noEmit`, `npm run check`, and `npm test` all pass.

## Desired End State

The responsible editor, ESLint, TypeScript-service, or source issue is identified and fixed at its origin. The editor reports none of the current unsafe-type findings, strict type-aware rules remain enabled, and all existing repository checks stay green without changing Strava behavior.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Complexity and interview budget | LOW; four focused questions | The evidence points to a bounded diagnostic mismatch, with investigation as the main uncertainty. |
| Scope | All current workspace editor diagnostics | The user selected workspace-wide editor findings rather than only the originally attached endpoint. |
| Fix strategy | Correct the verified source; do not suppress diagnostics | CLI checks pass, so source edits should depend on proving a source defect rather than silencing the editor. |
| Plan structure | Diagnose/repair, then verify | Separates cause-finding from the final editor and repository regression gate. |

## Scope

**In scope:**
- Diagnose the editor-reported unsafe-type findings, currently observed in four Strava files.
- Make the smallest source or editor/tooling correction supported by reproduction.
- Verify the editor diagnostic surface and existing lint, TypeScript, Astro, and test checks.

**Out of scope:**
- Weakening or disabling strict type-aware rules.
- Strava behavior, schema, migration, OAuth, or UI changes.
- Unrelated lint cleanup or broad autofix.

## Architecture / Approach

Compare the editor's diagnostic provider and effective configuration with the repository's flat ESLint configuration, TypeScript project, and passing CLI checks. Trace the unresolved type cascade in the affected files, correct the verified owner of the mismatch, then rerun workspace diagnostics and the existing checks.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Diagnose and Repair the Root Cause | A minimal correction to the confirmed source of the diagnostics. | Editor findings may be stale or differ from CLI diagnostics. |
| 2. Verify Workspace and Repository Checks | A clean editor diagnostic snapshot and passing repository checks. | Editor diagnostics may require refreshing the responsible provider. |

**Prerequisites:** Access to the workspace's VS Code diagnostic output and existing npm scripts.
**Estimated effort:** One focused implementation session, subject to locating the editor-only cause.

## Open Risks & Assumptions

- The reported diagnostics may be stale or provider-specific because editor snapshots varied while direct checks passed.
- The exact correction cannot be selected until the diagnostic source is reproduced; no rule suppression is accepted as a substitute.

## Success Criteria (Summary)

- No current unsafe-type findings remain in a fresh workspace diagnostic snapshot.
- `npm run lint`, `npx tsc --noEmit`, `npm run check`, and `npm test` pass.
- The correction preserves strict rules and does not alter Strava runtime behavior.