# Development Setup

## Requirements

- Node.js `22.14.0` as pinned in `.nvmrc`, with npm.
- Docker Desktop for the local Supabase stack and database integration tests.
- Supabase CLI, available through the project dependency as `npx supabase`.

Install dependencies from the repository root:

```bash
npm install
```

## Local Supabase

The repository includes its Supabase configuration and migrations. Start the local stack from the repository root; the first start downloads the required Docker images:

```bash
npx supabase start
```

Use the local API URL and the `anon` key reported by the CLI in an ignored `.dev.vars` file:

```dotenv
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<local anon key>
```

Supabase Auth email confirmations are disabled by the tracked local configuration, so local signups can be used by the smoke and integration tests without an email inbox. The local Studio is available at `http://localhost:54323`. Stop the local stack when finished:

```bash
npx supabase stop
```

The project ID in `supabase/config.toml` is `chaintrack`; local database test scripts address the corresponding Docker container, `supabase_db_chaintrack`. This local identifier is not evidence of or a link to the production Supabase project. Do not use it to infer a production target.

To recreate the local database from tracked migrations:

```bash
npx supabase db reset
```

## Application Environment

Astro declares the Supabase and Strava values as server-only environment variables. Keep them in the ignored `.dev.vars` file for local development; never put their values in tracked files or browser code.

For local Supabase, set `SUPABASE_URL` and `SUPABASE_KEY` as above. For a hosted Supabase project, use its Project URL and `anon`/publishable key from the Supabase dashboard. Avoid using a `service_role` key in the application.

Strava OAuth requires these additional server-side variables:

| Variable | Purpose |
| --- | --- |
| `STRAVA_CLIENT_ID` | Strava application client ID |
| `STRAVA_CLIENT_SECRET` | Strava application secret |
| `STRAVA_REDIRECT_URI` | Exact callback URL ending in `/api/strava/callback` |
| `STRAVA_TOKEN_ENCRYPTION_KEY` | 32 random bytes encoded as 64 hexadecimal characters |

For local development, configure the Strava callback domain as `localhost` and set the redirect URI to `http://localhost:4321/api/strava/callback`. The authorization requests `activity:read_all` and `profile:read_all`. Retain the encryption key securely; losing it requires users to reconnect Strava.

## Development and Validation

Start the app with:

```bash
npm run dev
```

Available checks and tests:

```bash
npm run lint
npm run check
npm test
npm run build
```

The auth-flow smoke test needs a reachable Supabase instance with email confirmation disabled. Run it against the dev server or a production preview:

```bash
npm run preview
BASE_URL=http://localhost:4321 npm run smoke
```

Database integration tests require Docker and the local Supabase database. Start Supabase first, then run:

```bash
npm run test:chain-concurrency
npm run test:waxing-integration
```

The waxing integration script also requires the app server to be reachable at its default `BASE_URL` (`http://127.0.0.1:4339`) or at a local URL supplied through `BASE_URL`.

## Cloudflare Deployment

The app is an Astro SSR application deployed to Cloudflare Workers with the Cloudflare adapter. The Worker is configured in `wrangler.jsonc` as `chaintrack-production`. Build locally with `npm run build`; deployment through Wrangler requires an authenticated Cloudflare account and owner approval:

```bash
npx wrangler deploy
```

Configure `SUPABASE_URL`, `SUPABASE_KEY`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI`, and `STRAVA_TOKEN_ENCRYPTION_KEY` as Cloudflare Worker secrets. Set the Strava redirect URI to the deployed Worker host's `/api/strava/callback` URL and configure the matching callback domain in Strava. Enter secrets directly through the Cloudflare dashboard or Wrangler prompt; do not commit or share their values.