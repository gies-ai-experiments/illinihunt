# Lab App Hosting — Cost Analysis & Recommendation

**Prepared for:** Disruption Lab stakeholders
**Date:** 2026-06-09
**Subscription:** `urbana-business-disruptionlab` · Region: `northcentralus`

> All dollar figures are **estimates** for planning. Exact prices vary by region and
> change over time — confirm in the [Azure Pricing Calculator](https://azure.microsoft.com/pricing/calculator/)
> before budgeting. The **relative comparison** (which model is cheaper as the app count
> grows) is the robust conclusion and does not depend on the exact rates.

---

## 1. Executive summary

The lab hosts a growing number of **low-traffic / mostly-dormant** web apps (MindForum,
IlliniHunt, UniQuick, gies-canvas-mcp, …). Today they run on a single **always-on Premium
App Service Plan** that is billed 24/7 regardless of usage.

**Recommendation:** standardize all apps on **Azure Container Apps (consumption /
scale-to-zero)** with **shared backing services** (one PostgreSQL server, one container
registry). Idle apps then cost **≈ $0**, and cost scales with *actual usage* rather than
*number of apps*.

**Projected effect (estimated):**

| App count | Current model (App Service Plan) | Proposed (Container Apps) | Est. monthly saving |
|---|---|---|---|
| 5 (today) | ~$235/mo | ~$65/mo | **~$170/mo** |
| 15 | ~$415/mo | ~$85/mo | **~$330/mo** |
| 25 | ~$595/mo | ~$115/mo | **~$480/mo** |

At 15 apps that's roughly **~$4,000/year** avoided, and the gap widens as more dormant apps
are added.

---

## 2. Current architecture

```
                       ┌─────────────────────────────────────────────┐
   each app's traffic  │  App Service Plan  "dl-appplan-01"           │
   ───────────────────►│  P1mv4 (Premium, memory-optimized)          │
                       │  ALWAYS ON — billed 24/7 regardless of use   │
                       │   ├── mindforum                              │
                       │   ├── illinihunt / illinihunt-front          │
                       │   ├── uniquick                               │
                       │   └── gies-canvas-mcp-staging                │
                       └───────────────┬─────────────────────────────┘
                                       ▼
                       ┌─────────────────────────────┐   ┌─────────────────┐
                       │ PostgreSQL  dl-postgresql-01 │   │ ACR (images)    │
                       │ one DB per app               │   │ illinihuntdevacr│
                       └─────────────────────────────┘   └─────────────────┘
```

**Cost characteristic:** the plan is a **fixed cost sized for peak capacity**. Dormant apps
still consume their share of that paid-for capacity. When the app count outgrows one
instance, you must scale up/out — another fixed step increase, paid 24/7.

---

## 3. Proposed architecture

```
                       ┌─────────────────────────────────────────────┐
   each app's traffic  │  Container Apps Environment (Consumption)    │
   ───────────────────►│  SCALE-TO-ZERO — billed only while running   │
                       │   ├── mindforum        (min=1, always warm)  │  ← the few that
                       │   ├── illinihunt       (min=0, $0 idle)      │     need instant
                       │   ├── uniquick         (min=0, $0 idle)      │     response keep
                       │   ├── app-N            (min=0, $0 idle)      │     min=1; the rest
                       │   └── … (15+, each ~$0 when idle)            │     cost $0 idle
                       └───────────────┬─────────────────────────────┘
                                       ▼
                       ┌─────────────────────────────┐   ┌─────────────────┐
                       │ PostgreSQL  dl-postgresql-01 │   │ ACR (images)    │
                       │ one DB per app (unchanged)   │   │ (unchanged)     │
                       └─────────────────────────────┘   └─────────────────┘
```

**Cost characteristic:** no always-on plan. Each app scales from **0 → N replicas** on
demand. Idle = $0. You pay per **vCPU-second + memory-second + request**, with a monthly
**free grant** that covers light aggregate usage. Adding a dormant app adds ≈ $0.

---

## 4. The cost model, component by component

These services are **identical in both models** (shared, unchanged) — they are not where the
difference comes from:

| Shared service | Est. monthly | Notes |
|---|---|---|
| PostgreSQL Flexible Server (B2s, shared) | ~$45 | one server, one DB per app |
| Container Registry (Basic) | ~$5 | one registry, all images |
| Log Analytics | ~$5 | low ingest at this scale |
| **Shared subtotal** | **~$55** | same for both models |

The difference is entirely **compute**:

### Compute — App Service Plan (current)
Fixed, always-on. One P1mv4 instance ≈ **~$180/mo**. As apps grow past one instance's
capacity you scale up/out in fixed steps:

| App count | Plan capacity needed | Est. compute |
|---|---|---|
| 5 | 1× P1mv4 | ~$180 |
| 15 | ~2× (scale out) | ~$360 |
| 25 | ~3× | ~$540 |

### Compute — Container Apps consumption (proposed)
Usage-based, scale-to-zero, with a **per-subscription monthly free grant**
(~180,000 vCPU-sec + ~360,000 GiB-sec + ~2,000,000 requests free). For dormant /
low-traffic apps, aggregate usage stays near the grant:

| App count (mostly dormant) | Est. compute |
|---|---|
| 5 | ~$10 |
| 15 | ~$30 |
| 25 | ~$60 |

> Apps that receive *sustained* traffic cost more (they run continuously) — but then they're
> doing real work. The model charges where value is delivered, not for idle capacity.

### Totals (shared + compute)

| App count | App Service Plan | Container Apps | Saving |
|---|---|---|---|
| 5 | **~$235** | **~$65** | ~$170/mo |
| 15 | **~$415** | **~$85** | ~$330/mo |
| 25 | **~$595** | **~$115** | ~$480/mo |

```
Monthly cost vs. number of apps (estimated)

$600 ┤                                            ● App Service ($595)
$500 ┤
$400 ┤                  ● App Service ($415)
$300 ┤
$235 ┤  ● App Service
$200 ┤
$115 ┤                                            ▲ Container Apps ($115)
$100 ┤  ▲ ($65)         ▲ ($85)
   0 ┼───────┬──────────────┬──────────────────────┬────────
        5 apps          15 apps                 25 apps

   ● App Service Plan = steps UP as apps grow (fixed, always-on)
   ▲ Container Apps    = stays low (usage-based, idle = $0)
```

---

## 5. Why the models diverge

| | App Service Plan | Container Apps (consumption) |
|---|---|---|
| Billing basis | Fixed capacity, 24/7 | Actual vCPU/memory/requests used |
| Idle (dormant) app | Still paid for | **$0** |
| Add another dormant app | Consumes paid capacity → eventual scale-up | **≈ $0** |
| Cost driver | **Number of apps** (capacity) | **Amount of traffic** |
| Right fit for | A few always-busy apps | **Many mostly-idle apps** ← the lab |

The lab's profile — **many apps, most idle most of the time** — is exactly the case where
scale-to-zero wins decisively.

---

## 6. Trade-offs (honest accounting)

| Consideration | Impact | Mitigation |
|---|---|---|
| **Cold starts** | A scaled-to-zero app takes ~2–4s to wake on the first request after idle | Set `min-replicas=1` for the few apps that must feel instant (e.g. MindForum); cost for just those |
| **Migration effort** | One-time move of existing apps off the plan | Phased; container-native apps move easily (IlliniHunt's API already ran on Container Apps) |
| **Transition overlap** | Briefly pay both plan + Container Apps until the plan is emptied and deleted | Keep the window short; delete the plan as the last step |
| **Per-request pricing at high traffic** | An app that becomes genuinely busy costs more than a plan slot | Acceptable — it's earning it; or pin heavy apps to a small dedicated plan |

---

## 7. Recommendation & phased plan

**Adopt Container Apps (consumption) as the lab standard; retire the App Service Plan.**

1. **Stand up the platform** (one-time): Container Apps Environment (consumption) + confirm
   shared Postgres + shared ACR. ~1 hour.
2. **Migrate apps one at a time** to the environment (build image → push to ACR →
   `az containerapp create`), each with a per-app database + scoped role. Set `min-replicas`
   per app (0 for dormant, 1 for must-be-warm).
3. **Verify** each app, then **delete the App Service Plan** once empty → savings realized.
4. **Onboard all future apps** via the standard runbook (see
   [`LAB_DEPLOYMENT_STANDARD.md`](./LAB_DEPLOYMENT_STANDARD.md)).

**Net:** estimated **~$330/mo (~$4k/yr) saved at 15 apps**, a standardized one-pipeline
deploy process, and a platform where each new dormant app adds ≈ $0.

---

## 8. Note on resource groups (common question)
Resource groups are **free** — Azure bills resources, never the RG. Use **one shared RG +
per-app tags** for simplicity (or per-app RGs purely for lifecycle/ownership cleanliness).
RG strategy has **no cost impact**; decide it on organizational grounds only.
