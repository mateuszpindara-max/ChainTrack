---
date: 2026-10-30T21:57:44.492+01:00
researcher: "AI assistant using Copilot SDK in VS Code"
git_commit: b8783422b624a1f3de078ed10544545081afc8bc
branch: main
repository: ChainTrack
topic: "Dashboard visual system"
tags: [research, codebase, dashboard, design-system]
status: complete
last_updated: 2026-10-30
last_updated_by: "AI assistant using Copilot SDK in VS Code"
---

# Research: Dashboard visual system

**Date**: 2026-10-30T21:57:44.492+01:00  
**Researcher**: AI assistant using Copilot SDK in VS Code  
**Git Commit**: b8783422b624a1f3de078ed10544545081afc8bc  
**Branch**: main  
**Repository**: ChainTrack

## Research Question

For `dashboard-visual-system`, verify the supplied token values against the current theme implementation, describe the dashboard's shared-control contract and boundaries, and identify the remaining verification or scope questions.

## Summary

In the current working tree, the 14 value entries in `design-tokens.md` match the dashboard theme values in `src/styles/global.css`. The documented `surface` value is implemented under the `card` role rather than as a separate `surface` token. Dashboard theme values are scoped to `.dashboard-theme`, and the page wrapper applies that class; Tailwind utilities resolve through CSS-variable mappings in the same stylesheet.

Shared `Button` usage covers actions in `ActivityDashboard`, `ChainDetails`, and `ChainManager`, but the inspected dashboard paths retain native controls in `DashboardSidebar`, native selects, and a styled disclosure summary. The planned combined screenshot of seven named states is still pending. This is a source-backed review of the working tree, not a live pixel audit: the supplied dashboard browser tab returned `chrome-error://chromewebdata/`.

## Detailed Findings

### Theme values and exposure

- The 14 values listed in `context/changes/dashboard-visual-system/design-tokens.md:7-20` match the corresponding scoped values in `src/styles/global.css:128-148`. Specifically, the table's `surface` value is the `--card` role; the inspected stylesheet does not define `--surface` or `--color-surface`.
- Dashboard-specific variables are declared under `.dashboard-theme` in `src/styles/global.css:126-157`; the single dashboard wrapper applies that class in `src/pages/dashboard.astro:92-94`. The shared layout imports the stylesheet (`src/layouts/Layout.astro:1-3`).
- Tailwind v4 utilities are mapped through `@theme inline` in `src/styles/global.css:81-119`; the theme configuration points to CSS variables and has no separate Tailwind config path (`components.json:6-11`).
- The scoped stylesheet also defines `card-foreground`, `popover`, secondary, sidebar, and accent-foreground roles (`src/styles/global.css:130-156`). The supplied table is a selected role list, not an inventory of every role in the CSS theme.
- The destructive token review recorded a contrast warning and a fix that lightened the token and added a destructive foreground (`context/changes/dashboard-visual-system/reviews/impl-review.md:27-37`). The review notes no automated audit across token/opacity combinations, so it does not establish a comprehensive contrast result.

### Shared controls and preserved behavior

- `src/components/ui/button.tsx:7-47` centralizes semantic variants, sizes, focus-ring styling, and disabled styling for shared button actions.
- In the inspected dashboard paths, `ActivityDashboard` uses `Button` for actions including Strava connection/import, retry, sync, drawer close, and load-more (`src/components/ActivityDashboard.tsx:232-326,475-490,517-666,693-702`). Its native selects at `437-452` and `596`, and the disclosure `<summary>` at `278`, remain outside the shared Button component.
- `DashboardSidebar` navigation, selection, retry, and load-more controls remain native `<button>` elements in `src/components/DashboardSidebar.tsx:66-245`; the component uses semantic classes and focus styling, but those controls do not inherit the shared Button implementation.
- `ChainDetails` and `ChainManager` use `Button` for the inspected retry, confirm, save, delete, and pagination actions (`src/components/ChainDetails.tsx:69-145,202,238-246`; `src/components/ChainManager.tsx:246,312,424-524`). Their semantic status/error styling is in `ChainDetails.tsx:59-70,148-151,232-245` and `ChainManager.tsx:281-307,341-344,384-416`.
- When changing presentation in these paths, preserve the current callbacks and native control behavior, button types, loading/disabled states, confirmations, focus/ARIA attributes, and pagination affordances. `ChainManager` tracks create, save, and delete busy states through `creating`, `savingId`, and `deletingId` (`src/components/ChainManager.tsx:83,89,91`); its controls reflect these states at `312-313,424-425,460-471`. Confirmation and disabled behavior also apply in `ChainDetails`.

### Remaining verification and scope

- The plan's Phase 2 gate asks for a single dashboard screenshot showing default, hover, focus, disabled, error, empty, and loading states together. The plan and implementation review mark this gate pending; they record separate overview, management, and validation-error captures instead (`context/changes/dashboard-visual-system/plan.md:22-24`; `reviews/impl-review.md:39-43`).
- The task plan's initial audit charges describe the pre-change token, focus, and button gaps (`plan.md:5-11`). Current source shows token mappings and shared controls on the named actions, while the native controls listed above remain; treat the plan's audit section as historical rationale, not a complete statement of current implementation.
- The shared browser tab for `/dashboard` was not readable during this research because it reported `chrome-error://chromewebdata/`. The source and existing plan/review were used instead; no current rendered appearance is claimed here.

## Code References

- `src/styles/global.css:81-119,126-157` - Tailwind utility mappings and dashboard-scoped semantic values.
- `src/pages/dashboard.astro:92-94` - Dashboard theme wrapper.
- `src/components/ui/button.tsx:7-47` - Shared button variants and interaction styling.
- `src/components/ActivityDashboard.tsx:232-326,437-452,475-490,517-666,693-702` - Shared actions and remaining native controls.
- `src/components/DashboardSidebar.tsx:66-245` - Sidebar native control paths.
- `src/components/ChainDetails.tsx:59-70,103-151,202,232-246` - Chain status and action controls.
- `src/components/ChainManager.tsx:246,281-307,312,341-416,424-524` - Management actions and stateful controls.
- `context/changes/dashboard-visual-system/design-tokens.md:7-20` - Scoped token-value handoff.
- `context/changes/dashboard-visual-system/reviews/impl-review.md:27-43` - Recorded contrast fix and remaining screenshot gate.

## Architecture Insights

- The dashboard's semantic color contract is applied at the page wrapper rather than by redefining the shared global theme for every route.
- `@theme inline` connects the semantic CSS variables to utility classes, while the shared `Button` provides a reusable control contract. Native selects and disclosure summaries have different semantics and are not represented by that button abstraction.
- The current source changes are present in a dirty working tree. The commit hash in this document identifies repository `HEAD`; it does not identify the uncommitted bytes cited above.

## Historical Context (from prior changes)

- `context/changes/product-identity/plan-brief.md:27,42` treats the dashboard and chain-manager palette as an existing dark/orange visual reference. The current change preserves that identity while aligning dashboard role values and controls.
- `context/changes/chain-lifecycle-tracking/plan.md:41` excludes a UI color-scheme rework from that lifecycle change's scope. This is a scoped historical boundary, not a repository-wide ban on a later visual-system change.
- `context/foundation/2dos.md:5-6` records preventing a chain from being assigned to two bikes at once and showing the bike in cycle history. The current change explicitly defers these functional lifecycle items (`context/changes/dashboard-visual-system/change.md:12` and `plan.md:28`).

## Related Research

Not applicable; no related `research.md` artifact was identified in the active change materials.

## Open Questions

- Complete the planned combined seven-state screenshot gate before treating the full visual verification plan as done.
- Decide whether native sidebar buttons and the remaining `ActivityDashboard` select/disclosure controls are in scope for shared-control alignment or intentionally remain native.
- A live visual pass remains unconfirmed in this research because the provided browser tab did not load.
