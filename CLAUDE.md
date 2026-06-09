# CLAUDE.md - Quick Reference

**Be critical and challenge suggestions that might lead to poor code quality, security issues, or architectural problems.**

## Project Essentials

**IlliniHunt V2** - Product Hunt for University of Illinois
**Live**: https://illinihunt.org + https://www.illinihunt.org (both → **Azure Static Web Apps**, Cloudflare DNS-only) — fully off Vercel
**Repo**: https://github.com/gies-ai-experiments/illinihunt
**Legacy Supabase Project**: `catzwowmxluzwbhdyhnf` (deployed app no longer calls it — historical-data migration may still be pending, issue #93)
**Stack**: React 18 + TypeScript + **Azure App Service API** (`illinihunt.azurewebsites.net/api`) + **Entra ID (MSAL) auth** + **Azure Static Web Apps** frontend (migrating off Vercel) + Cloudflare DNS

> **Migration (2026-06-08, frontend cutover complete):** Frontend Vercel → Azure Static Web Apps (`polite-desert-0406a5c10.7.azurestaticapps.net`, RG `DL_ResourceGroup_01`, SWA `illinihunt-dev`); backend Supabase → Azure App Service (`illinihunt.azurewebsites.net/api`, App `illinihunt`) + Entra ID. **Both apex and `www` now serve from Azure** (Cloudflare DNS-only CNAMEs → SWA, valid Azure-managed certs); fully off Vercel. Deployed app calls the Azure API + Entra; **zero Supabase references remain**. Auth is single-tenant UIUC + `@illinois.edu` (verified, not a regression). **Still stale:** deep architecture/setup docs below still describe the old Vercel+Supabase stack — don't trust per-doc Vercel/Supabase references. Remaining backend hardening tracked in issue #98; apex↔www canonical redirect is an open minor item (SWA has no native host-based redirect).

## Quick Setup

```bash
# Clone & Install
git clone <repo> && cd illinihunt && npm install

# Environment (.env.local)
VITE_SUPABASE_URL=https://catzwowmxluzwbhdyhnf.supabase.co
VITE_SUPABASE_ANON_KEY=<get_from_supabase_dashboard>
SUPABASE_ACCESS_TOKEN=<get_from_supabase_settings>

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

# Supabase
npx supabase gen types typescript --project-id catzwowmxluzwbhdyhnf > src/types/database.ts
mcp__supabase__execute_sql({ project_id: "catzwowmxluzwbhdyhnf", query: "..." })
mcp__supabase__apply_migration({ project_id: "catzwowmxluzwbhdyhnf", name: "...", query: "..." })
```

## Architecture Overview

**For complete details, see: [`docs/MENTAL_MODEL.md`](docs/MENTAL_MODEL.md)**

- **Auth**: Google OAuth with @illinois.edu restriction + secure RLS policies
- **Database**: PostgreSQL with Row Level Security, database triggers for vote counting
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Deployment**: **Azure Static Web Apps** (apex, cut over 2026-06-08) — `www` still Vercel during migration
  - Apex `illinihunt.org` → Cloudflare **DNS-only** CNAME → `polite-desert-0406a5c10.7.azurestaticapps.net` (Azure-managed TLS; Cloudflare proxy + reverse-proxy worker bypassed)
  - `www.illinihunt.org` → still Cloudflare-proxied CNAME → Vercel until issue #96 (Azure `www` custom domain + cert) lands
  - Cloudflare-cache/Vercel troubleshooting below applies only while `www` remains on Vercel
  - See: [Cloudflare + Vercel Issues](#cloudflare--vercel-issues) below

## Current Focus
- [x] **Azure frontend cutover COMPLETE (2026-06-09)** — apex + `www` both serve from Azure Static Web Apps (`illinihunt-dev`, RG `DL_ResourceGroup_01`, DNS-only CNAMEs), fully off Vercel. Backend on Azure App Service API (`illinihunt.azurewebsites.net`) + Entra auth; no Supabase calls remain. Auth confirmed single-tenant UIUC + `@illinois.edu` (not a regression).
- [ ] **Azure backend data migration** — issue #93 (keshavdalmia10). App already runs on Azure; remaining: decide preserve-history vs fresh start (Supabase UUID → Entra OID re-key), then decommission legacy Supabase project `catzwowmxluzwbhdyhnf`.
- [ ] **Backend hardening — issue #98**: Key Vault for `DATABASE_URL`/secret conn strings; drop `localhost:5173` from prod CORS; optional UUID guards on other `:id` routes; optional **server-side `@illinois.edu` enforcement** (single-tenant admits B2B guests whose UPN isn't @illinois.edu — client gate alone wouldn't stop a direct API call; tenant + audience *are* enforced server-side).
- [ ] Canonical-host redirect apex↔www — both serve directly now (old apex→www 307 is gone); SWA has no native host-based redirect. Minor.
- [ ] Sweep deep docs (README, MENTAL_MODEL, `docs/setup/*`) off Vercel+Supabase language now that the migration is complete.
- [ ] **Manual:** remove the stray `agent-infra` crontab line (`crontab -r`) — added in error then reverted; the GitHub Actions cloudflare-backup CI runs fine, so the local cron is redundant. Couldn't remove it from automation (crontab spool not writable).
- [ ] Likely moot post-migration (revisit after Supabase decommission): remaining Supabase Security Advisor items; Supabase secrets rotation; troubleshooting banner (PR #92, lives on old Vercel build).
- [ ] Testing framework

## Roadmap
- [x] Search & filtering system
- [x] Trending algorithm with analytics
- [x] Admin moderation tools
- [x] Project submission flow overhaul (PRs #78–#92): image upload reliability + full Sentry observability stack + funnel instrumentation
- [x] Azure frontend cutover (apex + www → Static Web Apps; backend on App Service + Entra; off Vercel/Supabase) — 2026-06-09
- [ ] Azure backend data migration + Supabase decommission (issue #93)
- [ ] Testing framework
- [ ] See: [Improvement Roadmap](docs/IMPROVEMENT_ROADMAP.md) for full details

## Session Log
### 2026-06-09
- Completed: **Full Vercel/Supabase → Azure frontend cutover + fixed an unauth API crash.**
  - **DNS (Cloudflare via API):** added apex Azure-ownership TXT; cut apex `illinihunt.org` → DNS-only CNAME → Azure SWA `polite-desert-0406a5c10.7.azurestaticapps.net` (deleted Vercel A). Then registered `www` as SWA custom domain via `az` (TXT-token validation `_al9f87...`), waited for Azure to issue the cert *while www still served Vercel* (zero-downtime), verified valid cert, then flipped `www` CNAME → Azure (DNS-only) and removed the TXT. Both hosts live on Azure, valid TLS; DNS-only bypasses the `illinihunt-reverse-proxy` worker. Closed **#96**.
  - **Verified the backend from the live bundle:** deployed app calls Azure App Service `illinihunt.azurewebsites.net/api` + Entra (MSAL); **zero Supabase refs**. Auth is single-tenant UIUC (`AzureADMyOrg`) + `@illinois.edu` — *not* a regression (the `/common` I first flagged was an MSAL library constant). Checked App Service config: Easy Auth off, tenant+audience enforced server-side, no `@illinois.edu` env gate; `DATABASE_URL` plaintext + `localhost:5173` in prod CORS → filed hardening **#98**.
  - **API crash fix (PR #97, merged + deployed):** `GET /api/users/<non-uuid>` (e.g. `/me` falling through to `/:id`) hit `prisma.users.findUnique` on a UUID column → P2023; Express 4 doesn't route async rejections to errorHandler → Node 22 process exit = unauth DoS. Fix: `express-async-errors` + UUID guards. Codex-reviewed clean; deployed via ACR; verified `/me`→404 and server survives.
  - **Infra/docs:** committed migration-state docs to illinihunt `main`; updated `~/.claude/references/cloudflare-illinihunt.md`. Added a complete two-token Cloudflare snapshot (`agent-infra/cloudflare-snapshots/2026-06-09`) capturing migration-day state. (Briefly misdiagnosed the backup CI as dead from a stale clone and set up a redundant local cron — reverted it; the GitHub Actions weekly backup runs fine. One stray crontab line still needs manual `crontab -r`.)
- Next: (1) backend data migration + Supabase decommission (#93, preserve-history decision); (2) backend hardening (#98); (3) sweep deep docs off Vercel+Supabase; (4) confirm the agent-infra cron fires Sunday (FDA for `/usr/sbin/cron` if not); (5) decide apex↔www canonical redirect.

*Older entries archived to `docs/session-archive.md`.*

## Quick Troubleshooting

```bash
# Type errors after schema changes
npx supabase gen types typescript --project-id catzwowmxluzwbhdyhnf > src/types/database.ts && npm run type-check

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
