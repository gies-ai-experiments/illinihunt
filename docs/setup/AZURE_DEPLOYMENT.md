# IlliniHunt on Azure — Architecture & Deployment (DevOps reference)

**Audience:** DevOps / platform engineers operating IlliniHunt.
**Last updated:** 2026-06-09.
**TL;DR:** React SPA + Express/Prisma API on Azure. Migrated off Supabase + Vercel.
Everything lives in resource group `DL_ResourceGroup_01` (subscription
`urbana-business-disruptionlab`, region `northcentralus`).

---

## 1. Live architecture (current)

```
                          ┌────────────────────────┐
   user ─── illinihunt.org│   Cloudflare (DNS+CDN) │
                          └───────────┬────────────┘
                                      │ apex CNAME → SWA hostname
                                      ▼
        ┌──────────────────────────────────────────────────┐
        │ Azure Static Web App  "illinihunt-dev"            │  ← React SPA (Vite build)
        │ polite-desert-0406a5c10.7.azurestaticapps.net     │
        └───────────────────────┬──────────────────────────┘
                                 │  fetch()  Authorization: Bearer <Entra token>
                                 ▼
        ┌──────────────────────────────────────────────────┐
        │ Azure App Service  "illinihunt"  (container)      │  ← Express + Prisma API
        │ illinihunt.azurewebsites.net                      │
        │ image: illinihuntdevacr.azurecr.io/illinihunt-api │
        └───────┬───────────────────────┬──────────────────┘
                │                        │
                ▼                        ▼
   ┌───────────────────────┐   ┌──────────────────────────┐
   │ Azure PostgreSQL 18   │   │ Azure Blob Storage        │
   │ dl-postgresqlserver-01│   │ illinihuntdevsa           │
   │ DB: illinihunt        │   │ container: project-images │
   │ role: illinihunt_user │   │ (public read)             │
   │ (SHARED server)       │   └──────────────────────────┘
   └───────────────────────┘
                ▲
                │ JWT validation (JWKS)
        ┌───────┴───────────────────┐
        │ Microsoft Entra ID         │  ← Auth (UIUC tenant)
        │ tenant 44467e6f-…          │     app reg client 02e095d4-…
        └────────────────────────────┘
```

### Resource inventory

| Concern | Azure resource | Notes |
|---|---|---|
| Frontend host | Static Web App `illinihunt-dev` | Vite build; SPA fallback in `staticwebapp.config.json` |
| API host | App Service `illinihunt` | Linux; currently a **container** from ACR |
| API image registry | ACR `illinihuntdevacr` | repo `illinihunt-api`, webhook `illinihuntapicd` |
| Database | `illinihunt` DB on **shared** `dl-postgresqlserver-01` (PG18) | scoped role `illinihunt_user`; server shared with MindForum |
| Object storage | Storage account `illinihuntdevsa`, container `project-images` | public-read; project images |
| Auth | Entra ID (UIUC tenant) | MSAL redirect flow; `@illinois.edu` enforced by single-tenant app reg |
| DNS / CDN | Cloudflare (`illinihunt.org`) | apex CNAME → SWA hostname |
| Old API DB (rollback) | `illinihunt-dev-db` in RG `illinihunt-dev` | retired; kept temporarily as data rollback |

### Auth model (important)
- The SPA acquires an **Entra ID access token** (MSAL, redirect flow) and sends it as
  `Authorization: Bearer …` to the API.
- The API validates the JWT against the tenant JWKS (`aud`/`iss`/`exp`). It does **not**
  check `scp`. Admin gating is an **email allowlist** (`ADMIN_EMAILS` app setting), ported
  from the old Supabase `is_admin()` function.
- There is **no RLS** anymore — authorization is enforced in Express route handlers.

---

## 2. CI/CD

Repo: `gies-ai-experiments/illinihunt`. GitHub Actions, branch `azure-migration`
(→ `main` after merge).

| Workflow | Trigger | Action |
|---|---|---|
| `azure-static-web-apps.yml` | push (frontend paths) | build Vite → deploy to SWA |
| `azure-webapp-api.yml` | push (`api/**`) | build API image → push to ACR → ACR webhook → App Service pulls |

Secrets / variables (GitHub):
- `AZURE_STATIC_WEB_APPS_API_TOKEN` — SWA deploy token
- `ACR_USERNAME` / `ACR_PASSWORD` — registry push creds (container workflow)
- `AZURE_WEBAPP_PUBLISH_PROFILE`, `AZURE_WEBAPP_PUBLISH_PROFILE_STAGING` — App Service deploy (code-based attempts; see §5)
- Vars: `VITE_AZURE_TENANT_ID`, `VITE_AZURE_CLIENT_ID`, `VITE_AZURE_API_CLIENT_ID`, `VITE_API_URL`

### Build-time frontend env
The SPA bakes these in at build time (Vite):
`VITE_AZURE_TENANT_ID`, `VITE_AZURE_CLIENT_ID`, `VITE_API_URL`
(`VITE_API_URL` is the API base — `https://illinihunt.azurewebsites.net/api` in the split
setup, or `/api` if frontend+API are consolidated into one app).

---

## 3. Deploy & rollback runbook

### Routine deploy
`git push` to `azure-migration`. The relevant workflow builds and deploys automatically.
After a frontend deploy, **purge Cloudflare cache** (Caching → Purge Everything) or
clients may get stale assets — same caveat that applied under Vercel.

### API rollback (container)
The App Service runs a tagged image; roll back by pointing it at a previous tag:
```bash
az webapp config container set \
  --name illinihunt --resource-group DL_ResourceGroup_01 \
  --container-image-name illinihuntdevacr.azurecr.io/illinihunt-api:<good-sha> \
  --container-registry-url https://illinihuntdevacr.azurecr.io \
  --container-registry-user illinihuntdevacr \
  --container-registry-password <acr-pw>
az webapp restart --name illinihunt --resource-group DL_ResourceGroup_01
```
Restores in ~60–90s. (`:latest` always points at the newest CI build.)

### DB access
Connect as the scoped role (never the server admin for app work):
```
postgresql://illinihunt_user:<pw>@dl-postgresqlserver-01.postgres.database.azure.com:5432/illinihunt?sslmode=require
```
`illinihunt_user` owns **only** the `illinihunt` database — it cannot touch MindForum or
other tenants on the shared server. Server firewall already allows UIUC network ranges +
`AllowAzureServices`.

### Logs
```bash
az webapp log download --name illinihunt --resource-group DL_ResourceGroup_01 --log-file /tmp/logs.zip
# or Kudu: https://illinihunt.scm.azurewebsites.net  (Bash console + /api/vfs file browser)
```

---

## 4. MindForum vs. IlliniHunt — why they deploy differently

Both apps live on the **same App Service plan** (`dl-appplan-01`) in the same resource
group, yet they deploy in completely different ways. This trips people up ("just do what
MindForum does"), so here's the precise difference.

### Side-by-side

| | **MindForum** | **IlliniHunt** |
|---|---|---|
| App shape | **One** app: Next.js serves UI **and** API together | **Two** pieces: SPA (frontend) + Express API (backend) |
| Frontend framework | **Next.js** (React framework w/ a built-in server) | **Vite** (builds a *static* React SPA — no server) |
| Backend | Part of the same Next.js process (`server.js`) | Separate **Express** service |
| ORM | Prisma | Prisma *(same — not the differentiator)* |
| Build output | Next.js **standalone** bundle — a self-contained server folder | Static `dist/` (frontend) + compiled `dist/` + `node_modules` (API) |
| App Service runtime | **Blessed Node** (built-in), runs `node server.js` | **Container** (image pulled from ACR) |
| Needs a registry (ACR)? | No | Yes |
| Needs a separate Static Web App? | No (Next serves its own pages) | Yes (the SPA is hosted on SWA) |

### The crux: Next.js *standalone* vs. a generic Node app

The reason MindForum deploys cleanly as code (no container) is **entirely** about what
Next.js produces:

- `next build` with `output: 'standalone'` emits a **self-contained server bundle** — it
  traces exactly the files it needs, inlines a minimal `node_modules`, and ships a
  `server.js` the platform's blessed Node runtime recognizes and launches directly.
- There is effectively **no external `node_modules` tree to compress**, and the startup is
  the conventional `node server.js`. So App Service's built-in Node hosting "just works."

IlliniHunt's API is a **generic Express app**. Its deploy artifact is a normal
`node_modules` tree + a compiled entrypoint. On the blessed Node image that combination
hits the platform gotcha documented in §5:

- App Service **compresses `node_modules` → `node_modules.tar.gz`** and depends on its
  auto-generated startup to extract it; our custom `node dist/index.js` startup bypasses
  that extraction → runtime can't find packages → boot fails.
- Next.js standalone never hits this because it isn't shipping a normal `node_modules`
  tree in the first place.

### So "why can't IlliniHunt follow MindForum's pattern?"

Because following MindForum's *deployment* pattern requires MindForum's *application*
pattern — i.e. **being a Next.js app**. IlliniHunt is a Vite SPA + Express API. To deploy
code-based the way MindForum does, IlliniHunt would have to be **rewritten as a Next.js
app** (move the SPA into Next pages/app-router, fold the Express routes into Next API
routes / route handlers, adopt `output: 'standalone'`). That's a multi-week frontend +
backend rewrite — out of scope for the Supabase→Azure migration, whose mandate was
*minimal change*.

**The container gets IlliniHunt the same end result** (one reliable web app, or SPA+API
split) **without** that rewrite — which is why it's the chosen path. See §5.

---

## 5. Decision record: container vs. code-based ("blessed Node") API hosting

**Decision: host the API as a container on App Service.** Rationale below — read before
attempting to "simplify" to a code-based Node deploy.

### Why this comes up
MindForum (same App Service plan) deploys **code-based** (no container): App Service's
built-in Node runtime runs its source directly. Natural question: why doesn't IlliniHunt?

### What we tried (and why code-based fails here)
IlliniHunt's API is **Express + Prisma + ESM**. Code-based deploy to the blessed Node
image failed two distinct ways:

1. **Prebuilt package (ship `node_modules`, no server build):**
   App Service **always compresses `node_modules` into `node_modules.tar.gz`** and relies
   on its auto-generated startup script to extract it at boot. Our app needs a custom
   startup (`node dist/index.js`), which **bypasses that extraction** → empty `node_modules`
   at runtime → `Cannot find package 'dotenv'`. Removing the custom startup → the default
   startup doesn't bind the port for our ESM/Express entry → warmup timeout (503).

2. **Oryx build (ship source, build on host):**
   The Oryx build succeeds, but `azure/webapps-deploy`'s OneDeploy **finalize step fails**
   ("ZIP Deploy failed").

```
   Prebuilt  ─► OneDeploy OK ─► node_modules compressed ─► custom startup skips
                                                           extraction ─► boot crash
   Oryx      ─► build OK ─────► OneDeploy finalize FAILS
   Container ─► build image ─► ACR ─► App Service pulls ─► runs ✅  (reliable)
```

### Why MindForum gets away with code-based
MindForum is **Next.js**, which emits a **standalone** build — a self-contained server
bundle with no external `node_modules` to compress and a startup the platform recognizes.
Our Vite-SPA + Express + Prisma stack doesn't produce that shape, so it hits the
compression/startup gotcha.

### Why we did NOT use Next.js originally
The Azure migration's mandate was *minimal-change* (get off Supabase/Vercel), explicitly
**no framework rewrite**. IlliniHunt was already a Vite React SPA; converting to Next.js is
a multi-week frontend rewrite (routing, data fetching, SSR/server components) with high
regression risk. Express + Prisma + keeping the SPA was the correct low-risk migration
choice. The code-based-deploy friction only surfaced later, when consolidating to a single
web app became a goal.

### Net guidance for DevOps
- **Keep the API on the container.** It deploys reliably here and rolls back in seconds.
- Don't sink time into "code-based Node to save the ~$5/mo ACR" — for this stack it's the
  worst effort/reward tradeoff available, and it caused production blips while being chased.
- If a single consolidated web app is desired (frontend + API in one), do it by **baking
  the SPA build into the API container** (Express serves `./public` + `/api/*`), not by
  switching to blessed-Node. Same architecture, same reliability.
- A Next.js rewrite is only worth considering for its own merits (SSR/SEO), **not** as a
  deployment workaround.

---

## 6. Known follow-ups / housekeeping
- Decommission the old `illinihunt-dev-db` Postgres + empty `illinihunt-dev` RG after the
  rollback window.
- Rotate the Supabase service-role key used during migration; retire the Supabase project.
- Wire Sentry DSN (`VITE_SENTRY_DSN` frontend, `SENTRY_DSN` API app setting) — instrumentation
  is in code, just needs the DSN.
- Azure Monitor alerts (Postgres CPU, App Service 5xx, Blob 4xx); bump Postgres PITR retention.
- A `staging` slot exists on the App Service (used while evaluating code-based deploy); it can
  be repurposed for blue/green or removed.
```
