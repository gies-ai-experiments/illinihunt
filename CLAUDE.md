# CLAUDE.md - Quick Reference

**Be critical and challenge suggestions that might lead to poor code quality, security issues, or architectural problems.**

## Project Essentials

**IlliniHunt V2** - Product Hunt for University of Illinois
**Live**: https://illinihunt.org + https://www.illinihunt.org (both → **Azure Static Web Apps**, Cloudflare DNS-only) — fully off Vercel
**Repo**: https://github.com/gies-ai-experiments/illinihunt
**Legacy Supabase Project**: `catzwowmxluzwbhdyhnf` — **not in the dashboard project list** (Vishal checked 2026-08-23; his other projects appear there, paused). Both stored access tokens 401. ⚠️ **DNS proves nothing here.** Controls both ways: two *active* Supabase projects resolve NOERROR and answer HTTP 401, while all four of Vishal's *paused* projects (awg, badm554-survey-bot, entrebot, prs-studio) are NXDOMAIN — same as illinihunt and same as a made-up ref. DNS separates active from not-active; it cannot separate paused from deleted. Deleted-vs-paused-in-another-org is still unconfirmed; a fresh personal access token (`GET /v1/projects` lists across all orgs) would settle it. Data migration is reconciled and complete: 34 projects / 99 votes match the counts verified at migration time, all 34 predate the cutover, and all 23 image URLs are on Azure Blob with zero Supabase URLs left. Azure Postgres is now the **sole copy**. See #93.
**Stack**: React 18 + TypeScript + **Azure App Service API** (`illinihunt.azurewebsites.net/api`) + **Entra ID (MSAL) auth** + **Azure Static Web Apps** frontend (migrating off Vercel) + Cloudflare DNS

> ### ⚠️ The deployed code is on `azure-migration`, not `main`
>
> **`main` is not deployed and does not contain the live frontend.** Azure Static Web Apps
> `illinihunt-dev` builds from **`azure-migration`**; `main`'s `src/` is the pre-migration
> **Supabase** frontend (last touched 2026-05-10) and the `api/` directory does not exist here at
> all. Verified 2026-08-23 via
> `az staticwebapp show -n illinihunt-dev -g DL_ResourceGroup_01 --query branch`.
>
> Pushing to `main` is *safe* (the deploy workflows live only on `azure-migration`), but reading
> `main` to understand the running system will mislead you. **Work on `azure-migration`, and read
> its CLAUDE.md** — it carries the deploy runbook (container→ACR for the API, SWA for the
> frontend), the rollback image tag, and the constraints that cost this session three failed
> deploys.

> **Migration (2026-06-08, frontend cutover complete):** Frontend Vercel → Azure Static Web Apps (`polite-desert-0406a5c10.7.azurestaticapps.net`, RG `DL_ResourceGroup_01`, SWA `illinihunt-dev`); backend Supabase → Azure App Service (`illinihunt.azurewebsites.net/api`, App `illinihunt`) + Entra ID. **Both apex and `www` now serve from Azure** (Cloudflare DNS-only CNAMEs → SWA, valid Azure-managed certs); fully off Vercel. Deployed app calls the Azure API + Entra; **zero Supabase references remain**. Auth is single-tenant UIUC + `@illinois.edu` (verified, not a regression). **Still stale:** deep architecture/setup docs below still describe the old Vercel+Supabase stack — don't trust per-doc Vercel/Supabase references. Remaining backend hardening tracked in issue #98; apex↔www canonical redirect is an open minor item (SWA has no native host-based redirect).

## Quick Setup

```bash
# Clone & Install
git clone <repo> && cd illinihunt && npm install

# Verify & Run
npm run type-check && npm run build && npm run dev
```

## Essential Commands

```bash
# Development
npm run dev          # Start server (localhost:5173)
npm run build        # Production build
npm run type-check   # TypeScript validation
npm run lint         # Code quality check

# Database — Supabase is GONE (project catzwowmxluzwbhdyhnf deleted; see #93).
# There are no `npx supabase` or mcp__supabase__* commands for this project any
# more, and src/types/database.ts on this branch is a pre-migration artefact.
# The live schema is Prisma against Azure Postgres, on the azure-migration branch:
#   cd api && npm run prisma:pull        # re-introspect from DATABASE_URL
#   cd api && npm run prisma:generate
```

## Architecture Overview

**For complete details, see: [`docs/MENTAL_MODEL.md`](docs/MENTAL_MODEL.md)**

- **Auth**: Google OAuth with @illinois.edu restriction + secure RLS policies
- **Database**: PostgreSQL with Row Level Security, database triggers for vote counting
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Deployment**: **Azure Static Web Apps** — apex + `www` both cut over 2026-06-09 (issue #96 closed); fully off Vercel
  - Apex `illinihunt.org` and `www.illinihunt.org` → Cloudflare **DNS-only** CNAMEs → `polite-desert-0406a5c10.7.azurestaticapps.net` (Azure-managed TLS; Cloudflare proxy + reverse-proxy worker bypassed)
  - [Cloudflare + Vercel Issues](#cloudflare--vercel-issues) below is historical (pre-migration) — kept for reference only

## Current Focus
- [x] **Azure frontend cutover COMPLETE (2026-06-09)** — apex + `www` both serve from Azure Static Web Apps (`illinihunt-dev`, RG `DL_ResourceGroup_01`, DNS-only CNAMEs), fully off Vercel. Backend on Azure App Service API (`illinihunt.azurewebsites.net`) + Entra auth; no Supabase calls remain. Auth confirmed single-tenant UIUC + `@illinois.edu` (not a regression).
- [x] **Supabase decommission / data reconcile — issue #93** (taken back from Keshav 2026-08-23). The "Azure 24 vs Supabase ~34" blocker was a **pagination artefact**: `GET /api/projects` defaults to `limit=24` (`api/src/routes/projects.ts:15`), so the June check read the page size — `total` was 34 all along. Reconcile: projects 34=34, votes 99=99, users 73→75 (+2 signups, no loss); all 34 projects predate the cutover; 23/23 images on Azure Blob, 0 Supabase URLs. The Supabase project does not appear in the dashboard, so the planned pre-delete backup probably cannot be taken — but see the caveat above: this is **not** confirmed deleted, and if it turns out to be paused in another org the backup is still possible.
- [ ] **Sole-copy backup posture** (follow-on from #93): Azure Postgres `dl-postgresqlserver-01` has 35-day PITR but **geo-redundant backup Disabled** and no HA, and it is now the only copy of the student data. Geo-redundancy cannot be retrofitted to an existing Flexible Server → set up a scheduled logical `pg_dump` to Blob.
- [ ] **Verify the submit flow end-to-end before semester traffic.** No user-generated content since 2026-05-11 — zero projects and zero comments since the June cutover — so the Azure/Entra submission path has never been exercised by a real user. Plausibly just a dormant summer, but worth an authenticated test now rather than after students arrive.
- [ ] **Backend hardening — issue #98**: Key Vault for `DATABASE_URL`/secret conn strings; drop `localhost:5173` from prod CORS; optional UUID guards on other `:id` routes; optional **server-side `@illinois.edu` enforcement** (single-tenant admits B2B guests whose UPN isn't @illinois.edu — client gate alone wouldn't stop a direct API call; tenant + audience *are* enforced server-side).
- [ ] Canonical-host redirect apex↔www — both serve directly now (old apex→www 307 is gone); SWA has no native host-based redirect. Minor.
- [ ] Sweep deep docs (README, MENTAL_MODEL, `docs/setup/*`) off Vercel+Supabase language now that the migration is complete.
- [ ] **Manual:** remove the stray `cloudflare-backup-cron.sh` crontab line — the GitHub Actions backup runs fine, so it is redundant. ⚠️ **Not `crontab -r`** (that deletes the whole crontab — there are four jobs). Use:
  `crontab -l | grep -v cloudflare-backup-cron | crontab -`
- [ ] Likely moot post-migration (revisit after Supabase decommission): remaining Supabase Security Advisor items; Supabase secrets rotation; troubleshooting banner (PR #92, lives on old Vercel build).
- [x] **Agent readiness (2026-08-23)** — is-agentic 43 → 89; real 404s, server-rendered content, `llms.txt` + `openapi.json`, trust-anchor pages. Remaining checks are either infeasible on SWA (`Accept:` content negotiation) or need an npm CLI publish.
- [ ] **Close #95** — the anonymous email leak is fixed and deployed; the issue is still open.
- [ ] Testing framework

## Roadmap
- [x] Search & filtering system
- [x] Trending algorithm with analytics
- [x] Admin moderation tools
- [x] Project submission flow overhaul (PRs #78–#92): image upload reliability + full Sentry observability stack + funnel instrumentation
- [x] Azure frontend cutover (apex + www → Static Web Apps; backend on App Service + Entra; off Vercel/Supabase) — 2026-06-09
- [x] Agent readiness / AI-agent discoverability — is-agentic 43 → 89 (2026-08-23)
- [ ] Azure backend data migration + Supabase decommission (issue #93)
- [ ] Testing framework
- [ ] See: [Improvement Roadmap](docs/IMPROVEMENT_ROADMAP.md) for full details

## Session Log
### 2026-08-23 — agent readiness (is-agentic 43 → 89) + closed an anonymous PII leak
- **Scored the site with is-agentic.com and fixed what it found: 43 → 89/100** ("agents are
  likely to struggle" → "strong technical baseline"), 12 checks flipped. Real HTTP 404s (an
  explicit 18-route table replaced `navigationFallback`, which answered *every* unknown path
  with 200 + app shell); server-rendered homepage content + JSON-LD; `llms.txt`, `openapi.json`
  (12 endpoints, every shape replayed against the live API), `/.well-known/api-catalog`;
  server-rendered `/about` `/contact` `/privacy` `/docs` `/developers` with `.md` twins.
- **`GET /api/users/:id` was handing @illinois.edu addresses to anonymous callers** — no auth,
  and user ids come out of `GET /api/projects` (8/8 probed ids returned one). That is issue #95,
  which survived the Supabase→Azure migration into the Express API. Fixed and **deployed**;
  0/10 profiles leak now. Covered by a class-level test that fails if *any* unauthenticated
  handler mentions `email`.
- **The API had no working deploy path for ten weeks.** On 2026-06-09 a code-based experiment
  overwrote the container build-and-push workflow; the app config was never moved. Every
  `api/**` push since then went to a `staging` slot nothing swaps in, while production kept
  serving the 2026-06-09 image. Production is DOCKER and the slot is NODE|22-lts, so the swap
  would have *replaced production's container config* — caught by verifying staging before
  touching production. Container workflow restored.
- Deploy reality, now documented on `azure-migration`: **SWA deploys from `azure-migration`, not
  `main`** (`main` still holds the pre-migration Supabase frontend). A push to `main` is
  harmless — the SWA workflow has never existed there.
- Verification: `scripts/verify-agentic.sh <host>` on `azure-migration` — 58 live assertions,
  all passing.
- **#93 taken back from Keshav and reconciled.** The 24-vs-34 blocker was a pagination
  artefact (`GET /api/projects` defaults to `limit=24`; `total` was 34 all along). Projects
  34=34 and votes 99=99 against the counts verified at migration time, all 34 predate the
  cutover, 23/23 images on Azure Blob with zero Supabase URLs. The Supabase project is absent
  from the dashboard project list and both stored tokens are 401. **Correction:** I first read
  NXDOMAIN as proof of deletion — it is not. Four of Vishal's own *paused* projects return
  NXDOMAIN too, so paused and deleted are indistinguishable by DNS; the control I ran (a
  made-up ref) was the wrong reference class. Deleted-vs-paused remains open.
  Stale Supabase credentials removed from `.env.local` and `~/.env` (backup in
  `~/.local/share/illinihunt-env-backup-2026-08-23/`), and the dead `npx supabase` commands in
  CLAUDE.md/AGENTS.md replaced with the Prisma equivalents.
- Next: (1) settle deleted-vs-paused for `catzwowmxluzwbhdyhnf` — check the dashboard's **other
  organizations**, or issue a personal access token so `GET /v1/projects` can list across orgs;
  if it is merely paused, **take the backup before anything else**. Then close **#93**; (2) close **#95** (email-leak fix deployed and verified); (3) **sole-copy
  backup** — Azure Postgres is now the only copy and has no geo-redundancy; (4) **exercise the
  submit flow** before semester traffic (no user content since 2026-05-11); (5) backend
  hardening **#98**; (6) the `staging` slot 503s — harmless, dead weight.

*Older entries archived to `docs/session-archive.md`.*

## Quick Troubleshooting

```bash
# Type errors after schema changes (azure-migration branch — Prisma, not Supabase)
cd api && npm run prisma:pull && npm run prisma:generate && npm run build

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
