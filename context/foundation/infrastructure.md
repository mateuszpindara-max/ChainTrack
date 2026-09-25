---
project: ChainTrack
researched_at: 2026-09-25
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript / JavaScript
  framework: Astro 7
  runtime: Cloudflare Workers runtime with Astro SSR adapter
---

## Recommendation

**Deploy on Cloudflare Workers.**

This is the most fitting MVP hosting choice for ChainTrack because the app is already built as an Astro SSR project with a Cloudflare adapter, the platform supports JavaScript/TypeScript and server-rendered workloads, and it gives the lowest operational overhead for a small solo-project workload without pushing the team into a full container or VM workflow. The decision is reinforced by the cost-sensitive interview answers and the Cloudflare stack already being the default path in the project hand-off.

## Platform Comparison

The platform comparison below is scored against the five agent-friendly evaluation criteria: CLI-first operations, managed/serverless posture, agent-readable documentation, stable deployment API, and MCP/first-class integration.

| Platform | CLI-first | Managed / serverless | Agent-readable docs | Stable deploy API | MCP / integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass | 5/5 |
| Vercel | Pass | Pass | Pass | Pass | Partial (MCP beta; agent tooling strong) | 4.5/5 |
| Railway | Pass | Pass | Pass | Pass | Pass | 4.5/5 |
| Netlify | Pass | Pass | Pass | Pass | Pass | 4.5/5 |
| Fly.io | Pass | Pass | Pass | Pass | Partial | 4.5/5 |
| Render | Pass | Pass | Partial | Pass | Partial | 3.5/5 |

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Cloudflare wins because it is the platform already aligned to the app’s Astro + Cloudflare adapter, has first-class CLI support with `wrangler`, very strong docs in Markdown/LLM-readable formats, built-in global edge delivery, and a fully managed serverless story for SSR and API routes. The project’s single-user, low-QPS MVP does not need a heavier VM or container platform, and the cost and DX profile fit the product stage well.

#### 2. Vercel

Vercel is the strongest runner-up because it has excellent DX, extremely polished deploy previews, easy rollbacks, and a very mature Git-based workflow. Its weakness for this project is that it is a slightly less natural match for the current Cloudflare-first architecture and is a more obvious choice for a Next.js-heavy stack than for a Cloudflare-native Astro SSR app. Vercel is still an excellent backup plan if Cloudflare deployment or team constraints change.

#### 3. Railway

Railway scores very highly on DX and co-located services, making it an attractive option for a project that needs rapid iteration and simple managed Postgres or storage. It loses to Cloudflare in this case because the project already uses Cloudflare native tooling, the stack is small and simple, and the cost-minimization preference makes Cloudflare’s lower-friction edge hosting more compelling for an MVP.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. Cloudflare’s edge runtime is not a perfect match for every Node library or SSR assumption; some middleware and server-only code can behave differently than local Node or a classic VPS runtime.
2. Cloudflare’s function limits, cold starts, and execution constraints can become painful if the app grows beyond a low-QPS MVP or if code path complexity increases quickly.
3. The project’s auth, Supabase, and middleware flow are all tightly coupled to server-side request execution; a misconfigured deployment boundary or env-var mismatch can break access control in a way that is hard to notice until production traffic hits.
4. While Cloudflare has mature docs, the operational story still changes across Workers environments and bindings; the team can get trapped in “works locally, fails in deployment” configuration drift if setup is not disciplined.
5. A Cloudflare-first stack can create subtle vendor lock-in for any future migration, especially if the product later needs more explicit server orchestration or a more traditional event-driven backend.

### Pre-Mortem — How This Could Fail

The team deployed ChainTrack to Cloudflare Workers for the MVP and was initially confident because the platform fit the Astro stack and the cost was low. They assumed the server-rendered routes, Supabase SSR session handling, and Cloudflare adapter would behave identically to a standard Node deployment. In reality, a few edge-runtime differences in middleware behavior and environment access surfaced only after real users started hitting auth and dashboard flows. The team then made a round of quick fixes in production without a reproducible local parity check, which masked the deeper issue: the project was effectively running under a different execution model than the local dev setup. A small but steady increase in traffic exposed cold-start and Worker limits, and a misconfigured secret or binding caused intermittent auth failures. By the time the team realized the issue, the MVP had lost trust and the operational complexity had become larger than the original app logic warranted.

### Unknown Unknowns

- A runtime mismatch can surface only under live traffic, especially in middleware and auth/session flows that rely on exact request lifecycle behavior.
- Cloudflare Workers configuration can look “simple” while still requiring careful handling of environment variables, preview deployments, and secret rotation across multiple projects.
- The production stack may need a deliberate decision on whether to use D1/R2 or an external Supabase/Postgres layer; that choice affects scale, budget, and operational complexity later.
- Some features that feel “just works” in local dev require explicit platform configuration for headers, cookies, caching, or route rules on the edge platform.
- A future migration away from Cloudflare can be more expensive than expected because the app’s platform-specific assumptions may be embedded in the runtime model, not just in deployment commands.

## Operational Story

- **Preview deploys**: Cloudflare Workers previews from GitHub-connected branches or PRs create a unique preview URL; preview access can be restricted with Cloudflare Access or a custom auth gate if needed.
- **Secrets**: Store runtime secrets in Cloudflare environment variables or `wrangler secret put` for Workers, and keep local values in `.dev.vars` only for development; rotate secrets on a schedule and scope access to the project team.
- **Rollback**: Revert to a previous deployment from the Cloudflare dashboard or CLI; the path is fast, with a deployment rollback typically taking minutes rather than a full rebuild cycle.
- **Approval**: Production publish, secret rotation, and database or storage policy changes should require a human approval step; the agent can handle deploy, log review, and build checks but not final production authorization on sensitive changes.
- **Logs**: Use `wrangler tail`, `wrangler deployments list`, and the Cloudflare dashboard logs to read runtime and worker output in real time; keep access read-only for non-ops work.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Edge-runtime behavior differs from local Node assumptions | Devil's advocate | Medium | Medium | Validate auth and SSR flows in a production-like Cloudflare build before launch; keep a small parity test suite for middleware and request handling. |
| Cold starts or worker constraints grow as traffic or route complexity increases | Pre-mortem | Medium | Medium | Keep the MVP simple, avoid unnecessary runtime work, and monitor Workers usage early; optimize hot paths before adding feature growth. |
| Secret or env drift between local, preview, and prod causes auth failures | Unknown unknowns | Medium | High | Treat env vars as deployment artifacts, document the exact set per environment, and audit them before each release. |
| Platform lock-in increases migration cost if project structure changes later | Devil's advocate | Low | Medium | Keep business logic decoupled from platform runtime assumptions and prefer explicit integration boundaries around auth and storage. |
| Cloudflare preview/prod config drift hides deployment issues until users hit them | Research finding | Medium | Medium | Run production-style smoke checks after every deploy and keep a reproducible deployment checklist with preview and production environment parity checks. |

## Getting Started

1. Confirm the project’s Cloudflare Workers configuration in `wrangler.jsonc` and keep the app’s current Astro + Cloudflare adapter alignment intact.
2. Run a clean build from the project root: `npm install && npm run build`.
3. Authenticate and validate the project target: `npx wrangler login`.
4. Deploy the build with the project’s Cloudflare Workers configuration: `npx wrangler deploy`.
5. Set up production and preview environment variables and verify the auth flow after deployment using the project’s smoke check and a real login session.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
