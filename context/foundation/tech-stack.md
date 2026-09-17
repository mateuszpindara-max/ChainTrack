---
starter_id: 10x-astro-starter
package_manager: npm
project_name: chaintrack
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

ChainTrack is a small, low-QPS web app with a three-week MVP and authentication, PostgreSQL-backed activity and chain data, and a manual external activity sync. The 10x Astro Starter is the vetted JavaScript/TypeScript default for this product shape and provides typed Astro/React UI, Supabase authentication and PostgreSQL, and Cloudflare Pages deployment with low operational overhead. Its conventions and documentation support agent-assisted development, while the external activity integration will require focused application code beyond the starter. GitHub Actions with auto-deploy on merge keeps the delivery path simple for a solo project; bootstrapper support is first-class, so occasional manual setup may still be needed.
