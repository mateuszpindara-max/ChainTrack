# Frame Brief: ChainTrack Product Identity

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

Starter-origin references remain visible across sign-in/sign-up or other auth screens, welcome screen, app name or starter references elsewhere in the UI, and browser tab/favicon/other browser-facing identity.

## Initial Framing (preserved)

- **User's stated cause or approach**: The relevant screens and material come from the starter and retain its identity or presentation.
- **User's proposed direction**: Align starter-derived screens with the rest of the app; replace starter content on the welcome screen with basic application information, not advertising; identify and update starter-origin information such as the project name; create a new favicon.
- **Pre-dispatch narrowing**: Investigate all user-visible surfaces together, and include project-facing materials as well. The desired observable outcome is that people recognize the app as ChainTrack, not the starter.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Welcome-page content** — signed-out visitors see explicit starter branding and developer-oriented feature copy instead of ChainTrack's purpose.
2. **Shared browser/config identity** — fallback document title, favicon, and configuration warnings may expose starter identity across routes.
3. **Auth-to-product presentation** — auth screens may lack ChainTrack identity and use a visual language different from the signed-in dashboard, even if they do not literally name the starter.
4. **Project-facing identifiers** — README, package metadata, and local service identifiers may retain starter names; some are internal and not visible to users at runtime.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Welcome-page content is the sole source | `/` renders `Welcome` for signed-out visitors (`src/pages/index.astro:11-13`). `src/components/Welcome.astro:23-26` calls the page “10x Astro Starter” and describes a starter; feature copy at lines 62-64, 85-88, and 107-110 promotes auth, stack, and developer experience. Other independently controlled surfaces also have evidence below. | WEAK |
| Shared browser/config identity contributes | `src/layouts/Layout.astro:10` defaults to “10x Astro Starter”; `/` inherits it. `src/layouts/Layout.astro:18` references `/favicon.png`. `src/lib/config-status.ts:11-18` links to the starter repository in a missing-config warning. The viewed 32x32 favicon appears as a tiny light mark on a blue field; its brand cannot be identified confidently at this resolution. | STRONG |
| Auth screens are literal starter-name leaks | `src/pages/auth/signin.astro:8-12`, `signup.astro:8-12`, and `confirm-email.astro:21-28` use generic auth titles/content, not the starter name. Their cosmic/purple styling is shared with the welcome and differs from the dashboard's ChainTrack/orange presentation (`src/components/ActivityDashboard.tsx:218-229`). This supports presentation inconsistency, not a literal-name leak from auth itself. | WEAK |
| Project-facing identifiers are runtime-visible | Starter strings appear in `package.json:2`, `supabase/config.toml:5`, and the repository README. These identify project/setup materials; by themselves they do not establish a user-facing runtime problem. | NONE |

## Narrowing Signals

Decisive observations from Step 4 (user reports + sub-agent findings) that narrowed the hypothesis space:

- The user chose all user-visible brand touchpoints together, rather than only the signed-out first impression.
- The user explicitly included project-facing materials as well as runtime surfaces.
- The welcome page is the clearest visible starter copy, but the shared layout and missing-config banner independently emit starter identity; welcome-only scope would leave those paths untouched.
- Auth pages do not literally say “10x Astro Starter”; their demonstrated issue is generic product identity and styling that differs from ChainTrack's dashboard.
- The favicon is served app-wide and the user wants it replaced, but visual inspection of the 32x32 image did not establish that it depicts starter branding.

## Cross-System Convention

Within this app, the dashboard and chain-management view already identify the product as “ChainTrack” and use orange accents (`src/components/ActivityDashboard.tsx:226`, `src/components/ChainManager.tsx:239`). The root welcome and shared layout instead retain explicit starter naming; auth pages use generic titles. This points to identity being applied per surface rather than consistently across entry points. The existing deployment Worker name is already `chaintrack-production` (`wrangler.jsonc:2`), so the mismatch is not universal across project configuration.

Prior scope decision: the archived `filter-activities` plan explicitly preserved the signed-out welcome unchanged (`context/archive/2026-10-23-filter-activities/plan.md:147-153`), confirming that the current copy survived an earlier, narrower dashboard/navigation change rather than being newly introduced by the recent work.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: ChainTrack's product identity is not consistently carried across its public entry experience, authentication surfaces, shared browser/configuration identity, and project-facing materials, leaving explicit starter branding in places and insufficient ChainTrack identity in others.

The evidence does not support one root cause or the claim that every auth screen literally exposes starter copy. The welcome page and shared layout contain direct starter naming; auth screens are generic and visually out of step with the dashboard. The favicon should be replaced as requested, but the current mark cannot be called starter-branded based on this low-resolution image. A plan should therefore distinguish visible identity leaks from product-presentation consistency and from internal setup identifiers, rather than treating every occurrence of the starter ID as user-visible branding.

## Confidence

- **HIGH** — multiple independent code paths show concrete identity mismatches, the user confirmed the broad scope, and an independent read reached the same multi-surface diagnosis. The exact favicon mark remains unidentified, but that uncertainty does not change the overall framing or the user's explicit replacement request.

## What Changes for /10x-plan

Plan around a consistent ChainTrack identity across runtime-visible surfaces and explicitly scoped project-facing materials. Separate required user-visible changes from internal starter identifiers that are retained only for technical setup; verify the favicon before describing it as starter-branded.

## References

- Source files: `src/components/Welcome.astro:23-110`; `src/layouts/Layout.astro:10-20`; `src/lib/config-status.ts:11-18`; `src/pages/auth/signin.astro:8-12`; `src/pages/auth/signup.astro:8-12`; `src/pages/auth/confirm-email.astro:21-28`; `src/components/ActivityDashboard.tsx:218-229`; `src/components/ChainManager.tsx:239-243`; `src/pages/index.astro:11-13`; `package.json:2`; `supabase/config.toml:5`; `wrangler.jsonc:2`.
- Related prior decision: `context/archive/2026-10-23-filter-activities/plan.md:147-153`.
- Investigation tasks: 4 read-only sub-agent investigations (welcome content, shared identity, auth presentation, and independent diagnosis); no task IDs were exposed by the tool.
