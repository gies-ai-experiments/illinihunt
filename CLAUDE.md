# CLAUDE.md - Quick Reference

**Be critical and challenge suggestions that might lead to poor code quality, security issues, or architectural problems.**

## Project Essentials

**IlliniHunt V2** - Product Hunt for University of Illinois
**Live**: https://illinihunt.org (Cloudflare CDN) | https://illinihunt.vercel.app
**Supabase Project**: `catzwowmxluzwbhdyhnf`
**Stack**: React 18 + TypeScript + Supabase + Vercel + Cloudflare CDN

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
- **Deployment**: Vercel (auto-deploy on push) → Cloudflare CDN (caching, DDoS protection)
  - Custom domain: illinihunt.org (Cloudflare proxy enabled)
  - After deployments, purge Cloudflare cache to clear stale assets
  - See: [Cloudflare + Vercel Issues](#cloudflare--vercel-issues) below

## Current Focus
- [ ] Complete remaining Supabase Security Advisor items: dashboard toggles (HIBP password check, OTP expiry <1h), Postgres patch upgrade
- [ ] Secrets rotation (PAT → DB password → JWT → API keys → edge secrets → regen types → verify) — schedule for quiet window since JWT rotation logs out all users
- [ ] Watch Sentry funnel data 24–48h post-#91/#92 to confirm whether stuck-submission cohort (aflasck2, calk2, critter4, mjdiaz3) completes — or root-cause via the new image-picked / submit-attempt-validated drop-off
- [ ] Remove the troubleshooting banner (PR #92) once funnel data is clean for 48h
- [ ] Testing framework
- [ ] Accessibility + regression test coverage for new collection flows

## Roadmap
- [x] Search & filtering system
- [x] Trending algorithm with analytics
- [x] Admin moderation tools
- [x] Project submission flow overhaul (PRs #78–#92): image upload reliability + full Sentry observability stack + funnel instrumentation
- [ ] Testing framework
- [ ] See: [Improvement Roadmap](docs/IMPROVEMENT_ROADMAP.md) for full details

## Session Log
### 2026-05-20
- Completed: Full Supabase Security Advisor sweep. **4 migrations** (`20260508000001`–`000004`): (1) enabled RLS on `public.comments` (policies existed but were inert — table was wide open); (2) flipped `user_bookmarks_with_projects` and `public_collections_with_stats` from SECURITY DEFINER → `security_invoker=true`; (3) pinned `search_path` on all 29 public functions via PL/pgSQL DO block with `to_regprocedure` guards (Codex P1 catch — original static ALTERs would fail `supabase db reset` on functions created via dashboard); (4) revoked EXECUTE from PUBLIC across the board (Codex P2 — without this, anon/auth inherit via PUBLIC even after explicit revokes), then re-granted per triage: trigger-only fns revoked from all client roles, admin/user RPCs `authenticated`-only, RLS helpers + stats kept on `anon, authenticated`; (5) dropped overly broad SELECT policy on `storage.objects` for `project-images` (CDN URL path bypasses RLS, so listing capability was unnecessary); (6) tightened `bookmarks` SELECT to `auth.uid() = user_id` and deduped two pairs of identical INSERT/DELETE policies (privacy leak — `qual=true` allowed any client to enumerate all users' bookmarks; all call sites already scope by user). Final advisor: **0 ERRORs, 28 WARNs** (25 accepted-risk SECURITY DEFINER helpers + 3 dashboard tasks). Also: customized `~/.claude/statusline-command.sh` to show `last <commit-age> session <YYYY-MM-DD>` (answers "when did I last work on this project" without leaving the bar). Saved memory: use `/codex-review` skill, not `codex:rescue` subagent (gets stuck on this project).
- Next: Dashboard tasks (enable HIBP password check, OTP expiry <1h, Postgres patch upgrade — all 1-click). Then 7-step secrets rotation in a quiet window (JWT rotation logs out every signed-in user). Drift to investigate: live `project_upvotes_count_trigger` points at `update_project_upvotes_count` but migration `20250814154600` says it should be `_robust` variant — either migration was reverted via dashboard or function renamed. Older carry-overs still open: (a) move `illinihunt-reverse-proxy` Worker source into a tracked repo with `wrangler deploy`; (b) recreate or roll `cf-illinihunt-zone-and-pages` token to clear phantom IP filter blocking CI `wrangler pages deploy`; (c) delete orphan `ZZ-orphan-never-used-DELETE` token.

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
