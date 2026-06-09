# CLAUDE.md - Quick Reference

**Be critical and challenge suggestions that might lead to poor code quality, security issues, or architectural problems.**

## Project Essentials

**IlliniHunt V2** - Product Hunt for University of Illinois
**Live**: https://illinihunt.org (apex → **Azure Static Web Apps**, DNS-only) | `www` still on Vercel — **migration in progress**
**Repo**: https://github.com/gies-ai-experiments/illinihunt
**Legacy Supabase Project**: `catzwowmxluzwbhdyhnf` (deployed app no longer calls it — historical-data migration may still be pending, issue #93)
**Stack**: React 18 + TypeScript + **Azure App Service API** (`illinihunt.azurewebsites.net/api`) + **Entra ID (MSAL) auth** + **Azure Static Web Apps** frontend (migrating off Vercel) + Cloudflare DNS

> **⚠️ Migration in progress (2026-06-08):** Frontend Vercel → Azure Static Web Apps (`polite-desert-0406a5c10.7.azurestaticapps.net`); backend Supabase → Azure App Service + Entra ID. **Verified from the live bundle (2026-06-08):** deployed app calls `https://illinihunt.azurewebsites.net/api` + Entra (`login.microsoftonline.com/common`); **zero Supabase references remain**. Apex `illinihunt.org` is cut over (Cloudflare DNS-only CNAME → SWA, valid Azure-managed cert). `www.illinihunt.org` is **still on Vercel** — blocked on Azure issuing a cert for it (issue #96). Deep architecture/setup docs below still describe the old Vercel+Supabase stack and are stale until the cutover fully completes — do not trust per-doc Vercel/Supabase references.

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
- [ ] **Azure frontend cutover (in progress)** — apex `illinihunt.org` live on Azure Static Web Apps (DNS-only) as of 2026-06-08. **Next**: dev registers `www.illinihunt.org` as SWA custom domain so Azure issues its cert, then flip `www` CNAME → Azure (issue #96). Decide canonical-host redirect (apex↔www) in `staticwebapp.config.json`.
- [ ] Azure backend migration — spec in `azure-migration` branch, issue #93 (keshavdalmia10). **Deployed app already runs on the Azure App Service API + Entra auth (verified 2026-06-08); no Supabase calls remain.** Remaining: decision on preserving existing user history vs fresh start (Supabase UUID → Entra OID re-key); confirm legacy Supabase project can be decommissioned once data migration is settled.
- [ ] **Auth verified (2026-06-08, not a regression)**: app registration `illinihunt-api` (`02e095d4-...`) is `signInAudience: AzureADMyOrg` (single-tenant, UIUC `44467e6f-...`); MSAL authority is the tenant GUID (not `/common`); bundle enforces `@illinois.edu` client-side. Equivalent to the old @illinois.edu gate. **Only residual check**: confirm the App Service API enforces `@illinois.edu` *server-side* too (single-tenant allows B2B guests whose UPN isn't @illinois.edu — client gate alone wouldn't stop a direct API call). Needs backend repo review.
- [ ] Complete remaining Supabase Security Advisor items: dashboard toggles (HIBP password check, OTP expiry <1h), Postgres patch upgrade
- [ ] Secrets rotation (PAT → DB password → JWT → API keys → edge secrets → regen types → verify) — schedule for quiet window since JWT rotation logs out all users
- [ ] Remove the troubleshooting banner (PR #92) once Sentry funnel data is clean for 48h
- [ ] Testing framework

## Roadmap
- [x] Search & filtering system
- [x] Trending algorithm with analytics
- [x] Admin moderation tools
- [x] Project submission flow overhaul (PRs #78–#92): image upload reliability + full Sentry observability stack + funnel instrumentation
- [ ] Testing framework
- [ ] See: [Improvement Roadmap](docs/IMPROVEMENT_ROADMAP.md) for full details

## Session Log
### 2026-06-08
- Completed: **Cut the apex `illinihunt.org` over to Azure Static Web Apps.** Added Azure apex-ownership TXT (`@` → `_nphcu17nuf41s6nsvzjxfbsjdr95huk`) via CF API; verified Azure already serves a valid `CN=illinihunt.org` cert. Pre-flight cert check caught that **`www` (the canonical host) has NO Azure cert yet** — Azure serves a generic `*.azurewebsites.net` cert for it — so flipping `www` would have broken the site. Flipped apex only: deleted Vercel A record, created DNS-only CNAME `@` → `polite-desert-0406a5c10.7.azurestaticapps.net` (CF flattening; proxy + reverse-proxy worker bypassed since worker routes don't run on grey-cloud traffic). Verified live: 200 + valid TLS. Filed issue #96 for the dev to register `www` as an SWA custom domain. Updated CLAUDE.md + `~/.claude/references/cloudflare-illinihunt.md` to reflect the in-progress migration. Behavior change: apex now serves the Azure app directly, no longer 307→www.
- Next: (1) dev registers `www` in Azure → add its validation record → flip `www` CNAME → Azure (issue #96); (2) decide canonical-host redirect in `staticwebapp.config.json`; (3) confirm whether the deployed SWA still calls Supabase `catzwowmxluzwbhdyhnf` (backend cutover is separate); (4) once settled, sweep deep docs (README, MENTAL_MODEL, setup/*) off Vercel+Supabase language.

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
