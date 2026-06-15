# Lab Deployment Standard — deploying apps on Azure Container Apps

**Audience:** anyone deploying or operating a lab app.
**Goal:** one repeatable, cheap, standardized procedure for every app (most are
low-traffic / dormant). See [`COST_ANALYSIS.md`](./COST_ANALYSIS.md) for the cost rationale.

**Platform in one line:** every app is a **container** running on a shared **Azure Container
Apps Environment** (scale-to-zero), with its **own database** on a shared **PostgreSQL
server** and its image in a shared **Container Registry**.

```
   Container Apps Environment  (consumption / scale-to-zero)
     ├── app-a  (min=0 → $0 idle)
     ├── app-b  (min=0 → $0 idle)
     ├── app-c  (min=1 → always warm, no cold start)
     └── …
   shared:  PostgreSQL server (1 DB + 1 role per app) · ACR (images) · Log Analytics
```

---

## 0. Conventions (follow these for every app)

| Thing | Convention | Example |
|---|---|---|
| Container app name | `<app>` (lowercase, hyphen) | `mindforum` |
| DB name | `<app>` | `mindforum` |
| DB role | `<app>_user` (owns only its DB) | `mindforum_user` |
| Image repo | `<app>` in the shared ACR | `illinihuntdevacr.azurecr.io/mindforum` |
| Resource tag | `app=<app>` (for cost attribution) | `app=mindforum` |
| `min-replicas` | `0` for dormant; `1` only if it must respond instantly | |

Shared platform resources (already exist):

| Resource | Name |
|---|---|
| Resource group | `DL_ResourceGroup_01` |
| Container Apps environment | `dl-aca-env` *(create once — §1)* |
| PostgreSQL server | `dl-postgresqlserver-01` |
| Container Registry | `illinihuntdevacr` |
| Log Analytics | `dl-loganalytics-01` |
| Entra tenant (if app uses SSO) | `44467e6f-462c-4ea2-823f-7800de5434e3` |

---

## 1. One-time platform setup (only if the environment doesn't exist yet)

```bash
RG=DL_ResourceGroup_01
LOC=northcentralus

# Container Apps environment, wired to the shared Log Analytics workspace.
LAW_ID=$(az monitor log-analytics workspace show -g $RG -n dl-loganalytics-01 --query customerId -o tsv)
LAW_KEY=$(az monitor log-analytics workspace get-shared-keys -g $RG -n dl-loganalytics-01 --query primarySharedKey -o tsv)

az containerapp env create \
  --name dl-aca-env --resource-group $RG --location $LOC \
  --logs-workspace-id "$LAW_ID" --logs-workspace-key "$LAW_KEY"
```
A **Consumption** environment has **no fixed fee** — apps in it scale to zero.

---

## 2. Onboard a new app (the standard checklist, ~15 min)

Set once per app:
```bash
RG=DL_ResourceGroup_01
ENV=dl-aca-env
ACR=illinihuntdevacr
APP=myapp                 # <- change me
PGHOST=dl-postgresqlserver-01.postgres.database.azure.com
```

### 2.1 Create the app's database + scoped role
Connect to the shared server as admin and run:
```sql
CREATE ROLE myapp_user WITH LOGIN PASSWORD '<generate-a-strong-one>';
CREATE DATABASE myapp OWNER myapp_user;
\c myapp
ALTER SCHEMA public OWNER TO myapp_user;
GRANT ALL ON SCHEMA public TO myapp_user;
```
The role owns **only** `myapp` — it cannot touch other apps' data. Save the password in the
team secret store.

### 2.2 Build + push the image to the shared ACR
```bash
az acr build --registry $ACR --image $APP:latest ./   # run from the app repo (needs a Dockerfile)
```

### 2.3 Create the container app
```bash
ACR_PW=$(az acr credential show -n $ACR --query "passwords[0].value" -o tsv)

az containerapp create \
  --name $APP --resource-group $RG --environment $ENV \
  --image $ACR.azurecr.io/$APP:latest \
  --registry-server $ACR.azurecr.io --registry-username $ACR --registry-password "$ACR_PW" \
  --target-port 3000 --ingress external \
  --min-replicas 0 --max-replicas 3 \        # min=1 if it must stay warm
  --cpu 0.5 --memory 1.0Gi \
  --secrets db-url="postgresql://myapp_user:<pw>@$PGHOST:5432/myapp?sslmode=require" \
  --env-vars DATABASE_URL=secretref:db-url NODE_ENV=production \
  --tags app=$APP
```

### 2.4 Get the URL + smoke test
```bash
az containerapp show -n $APP -g $RG --query properties.configuration.ingress.fqdn -o tsv
# → https://<app>.<env-id>.northcentralus.azurecontainerapps.io
curl -s https://<fqdn>/healthz
```

### 2.5 (Optional) custom domain
Add the domain on the container app, then a CNAME in DNS (Cloudflare) → the app FQDN.
```bash
az containerapp hostname add --name $APP -g $RG --hostname app.illinihunt.org
az containerapp hostname bind --name $APP -g $RG --hostname app.illinihunt.org --environment $ENV
```

### 2.6 (If the app has a separate frontend)
Prefer **serving the frontend from the same container** (one app, no CORS) — e.g. an Express
app serving its built SPA from `./public`. Only use a separate Azure Static Web App (free
tier) if the frontend must be deployed independently.

---

## 3. CI/CD — reusable GitHub Actions template

Drop this in each app repo as `.github/workflows/deploy.yml`. It builds the image in ACR and
updates the container app. Auth uses ACR creds (stored as repo secrets) — no service
principal required.

```yaml
name: Deploy to Azure Container Apps

on:
  push:
    branches: [main]
  workflow_dispatch: {}

env:
  ACR: illinihuntdevacr
  APP: myapp                         # <- change me
  RG: DL_ResourceGroup_01

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Log in to ACR
        uses: docker/login-action@v3
        with:
          registry: illinihuntdevacr.azurecr.io
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}

      - name: Build + push image
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            illinihuntdevacr.azurecr.io/${{ env.APP }}:latest
            illinihuntdevacr.azurecr.io/${{ env.APP }}:${{ github.sha }}

      - name: Update container app
        uses: azure/cli@v2
        with:
          inlineScript: |
            az containerapp update \
              --name ${{ env.APP }} --resource-group ${{ env.RG }} \
              --image illinihuntdevacr.azurecr.io/${{ env.APP }}:${{ github.sha }}
```

Repo secrets needed: `ACR_USERNAME`, `ACR_PASSWORD` (from
`az acr credential show -n illinihuntdevacr`). The `azure/cli` step also needs Azure auth —
use `azure/login@v2` with `AZURE_CREDENTIALS` (a scoped service principal) **or** trigger the
update via an **ACR webhook + continuous deployment** on the container app (no SP needed):

```bash
# Alternative to the update step: let the app auto-pull on ACR push
az containerapp registry set -n $APP -g $RG --server $ACR.azurecr.io \
  --username $ACR --password "$ACR_PW"
# then enable revision auto-update via an ACR webhook to the app's CD endpoint
```

> **Pick one** update mechanism per app and keep it consistent. The `azure/login` + `az
> containerapp update` path is the simplest to reason about; the webhook path avoids storing
> Azure credentials in CI.

---

## 4. Per-app sizing guidance

| App profile | `min-replicas` | `cpu` / `memory` | Result |
|---|---|---|---|
| Dormant / internal tool | `0` | 0.5 / 1.0Gi | **$0 when idle**, ~2–4s cold start |
| Low traffic, user-facing | `0` or `1` | 0.5 / 1.0Gi | `1` if cold start unacceptable |
| Always busy | `1`+ | tune up | always warm; costs like a small dedicated instance |

Start every app at `min=0`. Promote to `min=1` only if users notice cold starts.

---

## 5. Operations

```bash
# Logs (stream)
az containerapp logs show -n $APP -g $RG --follow

# Current revision / status
az containerapp revision list -n $APP -g $RG -o table

# Roll back to a previous image
az containerapp update -n $APP -g $RG --image illinihuntdevacr.azurecr.io/$APP:<good-sha>

# Scale knobs
az containerapp update -n $APP -g $RG --min-replicas 1 --max-replicas 5
```

Database connection (scoped role, never the server admin for app work):
```
postgresql://<app>_user:<pw>@dl-postgresqlserver-01.postgres.database.azure.com:5432/<app>?sslmode=require
```

---

## 6. Decommission an app
```bash
az containerapp delete -n $APP -g $RG --yes
az acr repository delete -n illinihuntdevacr --repository $APP --yes
# Drop its DB on the shared server (after backing up if needed):
#   DROP DATABASE myapp;  DROP ROLE myapp_user;
```
Because each app is self-contained (own container app, own DB, own role, own tag),
removal is clean and affects nothing else.

---

## 7. Why this standard

- **Cheap at scale:** dormant apps cost ≈ $0 (scale-to-zero); adding apps adds ≈ $0. See
  [`COST_ANALYSIS.md`](./COST_ANALYSIS.md).
- **Uniform:** one pipeline, one environment, one registry, one DB server — every app
  onboards the same way regardless of language/framework (it's just a container).
- **Isolated:** per-app DB + scoped role; per-app container; per-app tag.
- **No App Service blessed-runtime quirks:** Container Apps just runs your image — avoids the
  `node_modules`-compression / custom-startup issues that complicate code-based App Service
  deploys for non-Next.js stacks.
```
