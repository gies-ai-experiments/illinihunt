#!/usr/bin/env python3
"""Generate the server-rendered, JavaScript-free pages that agents and crawlers read.

Every page is emitted twice: once as styled HTML for people, once as .md for
agents that would rather have plain markdown. Both come from the same source
below, so the two can't drift apart.

Run from the repo root:  python3 scripts/build-static-pages.py
"""

import html
import re
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public"

SITE = "https://illinihunt.org"
API = "https://illinihunt.azurewebsites.net"
REPO = "https://github.com/gies-ai-experiments/illinihunt"

# --------------------------------------------------------------------------
# Page content. Body is a light markdown subset: ## headings, - bullets,
# ``` fences, blank-line-separated paragraphs, [text](url) and `code` inline.
# --------------------------------------------------------------------------

PAGES = {
    "about": {
        "title": "About IlliniHunt",
        "description": "What IlliniHunt is, who runs it, who can post, and how projects are ranked.",
        "body": """
IlliniHunt is a launch board for the University of Illinois Urbana-Champaign. Students, faculty, and staff post the apps, startups, research tools, and side projects they have built, and the campus community upvotes and comments on them. Think Product Hunt, scoped to one university.

The site exists because good work at Illinois is scattered across course repositories, club Slack channels, demo days, and lab pages, and none of those are searchable from outside. IlliniHunt gives a project one durable public URL, a category, a description, and a vote count, so that someone looking for what the campus has built can find it in one place.

## Who can post

Submitting a project, voting, and commenting all require signing in with a University of Illinois account. Sign-in runs through Microsoft Entra ID against the university tenant and is restricted to @illinois.edu addresses. Browsing and reading require no account at all, and neither does the public read API.

## How ranking works

The home page lists projects newest first. The [trending page](/trending) applies a time-decay score — upvotes divided by (hours since submission + 2) raised to the power 1.5 — so a project with ten votes today outranks one with thirty votes from last semester. Sorting by `popular` through the API gives the all-time ordering instead.

## Categories

Projects are filed under one of eight categories: Business & Entrepreneurship, Creative & Entertainment, Emerging Technology, Health & Wellness, Learning & Education Tools, Productivity & Organization, Research & Data Analysis, and Social & Communication.

## Moderation

Anyone signed in can report a project or a comment. Reports go to a moderation queue reviewed by the maintainers, who can hide a project, remove a comment, or suspend an account. Projects removed by moderation stop appearing in the catalog and in the API.

## Who runs it

IlliniHunt is built and operated by the Disruption Lab at Gies College of Business, University of Illinois Urbana-Champaign. It runs on Azure — a Static Web Apps frontend and an App Service API backed by Azure Database for PostgreSQL. The source is public and MIT-licensed at [{repo}]({repo}).

## For agents

There is a public read API, an [OpenAPI description](/openapi.json), and an [llms.txt](/llms.txt) that says when an agent should and should not reach for this site. Start at the [developer documentation](/developers).
""",
    },
    "contact": {
        "title": "Contact IlliniHunt",
        "description": "How to reach the IlliniHunt maintainers, report a problem, request removal of a project, or flag a bug.",
        "body": """
IlliniHunt is maintained by the Disruption Lab at Gies College of Business, University of Illinois Urbana-Champaign. The fastest way to reach the maintainers about anything is the public issue tracker.

## Report a bug or request a feature

Open an issue at [{repo}/issues]({repo}/issues). Include the page URL, what you expected, and what happened instead. Bug reports about the API should include the exact request path and the JSON response you received.

## Report a project or a comment

Every project page and every comment has a report control for signed-in users. Reports land in a moderation queue that the maintainers review. Use this for spam, misrepresentation, harassment, or content that does not belong on a university site.

## Ask for your project or profile to be removed

If you posted a project and want it taken down, sign in and delete it from your dashboard. If you can no longer sign in — you have graduated and lost your NetID, for example — open an issue at [{repo}/issues]({repo}/issues) naming the project, and the maintainers will remove it. The same applies to removing a profile.

## Security reports

If you have found a vulnerability, a way to read data you should not be able to read, or a way to act as another user, please do not open a public issue. Use GitHub's private vulnerability reporting on [{repo}]({repo}) so the problem can be fixed before it is described publicly.

## Postal address

Gies College of Business, University of Illinois Urbana-Champaign, 515 East Gregory Drive, Champaign, Illinois 61820, United States.

## Not a support channel for the university

IlliniHunt is a community project, not a University of Illinois service desk. For NetID, Canvas, registration, or IT account problems, contact the university's Technology Services rather than this site.
""",
    },
    "privacy": {
        "title": "IlliniHunt Privacy",
        "description": "What data IlliniHunt collects, what is shown publicly, what is never exposed through the API, and how to have your data removed.",
        "body": """
This page describes what IlliniHunt stores about you and what it makes public. It is written to be read, not to be survived. IlliniHunt is a community project run by the Disruption Lab at Gies College of Business; it is not a University of Illinois service, and this page is not a university privacy notice.

## What is collected

When you sign in, IlliniHunt receives your name, your @illinois.edu email address, and your Microsoft Entra ID object identifier from the university's identity provider. It does not receive or store your password. If you fill in a profile, it also stores whatever you choose to put there: username, bio, department, year of study, avatar image, and links to your own site, GitHub, or LinkedIn.

When you use the site, it stores the projects you submit, the votes you cast, the comments you write, the collections you build, and the bookmarks you save.

## What is public

Your username, full name, avatar, bio, department, year of study, and self-supplied links are public on your profile page. Your projects, comments, votes counts, and public collections are public. Anything you type into a project description or a comment should be treated as published.

## What is not public

**Your email address is not exposed on any unauthenticated endpoint.** The public profile API returns your profile without it. Other signed-in @illinois.edu members can find you by email through the team-invite search, so that a collaborator can add you to a project; anonymous visitors and automated agents cannot. Site administrators can see email addresses in the moderation tools.

Your bookmarks and your private collections are visible only to you.

## Analytics and error reporting

IlliniHunt uses Sentry for error reporting. Error events are tagged with your user id and username only — not your email — and personally identifying request data is switched off. Session replay is not enabled. Anonymous page-performance measurements are collected in aggregate.

## Cookies

IlliniHunt does not set advertising or tracking cookies. Sign-in state is held in your browser's local storage by the Microsoft authentication library so that you are not asked to sign in on every page.

## Retention and removal

Content stays until you remove it. You can delete your projects, comments, and collections from your dashboard at any time. To have your profile and everything attached to it deleted, follow the instructions on the [contact page](/contact). Deleted projects stop appearing in the catalog and in the API.

## Changes

Material changes to this page will be recorded in the public repository at [{repo}]({repo}), so the history of what this page said is auditable.
""",
    },
    "docs": {
        "title": "IlliniHunt Documentation",
        "description": "Index of IlliniHunt documentation for people and for agents: API reference, OpenAPI description, llms.txt, and site background.",
        "body": """
Everything IlliniHunt publishes about itself, in one place. If you are an automated agent, start with [llms.txt](/llms.txt) — it states plainly what this site is good for and what it is not.

## For agents

- [llms.txt](/llms.txt) — machine-readable site guide, including a "when to use IlliniHunt" section that names the queries this site can and cannot answer.
- [openapi.json](/openapi.json) — OpenAPI 3.1 description of every public endpoint, with typed parameters, response schemas, and a unique operation id per operation.
- [.well-known/api-catalog](/.well-known/api-catalog) — RFC 9727 link set pointing at the API description, the documentation, and the liveness probe.
- [/api](/api) — a JSON index served from the website host, telling you that the API lives on a different host and where.
- [sitemap.xml](/sitemap.xml) — every crawlable page.

## For developers

- [Developer documentation](/developers) — endpoint reference, worked `curl` examples, pagination, rate limits, error format, and the authentication model.
- [Source code]({repo}) — the whole application, MIT-licensed.
- [Issue tracker]({repo}/issues) — bugs, feature requests, and questions.

## About the site

- [About IlliniHunt](/about) — what the site is, who can post, how ranking works, who runs it.
- [Contact](/contact) — how to reach the maintainers, report content, or request removal.
- [Privacy](/privacy) — what is stored, what is public, and what is never exposed through the API.
""",
    },
    "developers": {
        "title": "IlliniHunt Developer Documentation",
        "description": "IlliniHunt REST API reference: base URL, public endpoints, parameters, pagination, rate limits, JSON error format, and the authentication model.",
        "body": """
IlliniHunt publishes a read-only public API over its catalog of University of Illinois Urbana-Champaign projects. No key, no signup, no quota form. This page is the human-readable reference; the machine-readable contract is [openapi.json](/openapi.json).

## Base URL

```
{api}
```

The website is served from `{site}` and the API from `{api}`. They are different hosts. `{site}/api` returns a JSON index naming the API base URL, but no API endpoints are served from the website host — send requests to `{api}`.

## Authentication

Every endpoint listed below is unauthenticated. Write operations — submitting a project, voting, commenting, bookmarking, managing collections — require a Microsoft Entra ID bearer token issued for the University of Illinois tenant, obtained by signing in interactively with an @illinois.edu account. There is no public API key programme, so an agent can read IlliniHunt but cannot write to it.

## Public endpoints

- `GET /healthz` — liveness. Returns `{{"ok": true, "ts": "..."}}`.
- `GET /api/categories` — the eight categories. Category ids are what the `category` filter takes.
- `GET /api/projects` — list, search, and paginate active projects.
- `GET /api/projects/{{id}}` — one project, wrapped as `{{"project": ...}}`.
- `GET /api/projects/{{id}}/comments` — the public comment thread.
- `GET /api/projects/{{id}}/members` — the credited team. Note that each row's `id` is the membership row, and `user_id` is the person.
- `GET /api/stats` — site-wide counts of users, projects, votes, and comments.
- `GET /api/stats/trending` — projects ranked by a time-decay score.
- `GET /api/collections` — public collections.
- `GET /api/users/{{id}}` — a public profile, wrapped as `{{"user": ...}}`. Email addresses are never included.
- `GET /api/users/{{id}}/projects` — the projects that user submitted or is credited on.
- `GET /api/votes/batch?projectIds=a,b,c` — vote counts for up to 200 projects in one request.

## Listing and searching projects

`GET /api/projects` accepts:

- `search` — case-insensitive substring match against project name and tagline.
- `category` — a category UUID from `GET /api/categories`.
- `sort` — `recent` (default, newest first) or `popular` (highest all-time upvotes).
- `limit` — page size, default 24, clamped to 100.
- `offset` — how many to skip.

The response is `{{"projects": [...], "total": N, "limit": N, "offset": N}}`. Page by incrementing `offset` until `offset + limit >= total`.

```
curl -s "{api}/api/projects?search=ai&sort=popular&limit=5"
```

## Trending versus popular

`sort=popular` is all-time upvotes. `GET /api/stats/trending` scores each project as `upvotes / (hours_since_submission + 2) ^ 1.5`, so recent momentum wins. Use trending when you want what is hot now, and `sort=popular` when you want the canonical hits.

```
curl -s "{api}/api/stats/trending?limit=10"
```

## Batching vote counts

Do not poll one project at a time. Pass up to 200 comma-separated ids:

```
curl -s "{api}/api/votes/batch?projectIds=ID_ONE,ID_TWO,ID_THREE"
```

The response is keyed by project id, each value `{{"count": N, "hasVoted": false}}`. `hasVoted` is always `false` for anonymous callers.

## Rate limits

300 requests per minute per client. Responses carry `RateLimit` and `RateLimit-Policy` headers in the RFC 9331 draft-7 format, so you can read your remaining budget rather than guessing. Exceeding the limit returns a JSON error; back off until the window resets.

## Errors

Errors are always JSON, never HTML. The shape is:

```
{{"error": "Not found", "path": "/api/nope"}}
```

`path` is present on unmatched-route 404s. A malformed id — anything that is not a UUID — returns 404 rather than 400. Server faults return 500 with a generic message; the detail goes to the maintainers' error tracker, not to the caller.

## Data notes

- `status` is `active` for everything the public API returns; moderated-away projects are excluded.
- `image_url` points at Azure Blob Storage and may be null.
- `upvotes_count` is denormalized and updated by a database trigger, so it is consistent with `GET /api/votes/batch`.
- Timestamps are ISO 8601 UTC.

## Source and support

The API is Express with Prisma against PostgreSQL; the whole thing is open source at [{repo}]({repo}). Report API problems at [{repo}/issues]({repo}/issues).
""",
    },
}

NOT_FOUND = {
    "title": "404 — page not found on IlliniHunt",
    "description": "The requested path does not exist on IlliniHunt. Here is where to go instead.",
    "body": """
There is no page at this address. This is a real HTTP 404, so an automated client can trust it: IlliniHunt does not answer unknown paths with a 200 and an app shell.

## Where to go instead

- [IlliniHunt home](/) — browse every project
- [Trending](/trending) — what is getting attention now
- [About](/about) — what this site is
- [Developer documentation](/developers) — the public REST API
- [llms.txt](/llms.txt) — machine-readable site guide
- [openapi.json](/openapi.json) — OpenAPI description of the API
- [sitemap.xml](/sitemap.xml) — every crawlable page

## If you are an agent

Project pages live at `/project/{{id}}` and profiles at `/user/{{id}}`, where `{{id}}` is a UUID. Rather than guessing paths, list what exists: `GET https://illinihunt.azurewebsites.net/api/projects`.
""",
}


# --------------------------------------------------------------------------

def fmt(text):
    return text.format(repo=REPO, api=API, site=SITE).strip()


def md_inline(text):
    """Escape HTML, then re-apply links and inline code."""
    text = html.escape(text, quote=False)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)
    return text


def md_to_html(body):
    out, lines, i = [], body.split("\n"), 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            block = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                block.append(html.escape(lines[i]))
                i += 1
            out.append("<pre><code>" + "\n".join(block) + "</code></pre>")
        elif line.startswith("## "):
            out.append(f"<h2>{md_inline(line[3:])}</h2>")
        elif line.startswith("- "):
            items = []
            while i < len(lines) and lines[i].startswith("- "):
                items.append(f"<li>{md_inline(lines[i][2:])}</li>")
                i += 1
            out.append("<ul>" + "".join(items) + "</ul>")
            continue
        elif line.strip():
            out.append(f"<p>{md_inline(line)}</p>")
        i += 1
    return "\n".join(out)


CSS = """
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#050A14;color:#CBD5E1;
  font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-text-size-adjust:100%}
.wrap{max-width:44rem;margin:0 auto;padding:1.5rem 1.125rem 4rem}
header{border-bottom:1px solid rgba(255,255,255,.1);margin-bottom:2rem;padding-bottom:1.25rem}
.brand{display:inline-flex;align-items:center;gap:.6rem;text-decoration:none;color:#fff}
.mark{width:2rem;height:2rem;border-radius:.55rem;background:linear-gradient(135deg,#FF6B35,#EA580C);
  display:grid;place-items:center;font-weight:700;color:#fff;flex:none}
.brand span{font-size:1.15rem;font-weight:700}
nav{margin-top:.9rem;display:flex;flex-wrap:wrap;gap:.4rem .95rem;font-size:.875rem}
nav a{color:#94A3B8;text-decoration:none}
nav a:hover,nav a:focus{color:#FF6B35;text-decoration:underline}
h1{color:#fff;font-size:1.7rem;line-height:1.25;margin:0 0 .6rem}
h2{color:#fff;font-size:1.15rem;margin:2rem 0 .5rem}
.lede{color:#94A3B8;font-size:1.02rem;margin:0 0 1.75rem}
a{color:#FF8C5A}
a:hover,a:focus{color:#FF6B35}
ul{padding-left:1.15rem}
li{margin:.3rem 0}
code{background:rgba(255,255,255,.07);border-radius:.25rem;padding:.1rem .35rem;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.875em;
  overflow-wrap:anywhere}
pre{background:#0A1428;border:1px solid rgba(255,255,255,.09);border-radius:.5rem;
  padding:.9rem 1rem;overflow-x:auto}
pre code{background:none;padding:0;font-size:.83rem}
strong{color:#E2E8F0}
footer{margin-top:3rem;padding-top:1.25rem;border-top:1px solid rgba(255,255,255,.1);
  color:#64748B;font-size:.83rem}
footer a{color:#94A3B8}
"""

NAV = [
    ("/", "Home"),
    ("/trending", "Trending"),
    ("/about", "About"),
    ("/developers", "Developers"),
    ("/docs", "Docs"),
    ("/contact", "Contact"),
    ("/privacy", "Privacy"),
]


def page_html(slug, title, description, body, canonical):
    nav = "".join(f'<a href="{h}">{t}</a>' for h, t in NAV if h != canonical)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(description)}">
<link rel="canonical" href="{SITE}{canonical}">
<link rel="icon" type="image/svg+xml" href="/vite.svg">
<link rel="alternate" type="text/markdown" href="{canonical}.md" title="Markdown version">
<link rel="sitemap" type="application/xml" href="/sitemap.xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="IlliniHunt">
<meta property="og:url" content="{SITE}{canonical}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(description)}">
<meta property="og:image" content="{SITE}/homepage.png">
<style>{CSS}</style>
</head>
<body>
<div class="wrap">
<header>
  <a class="brand" href="/"><span class="mark">I</span><span>IlliniHunt</span></a>
  <nav>{nav}</nav>
</header>
<main>
<h1>{html.escape(title)}</h1>
<p class="lede">{html.escape(description)}</p>
{md_to_html(body)}
</main>
<footer>
IlliniHunt · Disruption Lab, Gies College of Business, University of Illinois Urbana-Champaign ·
<a href="{REPO}">Source</a> · <a href="/llms.txt">llms.txt</a> · <a href="/openapi.json">openapi.json</a>
</footer>
</div>
</body>
</html>
"""


def page_md(title, description, body, canonical):
    links = "\n".join(f"- [{t}]({SITE}{h})" for h, t in NAV if h != canonical)
    return f"# {title}\n\n{description}\n\n{body}\n\n## Elsewhere on IlliniHunt\n\n{links}\n"


def main():
    written = []
    for slug, spec in PAGES.items():
        body = fmt(spec["body"])
        canonical = f"/{slug}"
        (OUT / f"{slug}.html").write_text(
            page_html(slug, spec["title"], spec["description"], body, canonical)
        )
        (OUT / f"{slug}.md").write_text(
            page_md(spec["title"], spec["description"], body, canonical)
        )
        written += [f"{slug}.html", f"{slug}.md"]

    body = fmt(NOT_FOUND["body"])
    (OUT / "404.html").write_text(
        page_html("404", NOT_FOUND["title"], NOT_FOUND["description"], body, "/404")
    )
    written.append("404.html")

    for name in written:
        print(f"  {name:<20} {(OUT / name).stat().st_size:>6} bytes")


if __name__ == "__main__":
    main()
