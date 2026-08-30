# ADR-0002: Hosting and the cutover path

**Status:** accepted
**Date:** 2026-07-28
**Updated:** 2026-08-30

## Context

The site must move to a new codebase without breaking the Community Day photo
archive, which is served from a dedicated S3 bucket and has thousands of
existing URLs in the wild.

Existing infrastructure is fully managed in the `terraform-aws` repo on `main`
(`cloudfront.tf`, `s3.tf`, `route53.tf`, `wafv2.tf`, `acm.tf`). Two CloudFront
distributions with WAF and ACM, Route 53 alias records, and both buckets
private, versioned, OAC-only, with `prevent_destroy = true`:

- **`awsug.nz` + `www.awsug.nz`** — the default behaviour currently points at a
  GitHub Pages custom origin (`aws-user-group-nz.github.io`). The
  `awsugnz-awscommunityday-photos` bucket (us-east-1) is a *second* origin via
  OAC, selected by an `ordered_cache_behavior` on
  `/communitydays/archive/photos*`. A CloudFront Function strips the photos
  prefix, maps year routes to `index.html`, and 301s `/code-of-conduct`.
- **`assets.awsug.nz`** — the `awsugnz-assets` bucket (Auckland,
  `ap-southeast-6`), with its own function rewriting `/images/`, `/logos/` and
  similar under an `/assets` prefix.

## Decision

**Production is S3 plus the CloudFront distribution that already exists.**
Cutover is repointing the default origin from GitHub Pages to a new site bucket,
deployed by a GitHub Action doing `s3 sync` and an invalidation
([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)).

The photos `ordered_cache_behavior` is evaluated independently of the default
origin, so it needs no change at all: **no bucket change, no key renames, no URL
change, no new hostname.** The archive keeps working through the cutover.

**Amplify Hosting is not used** for this site (not for production, staging, or
previews). It cannot express path-based multi-origin behaviours; proxying the
photo archive through Amplify would add a hop and bill image egress through
Amplify.

## Before cutover

This site builds and reviews without touching existing AWS resources:

- **Events** — `public/api/events.json` is a committed fixture. Astro copies
  `public/` verbatim into `dist/`, so `/api/events.json` is served by the site's
  own files. The path is deliberately identical to the future production path.
- **Photos** — hotlinked at their current absolute URLs, which already work from
  any origin. `<img>` needs no CORS.
- **Photo manifests** — vendored into the repo (~32KB for 2023–2025) rather than
  fetched during the build, so builds are hermetic and offline-capable.
- **Fonts, icons, OG images, sponsor logos** — self-hosted, bundled or committed.

## Required at cutover (`terraform-aws` + this repo)

- **A new site bucket, and repointing the `awsug.nz` default origin** to it from
  the GitHub Pages custom origin, with OIDC for this repo’s deploy workflow. The
  photos behaviour needs no change.
- **An `ordered_cache_behavior` on `/api/*`** pointing at a bucket or prefix
  *separate from the site bucket*, so `s3 sync --delete` on a site deploy cannot
  delete the Lambda-written `events.json`.
- **The events Lambda and its EventBridge schedule**, writing `events.json` with
  its own `Cache-Control`. See [api-contract.md](./api-contract.md).
- **Update or remove the `/code-of-conduct` → `/#/about/codeofconduct` 301** in
  the CloudFront Function. This site serves a real `/code-of-conduct` page, so
  that redirect will misroute a valid URL the moment the new site goes live.
  This one will break things if it is missed.
- **Do not copy the assets distribution's `403/404 → 200 /index.html` mapping.**
  Answering 200 for missing pages tells crawlers every wrong URL is a real page.
  This site builds a real `404.html`; serve it with a 404 status.
- **Do not publish this site into `aws-user-group-nz.github.io`.** That host is
  also the origin for `www.oceania.aws-community-day.nz`; replacing its content
  would flip oceania as well.

## Improvements worth making while in there

- **`price_class = "PriceClass_100"` on both distributions excludes New
  Zealand.** Price Class 100 covers only US/Mexico/Canada and
  Europe/Israel/Türkiye; AU/NZ are excluded from Price Class 200 as well and
  need `PriceClass_All`. Confirmed empirically: requests from New Zealand for
  both the site root and archive photos returned `x-amz-cf-pop: LAX50-P1` and
  `SEA900-P10`. At this volume the Price Class All cost difference is small; the
  latency win for gallery images is large.
- **Generalise the hardcoded `2023|2024|2025`** year routes in the CloudFront
  Function to a regex, so a new Community Day does not require a Terraform
  change and a function republish. This site's real per-year pages remove the
  need for new years anyway.
- **Generate thumbnail derivatives** under a separate prefix beside the
  untouched originals. This is the highest-value performance follow-up: lazy
  loading only changes *when* 500–750KB arrives, not how much.
- **Emit a richer photo manifest** carrying `{ file, w, h }`, so the gallery can
  reserve each image's true aspect ratio. This site currently crops to a fixed
  3:2 box to avoid layout shift, which is the right trade-off without dimensions
  but does crop some photos.
- Minor: `www.assets.awsug.nz` is still a CNAME to `aws-user-group-nz.github.io`,
  vestigial and not in the assets distribution's aliases.

## Target production shape

One distribution, three origins, mirroring how photos are already wired:

| Path | Origin |
| --- | --- |
| `/*` (default) | Site bucket, deployed by GitHub Actions |
| `/api/*` | Separate bucket or prefix, written by the events Lambda |
| `/communitydays/archive/photos*` | Existing photos bucket, unchanged |

Because everything is same-origin from the browser's point of view, there is no
CORS to configure and no third-party request on any page.
