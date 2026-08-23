# IlliniHunt Privacy

What data IlliniHunt collects, what is shown publicly, what is never exposed through the API, and how to have your data removed.

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

Material changes to this page will be recorded in the public repository at [https://github.com/gies-ai-experiments/illinihunt](https://github.com/gies-ai-experiments/illinihunt), so the history of what this page said is auditable.

## Elsewhere on IlliniHunt

- [Home](https://illinihunt.org/)
- [Trending](https://illinihunt.org/trending)
- [About](https://illinihunt.org/about)
- [Developers](https://illinihunt.org/developers)
- [Docs](https://illinihunt.org/docs)
- [Contact](https://illinihunt.org/contact)
