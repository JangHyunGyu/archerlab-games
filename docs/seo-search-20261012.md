# Search metadata maintenance — 2026-10-12

The supplied three-month Search Console query table shows 39 disclosed
impressions and one click, mostly for English game names. This is a baseline,
not enough data to attribute rankings to a single technical issue. The work
improves search descriptions and language signals without changing game UI.

## Changes

- The portal and Korean/English Slime Volley, Blockpang, Cat Tower and Lumen
  Shift pages have descriptive, language-matched titles and descriptions.
  English names in Korean titles identify the games; descriptions no longer
  append a second English promotional sentence.
- Slime Volley's runtime title translations match the static HTML titles, so
  rendering no longer replaces the search title with an older value.
- Open Graph, Twitter and game structured-data descriptions match each page.
  Existing games are co-typed VideoGame/WebApplication with GameApplication as
  the application category. No ratings, reviews or new FAQ markup are invented.
- Block Pang and Slime Volleyball are included as alternate names of the
  existing games. Query misspellings such as “cat towr” are not inserted.
- Social-image dimensions reflect the original PNGs: Slime Volley 2048×2048,
  Lumen Shift 1280×1280, Blockpang and Cat Tower 512×512. The originals and all
  visible images are unchanged. Blockpang's metadata uses its existing local
  image URL instead of the equivalent parent-domain URL.
- The portal's WebPage is a CollectionPage connected to its existing game list.
- The 39 canonical sitemap entries retain their destinations. Their language
  annotations now match the HTML and are checked for return links. Only the
  nine changed pages receive the release modification date.
- English game URLs receive image-sitemap entries using the existing images.
- Development references and preview deployments get noindex response headers.

## Deliberately preserved

No body copy, headings, controls, game mechanics, visible links, styling,
animation, fonts, artwork or layout changes. Every modified HTML body's bytes
are unchanged after newline normalization. The only runtime JS edits are the
two `document.title` translation values.

Existing legacy SEO redirects still lead to their established destinations.
Changing those redirects from Korean to English would alter the user-visible
navigation and was not part of this release. Jewelria's noindex English redirect
stub and Shadow Survival's query-language routes are likewise left intact.
There is no new English portal, hidden SEO content, doorway page or speculative
canonical consolidation.

## Maintenance and validation

`config/search-pages.json` owns the changed search copy. Run `npm run seo:sync`
after changing that configuration or regenerating guide/sitemap files, then
`npm run seo:check`. The SEO assertions are also loaded by the existing shared
portal tests. No dependency or lockfile change is required.

Release checks include the 10-game npm test matrix, shared/API tests, unchanged
asset-manifest verification and the five search-metadata regression tests.
The Cloudflare Pages project publishes this static repository without a build
command; there is no application build output to regenerate for this change.

Visual evidence is recorded under `D:/workspace/.seo-cache/games-20261012`.
The nine changed pages are checked at 1440×900 and 390×844. Each baseline page
loads with its prior HTML and title translations, then its clock/animations are
paused and the final nonvisual head metadata is applied. Before/after captures
must match. Source comparisons separately confirm identical game bodies, CSS,
assets and runtime JS except the two title values.

Production verification checks the deployed commit, all 39 sitemap URL
responses and canonicals, runtime Slime Volley titles, nine changed pages,
image coverage and source/preview noindex headers. This release does not claim
an immediate ranking increase; compare subsequent nonbrand impressions, clicks
and positions with the supplied baseline after Google recrawls the pages.

References: [Google title guidance](https://developers.google.com/search/docs/appearance/title-link),
[localized-page annotations](https://developers.google.com/search/docs/specialty/international/localized-versions).
