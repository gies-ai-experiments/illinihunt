# DNS Cutover Runbook — point illinihunt.org at the Azure stack

**Goal:** move `illinihunt.org` from the old Vercel/Supabase deployment to the new Azure stack (Static Web App frontend + App Service API), with zero data loss and a clean rollback path.

**Estimated time:** 30–45 min active, plus up to ~1 hr for DNS/cert propagation.

**Schedule it for a quiet window** — there's a brief period where the domain may serve inconsistent responses while DNS + the SWA managed cert settle.

---

## Reference values (fill-in-the-blanks already filled)

| Thing | Value |
|---|---|
| Custom domain | `illinihunt.org` (apex) |
| Frontend (SWA) | `illinihunt-dev` in RG `DL_ResourceGroup_01` |
| SWA hostname | `polite-desert-0406a5c10.7.azurestaticapps.net` |
| API (App Service) | `illinihunt` → `https://illinihunt.azurewebsites.net` |
| Entra app (client ID) | `02e095d4-b4f4-4209-86e7-56574e08cd11` |
| Entra tenant | `44467e6f-462c-4ea2-823f-7800de5434e3` |
| GitHub repo | `gies-ai-experiments/illinihunt` |
| Subscription | `urbana-business-disruptionlab` (`41fbcd97-…`) |

**Why no frontend rebuild is needed:** MSAL `redirectUri` is `window.location.origin` (dynamic), and the frontend calls the API at its fixed `azurewebsites.net` URL. So the only app-level change is *registering* `https://illinihunt.org` in Entra (runtime) and allowing it in API CORS. No `VITE_*` change, no redeploy.

---

## Phase 0 — Pre-flight (do these BEFORE touching DNS)

These are safe to do in advance; they prepare the stack so the moment DNS flips, everything works.

### 0.1 Allow the new origin in API CORS

The frontend served from `https://illinihunt.org` will make cross-origin calls to `illinihunt.azurewebsites.net`. Add the apex (and `www`, if you'll use it) to the API's allowlist:

```bash
az webapp config appsettings set \
  --name illinihunt \
  --resource-group DL_ResourceGroup_01 \
  --settings CORS_ORIGINS="https://illinihunt.org,https://www.illinihunt.org,https://polite-desert-0406a5c10.7.azurestaticapps.net,http://localhost:5173" \
  --output none

az webapp restart --name illinihunt --resource-group DL_ResourceGroup_01
```

Verify after restart:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://illinihunt.azurewebsites.net/healthz   # expect 200
```

### 0.2 Register the new redirect URI in Entra ID

Portal → **Microsoft Entra ID** → **App registrations** → the app `02e095d4-…` → **Authentication** → under **Single-page application**, **Add URI**:

```
https://illinihunt.org
```

(Add `https://www.illinihunt.org` too if you plan to serve `www`.) **Save.** Leave the existing `polite-desert-…azurestaticapps.net` and `http://localhost:5173` URIs in place — they stay valid.

> If sign-in later fails with `AADSTS50011 redirect URI mismatch`, this step was missed or the URL has a typo/trailing slash.

### 0.3 Confirm you have Cloudflare DNS access

Log in to the Cloudflare dashboard for the `illinihunt.org` zone. Confirm you can edit DNS records. Note the **current** record for the apex (`illinihunt.org`) — it almost certainly points at Vercel (`cname.vercel-dns.com` or an A record). **Screenshot it** so you can roll back.

---

## Phase 1 — Add the custom domain to the Static Web App

### 1.1 Start domain validation in Azure

```bash
az staticwebapp hostname set \
  --name illinihunt-dev \
  --resource-group DL_ResourceGroup_01 \
  --hostname illinihunt.org
```

This registers the intent and returns validation details. Because it's an **apex** domain, SWA validates via a **TXT record** (or `CNAME` for subdomains). Get the validation token:

```bash
az staticwebapp hostname show \
  --name illinihunt-dev \
  --resource-group DL_ResourceGroup_01 \
  --hostname illinihunt.org \
  --query "{status:status, validationToken:validationToken}" -o json
```

> Apex domains use a `TXT` validation record + a `CNAME`/`ALIAS` (via Cloudflare CNAME-flattening) for routing. Subdomains (e.g. `www`) just use a `CNAME`.

### 1.2 Add the validation + routing records in Cloudflare

In the Cloudflare DNS panel for `illinihunt.org`:

1. **Validation TXT record** (only if Azure returned a `validationToken`):
   - Type: `TXT`
   - Name: `illinihunt.org` (or the exact host Azure specifies)
   - Content: `<validationToken from 1.1>`
   - TTL: Auto

2. **Routing record (apex)** — replace the old Vercel record:
   - Type: `CNAME`
   - Name: `@` (apex — Cloudflare flattens this automatically)
   - Target: `polite-desert-0406a5c10.7.azurestaticapps.net`
   - **Proxy status: DNS only (grey cloud) for now** — see note below
   - TTL: Auto

3. **(Optional) www subdomain:**
   - Type: `CNAME`, Name: `www`, Target: `polite-desert-0406a5c10.7.azurestaticapps.net`, Proxy: DNS only initially.

> **Why DNS-only (grey cloud) during validation:** Azure needs to issue a managed TLS cert for `illinihunt.org`, and the validation/issuance is most reliable when Cloudflare isn't proxying. Once the domain shows **Ready** in SWA and the cert is issued, you *may* re-enable the orange-cloud proxy (Phase 3).

### 1.3 Wait for validation + cert issuance

```bash
# Poll until status = "Ready" (can take 5–30 min for apex + cert)
watch -n 30 'az staticwebapp hostname show \
  --name illinihunt-dev --resource-group DL_ResourceGroup_01 \
  --hostname illinihunt.org --query status -o tsv'
```

When it prints `Ready`, the SWA is serving `https://illinihunt.org` with a valid cert.

---

## Phase 2 — Smoke test on the real domain (still grey-cloud)

```bash
# 1. Frontend loads
curl -s -o /dev/null -w "frontend: %{http_code}\n" https://illinihunt.org

# 2. SPA fallback works (deep link returns index.html, not 404)
curl -s -o /dev/null -w "deep link: %{http_code}\n" https://illinihunt.org/trending
```

Then in a browser (incognito):
1. Open `https://illinihunt.org`
2. Sign in with an `@illinois.edu` account → should redirect to Microsoft, back to `https://illinihunt.org`, logged in.
3. Verify projects render, an image loads (Blob), a vote works.
4. Open DevTools → Network → confirm `/api/*` calls go to `illinihunt.azurewebsites.net` and return 200 (not CORS-blocked).

**If sign-in fails:** re-check Phase 0.2 (redirect URI). **If API calls are CORS-blocked:** re-check Phase 0.1 (CORS origin), and that the App Service restarted.

---

## Phase 3 — (Optional) Re-enable Cloudflare proxy

Once `https://illinihunt.org` works end-to-end on grey-cloud:

1. Cloudflare → SSL/TLS → set encryption mode to **Full (strict)**.
2. Flip the apex (and `www`) CNAME to **Proxied (orange cloud)**.
3. Re-run the Phase 2 smoke test. If you get redirect loops or 5xx, set SSL mode to **Full** (not strict) or revert to grey-cloud — Azure's cert + Cloudflare's edge cert must both be valid.

> Proxying gives you Cloudflare's CDN + DDoS protection in front of SWA (which already has its own CDN). For most cases grey-cloud is fine; orange-cloud matches the project's historical setup. Your call.

> **Cache note:** Per `CLAUDE.md`, after any deploy you must **purge Cloudflare cache** (Caching → Configuration → Purge Everything) or browsers may get stale assets. This applies to SWA deploys exactly as it did to Vercel.

---

## Phase 4 — Decommission Vercel

Only after `https://illinihunt.org` is confirmed stable on Azure for a few hours:

1. Vercel dashboard → the IlliniHunt project → Settings → remove the `illinihunt.org` custom domain (so Vercel stops claiming it).
2. Optionally pause/delete the Vercel project.
3. Remove any Vercel-specific env vars / deploy hooks you no longer need.

---

## Rollback (if something goes wrong during cutover)

DNS changes are fully reversible. To revert to Vercel:

1. Cloudflare → DNS → change the apex record back to the **old Vercel target** you screenshotted in Phase 0.3 (e.g. CNAME `@` → `cname.vercel-dns.com`, proxied as before).
2. Purge Cloudflare cache.
3. Within a few minutes DNS resolves back to Vercel. (Vercel still has the old Supabase-backed build until you decommission it in Phase 4 — so keep Phase 4 last.)

No data is involved in the DNS layer, so rollback is purely a DNS record swap.

---

## Post-cutover checklist

- [ ] `https://illinihunt.org` serves the Azure frontend
- [ ] Sign-in works on the real domain
- [ ] `/api/*` calls succeed (CORS OK)
- [ ] Images load from Blob
- [ ] Cloudflare cache purged
- [ ] Vercel domain removed (Phase 4)
- [ ] Update `CLAUDE.md` "Live" line to `https://illinihunt.org` (Azure)
- [ ] Then proceed to the other Current Focus items: delete old Postgres, rotate Supabase key, wire Sentry DSN

---

## Optional follow-up: give the API its own domain

Right now the frontend (`illinihunt.org`) calls the API at `illinihunt.azurewebsites.net`. If you'd prefer `api.illinihunt.org`:

1. App Service → `illinihunt` → Custom domains → add `api.illinihunt.org` (validates via TXT + CNAME to `illinihunt.azurewebsites.net`).
2. Cloudflare: CNAME `api` → `illinihunt.azurewebsites.net`.
3. Update the GitHub repo variable `VITE_API_URL` to `https://api.illinihunt.org/api`, push (triggers a frontend rebuild), and add `https://api.illinihunt.org` is **not** needed in Entra (only the frontend origin is a redirect URI), but **do** keep `https://illinihunt.org` in API CORS.

This is cosmetic — `azurewebsites.net` works fine. Skip unless you want the cleaner URL.
