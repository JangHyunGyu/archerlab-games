# Jewelria and Shadow Survival English entries — 2026-10-12

## Behavior

- `/jewelria/index-en` and `/solo-leveling/index-en` now serve complete playable
  English documents with HTTP 200. Their `.html` forms use Pages' normal clean-URL
  normalization. The former redirect stubs and bot-specific redirect logic are gone.
- Each Korean/English pair has self-canonicals, reciprocal ko/en/x-default
  annotations, language-matched metadata and game structured data. Both English
  URLs are in the page and image sitemaps; the page sitemap now has 41 entries.
- Existing `?lang=en` links redirect to the English document while retaining
  other query parameters. Only the two game roots invoke Pages Functions; the
  rest of the site, game assets and English documents remain static.
- Shadow's former permanent redirect ran in the opposite direction. Its legacy
  query redirect adds `_lang_entry=20261012` to avoid a loop in browsers that still
  cache that old response. The canonical always points to the clean `/index-en`.
- Korean and existing Japanese query links remain usable. Shadow's language
  chooser updates the address with history.replaceState, without a reload or
  interruption to the game. Explicit page/query language precedes saved language.
- An early Shadow preference assignment also keeps older cached runtime modules
  in the correct language. Only the language preference key is touched; saved
  progress and scores are not migrated or cleared.
- Service worker releases invalidate obsolete English stubs. Query-language
  redirects cache under the English document key, so visiting an English alias
  cannot overwrite the Korean offline page. Other games' caches are preserved.
- Preview root responses retain noindex even when passing through Functions.

## UI preservation and English copy

Both games reuse their original code, controls, art, sounds, CSS and layout.
Jewelria previously translated its title but left several HUD, pause, result,
ranking and status labels in Korean. Those labels are English in the English
entry and English runtime. All Korean strings remain unchanged. Existing Japanese
fallback behavior is retained; this is not a Japanese SEO release.

The full English HTML is derived from the existing Korean shells by
`scripts/english-game-entries.cjs`, invoked by `npm run seo:sync`. This avoids a
second independently maintained game shell. No new hidden SEO text or visible
language controls are added. Current query links, saved scores and mechanics are
preserved.

## Validation

- Page/metadata generation is idempotent; 41 canonical sitemap URLs and return
  language annotations pass the shared search tests.
- Regression coverage includes real entry shells, query redirects, retained
  parameters, preview noindex, exact Function route scope, stale language storage,
  language changes without reload, blocked storage and offline KO/EN separation.
- The 10-game test matrix passed. Shared, API and real Chromium offline tests
  passed after updating the intentional worker-version and Pixi-entry-count
  expectations. Asset-manifest verification covered 3,333 unchanged media files.
- `wrangler pages functions build` compiled the two routes successfully.
- Baseline/current title comparisons covered both games in KO at desktop/mobile,
  plus EN at 1440×900, 1024×768, 768×1024, 390×844 and 844×390 (14 pairs).
  Titles, controls and layout were retained with no browser exceptions or
  horizontal overflow. Shadow comparisons were pixel-identical. Three Jewelria
  comparisons had sparse raster/gradient-edge differences (up to 184 pixels,
  maximum channel delta 14); before/after image inspection confirmed no visible
  design change. English HUD/status translation is the intended content change.
- Browser gameplay checks covered Jewelria play/pause/resume/time-up/result and
  retained best score; Shadow English startup with a saved Korean preference,
  in-place language switching, and GameScene startup. A simulated cached old
  permanent redirect reached the new English game without looping.
- Artifacts: `D:/workspace/.seo-cache/games-en-20261012`.

The Pages production deployment is verified after pushing main: direct English
200 responses, legacy redirects, self-canonicals, hreflang, sitemap entries,
preview headers and rendered English startup. Ranking changes require later
Google recrawling and are not claimed by this implementation.
