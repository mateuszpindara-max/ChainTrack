# Repair Editor ESLint Diagnostics Implementation Plan

## Overview

Diagnose and resolve the unsafe-type diagnostics currently reported by the editor across the workspace. The repository's ESLint, TypeScript, Astro, and unit-test commands pass, so implementation must establish which editor diagnostic provider or configuration is responsible before changing source code.

## Current State Analysis

The editor's global Problems snapshot reported 149 entries, primarily repeated unsafe-member, unsafe-argument, and unresolved-import-type diagnostics in four files: `src/lib/strava/import.test.ts`, `src/components/ActivityDashboard.tsx`, `src/pages/api/strava/callback.ts`, and `src/pages/api/strava/sync.ts`. The reported errors cascade from imported types or helpers being treated as error types; snapshots varied between reads, so the first step must capture the active diagnostic source and reproduce the findings.

The repository checks currently pass: `npm run lint`, focused ESLint on the affected test file, `npx tsc --noEmit`, `npm run check`, and `npm test` (34 tests). `eslint.config.js` enables strict type-aware TypeScript rules. `tsconfig.json` includes workspace files, while `.vscode/settings.json` enables ESLint validation for TypeScript. These boundaries make an editor ESLint or TypeScript-service mismatch plausible, but not yet proven.

## Desired End State

The verified cause of the editor diagnostics is corrected at its source. All current workspace diagnostics are cleared without suppressing strict rules or altering Strava behavior, and the repository lint, type, Astro, and unit-test checks remain green.

### Key Discoveries:

- The editor reported unresolved imported-type cascades in `src/lib/strava/import.test.ts` and `src/components/ActivityDashboard.tsx`, plus findings in the callback and sync endpoints.
- `eslint.config.js` extends `typescript-eslint` strict type-checked and stylistic type-checked configurations; `package.json` defines `npm run lint`, `npm run check`, and `npm test`.
- Direct ESLint, TypeScript, Astro, and unit-test checks pass, so their output alone does not explain the editor report.
- `.vscode/settings.json` enables ESLint validation for TypeScript; confirm the diagnostic provider and effective configuration before deciding whether source or editor tooling needs correction.

## What We're NOT Doing

- Disabling or weakening type-aware ESLint rules to hide diagnostics.
- Changing Strava synchronization, OAuth, activity display behavior, database schema, or migrations.
- Broad lint cleanup or edits to unrelated files not implicated by the current workspace diagnostic snapshot.
- Bulk-running autofix before the diagnostic source is understood.

## Implementation Approach

Reproduce the editor findings and identify their diagnostic provider, effective ESLint/TypeScript configuration, and type-resolution context. Apply the smallest correction at the verified source: repair actual source typing only if the findings reproduce as source defects; otherwise correct the editor/tooling configuration without adding unnecessary project-wide suppressions. Recheck the complete workspace and the existing repository gates.

## Phase 1: Diagnose and Repair the Root Cause

### Overview

Capture the active diagnostics and trace the unresolved imported types across the four reported files to the responsible editor, ESLint, or TypeScript-service boundary. Correct only the confirmed source of the mismatch.

### Changes Required:

#### 1. Diagnostic source and affected type boundaries

**Files**: `src/lib/strava/import.test.ts`, `src/components/ActivityDashboard.tsx`, `src/pages/api/strava/callback.ts`, `src/pages/api/strava/sync.ts`, `.vscode/settings.json`, `eslint.config.js`, `tsconfig.json`

**Intent**: Reproduce and classify the editor's current unsafe-type findings, then identify why imported types are unresolved there while direct repository checks succeed. Limit any correction to the verified owner of that mismatch.

**Contract**: Preserve the strict type-aware lint configuration and existing source contracts; do not change application behavior or suppress rules. Only edit source or configuration files demonstrated to cause the findings.

### Success Criteria:

#### Automated Verification:

- Focused `npx eslint` and `npx tsc --noEmit` runs establish whether the current diagnostics reproduce in the repository's CLI checks.

#### Manual Verification:

- Identify the editor diagnostic provider and attribute the unresolved types to a specific source or tooling cause before correction.
- Confirm the verified correction removes the reported unsafe-type findings without disabling or weakening type-aware ESLint rules.
- Review the focused diff to confirm it contains only the correction for the diagnosed source and no Strava behavior changes.

## Phase 2: Verify Workspace and Repository Checks

### Overview

Confirm the editor no longer reports the current workspace diagnostics and that established repository commands continue to pass.

### Changes Required:

#### 1. Workspace diagnostic and regression verification

**Files**: Affected files from Phase 1; `package.json` scripts are used as existing verification commands.

**Intent**: Verify the fix against both the editor diagnostic surface that exposed the issue and the repository's independent static and behavioral checks.

**Contract**: Keep the existing validation commands and their strictness unchanged: `npm run lint`, `npx tsc --noEmit`, `npm run check`, and `npm test`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes.
- `npx tsc --noEmit` passes.
- `npm run check` passes.
- `npm test` passes all existing Strava tests.

#### Manual Verification:

- After refreshing the relevant editor diagnostic provider if needed, confirm a fresh workspace diagnostic snapshot has no remaining instances of the current unsafe-type findings.

## Testing Strategy

### Unit Tests:

- Run the existing Strava suite with `npm test`; no behavior change or new domain test is expected unless the verified root cause is an actual source typing defect.

### Integration Tests:

- No integration or live Strava test is required because runtime behavior and database contracts are out of scope.

### Manual Testing Steps:

1. Refresh the editor diagnostic provider after the correction and inspect the previously affected files.
2. Confirm the current unsafe-type findings have disappeared without rule suppressions.

## Performance Considerations

No runtime or build-performance change is intended. Avoid broad configuration changes that expand type-aware linting to unrelated files.

## Migration Notes

No database or data migration is required.

## References

- Active endpoint with the initial reported diagnostics: `src/pages/api/strava/sync.ts`
- Shared response contracts imported by the dashboard: `src/lib/strava/sync-contract.ts`
- Type-aware ESLint configuration: `eslint.config.js`
- TypeScript project inclusion: `tsconfig.json`
- Repository scripts: `package.json`
- Workspace ESLint settings: `.vscode/settings.json`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Diagnose and Repair the Root Cause

#### Automated

- [x] 1.1 Focused `npx eslint` and `npx tsc --noEmit` runs establish whether the current diagnostics reproduce in the repository's CLI checks. — 614f2e4

#### Manual

- [x] 1.2 Identify the editor diagnostic provider and attribute the unresolved types to a specific source or tooling cause before correction. — 614f2e4
- [x] 1.3 Confirm the verified correction removes the reported unsafe-type findings without disabling or weakening type-aware ESLint rules. — 614f2e4
- [x] 1.4 Review the focused diff to confirm it contains only the correction for the diagnosed source and no Strava behavior changes. — 614f2e4

### Phase 2: Verify Workspace and Repository Checks

#### Automated

- [x] 2.1 `npm run lint` passes.
- [x] 2.2 `npx tsc --noEmit` passes.
- [x] 2.3 `npm run check` passes.
- [x] 2.4 `npm test` passes all existing Strava tests.

#### Manual

- [x] 2.5 After refreshing the relevant editor diagnostic provider if needed, confirm a fresh workspace diagnostic snapshot has no remaining instances of the current unsafe-type findings.