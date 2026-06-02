# IlliniHunt — Azure Migration Design

**Date**: 2026-05-26  
**Branch**: `azure-migration`  
**Author**: Vishal Sachdev  
**Status**: Approved, awaiting implementation

---

## Context

IlliniHunt is a Product Hunt–style platform for UIUC. UIUC IT/compliance requires all student data — and the entire hosting stack — to live on Azure infrastructure. Currently the app is a React/Vite SPA hosted on Vercel that talks directly to Supabase. Both the hosting platform and Supabase need to move:

| Current | Replacement |
|---|---|
| Vercel (frontend hosting) | Azure Static Web Apps |
| Supabase PostgreSQL (with RLS) | Azure Database for PostgreSQL – Flexible Server |
| Supabase Auth (Google OAuth + @illinois.edu guard) | Microsoft Entra ID (UIUC tenant) via MSAL |
| Supabase Storage (project images) | Azure Blob Storage |
| Supabase Realtime (live vote counts) | 30-second polling (dropped) |

---

## Architecture

```
Browser
  │
  ▼
Cloudflare (DNS + CDN, optional — keep existing illinihunt.org setup)
  │
  ▼
Azure Static Web Apps — React/Vite SPA
  │  Authorization: Bearer <Entra ID access token>
  │  (proxied via SWA /api/* linked backend, or direct CORS call)
  ▼
Azure Container Apps — Express API (new)
  │  Prisma ORM            │  @azure/storage-blob
  ▼                        ▼
Azure PostgreSQL        Azure Blob Storage
(Flexible Server)
```

The frontend stays a React/Vite SPA — no framework migration, no UI changes. Two things change about how it's hosted and what it calls:

1. Hosting moves from **Vercel → Azure Static Web Apps** (Azure-native, satisfies UIUC's "everything on Azure" requirement, has built-in global CDN, PR preview environments, and one-click GitHub Actions deploys).
2. All Supabase SDK calls become `fetch()` calls to the new Express API. Service layer function signatures stay identical — only implementations change.

---

## Part 1 — Express API (new repo: `illinihunt-api`)

### Structure

```
illinihunt-api/
  src/
    middleware/
      auth.ts          # Validates Entra ID JWT on every request
      requireAuth.ts   # 401 if not authenticated
      requireAdmin.ts  # 403 if not admin
    routes/
      projects.ts
      votes.ts
      comments.ts
      collections.ts
      bookmarks.ts
      categories.ts
      stats.ts
      admin.ts
      upload.ts
      auth.ts          # POST /auth/sync — upsert user on first login
    lib/
      prisma.ts        # Singleton Prisma client
      blob.ts          # Azure Blob Storage helpers
    index.ts           # Express app entry point
  prisma/
    schema.prisma
    migrations/
  Dockerfile
  .env.example
```

### Auth middleware

Every request carries an Entra ID access token. The middleware:

1. Reads `Authorization: Bearer <token>`
2. Fetches JWKS from `https://login.microsoftonline.com/<UIUC_TENANT_ID>/discovery/v2.0/keys`
3. Verifies the JWT signature and claims (`aud`, `iss`, `exp`)
4. Attaches `req.user = { oid, email, name }` for downstream handlers

No secret key needed — Entra tokens are verified against the public JWKS endpoint.

Dependencies: `jwks-rsa`, `jsonwebtoken`

### API routes

All routes require auth unless noted. Admin routes additionally require `requireAdmin` middleware (checks `users.is_admin` in DB).

**Projects**
```
GET    /api/projects              # list with filters (category, search, sort)
GET    /api/projects/:id          # single project
POST   /api/projects              # create
PUT    /api/projects/:id          # update (owner/admin only)
DELETE /api/projects/:id          # delete (admin only)
POST   /api/projects/:id/vote     # upvote
DELETE /api/projects/:id/vote     # remove vote
GET    /api/projects/:id/members  # team members
POST   /api/projects/:id/invite   # invite teammate
POST   /api/projects/:id/invite/accept
POST   /api/projects/:id/invite/decline
DELETE /api/projects/:id/invite/:userId  # revoke
```

**Votes (polling endpoint)**
```
GET    /api/votes/batch?projectIds=id1,id2,...  # returns {[id]: {count, hasVoted}}
```

**Comments**
```
GET    /api/projects/:id/comments
POST   /api/projects/:id/comments
DELETE /api/comments/:id
```

**Collections**
```
GET    /api/collections           # public collections
GET    /api/collections/mine      # authenticated user's
POST   /api/collections
PUT    /api/collections/:id
DELETE /api/collections/:id
POST   /api/collections/:id/projects
DELETE /api/collections/:id/projects/:projectId
```

**Bookmarks**
```
GET    /api/bookmarks
POST   /api/bookmarks
DELETE /api/bookmarks/:projectId
```

**Categories**
```
GET    /api/categories            # no auth required
```

**Stats**
```
GET    /api/stats                 # site-wide stats
GET    /api/stats/trending        # trending projects
```

**Users**
```
GET    /api/users/:id             # public profile
PUT    /api/users/me              # update own profile
POST   /api/auth/sync             # upsert user record on first Entra login
```

**Admin** (all require `requireAdmin`)
```
GET    /api/admin/projects
GET    /api/admin/users
GET    /api/admin/comments
GET    /api/admin/reports
GET    /api/admin/stats
PUT    /api/admin/projects/:id/status
DELETE /api/admin/projects/:id
DELETE /api/admin/comments/:id
PUT    /api/admin/users/:id/suspend
PUT    /api/admin/users/:id/unsuspend
PUT    /api/admin/reports/:id/resolve
```

**Upload**
```
POST   /api/upload/image          # multipart, streams to Azure Blob, returns URL
```

### Replacing Supabase RPC calls

The 19 existing `supabase.rpc()` calls map to the routes above. The Express handlers contain the logic that was previously in PostgreSQL functions. The Postgres functions themselves can stay (Prisma can call them via `$queryRaw` if needed), but the auth-dependent ones (`is_admin`, `is_project_member`, `can_manage_project`) should be reimplemented in application code since they referenced `auth.uid()`.

### Dockerfile

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Environment variables

```
DATABASE_URL=postgresql://...@...azure.com/illinihunt?sslmode=require
AZURE_TENANT_ID=<UIUC tenant ID>
AZURE_CLIENT_ID=<app registration client ID>
AZURE_STORAGE_CONNECTION_STRING=...
AZURE_STORAGE_CONTAINER=project-images
PORT=3000
```

---

## Part 2 — Azure PostgreSQL setup

### Service

Azure Database for PostgreSQL – Flexible Server. Recommended SKU for student/dev: `Standard_B2ms` (2 vCores, 8 GB). Enable SSL enforcement.

### Database migration steps

1. **Export from Supabase**
   ```bash
   pg_dump "postgresql://postgres.<project-id>:password@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
     --schema=public \
     --no-owner \
     --no-acl \
     -f supabase-export.sql
   ```

2. **Clean the dump** — remove or rewrite:
   - All `CREATE POLICY` / `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statements (RLS enforcement moves to Express)
   - All `auth.uid()` references in function bodies
   - References to `auth.users` table (replace with local `users` table)
   - Supabase-specific extensions: `pg_graphql`, `pg_stat_monitor`, `supabase_vault`

3. **Add users table** — Supabase's `auth.users` table won't exist. Create:
   ```sql
   CREATE TABLE users (
     id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     entra_oid   TEXT UNIQUE NOT NULL,  -- Entra ID object identifier claim
     email       TEXT UNIQUE NOT NULL,
     username    TEXT UNIQUE,
     display_name TEXT,
     avatar_url  TEXT,
     is_admin    BOOLEAN DEFAULT FALSE,
     suspended   BOOLEAN DEFAULT FALSE,
     created_at  TIMESTAMPTZ DEFAULT now()
   );
   ```
   All existing `user_id` foreign keys that pointed to `auth.users(id)` now point to `users(id)`.

4. **Import to Azure PostgreSQL**
   ```bash
   psql "postgresql://adminuser:password@<server>.postgres.database.azure.com/illinihunt?sslmode=require" \
     -f supabase-export-cleaned.sql
   ```

5. **Prisma introspection**
   ```bash
   npx prisma db pull
   npx prisma generate
   ```

### Existing PostgreSQL features that carry over unchanged

- Vote count triggers (`project_upvotes_count_trigger` → `update_project_upvotes_count` or `_robust` variant — verify which is live before migration)
- `search_path`-pinned functions (all 29 are plain PL/pgSQL, no Supabase deps)
- All indexes, constraints, and sequences

---

## Part 3 — Azure Blob Storage

### Setup

Create a Storage Account → Blob container named `project-images` with public read access (images are public).

### Upload endpoint

`POST /api/upload/image` in the Express API:
1. Accept `multipart/form-data` with `image` field (use `multer` with `memoryStorage`)
2. Validate: MIME type must be `image/jpeg`, `image/png`, or `image/webp`; max 5 MB
3. Generate filename: `projects/<uuid>.<ext>`
4. Upload to Azure Blob via `@azure/storage-blob` `BlobServiceClient`
5. Return `{ url: "https://<account>.blob.core.windows.net/project-images/<filename>" }`

### Image URL migration

After importing the database, run a one-time script to rewrite all Supabase Storage URLs to Azure Blob URLs:

```sql
UPDATE projects
SET image_url = REPLACE(
  image_url,
  'https://catzwowmxluzwbhdyhnf.supabase.co/storage/v1/object/public/project-images/',
  'https://<account>.blob.core.windows.net/project-images/'
)
WHERE image_url LIKE '%supabase.co/storage%';
```

Also download the actual image files from Supabase Storage and re-upload them to Azure Blob before cutting over DNS. Supabase Storage provides a zip export via the dashboard.

---

## Part 4 — Frontend changes (illinihunt repo)

### Auth: replace Supabase Auth with MSAL

Install: `@azure/msal-browser @azure/msal-react`

Rewrite `src/contexts/AuthContext.tsx`:
- Replace `supabase.auth.signInWithOAuth` with `msalInstance.loginPopup()` or `loginRedirect()`
- Replace `supabase.auth.getSession` / `onAuthStateChange` with MSAL's `useMsal()` hook + account state
- On first login, call `POST /api/auth/sync` to upsert the user record in the DB
- Store the access token in memory (MSAL handles this); attach it to every API call

The @illinois.edu restriction is enforced by scoping the Entra app registration to the UIUC tenant — no domain check needed in code.

Remove: `src/lib/supabase.ts`, `src/lib/supabaseInit.ts`, `@supabase/supabase-js` dependency.

### Service layer: replace Supabase SDK calls with fetch()

Each service in `src/lib/services/` gets rewritten. The exported function signatures stay identical so no component changes are needed.

Pattern for each service function:
```typescript
// Before (Supabase)
const { data, error } = await supabase.from('projects').select('*').eq('id', id)

// After (fetch to Express API)
const res = await apiFetch(`/api/projects/${id}`)
if (!res.ok) throw new Error(await res.text())
const data = await res.json()
```

Create `src/lib/api.ts` — a thin wrapper around `fetch` that attaches the MSAL Bearer token:
```typescript
export async function apiFetch(path: string, options?: RequestInit) {
  const token = await getAccessToken()  // MSAL acquireTokenSilent
  return fetch(`${import.meta.env.VITE_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })
}
```

### Realtime → polling

Replace `src/hooks/useRealtimeVotes.ts` with a polling implementation:

```typescript
useEffect(() => {
  const poll = async () => {
    const ids = projectIds.join(',')
    const res = await apiFetch(`/api/votes/batch?projectIds=${ids}`)
    const data = await res.json()
    setVoteData(data)
  }
  poll()
  const interval = setInterval(poll, 30_000)
  return () => clearInterval(interval)
}, [projectIds])
```

Remove: `@supabase/supabase-js` (after all usages replaced), `src/lib/supabase.ts`, `src/lib/supabaseInit.ts`, `src/contexts/RealtimeVotesContext.tsx` (fold into updated hook).

### New environment variables

```
VITE_API_URL=https://api.illinihunt.org   # or Azure Container Apps URL; or "/api" if using SWA linked backend
VITE_AZURE_TENANT_ID=<UIUC tenant ID>
VITE_AZURE_CLIENT_ID=<app registration client ID>
```

Remove: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

---

## Part 5 — Azure Static Web Apps (frontend hosting)

### Service

Azure Static Web Apps (Free tier is sufficient — 100 GB bandwidth/mo, unlimited builds via GitHub Actions, custom domains, PR preview environments). Created in the `illinihunt` resource group alongside the API.

### SPA fallback routing

Vercel's `vercel.json` rewrite `/:path((?!.*\\.).*)` → `/index.html` is replaced with `staticwebapp.config.json` at the repo root:

```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/assets/*", "/*.{js,css,png,jpg,jpeg,svg,ico,webp,woff,woff2}"]
  },
  "mimeTypes": {
    ".json": "application/json"
  }
}
```

### Linked backend (recommended) vs. direct CORS

SWA supports "linking" a backend (Container Apps in our case) so that requests to `/api/*` on the SWA hostname are proxied to the API without CORS. Two options:

- **Linked backend (recommended)**: Set `VITE_API_URL=/api` and link the Container App in the SWA "APIs" blade. Browser sees same-origin requests, no CORS configuration on Express needed, Entra Bearer token still flows through.
- **Direct CORS**: Set `VITE_API_URL=https://api.illinihunt.org`, configure CORS on Express to allow the SWA + custom domain origins. Simpler conceptually but adds a CORS surface to maintain.

### CI/CD (GitHub Actions)

When the SWA resource is created from the Azure Portal and pointed at the GitHub repo, Azure auto-generates a workflow file (`.github/workflows/azure-static-web-apps-<id>.yml`). Edit it to inject build-time env vars:

```yaml
on:
  push:
    branches: [main]
  pull_request:
    types: [opened, synchronize, reopened, closed]
    branches: [main]

jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: "upload"
          app_location: "/"
          output_location: "dist"
        env:
          VITE_API_URL: ${{ vars.VITE_API_URL }}
          VITE_AZURE_TENANT_ID: ${{ vars.VITE_AZURE_TENANT_ID }}
          VITE_AZURE_CLIENT_ID: ${{ vars.VITE_AZURE_CLIENT_ID }}
```

### Custom domain + Cloudflare

Keep Cloudflare DNS + CDN in front of SWA (preserves the existing cache-purge workflow documented in `CLAUDE.md`):

1. In SWA → Custom domains → add `illinihunt.org`, validate via CNAME.
2. Update Cloudflare DNS: CNAME `illinihunt.org` → `<name>.azurestaticapps.net`, proxy enabled.
3. SWA's auto-managed certificate handles TLS at the Azure edge; Cloudflare handles TLS at its edge.

Note: the `vercel.json` cache-purge guidance in `CLAUDE.md` still applies — Cloudflare cache must be purged after SWA deploys for the same reasons (long `max-age` on static assets).

### What goes away

- `vercel.json` — replaced by `staticwebapp.config.json`
- Vercel project, environment variables, deploy hooks
- Vercel GitHub integration

---

## Part 6 — Azure Container Apps deployment

### CI/CD (GitHub Actions)

```yaml
# .github/workflows/deploy-api.yml
on:
  push:
    branches: [main]
    paths: ['illinihunt-api/**']

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      - name: Build and push image
        run: |
          az acr build \
            --registry ${{ vars.ACR_NAME }} \
            --image illinihunt-api:${{ github.sha }} \
            ./illinihunt-api
      - name: Deploy to Container Apps
        run: |
          az containerapp update \
            --name illinihunt-api \
            --resource-group illinihunt \
            --image ${{ vars.ACR_NAME }}.azurecr.io/illinihunt-api:${{ github.sha }}
```

### Secrets management

Store all secrets in Azure Container Apps environment secrets (not in the container image or repo). Reference them as environment variables in the container app configuration.

---

## Implementation Order

The student worker should tackle these phases in order — each phase is independently deployable and testable before moving to the next.

**Phase 1 — Azure infrastructure setup** (no code yet)
- Create Azure resource group `illinihunt`
- Provision PostgreSQL Flexible Server
- Provision Blob Storage account + container
- Register app in Entra ID (UIUC tenant), configure redirect URIs (include the SWA hostname + `illinihunt.org`)
- Set up Azure Container Registry
- Create Azure Static Web App, link to GitHub repo (workflow file is auto-generated)

**Phase 2 — Database migration**
- Export Supabase schema + data
- Clean the dump (remove RLS, auth.uid() refs, Supabase extensions)
- Create `users` table with `entra_oid`
- Import to Azure PostgreSQL
- Verify all tables, triggers, and functions are intact

**Phase 3 — Express API**
- Bootstrap `illinihunt-api` repo with Express + Prisma + TypeScript
- Implement auth middleware (JWKS validation)
- Implement all route handlers (start with read-only routes, then mutations)
- Dockerfile + local Docker Compose for development
- Deploy to Azure Container Apps

**Phase 4 — Frontend auth swap**
- Install MSAL, rewrite `AuthContext.tsx`
- Implement `apiFetch` wrapper
- Test login/logout flow end-to-end against Phase 3 API

**Phase 5 — Service layer rewrite**
- Rewrite each `src/lib/services/*.ts` file to use `apiFetch`
- Replace `useRealtimeVotes.ts` with polling
- Remove Supabase SDK dependency

**Phase 6 — Storage migration**
- Download all images from Supabase Storage
- Upload to Azure Blob
- Run URL rewrite SQL script
- Test image uploads via new `/api/upload/image` endpoint

**Phase 7 — Cutover**
- Add `staticwebapp.config.json` to the repo (SPA fallback)
- Configure SWA env vars (`VITE_API_URL`, `VITE_AZURE_TENANT_ID`, `VITE_AZURE_CLIENT_ID`)
- Trigger SWA build via push; verify in a PR preview environment first
- Add `illinihunt.org` as a custom domain on the SWA, validate CNAME
- Update Cloudflare DNS: CNAME `illinihunt.org` → `<name>.azurestaticapps.net` (proxy enabled)
- Purge Cloudflare cache (per `CLAUDE.md` Cloudflare + Vercel section — same procedure applies)
- Decommission the Vercel project once traffic is confirmed flowing through Azure
- Monitor Sentry for regressions for 48h

---

## What NOT to change

- Frontend routing, page components, UI — untouched
- Tailwind config, shadcn/ui components — untouched
- Cloudflare DNS + CDN config — keep in front of SWA (only the origin CNAME target changes)
- All service function signatures in `src/lib/services/` — same interface, new implementation
- Sentry instrumentation — carry over to the Express API as well (`@sentry/node`)

What does change for hosting: Vercel is fully replaced by Azure Static Web Apps. `vercel.json` → `staticwebapp.config.json`; Vercel project decommissioned at the end of Phase 7.

---

## Open questions before starting

1. **UIUC Entra app registration** — who has permission to register an app in the UIUC tenant? IT may need to approve this. Confirm before Phase 1.
2. **Existing user accounts** — current users authenticated via Google OAuth. Their Supabase UUIDs are the FK in all tables. On first Entra login, `POST /api/auth/sync` creates a new `users` row with their `entra_oid`. Existing rows keyed on old Supabase UUIDs will be orphaned unless a mapping is done. If preserving user history matters, a migration script needs to match old Supabase email addresses to Entra `email` claims and re-key the FKs. Decide before Phase 2.
3. **Vote count trigger drift** — the live trigger `project_upvotes_count_trigger` may point at `update_project_upvotes_count` instead of `update_project_upvotes_count_robust`. Verify which function is live in Supabase before exporting the schema.
4. **Supabase Storage export** — Supabase dashboard allows a zip export of Storage buckets. Do this early; free-tier projects can be paused and data lost.
5. **SWA region + compliance scope** — confirm with UIUC IT that Azure Static Web Apps satisfies the "everything on Azure" requirement (static HTML/JS technically isn't student data, but compliance may read the requirement broadly). Also pick a region close to the API region to minimize cross-region latency for the linked backend.
