# ADR-0001: Stack choice and portability rules

**Status:** accepted
**Date:** 2026-07-28

## Context

The awsug.nz site is being rewritten. The current site is a hand-maintained
collection of HTML fragments loaded by a client-side hash router, which makes
routine content edits (adding a news item, updating a meetup) riskier and more
tedious than they should be for a volunteer committee.

Requirements that shaped this decision:

- A Node-based toolchain.
- Content should be editable as markdown, not hand-edited HTML.
- Dynamic content — the homepage shows current events — so a purely hand-written
  static site is not enough.
- Cost must stay low. This is a volunteer society.
- Visually a sibling of the Oceania Community Day site.

The recurring worry, and the reason this ADR exists, is framework lock-in: if we
pick a framework now, how much work is it to leave later?

## Decision

**Astro 7.x with `output: 'static'` and no adapter.**

The build emits plain HTML, CSS and JS. There is no server, no runtime, and no
hydration framework. Dynamic content arrives through a single client-side fetch
of a cached JSON file (see [api-contract.md](./api-contract.md)).

To keep the lock-in genuinely small rather than nominally small, we also adopt
these constraints:

| Rule | Why |
| --- | --- |
| Content in markdown and JSON, never in templates | The content survives any rewrite untouched |
| Plain CSS with custom properties, no Tailwind | Stylesheets move to any framework as-is |
| Vanilla JS in `<script>`, no React/Vue/Svelte islands | No component model to port |
| `output: 'static'`, no adapter, no SSR | Output is deployable anywhere that serves files |
| No Astro-specific data in frontmatter schemas | Zod schemas are ordinary TypeScript |

## Consequences

### What lock-in actually remains

Only the `.astro` template files — roughly 20 small files. Everything they
consume (markdown, JSON, CSS, the API client, the OG script) is framework-neutral.
A migration to Eleventy, Next or plain templates would mean rewriting the
templates and nothing else. That is a days-long job, not a rewrite.

### What we give up

**A build toolchain raises the maintenance floor.** Today a volunteer can edit
HTML with no tooling at all. Afterwards the repo needs Node, npm and dependency
upkeep. This is the real cost of the decision, and it is mitigated rather than
eliminated:

- The Node version is pinned in `.nvmrc` and in `engines`.
- The lockfile is committed.
- Dependabot or Renovate should be enabled on the repo.
- **Content contributors do not need Node.** Editing a markdown file in the
  GitHub web UI and letting CI build is a fully supported workflow, so fixing a
  typo never requires a local dev environment.

**We accept a dependency on Astro's content collections API.** It changed
between Astro 4 and 5. The mitigation is that the markdown files themselves are
plain, so a breaking change means editing `content.config.ts`, not the content.

## Alternatives considered

**Keep hand-written HTML.** Rejected: it cannot satisfy the dynamic-events
requirement without the client-side router that is already the maintenance
problem, and there is no schema validation, so a malformed page fails silently
in production instead of at build time.

**Next.js.** Rejected: it brings React, a component model and a much larger
dependency surface for a site that renders almost no interactive UI. It would
create far more lock-in than Astro for no benefit here.

**Eleventy.** A genuinely reasonable alternative with slightly less lock-in.
Astro was chosen for first-class TypeScript, schema-validated content
collections that fail the build on bad frontmatter, and scoped component styles.
If the portability constraints above are honoured, switching to Eleventy later
remains cheap.

**A JS framework with SSR.** Rejected outright: it puts compute on the request
path, which conflicts with the low-cost requirement, for a site whose content
changes a few times a month.

## Notes

`site` and `base` are read from environment variables, so the same source builds
correctly at a domain root or under a nested demo path without a code change.
