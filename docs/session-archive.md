# Session Archive

Older session log entries. Current session log lives at the top of `CLAUDE.md`.

### 2026-05-28
- Completed: Sorted out the Azure-migration data handoff to Keshav. Initial plan was to export the Supabase `public` schema (73 users, 34 projects, 99 votes) as encrypted pg_dump files and hand them over — produced schema.sql/data.sql + README + checksums outside the repo. Then decided Keshav already has Supabase project access, so he pulls his own dump directly (cleaner compliance story: authorized member, no file/passphrase changing hands, no standing credential shared). Deleted all local PII copies; repo stayed clean. Saved the pg_dump connection gotcha to auto memory.
- Next: (optional) lift the non-PII migration playbook (IPv4 session-pooler for pg_dump, `--no-owner --no-privileges`, `SET session_replication_role = replica` for data restore, UUID→Entra-OID re-keying) into the `azure-migration` spec so Keshav doesn't re-derive it. Still blocked on UIUC IT Entra approval + preserve-history-vs-fresh-start decision before Phase 2.

### 2026-05-27
- Completed: Designed and specced full Azure migration (UIUC IT compliance — all student data must move to Azure). Approach: Express API on Azure Container Apps + Azure PostgreSQL Flexible Server + Azure Blob Storage + Entra ID (MSAL) auth; frontend stays on Vercel. Spec written to `docs/superpowers/specs/2026-05-26-azure-migration-design.md` on `azure-migration` branch. Repo transferred from `vishalsachdev/illinihunt` → `gies-ai-experiments/illinihunt`; Vercel reconnected; local remote updated. GitHub issue #93 created and assigned to Keshav (keshavdalmia10).
- Next: Keshav to start Phase 1 (Azure infra setup) once UIUC IT approves Entra app registration. Decide whether to preserve existing user history (re-key Supabase UUIDs → Entra OIDs) before Phase 2 starts.

### 2026-05-10
- Completed: Wrapped a 6-day arc on the project-submission flow. **12 PRs (#78–#92)** covering: image-upload fixes (30s timeout, WebP re-encoding for PNGs, 25 MB raw-input cap, removed misbehaving `Cache-Control` global header), **deferred-upload pattern** (image only uploads on Submit click — eliminates "image in storage but no project row" bug entirely), full **Sentry observability** (SDK + ErrorContext + ErrorBoundary integration, CSP allowlist, Supabase plain-object error normalization, stage tracking with local-var fix for stale-closure bug, six funnel events: form-mounted / image-picked / image-pick-rejected / submit-attempt-validated / submit-validation-failed / errors-with-stage), **Vite preload-error auto-recovery** for stale chunks post-deploy, and a **temporary troubleshooting banner** on /submit (hard-refresh + submit-without-image workaround). Outside this repo: `~/admin/agent-infra/sentry-setup.md` runbook, global CLAUDE.md observability section, wrap-up-session skill nudge for Sentry adoption. Sripad ("ScreenSort") completed; aflasck2 + 3 others still at 0 projects despite reaching the form (Sentry funnel data should pinpoint where they stall).
- Next: Reply to aflasck2 with hard-refresh + workaround. Watch Sentry funnel for 24–48h. Once stuck cohort either completes or root cause is identified, remove banner.

### 2026-04-30
- Completed: Bumped `agent-infra` Cloudflare backup workflow from monthly to weekly (Sundays 07:00 UTC) — reduces drift between dashboard edits and snapshots, since the `illinihunt-reverse-proxy` Worker is still dashboard-edited. `workflow_dispatch` retained for ad-hoc post-edit snapshots. Cleaned stale stashes (filter-branch reflog artifact + obsolete Aug-2025 useRealtimeVotes WIP).
- Next: Testing framework + accessibility coverage for collection flows. Carry-overs: (a) move `illinihunt-reverse-proxy` Worker source into a tracked repo with `wrangler deploy`; (b) recreate or roll `cf-illinihunt-zone-and-pages` token to clear phantom IP filter blocking CI `wrangler pages deploy`; (c) delete orphan `ZZ-orphan-never-used-DELETE` token.

### 2026-04-29
- Completed: Resolved issue #76 (Chalkwise DNS via Cloudflare API — DKIM/SPF/MX records added; closed). Updated `chiconnect.illinihunt.org` redirect target in `illinihunt-reverse-proxy` Worker (line 52 of `SUBDOMAIN_MAP`) to `https://lgluck28.github.io/connect-my-tribe-landing/`. Patched the Worker's URL-resolution logic so full-URL targets preserve their pathname (was stripping to origin) — uses `new URL((url.pathname + url.search).replace(/^\//, ""), targetBase).href`. Committed AGENTS.md additions (Claude memory lookup + external-action approval policy).
- Also completed (cross-cutting infra work in `~/admin/agent-infra`): audited and renamed all 7 Cloudflare API tokens; created `cf-backup-readonly` token; set up monthly Cloudflare config snapshot via private repo `vishalsachdev/agent-infra` GH Actions workflow → `cloudflare-snapshots/YYYY-MM-DD/` (first snapshot captured 81 DNS records, 5 worker scripts, 8 Pages projects).

### 2026-03-01 (session 2)
- Completed: Admin moderation tools (PR #72) — content reporting, comment moderation, user suspension
  - DB: `reports` table, `suspended_at` column, 8 RPC functions, `is_not_suspended()` RLS helper
  - Frontend: ReportModal, flag buttons on ProjectCard/CommentItem, admin tabs (Reports/Comments/Users)
  - Codex review caught P1 (RLS write policies missing suspension check) and P2 (cached profile bypass) — both fixed
  - Fixed vote RLS policy name mismatch that left old permissive policies active
- Closed stale PR #73 (duplicate of merged #71)
- Updated DressCode project with YouTube video URL
- Next: Testing framework, accessibility

### 2026-03-01
- Merged large refactor PR #71: decomposed `database.ts` god file into 7 service modules, extracted 5 shared components, fixed trending page bugs, removed dead code
- Fixed P1 bug found by Codex review: realtime vote context was reading from a ref with stable identity, preventing consumer re-renders on vote updates
- Changed default homepage sort from "trending" to "most recent" (trending shows empty results with low posting frequency)
- Next: Admin moderation tools, testing framework

### 2026-02-11
- Reduced project-list N+1 calls by batching vote/bookmark status fetches
- Added real collection pages/routes: new, edit, discover, bookmarks, add-projects
- Removed `framer-motion` and replaced with lightweight CSS animation classes
- Reduced built JS payload below budget (now under 800 kB target)

### 2025-12-27
- Standardized roadmap sections (migrated from "Current Status" format)
- Recently completed: Cloudflare CDN, SPA routing, vote sync removal, email validation, TypeScript 0 errors
