# About IlliniHunt

What IlliniHunt is, who runs it, who can post, and how projects are ranked.

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

IlliniHunt is built and operated by the Disruption Lab at Gies College of Business, University of Illinois Urbana-Champaign. It runs on Azure — a Static Web Apps frontend and an App Service API backed by Azure Database for PostgreSQL. The source is public and MIT-licensed at [https://github.com/gies-ai-experiments/illinihunt](https://github.com/gies-ai-experiments/illinihunt).

## For agents

There is a public read API, an [OpenAPI description](/openapi.json), and an [llms.txt](/llms.txt) that says when an agent should and should not reach for this site. Start at the [developer documentation](/developers).

## Elsewhere on IlliniHunt

- [Home](https://illinihunt.org/)
- [Trending](https://illinihunt.org/trending)
- [Developers](https://illinihunt.org/developers)
- [Docs](https://illinihunt.org/docs)
- [Contact](https://illinihunt.org/contact)
- [Privacy](https://illinihunt.org/privacy)
