# awsug-nz

Official website for the [AWS User Group Aotearoa New Zealand](https://awsug.nz)
community. Astro static site; production is the existing `awsug.nz` CloudFront
distribution with the default origin on an S3 site bucket (photos stay on their
own origin). Infra lives in the `terraform-aws` repo.

Push to `main` runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml):
type-check + build, then (only if that succeeds) the reusable
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) job —
`astro build` → `s3 sync` → CloudFront invalidation. Manual deploys use
`workflow_dispatch` on Deploy.

CloudFront keeps `/communitydays/archive/photos*` on the existing photos bucket.
Cutover (origin swap off GitHub Pages, CoC function fix) is in
[docs/adr-0002-hosting.md](docs/adr-0002-hosting.md).

## Deploy configuration

Infra (bucket + OIDC role) is in `terraform-aws`. Set these repository
**variables** on this repo (no secrets required for account id):

| Variable | Example |
| ---------- | --------- |
| `AWS_ACCOUNT_ID` | `161492946389` |
| `AWS_REGION` | `ap-southeast-6` |
| `OIDC_ROLE_NAME` | `awsug-nz-site-oidc` |
| `SITE_BUCKET` | `awsug.nz` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `E365KNSSE8FOMC` |

Until `OIDC_ROLE_NAME`, `SITE_BUCKET`, and `AWS_ACCOUNT_ID` are set, deploy skips.

## Content

> **Event data in this repo is sample data.** `public/api/events.json` is a
> committed fixture so the site runs with no backend. See
> [docs/api-contract.md](docs/api-contract.md).

| I want to… | Edit |
| --- | --- |
| Add a news item | New file in `src/content/news/` |
| Change a meetup | Matching file in `src/content/meetups/` |
| Edit About, CoC, Resources, etc. | `src/content/pages/` |
| Sponsors | `src/data/sponsors.json` (+ logo under `public/logos/sponsors/`) |
| Committee / leads | `src/data/committee.json` (+ optional `public/people/`) |
| Nav, socials, Discord, emails | `src/data/site.json` |

Schemas live in `src/content.config.ts`.

## Local development

Requires Node 24 (see [`.nvmrc`](.nvmrc)).

```bash
npm ci
npm run dev        # http://localhost:8001
npm run check      # Astro / TS diagnostics
npm run build      # static output in dist/ (+ Pagefind index)
npm run preview    # serve dist/ on port 8001
```

Site search (header / Ctrl+K) needs the Pagefind index from `npm run build`;
`astro dev` alone will not have search results until you build once. PDFs under
`public/` (copied into `dist/`) are indexed automatically — no per-file config.

| Script | What it does |
| --- | --- |
| `npm run a11y` | axe-core against a running preview |
| `npm run mobile-qa` | Overflow + touch-target smoke |
| `npm run og` | Regenerate Open Graph images |
| `npm run refresh-manifests` | Re-vendor Community Day photo manifests |

## Checks

| Check | When | What |
| ------- | ------ | ------ |
| `build` | PR + push to `main` | `astro check` + `astro build` (+ Pagefind index) |
| `deploy` | push to `main`, after `build` | reusable Deploy workflow: `s3 sync` + invalidation (when vars set) |
| Markdown Lint | PR | [actions](https://github.com/aws-user-group-nz/actions) `markdown-lint` |
| Commit Message Conformance | PR | [actions](https://github.com/aws-user-group-nz/actions) `commitmsg-conform` (skips Dependabot) |
| Auto-merge | Dependabot PRs | [actions](https://github.com/aws-user-group-nz/actions) `dependabot-auto-merge` |

## Branch protection

Rulesets live in [`.github/rulesets/`](.github/rulesets/). Create or update with:

```bash
./scripts/apply-branch-rulesets.sh --enforce
```

## Docs

- [docs/api-contract.md](docs/api-contract.md) — events JSON contract
- [docs/adr-0001-stack.md](docs/adr-0001-stack.md) — stack ADR
- [docs/adr-0002-hosting.md](docs/adr-0002-hosting.md) — hosting ADR
- [docs/a11y-checklist.md](docs/a11y-checklist.md) — accessibility notes
