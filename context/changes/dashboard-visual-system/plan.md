# Dashboard Visual System

## Audit charges

1. **Missing tokens** — `src/components/ActivityDashboard.tsx:223,226,228` and `src/styles/global.css:115` use literal white/blue/orange colors and a hard-coded gradient outside the semantic token roles. The dashboard's hierarchy and contrast cannot be adjusted consistently through the existing value source.
2. **Missing shared component** — `src/components/ActivityDashboard.tsx:237-249` and `src/components/ChainDetails.tsx:124-144` hand-style common action buttons even though `src/components/ui/button.tsx:6` provides shared hover, focus, and disabled behavior. Users can encounter inconsistent interaction affordances across the same screen.
3. **Focus token bypass** — `src/components/DashboardSidebar.tsx:35` and dashboard form controls use hard-coded orange outlines instead of the existing `--ring` token. Keyboard focus cannot follow the dashboard's semantic theme values.

## Architecture and states checked

- Logged-out `/dashboard` requests are redirected by `src/middleware.ts:4,18-20`.
- The dashboard and its child views represent loading, error, and empty states in their normal entry paths; no architecture charge is justified.
- Keep behavior, route structure, and the current dark/orange identity unchanged. Functional items in `context/foundation/2dos.md` are deferred.

## Phase 1: Semantic theme and dashboard controls

1. Extend `src/styles/global.css` with scoped dashboard role values and publish success/warning roles through the existing Tailwind theme.
2. Replace dashboard color literals and hand-written focus outlines with semantic token classes.
3. Use the existing `Button` for shared dashboard actions without changing navigation or form behavior.
4. Validate lint, type checking, unit tests, and build; inspect `/dashboard` at desktop and mobile widths.

## Phase 2: Combined state gate

Render the dashboard's default, hover, focus, disabled, error, empty, and loading states together in a kitchen-sink screenshot. This phase is pending; the current manual browser pass captured separate overview, management, and validation-error states.

## Deferred

- Enforce one active bike per chain and display the bike in cycle history; these are functional lifecycle requirements, not part of this visual-only pass.

## References

- `context/changes/product-identity/plan-brief.md` — established ChainTrack dark/orange visual language.
- `context/changes/chain-lifecycle-tracking/plan.md` — lifecycle scope and explicit UI-rework boundary.

## Progress

> Convention: `[ ]` pending, `[x]` done.

### Phase 1: Semantic theme and dashboard controls

#### Automated

- [x] 1.1 Add scoped semantic dashboard values and replace literal palette/focus classes with tokens.
- [x] 1.2 Reuse the shared `Button` for dashboard actions without changing navigation or form behavior.
- [x] 1.3 Pass lint, Astro check, unit tests, and production build.

#### Manual

- [x] 1.4 Capture authenticated desktop/mobile overview screenshots and a desktop management/error-state screenshot.

### Phase 2: Combined state gate

#### Manual

- [x] 2.1 Capture all seven named states together in a dashboard kitchen-sink screenshot. — d2ca32d
