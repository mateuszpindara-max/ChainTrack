# ChainTrack Product Identity — Plan Brief

> Full plan: `context/changes/product-identity/plan.md`
> Frame brief: `context/changes/product-identity/frame.md`

## What & Why

ChainTrack's product identity is not consistently carried across its public entry experience, authentication surfaces, shared browser/configuration identity, and project-facing materials, leaving explicit starter branding in places and insufficient ChainTrack identity in others.

This plan replaces that starter-derived presentation with a factual, restrained ChainTrack identity. It keeps the auth and data behavior intact while refreshing the active project materials that contributors and local development rely on.

## Starting Point

The welcome screen still names and promotes the Astro starter, shared browser titles and a configuration warning retain starter identity, and auth screens use generic copy with purple/cosmic styling. Active package and local Supabase names also retain starter identifiers; smoke and database tests depend on some of those values.

## Desired End State

The signed-out welcome shows ChainTrack with sign-in/sign-up actions, and the auth flow uses the app's established dark surface and orange accents. Browser titles, the favicon, and configuration messaging identify ChainTrack without changing account behavior.

Active project names and onboarding instructions are aligned: the README is a short product overview, while setup guidance lives in `docs/setup.md` and is linked from `AGENTS.md`. Historical starter-selection and archived records remain unchanged.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Scope | Runtime surfaces and active project files; preserve archive/tool history | Removes active starter leaks without rewriting historical evidence | Frame / Plan |
| Welcome | ChainTrack name and sign-in/sign-up actions only | Keeps the welcome factual and restrained, not promotional | Plan |
| Auth styling | Follow the dashboard's dark surface and orange cues | Reuses the existing product visual language | Plan |
| Favicon | High-contrast orange chain-link mark | Directly reflects chain tracking and is intended to read small | Plan |
| README | Short product overview; move setup to `docs/setup.md` | Separates product identity from contributor onboarding | Plan |
| Local names | Rename package and Supabase project to `chaintrack`; update dependent tests | Keeps active identifiers consistent without implying a production rename | Plan |
| Operational references | Update current local-ID statements in the active production-status plan and brief | Avoids stale guidance while preserving the production-identity safety warning | Plan |

## Scope

**In scope:** welcome/auth/browser identity, config warning, favicon, active package and local Supabase naming, dependent database test scripts, README and setup guide, `AGENTS.md` link, active operational references, and automated/manual verification.

**Out of scope:** auth-flow changes, schema migrations, production Supabase or Cloudflare changes, secret/deployment updates, product features, and edits to archived/bootstrap/course/tool-selection history.

## Architecture / Approach

Phase 1 updates only the runtime presentation and smoke expectation, using the dashboard and chain manager as the style reference. Phase 2 updates active project metadata and local Supabase-dependent scripts, moves onboarding into a dedicated guide, corrects the active operational warning, then runs the full checks and smoke flow.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Runtime Identity and Entry Screens | ChainTrack welcome/auth identity, shared titles/config messaging, favicon, and smoke assertion | Shared auth component styling must change presentation without altering form behavior |
| 2. Project Identity, Onboarding, and Verification | Consistent active identifiers, product README/setup guide, refreshed operational reference, and verified local flows | Local Supabase container identity changes with `project_id` and must match test scripts |

**Prerequisites:** Node 22.14.0; configured local secrets for build/preview; local Supabase and disabled email confirmation for smoke; Docker/Supabase for database integration scripts.
**Estimated effort:** About 2-3 focused implementation sessions across two phases; Docker-backed verification depends on local Supabase availability.

## Open Risks & Assumptions

- `chaintrack` is available as the desired local package and Supabase project identifier; this affects local tooling only, not production resource names.
- Docker-backed integration scripts may require stopping and restarting the local Supabase stack after the configuration rename.
- The exact favicon artwork will be validated at browser-tab size; the choice of chain-link direction is settled, not a claim about the existing mark.

## Success Criteria (Summary)

- Signed-out and auth pages identify ChainTrack consistently and preserve the existing account flows.
- Active project metadata, local Supabase test names, README, and setup guide agree, with historical records retained.
- Lint, Astro check, unit tests, build, smoke test, and available local database integration tests pass; public/auth views and favicon are manually checked.