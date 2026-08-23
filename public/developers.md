# IlliniHunt Developer Documentation

IlliniHunt REST API reference: base URL, public endpoints, parameters, pagination, rate limits, JSON error format, and the authentication model.

IlliniHunt publishes a read-only public API over its catalog of University of Illinois Urbana-Champaign projects. No key, no signup, no quota form. This page is the human-readable reference; the machine-readable contract is [openapi.json](/openapi.json).

## Base URL

```
https://illinihunt.azurewebsites.net
```

The website is served from `https://illinihunt.org` and the API from `https://illinihunt.azurewebsites.net`. They are different hosts. A request to `https://illinihunt.org/api/...` returns a JSON 404 telling you so, rather than an HTML page.

## Authentication

Every endpoint listed below is unauthenticated. Write operations — submitting a project, voting, commenting, bookmarking, managing collections — require a Microsoft Entra ID bearer token issued for the University of Illinois tenant, obtained by signing in interactively with an @illinois.edu account. There is no public API key programme, so an agent can read IlliniHunt but cannot write to it.

## Public endpoints

- `GET /healthz` — liveness. Returns `{"ok": true, "ts": "..."}`.
- `GET /api/categories` — the eight categories. Category ids are what the `category` filter takes.
- `GET /api/projects` — list, search, and paginate active projects.
- `GET /api/projects/{id}` — one project, wrapped as `{"project": ...}`.
- `GET /api/projects/{id}/comments` — the public comment thread.
- `GET /api/projects/{id}/members` — the credited team. Note that each row's `id` is the membership row, and `user_id` is the person.
- `GET /api/stats` — site-wide counts of users, projects, votes, and comments.
- `GET /api/stats/trending` — projects ranked by a time-decay score.
- `GET /api/collections` — public collections.
- `GET /api/users/{id}` — a public profile, wrapped as `{"user": ...}`. Email addresses are never included.
- `GET /api/users/{id}/projects` — the projects that user submitted or is credited on.
- `GET /api/votes/batch?projectIds=a,b,c` — vote counts for up to 200 projects in one request.

## Listing and searching projects

`GET /api/projects` accepts:

- `search` — case-insensitive substring match against project name and tagline.
- `category` — a category UUID from `GET /api/categories`.
- `sort` — `recent` (default, newest first) or `popular` (highest all-time upvotes).
- `limit` — page size, default 24, clamped to 100.
- `offset` — how many to skip.

The response is `{"projects": [...], "total": N, "limit": N, "offset": N}`. Page by incrementing `offset` until `offset + limit >= total`.

```
curl -s "https://illinihunt.azurewebsites.net/api/projects?search=ai&sort=popular&limit=5"
```

## Trending versus popular

`sort=popular` is all-time upvotes. `GET /api/stats/trending` scores each project as `upvotes / (hours_since_submission + 2) ^ 1.5`, so recent momentum wins. Use trending when you want what is hot now, and `sort=popular` when you want the canonical hits.

```
curl -s "https://illinihunt.azurewebsites.net/api/stats/trending?limit=10"
```

## Batching vote counts

Do not poll one project at a time. Pass up to 200 comma-separated ids:

```
curl -s "https://illinihunt.azurewebsites.net/api/votes/batch?projectIds=ID_ONE,ID_TWO,ID_THREE"
```

The response is keyed by project id, each value `{"count": N, "hasVoted": false}`. `hasVoted` is always `false` for anonymous callers.

## Rate limits

300 requests per minute per client. Responses carry `RateLimit` and `RateLimit-Policy` headers in the RFC 9331 draft-7 format, so you can read your remaining budget rather than guessing. Exceeding the limit returns a JSON error; back off until the window resets.

## Errors

Errors are always JSON, never HTML. The shape is:

```
{"error": "Not found", "path": "/api/nope"}
```

`path` is present on unmatched-route 404s. A malformed id — anything that is not a UUID — returns 404 rather than 400. Server faults return 500 with a generic message; the detail goes to the maintainers' error tracker, not to the caller.

## Data notes

- `status` is `active` for everything the public API returns; moderated-away projects are excluded.
- `image_url` points at Azure Blob Storage and may be null.
- `upvotes_count` is denormalized and updated by a database trigger, so it is consistent with `GET /api/votes/batch`.
- Timestamps are ISO 8601 UTC.

## Source and support

The API is Express with Prisma against PostgreSQL; the whole thing is open source at [https://github.com/gies-ai-experiments/illinihunt](https://github.com/gies-ai-experiments/illinihunt). Report API problems at [https://github.com/gies-ai-experiments/illinihunt/issues](https://github.com/gies-ai-experiments/illinihunt/issues).

## Elsewhere on IlliniHunt

- [Home](https://illinihunt.org/)
- [Trending](https://illinihunt.org/trending)
- [About](https://illinihunt.org/about)
- [Docs](https://illinihunt.org/docs)
- [Contact](https://illinihunt.org/contact)
- [Privacy](https://illinihunt.org/privacy)
