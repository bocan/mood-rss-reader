# SPEC-026: IndieWeb identity on the public pages (h-card, rel="me", bookmarks, blogroll discovery)

- **Status:** Done
- **Phase:** 4
- **Depends on:** SPEC-019 (Done), SPEC-020 (Done)
- **Estimated size:** M (about a day)

## Context

Mood Reader already publishes two public, server-rendered pages per user
(`apps/api/src/routes/public.ts`):

- `/u/<slug>`: the shared-items linkblog (SPEC-019), gated by
  `profiles.visibility = 'public'`. It already carries `h-feed` and `h-entry`
  microformats, plus Atom and JSON Feed alternates.
- `/u/<slug>/blogroll`: the blogroll (SPEC-020), gated by
  `profiles.blogrollEnabled`. It already carries
  `<link rel="blogroll" type="text/x-opml">` in its head (`public.ts:172`).

Four small gaps stop these pages from working well with IndieWeb tools:

1. There is no way to say "this is also me". SPEC-020 lists a `rel="me"` link
   field as an open question. Without it, Mastodon cannot verify the page,
   and IndieAuth-style tools cannot connect the page to the person.
2. The pages have no `h-card`, so parsers cannot find the author. Each
   `h-entry` has no author, no permalink of its own, and marks the external
   article link as `u-url` (the entry's own address), which is wrong.
3. A share is semantically a bookmark with a comment. IndieWeb tools expect
   `u-bookmark-of` for the link and `e-content` for the note.
4. The shares page does not advertise the blogroll with `rel="blogroll"`;
   only the blogroll page does.

This spec fixes all four. It is groundwork for later IndieWeb work (sending
Webmentions needs correct `h-entry` markup and a per-entry permalink).

## Goal

A user adds their website, an optional photo, and links to their other
profiles in Settings. Their public pages then carry a correct `h-card`,
`rel="me"` links (so Mastodon shows the page as verified), `h-entry` items
that parse as bookmarks with a note and a permalink, and `rel="blogroll"`
discovery on every public page where the blogroll is on.

## Non-goals

- Sending or receiving Webmentions (a later spec; this one only makes the
  markup ready for it).
- Micropub, IndieAuth sign-in, or a Microsub server.
- Subscribing to `h-feed` pages or to JSON Feeds (a separate reader-side
  spec; see Handoff).
- Uploading or hosting a photo. The photo is an https address of an image
  that the user hosts elsewhere.
- Checking that the `rel="me"` links point back. Mastodon and other sites do
  that on their side.
- XFN relationship values (`rel="friend"` and so on) on blogroll entries.
- `/.well-known/recommendations.opml`. That path is per domain, and this app
  has many users per domain.
- Changes to the Atom or JSON Feed documents (see Open questions).
- Any change to who can see what. The new fields show only on pages that are
  already public.

## Outcome shape

Files to change (all exist today unless marked new):

- `apps/api/src/db/schema.ts`: three new `profiles` columns.
- `apps/api/drizzle/0024_*.sql` (new, generated): the migration.
- `packages/shared/src/schemas/profile.ts`: new fields on
  `updateProfileSchema` and `profileSchema`, plus `MAX_ME_LINKS`.
- `packages/shared/src/schemas/profile.test.ts`: validation tests.
- `apps/api/src/routes/profile.ts`: read and write the new fields.
- `apps/api/src/lib/public-html.ts`: an `ownerCard()` helper, a
  `linkLabel()` helper, and CSS for the card.
- `apps/api/src/lib/public-html.test.ts`: helper tests.
- `apps/api/src/routes/public.ts`: the new markup on both pages.
- `apps/api/src/routes/sharing.int.test.ts` and
  `apps/api/src/routes/blogroll.int.test.ts`: parse-based tests.
- `apps/api/package.json`: `microformats-parser` as a devDependency.
- `apps/web/src/routes/SettingsPage.tsx` (`SharingSection`): three new
  fields and the Mastodon hint.
- `apps/web/src/routes/SharingSection.test.tsx`: UI tests.
- `docs/design-specs/README.md`: a row for 026 and a scope summary line.

## What carries over from previous specs

- **SPEC-019:** the `profiles` table, `GET` and `PUT /api/profile`, the
  `ProfileDto`, the root-scoped public routes, `publicBase(request)`
  (`PUBLIC_URL` first, else the request origin), `loadProfileForSlug()` with
  its disabled-user filter, and the `esc()`, `escMultiline()` and `layout()`
  helpers. Every interpolated value still goes through `esc()`.
- **SPEC-020:** `profiles.blogrollEnabled`, the blogroll page and OPML, and
  the existing `<link rel="blogroll" type="text/x-opml">` on the blogroll
  page. Keep that type value.
- **Settings:** `SharingSection` in `SettingsPage.tsx` has two save paths.
  The visibility and blogroll switches save at once (`saveNow`); the "Save
  page details" form saves the rest. The new fields belong to the form.
- **Tests:** `seedProfile()` in `apps/api/test/helpers.ts`, and the existing
  string assertions in `sharing.int.test.ts:212-228`, which must still pass.

## Data model changes

Add to `profiles` (`apps/api/src/db/schema.ts`):

```ts
// SPEC-026: IndieWeb identity. Shown only on pages that are already public.
websiteUrl: text(),
photoUrl: text(),
// Other profiles of the same person, rendered as rel="me" links. Order kept.
meLinks: text().array().notNull().default(sql`'{}'::text[]`),
```

Then `pnpm db:generate` and commit the generated SQL. Check that the SQL
says `"me_links" text[] DEFAULT '{}'::text[] NOT NULL`. Existing rows get
nulls and an empty array, so no backfill is needed.

## API changes

`packages/shared/src/schemas/profile.ts`:

```ts
/** Most rel="me" links one profile may have (SPEC-026). */
export const MAX_ME_LINKS = 8;

const webUrl = z.httpUrl().max(300);              // http or https, real domain
const httpsImage = z.url({ protocol: /^https$/, hostname: z.regexes.domain }).max(300);

updateProfileSchema gains:
  websiteUrl: webUrl.nullable().optional(),
  photoUrl: httpsImage.nullable().optional(),
  meLinks: z.array(webUrl).max(MAX_ME_LINKS).optional(),

profileSchema gains:
  websiteUrl: z.string().nullable(),
  photoUrl: z.string().nullable(),
  meLinks: z.array(z.string()),
```

Trim each URL before validation (`z.string().trim().pipe(...)` or a
`preprocess`; pick whichever the Zod 4 docs show as current). Remove exact
duplicates from `meLinks` after trimming, and keep the first one.

`apps/api/src/routes/profile.ts`:

- `toDto()` returns the three fields.
- `GET /profile` with no row returns `websiteUrl: null`, `photoUrl: null`,
  `meLinks: []`.
- `PUT /profile` writes each field only when it is present in the body, as
  it does for `title` and `bio` today. `null` clears a URL; `[]` clears the
  links.

Auth is unchanged: both routes need a session. The public routes stay
unauthenticated and read the new columns through `loadProfileForSlug()`.

## Behavioural definitions and contracts

### Field rules

| Field | Accepts | Refuses | Stored as |
| --- | --- | --- | --- |
| `websiteUrl` | http or https URL with a real domain, 300 chars max | `javascript:`, `mailto:`, `data:`, `localhost`, bare IPs, anything else | trimmed text, as typed |
| `photoUrl` | https URL with a real domain, 300 chars max | http, and everything `websiteUrl` refuses | trimmed text, as typed |
| `meLinks` | 0 to 8 URLs, each like `websiteUrl` | a 9th link, any bad link (the whole PUT is a 400) | trimmed, duplicates removed, order kept |

URLs are stored as typed (after trimming), not normalized. Mastodon matches
the `rel="me"` address against the exact profile URL, so the user's own
spelling must survive.

### The owner card

`ownerCard(profile, pageUrl, { author })` in `public-html.ts` returns this
markup. Every value is escaped. Optional parts are left out entirely, not
rendered empty.

```html
<div class="h-card p-author">            <!-- "p-author" only when author is true -->
  <img class="u-photo" src="PHOTO" alt="" width="48" height="48"
       loading="lazy" referrerpolicy="no-referrer">          <!-- if photoUrl -->
  <a class="p-name u-url u-uid" href="PAGE_URL">DISPLAY_NAME</a>
  <a class="u-url" rel="me noopener" href="WEBSITE">LABEL</a>  <!-- if websiteUrl -->
  <p class="p-note">BIO</p>                                    <!-- if bio, via escMultiline -->
  <ul class="me-links">                                        <!-- if meLinks is not empty -->
    <li><a rel="me noopener" href="LINK">LABEL</a></li>
  </ul>
</div>
```

- `PAGE_URL` is the absolute URL of the page the card is on
  (`${publicBase(request)}/u/<slug>` or `.../blogroll`). A matching `u-uid`
  and `u-url` makes this the page's representative h-card, also on the
  blogroll page, where every feed is an h-card too.
- `DISPLAY_NAME` is `users.displayName`, not the page title: the card is a
  person, the title is the page.
- `LABEL` is `linkLabel(url)`: the host plus the path, with no scheme and no
  trailing slash (`https://mastodon.social/@chris/` gives
  `mastodon.social/@chris`). If the URL does not parse, the label is the URL.
- The `rel` value must contain the token `me`. Do not replace it with
  `noopener noreferrer`.
- The bio moves into the card as `p-note`. The header no longer renders it
  separately, so it shows once.

### The shares page (`/u/<slug>`)

- The `<header>` inside `.h-feed` keeps the `h1.p-name` and the "Links
  shared by" line, and gains `ownerCard(..., { author: true })`. Entries
  have no author of their own, so parsers take the feed's author.
- Each entry:

```html
<article class="h-entry" id="s-ARTICLE_ID">
  <div class="note e-content">NOTE</div>                          <!-- if note -->
  <h2 class="p-name"><a class="u-bookmark-of" href="LINK"
      rel="noopener noreferrer">TITLE</a></h2>                    <!-- if link -->
  <h2 class="p-name">TITLE</h2>                                   <!-- if no link -->
  <p class="meta">FEED · <a class="u-url u-uid" href="PAGE_URL#s-ARTICLE_ID"><time
      class="dt-published" datetime="ISO">DATE</time></a></p>
</article>
```

  `LINK` stays `item.url ?? item.feedSiteUrl`, as today. The note becomes a
  `div` with `e-content`, because `escMultiline` produces `<br>`.
- The `<head>` gains `<link rel="blogroll" type="text/x-opml" title="..."
  href="PAGE_URL/blogroll.opml">` when `blogrollEnabled` is true, beside
  the existing Atom and JSON Feed alternates.

### The blogroll page (`/u/<slug>/blogroll`)

- The `<header>` gains `ownerCard(..., { author: false })`, and loses its
  separate bio paragraph.
- Each feed `<li>` becomes `<li class="h-card">`. The favicon `img` gets
  `class="u-logo"`, and the site link gets `class="p-name u-url"`. The
  "feed" link stays as it is.
- The existing `rel="blogroll"` head link is unchanged.

### Visibility

Nothing new becomes public by itself. The card shows only on a page that
already serves (shares page: `visibility = 'public'`; blogroll page:
`blogrollEnabled`). With both off, the new fields show nowhere. The
`instance` visibility (Community view) does not show them either.

### Settings

`SharingSection` gains three inputs inside the "Save page details" form,
after Bio:

- **Your website:** `type="url"`, placeholder `https://example.com`.
- **Photo:** `type="url"`, placeholder `https://example.com/me.jpg`, hint
  "An https address of a square image. It is shown on your public pages."
- **Other profiles:** a textarea, one URL per line, hint "Mastodon, GitHub,
  or any profile that is you. Up to 8." On submit, split on newlines, trim,
  drop empty lines, and send `meLinks`. An empty box sends `[]`; an empty
  URL field sends `null`.

Before sending, validate `meLinks` with the shared schema. If a line is bad,
show "Line N is not a web address." and do not send. Server 400s show
through the existing `errorMessage()` path.

Under the three fields, a hint about Mastodon verification:

- With a public page (`shareUrl`, else `blogrollUrl`): "To show this page as
  verified on Mastodon, add its address, PAGE_URL, to your Mastodon profile,
  and add your Mastodon profile to Other profiles." Show `PAGE_URL` as a
  link.
- With no public page: "These links show only on a public page. Turn on
  public shares or the public blogroll first."

## Implementation plan

One commit per step, Conventional Commits, `make check` after each.

1. **`feat(api)`: profile fields.** Schema columns, `pnpm db:generate`,
   the shared Zod changes with `MAX_ME_LINKS`, and the profile route. Tests:
   the schema unit tests and the profile integration tests.
2. **`feat(api)`: h-card and bookmark markup.** Add `microformats-parser`
   as an exact-pinned devDependency of `apps/api` (`pnpm --filter @rss/api
   add -D -E microformats-parser`). Add `linkLabel()` and `ownerCard()` with
   their CSS, then the new markup on both pages. Tests: helper unit tests
   and the parse-based integration tests.
3. **`feat(settings)`: identity fields in Sharing.** The three inputs, the
   line validation and the Mastodon hint. Tests: `SharingSection.test.tsx`.
4. **`docs`: SPEC-026 done.** Set the status in this file and in the
   README table, add the scope summary line, and add an "As built" section
   for any differences.

## Context7 lookups

- **Zod 4 (`/websites/zod_dev`):** `z.httpUrl()`, `z.url({ protocol,
  hostname })` and `z.regexes.domain`. Already checked while writing this
  spec: `z.url()` alone accepts `mailto:` and other schemes, so it is not
  enough. Also look up the current way to trim before a string format check.
- **Drizzle ORM (pg-core):** a `text().array()` column with a `notNull()`
  empty-array default, and how drizzle-kit writes it in the migration.
- **microformats-parser:** not in Context7. Use the npm README:
  `import { mf2 } from 'microformats-parser'`, then
  `mf2(html, { baseUrl })` returns `{ items, rels, 'rel-urls' }`.

## Dependencies

- Specs: SPEC-019 and SPEC-020 (both Done).
- New package: `microformats-parser` 2.x (MIT, one dependency, `parse5`), as
  a devDependency of `apps/api` only. It is for tests; the server builds the
  markup itself. Pin the exact version, as the rest of the repo does.
- No new runtime dependency.

## Test plan

**Shared unit tests (`profile.test.ts`):**

- `websiteUrl` and `meLinks` take http and https URLs; they refuse
  `javascript:alert(1)`, `mailto:a@b.co`, `data:text/html,x`,
  `https://localhost`, `https://127.0.0.1` and `not a url`.
- `photoUrl` refuses `http://` and takes `https://`.
- 8 links pass, 9 fail; 301 characters fail.
- Trimming and duplicate removal keep the order.
- `null` and `[]` are accepted (they clear).

**API integration tests:**

- `GET /profile` before any row gives `null`, `null`, `[]`.
- `PUT` then `GET` round-trips all three fields; a later `PUT` with only
  `title` leaves them alone; `null` and `[]` clear them.
- A bad URL or 9 links give a 400, and nothing is written.
- Shares page, parsed with `mf2(res.body, { baseUrl })`:
  - the first item is an `h-feed` whose `author` is an `h-card` with `name`,
    `url` (the page URL and the website), `uid` (the page URL), `photo` and
    `note`;
  - `rels.me` equals the website followed by the `meLinks`, in order;
  - `rels.blogroll` is present only when `blogrollEnabled` is true;
  - each `h-entry` has `bookmark-of` equal to the article URL, `url` equal to
    `PAGE_URL#s-<id>`, `published`, and `content` when there is a note;
  - an item with no URL and no site URL has no `bookmark-of`.
- Blogroll page: the owner card is present also when shares are off; each
  feed is an `h-card` with `name` and `url`; `rels.me` is as above.
- Escaping: a stored URL that contains `"` or `<` appears escaped in both
  pages and never breaks out of its attribute.
- A profile with none of the new fields renders both pages with no card
  parts missing or empty (no empty `href`, no empty `ul`), and the existing
  SPEC-019 and SPEC-020 tests still pass.
- Nothing new appears on any page that 404s today.

**Web tests (`SharingSection.test.tsx`):**

- Save sends `websiteUrl`, `photoUrl` and `meLinks` from the form; empty
  inputs send `null` and `[]`.
- A bad line shows "Line N is not a web address." and sends nothing.
- The hint shows the share URL, else the blogroll URL, else the "Turn on a
  public page first" text.

**Manual:**

- Paste a public page into a microformats validator (for example the
  microformats.io parser, or indiewebify.me) and check the h-card and
  h-entry results.
- On an instance with a public HTTPS `PUBLIC_URL`, put the page URL in a
  Mastodon profile field, add the Mastodon profile to Other profiles, and
  check that Mastodon shows the green check.

## Acceptance criteria

- [x] Settings has Your website, Photo and Other profiles fields that save
      with "Save page details", and a Mastodon hint that names the right
      page URL.
- [x] The API refuses any URL that is not http or https with a real domain,
      a photo that is not https, and more than 8 profile links.
- [x] Both public pages have one representative `h-card` for the owner, with
      name, page URL, and (when set) photo, website, bio and `rel="me"` links.
- [x] Every `rel="me"` link on a page is the website or one of the
      `meLinks`, in the saved order, and nothing else.
- [x] Each shared item parses as an `h-entry` with `bookmark-of`, a
      permalink `url` (`#s-<id>`), `published`, and `content` when it has a
      note; the feed's author is the owner card.
- [x] The shares page has `rel="blogroll"` when the blogroll is on, and not
      when it is off.
- [x] Blogroll entries are `h-card`s with name and URL.
- [x] No new data shows on a page that is not already public, and no page
      that 404s today starts to serve.
- [x] All values are escaped; the escaping tests pass.
- [x] `make check` passes, and the existing SPEC-019 and SPEC-020 tests pass
      unchanged or with only the class changes this spec requires.

## Gotchas

- **`z.url()` is not safe here.** It accepts `javascript:` and `mailto:`.
  Use `z.httpUrl()` (http or https, real domain) and the https-only variant
  for the photo.
- **`z.httpUrl()` refuses `localhost` and IP addresses.** Tests must use
  real-looking domains (`example.com`, `mastodon.example`).
- **Store what the user typed.** Mastodon matches the exact profile URL. Do
  not normalize, lower-case, or add or remove a trailing slash.
- **Keep the `me` token in `rel`.** `rel="me noopener"` is right.
  `rel="noopener noreferrer"` loses the verification.
- **Mastodon must reach the page.** Verification works only when the page
  is public, served over HTTPS from the internet, and `PUBLIC_URL` is set.
  A home instance on `*.local` behind Caddy's internal certificate cannot be
  verified. Mastodon checks again when the user saves their Mastodon
  profile, not by itself.
- **The page is cached for 5 minutes** (`cache-control: public,
  max-age=300`). A browser can show the old page just after a save.
- **Representative h-card.** `u-uid` and `u-url` must equal the URL of the
  page the card is on. Build it with `publicBase(request)`, and in tests read
  the base from the same request, not from a hard-coded host.
- **Show the bio once.** It moves into the card as `p-note`; remove the old
  header paragraph on both pages.
- **The photo is loaded from another site.** Keep
  `referrerpolicy="no-referrer"` and `loading="lazy"`, and allow only https,
  so the page has no mixed content. CSP is off today (`app.ts`), so no
  header change is needed; if CSP is turned on later, `img-src` must allow
  https images (favicons need this already).
- **Array column default.** Drizzle needs `sql\`'{}'::text[]\`` for an empty
  array default; check the generated SQL before committing it.
- **Existing test strings.** `sharing.int.test.ts` checks for
  `class="h-entry"` and `class="h-feed"`; keep those exact class strings as
  the first class on each element, or update the assertions in the same
  commit.

## As built

Built as specified, in the four planned commits. The differences:

- **The shared schemas are exported.** `webUrlSchema`,
  `httpsImageUrlSchema` and `meLinksSchema` live in
  `packages/shared/src/schemas/profile.ts`, and the web form uses them too.
  Trimming is `z.string().trim().pipe(...)`; duplicate removal is a
  `transform` on the array.
- **The form checks all three fields, not only the links.**
  `identityInput()` in `apps/web/src/lib/profile.ts` gives "Your website is
  not a web address." and "The photo must be an https web address." as
  well as the line message, and "Up to 8 other profiles." for too many
  links. Tests are in `apps/web/src/lib/profile.test.ts`.
- **The field hints sit outside their labels.** They are linked with
  `aria-describedby`, so a screen reader does not read them as part of the
  field name. A test checks the names and the descriptions.
- **One `blogrollTitle()` helper** in `public.ts` replaces the two copies of
  the blogroll title, because the shares page now needs it too for its
  `rel="blogroll"` link.
- **The owner card also has the class `owner`**, for its CSS (`h-card`
  stays the first class).
- **The permalink date is a link.** On the shares page, the date of each
  share is now the `#s-<id>` permalink, so it shows as a link.
- **Checked on screen:** Settings > Sharing at 375 px and 1280 px, and the
  public page in light and dark mode at the same widths. The Settings page
  still scrolls 14 px sideways at 375 px; the cause is the Preferences
  toggle group, which was already the case before this spec.

The open questions below are still open.

## Handoff

Run it with:

> Implement docs/design-specs/026-indieweb-identity.md.

Follow the four commits in the Implementation plan, run `make check` after
each, and mark the spec Done in this file and in `README.md` at the end.

Candidates for later specs, which this one prepares:

- **SPEC-027, follow more of the web:** subscribe to JSON Feeds (the parser,
  `rss-parser`, reads only XML today, so the app cannot even follow its own
  `feed.json`) and to `h-feed` pages with no RSS.
- **Webmention sending:** when a user shares on a public page, tell the
  article's site. It needs the `u-bookmark-of` markup and the `#s-<id>`
  permalinks from this spec.
- **Micropub with IndieAuth:** "Post to my site" from the reader.

## Open questions

1. **JSON Feed linkblog fields.** JSON Feed 1.1 says an item's `url` is its
   permalink and `external_url` is the linked page. The share feed puts the
   linked article in `url`. Switch to `external_url` plus a `#s-<id>`
   permalink? Some readers open `url`, so this changes what a click opens.
2. **`source:blogroll` in the share feed.** The `source` namespace
   (source.scripting.com) lets an RSS feed point to its blogroll. The share
   feed is Atom, so this needs a decision first.
3. **An `h-card` in the Community view.** Not needed for IndieWeb tools
   (the Community view is not public), but the photo could show there too.
