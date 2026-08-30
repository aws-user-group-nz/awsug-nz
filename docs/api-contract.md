# Events feed contract

The site reads all event data from a single JSON document served at
`/api/events.json` on the site's own origin.

Today that document is a committed fixture in `public/api/events.json`.
In production it will be written by a scheduled Lambda. **The path is identical
in both cases**, so shipping the Lambda changes no site code — the real object
simply shadows the fixture.

This document is the contract between the two. The Lambda can be built against
it independently, and `src/lib/api.ts` validates against it at runtime.

## Why scheduled rather than request-path

A Lambda Function URL invoked per visitor would be the obvious shape, and it is
the wrong one here.

- A low-traffic community site almost never has a warm container, so the events
  section would be the slowest thing on the page.
- Cost scales with visitors instead of with a fixed schedule.
- It needs CORS configuration; a same-origin static object does not.
- If the Lambda breaks, the site keeps serving the last good payload.

So EventBridge invokes the Lambda on a schedule, it polls the upstream sources,
normalises everything into one payload, and writes the object to S3. CloudFront
serves it through an `ordered_cache_behavior` on `/api/*` — the same pattern the
photo archive already uses.

## Schema

```jsonc
{
  // ISO 8601 with offset. When this payload was produced, not when it was read.
  "generatedAt": "2026-07-27T20:00:00+12:00",

  // Optional. Omit the whole object if Discord could not be reached; the
  // Discord panel degrades to a plain join button rather than showing zero.
  "discord": {
    "online": 62,
    "total": 940
  },

  // Sorted ascending by `start` is preferred but not required — the client
  // sorts defensively. Past events may be included; the client filters them.
  "events": [
    {
      // Stable across runs. Used as a render key and for calendar UIDs, so it
      // must not change between polls for the same real-world event.
      "id": "discord-2026-08-06-auckland",

      "title": "Auckland meetup — Bedrock in production",

      // ISO 8601 with offset. Required.
      "start": "2026-08-06T17:30:00+12:00",

      // ISO 8601 with offset. Optional; omit for open-ended events.
      "end": "2026-08-06T20:00:00+12:00",

      // Optional. Plain text — it is rendered as text, never as HTML.
      "description": "Two talks on running Amazon Bedrock workloads...",

      // Optional. A venue for physical events, a platform name for online ones.
      "location": "Datacom, 68 Jervois Quay, Auckland",

      // Required. Drives the online/in-person filter.
      "online": false,

      // Optional. Where to find out more or register.
      "url": "https://www.meetup.com/AWS_NZ",

      // One of: discord | meetup | twitch | youtube | other.
      // Unrecognised values are coerced to "other" rather than dropped.
      "source": "meetup"
    }
  ]
}
```

### Validation behaviour

`src/lib/api.ts` treats the feed as untrusted, because it is produced by a
separate deployable on a different release cadence:

- An event missing `id`, `title` or a parseable `start` is **dropped**, not
  rendered as a broken card.
- An unparseable `end` is treated as absent.
- An unrecognised `source` becomes `other`.
- A malformed document as a whole yields an empty event list, and the UI shows
  its error state rather than throwing.

Adding fields is therefore safe. Renaming or removing the required three is not.

## Producer requirements

**Sources to poll.** Discord scheduled events for guild `1157469922633466058`,
the Meetup.com groups listed in `src/data/site.json`, AWS Twitch schedules, and
YouTube. Also fetch Discord's `widget.json` for the `discord` member counts —
this is why the site needs no Discord iframe, which would otherwise leak every
visitor's IP address to Discord.

**Timezone.** Always emit an explicit offset. New Zealand observes daylight
saving, so a bare local time is ambiguous twice a year and `Z`-normalised times
lose the information the UI needs to label an event correctly.

**Caching.** Set `Cache-Control` on the object itself — something around
`max-age=300, stale-while-revalidate=3600`. The schedule sets how fresh the data
can be; this header sets how hard CloudFront works to serve it.

**Failure handling.** If an upstream source fails, emit the payload without that
source's events rather than failing the whole run. A partial feed is much better
than a stale or missing one. Never write an empty `events` array on error — that
is indistinguishable from "nothing is on" and would silently empty the homepage.

## Deployment separation

The `/api/*` prefix **must** resolve to a different bucket or prefix from the
site bucket. Site deploys run `s3 sync --delete`, which would otherwise delete
the Lambda-written object on every release.

This is tracked in the infrastructure backlog in
[adr-0002-hosting.md](./adr-0002-hosting.md); none of it is needed to run or
review this site with the committed fixture.
