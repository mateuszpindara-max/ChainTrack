# Repository Guidelines

This is an Astro 7 SSR app with React 19 islands, Supabase auth, and Cloudflare Workers deployment. Most agent work lands in `src/pages`, `src/components`, and `src/lib`, and the first validation step is a real lint/build check.

## Hard rules

- Keep secrets in `astro:env/server` and local `.dev.vars`; do not expose them to client code. See `@astro.config.mjs` and `@src/lib/supabase.ts`.
- Protect routes through `@src/middleware.ts`; add new restricted pages to `PROTECTED_ROUTES` instead of creating ad hoc checks.
- Keep API routes server-rendered; files under `src/pages/api` must stay in SSR mode and validate input before use.

## Project structure

- `src/pages` holds Astro pages and API routes; `src/layouts` contains shared layout wrappers; `src/components` is for UI, with `src/components/ui` for shadcn-style primitives.
- `src/lib` contains helpers and client wiring; `public` holds static assets; `supabase/` stores the local Supabase configuration.
- Root config is owned by `@package.json`, `@astro.config.mjs`, and `@wrangler.jsonc`.

## Build, test, and development commands

- `npm install` - install dependencies.
- `npm run dev` - start the Astro dev server.
- `npm run lint` - run ESLint.
- `npm run build` - create the production SSR build.
- `npm run smoke` - run the auth-flow smoke check against a live server.
- `npm run preview` - preview the built app locally.

## Coding and validation

- Use Astro for page/layout composition and React only for interactivity. Prefer the `cn()` helper from `@/lib/utils` for merged class names instead of string concatenation.
- Match the Node version pinned in `.nvmrc` (22.14.0), and keep runtime secrets aligned with the Cloudflare/Supabase setup described in `@README.md`.
- CI is defined in `@.github/workflows/ci.yml`; it runs lint, `astro check`, and build, then a Supabase-backed smoke test against the production preview.

## Security and config tips

- `SUPABASE_URL` and `SUPABASE_KEY` are required in build and local preview environments; keep them in `.dev.vars` for local development and GitHub secrets for CI.
- When changing auth or route behavior, update both the runtime config and the user-facing flow in `@src/middleware.ts` and the auth pages under `src/pages/auth`.