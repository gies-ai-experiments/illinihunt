# CLAUDE.md - Quick Reference

**Be critical and challenge suggestions that might lead to poor code quality, security issues, or architectural problems.**

## Project Essentials

**IlliniHunt V2** - Product Hunt for University of Illinois
**Live (Azure stack)**: Frontend https://polite-desert-0406a5c10.7.azurestaticapps.net · API https://illinihunt.azurewebsites.net
**Stack**: React 18 + TypeScript (Vite) → Express + Prisma API → Azure Postgres 18 + Azure Blob + Entra ID auth
**Azure**: subscription `urbana-business-disruptionlab`, resource group `DL_ResourceGroup_01` (northcentralus)

> ### ⚠️ This branch is what deploys — `main` is not
>
> Azure Static Web Apps `illinihunt-dev` is wired to the **`azure-migration`** branch, and
> `illinihunt.org` / `www.illinihunt.org` serve from it. `main` still holds the pre-migration
> **Supabase** frontend (last `src/` commit 2026-05-10) and has diverged.
>
> `azure-static-web-apps.yml` triggers on pushes to **both** `main` and `azure-migration`, so a
> routine push to `main` would deploy the old Supabase build over production. Verified
> 2026-08-23 (`az staticwebapp show -n illinihunt-dev -g DL_ResourceGroup_01 --query branch`).
>
> **Deploying the API is a two-step:** pushing here deploys to the `staging` *slot* only
> (`azure-webapp-api.yml`); production needs a manual slot swap. The slot's app settings must
> match production or the deploy fails — `SCM_DO_BUILD_DURING_DEPLOYMENT` and
> `ENABLE_ORYX_BUILD` must both be `false`, or App Service re-runs Oryx over the already-built
> package and dies on `tsc: not found`.


> **Migrated off Supabase + Vercel (2026-06).** The app no longer uses Supabase or Vercel. Auth is Microsoft Entra ID (UIUC tenant) via MSAL; data is a dedicated `illinihunt` database on the shared `dl-postgresqlserver-01` server; images are in Azure Blob `illinihuntdevsa`. The React SPA talks to a new Express API (`api/` subdir), never to the DB directly. Old `illinihunt-dev-db` Postgres is retained temporarily for rollback. See [`docs/superpowers/specs/2026-05-26-azure-migration-design.md`](docs/superpowers/specs/2026-05-26-azure-migration-design.md).

## Quick Setup

```bash
# Clone & Install
git clone <repo> && cd illinihunt && npm install   # frontend
cd api && npm install                              # API

# Frontend env (.env.local) — Entra + API URL
VITE_AZURE_TENANT_ID=44467e6f-462c-4ea2-823f-7800de5434e3
VITE_AZURE_CLIENT_ID=02e095d4-b4f4-4209-86e7-56574e08cd11
VITE_API_URL=https://illinihunt.azurewebsites.net/api   # or http://localhost:3000/api for local

# API env (api/.env) — see api/.env.example (DATABASE_URL, AZURE_*, ADMIN_EMAILS)

# Verify & Run
npm run type-check && npm run build && npm run dev   # frontend on :5173
cd api && npm run dev                                # API on :3000
```

## Essential Commands

```bash
# Frontend
npm run dev          # Vite dev server (localhost:5173)
npm run build        # Production build (esbuild minifier — NOT terser; see vite.config notes)
npm run type-check   # TypeScript validation
npm run lint         # Code quality check

# API (api/)
cd api && npm run dev          # tsx watch on :3000
cd api && npm run build        # tsc → dist/
cd api && npm run prisma:pull  # re-introspect schema from DATABASE_URL
cd api && npm run prisma:generate

# Deploy: just `git push` — GitHub Actions deploys both halves.
#   .github/workflows/azure-static-web-apps.yml  → frontend → SWA
#   .github/workflows/azure-webapp-api.yml        → API image → ACR → App Service auto-pulls
```

## Architecture Overview

- **Auth**: Microsoft Entra ID (UIUC tenant) via MSAL redirect flow. The `@illinois.edu` restriction is enforced by the single-tenant app registration. API validates Entra JWTs against the tenant JWKS; admin gating is an email allowlist (`ADMIN_EMAILS`), ported from the old `is_admin()` PL/pgSQL function.
- **Database**: `illinihunt` DB on shared `dl-postgresqlserver-01` (Postgres 18). Scoped role `illinihunt_user` owns only this DB. Vote-count triggers + functions carried over. RLS was dropped — authorization now lives in the Express handlers.
- **API**: Express + Prisma (`api/`), containerized (debian-slim, not alpine — Prisma needs OpenSSL 3), on Azure App Service `illinihunt` pulling from ACR `illinihuntdevacr`.
- **Storage**: Azure Blob `illinihuntdevsa`, container `project-images`, public-read. Uploads stream through `POST /api/upload/image`.
- **Frontend**: React 18, TypeScript, Vite, Tailwind, shadcn/ui — on Azure Static Web Apps. Realtime votes replaced by 30s polling against `/api/votes/batch`.
- **Deployment**: `git push` → GitHub Actions → SWA (frontend) + ACR→App Service (API). Cloudflare DNS swap for `illinihunt.org` is still pending (see Current Focus).

## Current Focus (post-Azure-migration, 2026-06)
- [ ] **DNS cutover**: point `illinihunt.org` (Cloudflare) at the SWA hostname `polite-desert-0406a5c10.7.azurestaticapps.net`; add `https://illinihunt.org` to the Entra app redirect URIs; then decommission Vercel.
- [ ] **Delete old Postgres** `illinihunt-dev-db` + empty `illinihunt-dev` RG after 24–48h of stable shared-DB operation (rollback window).
- [ ] **Rotate** `SUPABASE_SERVICE_ROLE_KEY` (exposed during migration) + retire the Supabase project (keep paused 30d, then delete).
- [ ] **Sentry**: wire `VITE_SENTRY_DSN` (frontend) + `SENTRY_DSN` (API app setting) — instrumentation is in code, just needs the DSN.
- [ ] **Rename Entra scope** `Files.Read` → `access_as_user` (cosmetic; update `src/lib/msal-config.ts`).
- [ ] **Hardening**: Azure Monitor alerts (Postgres CPU, App Service 5xx, Blob 4xx); bump Postgres PITR retention; tighten firewall once egress confirmed.
- [ ] **Collections API**: `src/lib/services/collections.ts` mutations are still stubbed (read works); implement the Express handlers when collections UI is needed.
- [ ] Testing framework + accessibility/regression coverage for collection flows.

## Roadmap
- [x] Search & filtering system
- [x] Trending algorithm with analytics
- [x] Admin moderation tools
- [x] Project submission flow overhaul (PRs #78–#92): image upload reliability + full Sentry observability stack + funnel instrumentation
- [ ] Testing framework
- [ ] See: [Improvement Roadmap](docs/IMPROVEMENT_ROADMAP.md) for full details

## Session Log
### 2026-08-23 — agent readiness + an anonymous PII leak
- **Scored the site with is-agentic.com: 43 → 89** ("agents are likely to struggle" → "strong
  technical baseline"). Real 404s via an explicit 18-route table in `staticwebapp.config.json`
  (navigationFallback dropped — it was answering every unknown path with 200 + app shell);
  server-rendered fallback content and JSON-LD in `index.html`; `public/llms.txt`,
  `public/openapi.json`, `/.well-known/api-catalog`; server-rendered `/about` `/contact`
  `/privacy` `/docs` `/developers` with `.md` twins, all generated by
  `scripts/build-static-pages.py` — **edit that script, not the generated files in `public/`.**
- **`GET /api/users/:id` was leaking email addresses to anonymous callers.** It takes no auth and
  selected `email`; user ids come out of `GET /api/projects`, so every @illinois.edu address was
  harvestable (8/8 probed ids returned one). Fixed, and `api/src/routes/public-endpoints.test.ts`
  now fails if *any* unauthenticated handler mentions `email`. This was issue #95 surviving the
  Supabase→Azure migration into the Express API.
- Two SWA config constraints, both found by a failed deploy: `/api` and `/api/` count as a
  duplicate route, and `statusCode` cannot be combined with `rewrite` (in `routes` *or*
  `responseOverrides`). A responseOverride rewrite preserves the original status anyway.
- Known-unfixable on SWA: `markdown-negotiation-vary` needs `Accept:`-based content negotiation,
  which Static Web Apps cannot do. It would need the site served from the Express app instead.
- Verification script: `scripts/verify-agentic.sh <host>` — 58 assertions, every one a live
  request. Re-run it after any change to `staticwebapp.config.json` or the public pages.

### 2026-06-06
- Completed: **Full Supabase+Vercel → Azure migration, then consolidated onto shared lab infra.** (1) Built new Express+Prisma API (`api/`), Entra ID auth (MSAL redirect flow), 50+ endpoints replacing all Supabase SDK + 19 RPCs. (2) Migrated data to a dedicated `illinihunt` DB on shared `dl-postgresqlserver-01` (PG18) with scoped role `illinihunt_user` — 73 users/34 projects/99 votes verified, `entra_oid` linkage preserved. (3) Migrated 38 images Supabase Storage → Azure Blob `illinihuntdevsa`, rewrote 23 image URLs. (4) API runs on **App Service `illinihunt`** (container from ACR `illinihuntdevacr`, debian-slim for Prisma/OpenSSL3), replacing the initial Container Apps deploy (deleted). (5) Frontend on **Azure Static Web Apps**. (6) CI/CD: `git push` → GH Actions builds API image → ACR → webhook → App Service auto-pull; SWA workflow for frontend. (7) Moved ACR/Storage/SWA into `DL_ResourceGroup_01`; deleted Container App+env+Log-Analytics workspace. Debugging notes: terser broke shadcn `Avatar` cross-chunk re-export → switched Vite to esbuild minifier + dropped manualChunks; `supabase.ts` now a lazy throwing-stub so missing Supabase env doesn't crash boot; `main.tsx` env guard now requires Azure vars; popup auth hit `block_nested_popups` → redirect flow; Entra scope is `Files.Read` (pre-existing, works) not `access_as_user`.
- Next: see Current Focus — DNS cutover to illinihunt.org, delete old Postgres after rollback window, rotate exposed Supabase key, wire Sentry DSN.

### 2026-05-20
- Completed: Full Supabase Security Advisor sweep. **4 migrations** (`20260508000001`–`000004`): (1) enabled RLS on `public.comments` (policies existed but were inert — table was wide open); (2) flipped `user_bookmarks_with_projects` and `public_collections_with_stats` from SECURITY DEFINER → `security_invoker=true`; (3) pinned `search_path` on all 29 public functions via PL/pgSQL DO block with `to_regprocedure` guards (Codex P1 catch — original static ALTERs would fail `supabase db reset` on functions created via dashboard); (4) revoked EXECUTE from PUBLIC across the board (Codex P2 — without this, anon/auth inherit via PUBLIC even after explicit revokes), then re-granted per triage: trigger-only fns revoked from all client roles, admin/user RPCs `authenticated`-only, RLS helpers + stats kept on `anon, authenticated`; (5) dropped overly broad SELECT policy on `storage.objects` for `project-images` (CDN URL path bypasses RLS, so listing capability was unnecessary); (6) tightened `bookmarks` SELECT to `auth.uid() = user_id` and deduped two pairs of identical INSERT/DELETE policies (privacy leak — `qual=true` allowed any client to enumerate all users' bookmarks; all call sites already scope by user). Final advisor: **0 ERRORs, 28 WARNs** (25 accepted-risk SECURITY DEFINER helpers + 3 dashboard tasks). Also: customized `~/.claude/statusline-command.sh` to show `last <commit-age> session <YYYY-MM-DD>` (answers "when did I last work on this project" without leaving the bar). Saved memory: use `/codex-review` skill, not `codex:rescue` subagent (gets stuck on this project).
- Next: Dashboard tasks (enable HIBP password check, OTP expiry <1h, Postgres patch upgrade — all 1-click). Then 7-step secrets rotation in a quiet window (JWT rotation logs out every signed-in user). Drift to investigate: live `project_upvotes_count_trigger` points at `update_project_upvotes_count` but migration `20250814154600` says it should be `_robust` variant — either migration was reverted via dashboard or function renamed. Older carry-overs still open: (a) move `illinihunt-reverse-proxy` Worker source into a tracked repo with `wrangler deploy`; (b) recreate or roll `cf-illinihunt-zone-and-pages` token to clear phantom IP filter blocking CI `wrangler pages deploy`; (c) delete orphan `ZZ-orphan-never-used-DELETE` token.

*Older entries archived to `docs/session-archive.md`.*

## Quick Troubleshooting

```bash
# Type errors after schema changes — re-introspect Prisma from the live DB
cd api && npm run prisma:pull && npm run prisma:generate && npm run type-check

# Port conflicts
npx kill-port 5173

# Health check
npm run type-check && npm run build && echo "✅ Ready"
```

### Cloudflare + Vercel Issues

**Symptom**: Site works on Firefox but Chrome/Safari show "Expected JavaScript but got text/html" errors

**Cause**: Cloudflare CDN caches responses for up to 1 year (`max-age=31536000`). If you deploy a fix for routing issues, Cloudflare still serves old broken responses.

**Solution**: Purge Cloudflare cache after Vercel deployments
1. Login to Cloudflare dashboard
2. Select `illinihunt.org` domain
3. Go to: Caching → Configuration → Purge Everything
4. Wait 30 seconds, then hard refresh browser

**Prevention**: The `vercel.json` rewrite pattern `/:path((?!.*\\.).*)` excludes files with dots from SPA routing. Don't change this pattern without testing - Vercel has limited regex support and Cloudflare proxying breaks auto-detection.

## Documentation Structure

**Quick Access:**
- **[CLAUDE.md](CLAUDE.md)** - This quick reference (start here!)
- **[docs/INDEX.md](docs/INDEX.md)** - Complete documentation index
- **[README.md](README.md)** - Project overview

**Key Guides:**
- **[docs/MENTAL_MODEL.md](docs/MENTAL_MODEL.md)** - Architecture deep dive
- **[docs/IMPROVEMENT_ROADMAP.md](docs/IMPROVEMENT_ROADMAP.md)** - Planned enhancements
- **[docs/setup/CUSTOM_DOMAIN_SETUP.md](docs/setup/CUSTOM_DOMAIN_SETUP.md)** - Cloudflare domain config
- **[docs/setup/OAUTH_REDIRECT_FIX.md](docs/setup/OAUTH_REDIRECT_FIX.md)** - OAuth configuration

## Performance Best Practices

### Data Fetching Patterns

**❌ Anti-pattern: Waterfall Loading**
```typescript
// BAD: Sequential fetches create slow loading
useEffect(() => {
  loadAuth() // Wait 500ms
}, [])

useEffect(() => {
  if (auth) loadProject() // Wait 300ms
}, [auth])

useEffect(() => {
  if (project) loadCategories() // Wait 200ms
}, [project])
// Total: ~1000ms
```

**✅ Pattern: Cached + Parallel Loading**
```typescript
// GOOD: Use cached hooks and load in parallel
const { categories } = useCategories() // Cached, instant after first load
const { user } = useAuth() // Load in parallel

useEffect(() => {
  if (user) loadProject() // Only wait for auth
}, [user])
// Total: ~500-700ms
```

### When to Cache Data

**Always cache:**
- Categories (rarely change)
- Static configuration data
- User preferences

**Use `useCategories` hook:**
```typescript
import { useCategories } from '@/hooks/useCategories'

function MyComponent() {
  const { categories, loading } = useCategories() // Auto-cached
}
```

**Location**: `src/hooks/useCategories.ts` (5-min in-memory cache)

## Before Committing

```bash
npm run type-check && npm run build && npm run lint
grep -r "console.log" src/  # Minimize debug logs
```

**All changes**: Apply via Supabase migrations → Regenerate types → Test → Deploy
