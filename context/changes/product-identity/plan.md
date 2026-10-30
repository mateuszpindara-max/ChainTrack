# ChainTrack Product Identity Implementation Plan

## Overview

Establish a consistent ChainTrack identity across the public welcome page, authentication screens, shared browser identity, and active project materials. Replace starter-derived presentation with a factual, restrained product identity while preserving authentication behavior and historical records of how the starter was selected.

## Current State Analysis

- `src/components/Welcome.astro` still presents “10x Astro Starter,” promotes developer tooling, and uses the starter's cosmic visual treatment and feature cards.
- `src/layouts/Layout.astro` defaults the browser title to the starter name, and `src/lib/config-status.ts` links a missing-Supabase warning to the starter repository.
- Sign-in, sign-up, and confirmation pages use generic titles and purple/cosmic styling. The authenticated dashboard and chain manager already establish ChainTrack branding, a dark surface, and orange accents.
- `public/favicon.png` is a generic blue-and-white mark; `public/template.png` is a starter-branded image referenced by the README.
- Active project identity remains in `package.json`, `package-lock.json`, `supabase/config.toml`, the root README, and Docker container names referenced by database test scripts. The production-status plan and brief also describe the current local Supabase project ID.
- `scripts/smoke.mjs` currently asserts the starter welcome title. The app has an existing auth-flow smoke test and repository checks for lint, Astro, tests, and build.

## Desired End State

Signed-out visitors see ChainTrack and concise sign-in/sign-up actions without starter promotion; auth and confirmation screens carry the same product identity and orange-accented visual cues as the dashboard. Browser titles, the Supabase configuration warning, and the favicon identify ChainTrack without exposing starter branding.

Active project metadata, local Supabase identifiers, dependent test fixtures, and onboarding documentation consistently use ChainTrack. The README is a short product overview linking to setup documentation, which is also linked from `AGENTS.md`. Archived work and historical starter/tool-selection records remain intact.

### Key Discoveries:

- The root route renders `Welcome` for signed-out visitors (`src/pages/index.astro`); the starter copy and feature cards are in `src/components/Welcome.astro`.
- The shared title and favicon link are in `src/layouts/Layout.astro`; the missing-configuration banner and starter repository link are in `src/lib/config-status.ts`.
- Auth routes use reusable React form components under `src/components/auth/`; their styling must be aligned along with the page wrappers to avoid retaining purple focus and button cues.
- Dashboard and chain-manager headers use “ChainTrack” and orange accents (`src/components/ActivityDashboard.tsx`, `src/components/ChainManager.tsx`), providing an existing visual reference.
- Local Supabase container names are embedded in `scripts/chain-concurrency.mjs` and `scripts/waxing-integration.mjs`; renaming `project_id` requires those references to remain synchronized.
- The production-status plan warns that the local project ID does not establish production identity. Update its old literal while preserving that safety distinction.

## What We're NOT Doing

- Changing authentication, route protection, data access, or account flows.
- Adding product features, marketing claims, or detailed workflow copy to the welcome screen; it will show the ChainTrack name and sign-in/sign-up actions only.
- Rewriting archived changes, bootstrap verification records, course/tool configuration, or the foundational record of the chosen starter.
- Changing production Supabase identity, Cloudflare resources, secrets, deployment settings, or Strava configuration.
- Rebranding unrelated third-party assets or changing the application's language.

## Implementation Approach

Apply the existing ChainTrack dashboard palette and identity to public and authentication entry surfaces first, preserving their current routes and interactions. Then rename only active project identifiers, keep local test-container references aligned, and split the short product overview from practical setup instructions. Verify the app through the existing quality gates and auth smoke flow, then manually inspect public/auth pages and the favicon at small sizes.

## Phase 1: Runtime Identity and Entry Screens

### Overview

Remove starter identity from the runtime experience and make the welcome, auth, shared browser, and favicon surfaces recognizably ChainTrack without changing auth behavior.

### Changes Required:

#### 1. Replace the welcome screen's starter content

**File**: `src/components/Welcome.astro`, `src/components/Topbar.astro`

**Intent**: Replace starter branding and developer-feature promotion with a restrained ChainTrack welcome containing the product name and sign-in/sign-up actions. Remove redundant starter-era presentation that conflicts with the minimal welcome requirement.

**Contract**: The signed-out `/` route continues to render the existing auth destinations. No starter name, starter feature copy, or starter screenshot remains in the rendered page.

#### 2. Standardize shared browser and configuration identity

**File**: `src/layouts/Layout.astro`, `src/lib/config-status.ts`

**Intent**: Make the default and route-specific browser titles identify ChainTrack, and remove starter-repository branding from missing-configuration messaging.

**Contract**: Preserve the shared `/favicon.png` route and existing configuration detection behavior. The warning remains accurate that authentication is unavailable when Supabase is not configured, but it no longer links to starter documentation.

#### 3. Align auth and confirmation presentation

**File**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`, `src/components/auth/FormField.tsx`, `src/components/auth/SubmitButton.tsx`, `src/components/auth/PasswordToggle.tsx`, `src/components/auth/ServerError.tsx`

**Intent**: Give sign-in, sign-up, and confirmation pages ChainTrack identity and the established dark/orange visual cues used in the authenticated app. Keep form controls, error states, validation, and navigation behavior unchanged.

**Contract**: Update relevant headings, document titles, action/focus/error styling, and confirmation-page presentation while retaining current form routes, accessible labels, and success/error content.

#### 4. Replace the favicon and assert runtime identity

**File**: `public/favicon.png`, `scripts/smoke.mjs`

**Intent**: Replace the generic mark with a high-contrast orange chain-link mark and make the existing smoke flow guard against reintroducing starter copy.

**Contract**: Keep the existing PNG path and response usable by the shared layout. Update the signed-out home assertion to require ChainTrack and reject starter wording; retain all existing auth-flow assertions.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes after runtime and smoke-test changes.
- `npm run check` passes with the updated Astro pages and titles.
- `scripts/smoke.mjs` expects ChainTrack on signed-out home and no longer expects starter content.

#### Manual Verification:

- At desktop and mobile widths, `/`, `/auth/signin`, `/auth/signup`, and `/auth/confirm-email` show coherent ChainTrack identity, readable content, and no clipped or overlapping controls.
- Sign-in, sign-up, password visibility, validation/error presentation, confirmation messaging, and navigation remain usable.
- The favicon is legible as a chain-link mark at browser-tab size, and the page title identifies ChainTrack on public and auth routes.

---

## Phase 2: Project Identity, Onboarding, and Verification

### Overview

Update active project-facing names and setup material, then verify the app and dependent local Supabase tests work with the new project ID.

### Changes Required:

#### 1. Rename active package and local Supabase identifiers

**File**: `package.json`, `package-lock.json`, `supabase/config.toml`, `scripts/chain-concurrency.mjs`, `scripts/waxing-integration.mjs`

**Intent**: Replace the starter package and local Supabase project names with `chaintrack`, keeping lockfile and database-test container references consistent with the configured project.

**Contract**: The package manifest and lockfile root package name agree. The Supabase `project_id` and Docker container names expected by local database tests refer to the same ChainTrack identifier. Do not edit ignored, generated Supabase state as a substitute for updating tracked configuration.

#### 2. Reframe the README and move setup guidance

**File**: `README.md`, `docs/setup.md`, `AGENTS.md`, `public/template.png`

**Intent**: Replace the starter README with a short factual ChainTrack product overview, move useful install/configuration/test/deployment instructions into a dedicated setup guide, and link to that guide from both README and `AGENTS.md`. Remove the starter-branded README image and its unused asset.

**Contract**: Preserve accurate Node, npm, Supabase, Strava, Cloudflare, and validation instructions in `docs/setup.md`; the root README remains concise and non-promotional. `AGENTS.md` points contributors to the setup guide. Remove `public/template.png` only after confirming it has no other active reference.

#### 3. Refresh current operational references and verify active names

**File**: `context/changes/production-strava-status/plan.md`, `context/changes/production-strava-status/plan-brief.md`, active project files discovered by a starter-reference scan

**Intent**: Keep the active production-status guidance factually current after the local project rename, while preserving the explicit warning that a local project ID is not evidence of production identity. Confirm that remaining starter references are historical or tool-selection records rather than active product leaks.

**Contract**: Replace only current-state references to the old local project ID in the active operational plan and brief. Leave archived changes, bootstrap verification, `context/foundation/tech-stack.md`, course/tool records, and unrelated generated files unchanged. Any other active runtime or project-facing occurrence discovered in the scan is either updated or explicitly retained for a technical reason.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes.
- `npm run check` passes.
- `npm test` passes.
- `npm run build` passes with the project's configured environment.
- `npm run smoke` passes against the local production preview with Supabase available and email confirmation disabled.
- `npm run test:chain-concurrency` and `npm run test:waxing-integration` pass against the renamed local Supabase container when Docker/Supabase are available.
- An active-file scan finds no unintended starter branding; package/lockfile names, Supabase `project_id`, and test container identifiers are consistent.

#### Manual Verification:

- Review the concise README and `docs/setup.md` for accurate links, setup instructions, and separation of product overview from onboarding.
- Run the documented local Supabase startup after the project ID change and confirm the test scripts target the resulting ChainTrack container.

## Testing Strategy

### Unit Tests:

- Run `npm test` to guard the existing application logic while project metadata is changed.
- Run the chain concurrency and waxing integration scripts when Docker and local Supabase are available; these contain the dependent database container name.

### Integration Tests:

- Run `npm run smoke` against the Cloudflare production preview backed by local Supabase. It exercises signed-out home, protected-route redirect, account creation, sign-in failure/success, dashboard access, sign-out, and the updated welcome identity assertion.
- Run lint, Astro check, and production build after both phases.

### Manual Testing Steps:

1. Inspect `/`, `/auth/signin`, `/auth/signup`, and `/auth/confirm-email` at desktop and mobile widths; verify the orange/dark ChainTrack treatment and readable focus/error states.
2. Inspect the browser tab title and favicon at native size, confirming the orange chain-link remains recognizable.
3. Follow `docs/setup.md` for local startup and confirm the README and `AGENTS.md` links resolve.

## Performance Considerations

No meaningful runtime or data-volume change is expected. The favicon remains a small static asset, and the welcome/auth changes do not add client-side behavior.

## Migration Notes

No database schema or production migration is planned. Changing `supabase/config.toml` changes the local Supabase project/container identity; stop and restart the local Supabase stack using the renamed project before running Docker-backed tests. This does not identify or modify the production Supabase project.

## References

- Frame brief: `context/changes/product-identity/frame.md`
- Product description: `context/foundation/prd.md`
- Existing runtime style reference: `src/components/ActivityDashboard.tsx`, `src/components/ChainManager.tsx`
- Local environment and safety guidance: `context/changes/deployment/deployment-plan.md`
- Active production-status references to the local project ID: `context/changes/production-strava-status/plan.md`, `context/changes/production-strava-status/plan-brief.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Runtime Identity and Entry Screens

#### Automated

- [x] 1.1 `npm run lint` passes after runtime and smoke-test changes. — d4c4d7f
- [x] 1.2 `npm run check` passes with the updated Astro pages and titles. — d4c4d7f
- [x] 1.3 `scripts/smoke.mjs` expects ChainTrack on signed-out home and no longer expects starter content. — d4c4d7f

#### Manual

- [x] 1.4 At desktop and mobile widths, `/`, `/auth/signin`, `/auth/signup`, and `/auth/confirm-email` show coherent ChainTrack identity, readable content, and no clipped or overlapping controls. — d4c4d7f
- [x] 1.5 Sign-in, sign-up, password visibility, validation/error presentation, confirmation messaging, and navigation remain usable. — d4c4d7f
- [x] 1.6 The favicon is legible as a chain-link mark at browser-tab size, and the page title identifies ChainTrack on public and auth routes. — d4c4d7f

### Phase 2: Project Identity, Onboarding, and Verification

#### Automated

- [x] 2.1 `npm run lint` passes. — fd3a391
- [x] 2.2 `npm run check` passes. — fd3a391
- [x] 2.3 `npm test` passes. — fd3a391
- [x] 2.4 `npm run build` passes with the project's configured environment. — fd3a391
- [x] 2.5 `npm run smoke` passes against the local production preview with Supabase available and email confirmation disabled. — fd3a391
- [x] 2.6 `npm run test:chain-concurrency` and `npm run test:waxing-integration` pass against the renamed local Supabase container when Docker/Supabase are available. — fd3a391
- [x] 2.7 An active-file scan finds no unintended starter branding; package/lockfile names, Supabase `project_id`, and test container identifiers are consistent. — fd3a391

#### Manual

- [x] 2.8 Review the concise README and `docs/setup.md` for accurate links, setup instructions, and separation of product overview from onboarding. — fd3a391
- [x] 2.9 Run the documented local Supabase startup after the project ID change and confirm the test scripts target the resulting ChainTrack container. — fd3a391