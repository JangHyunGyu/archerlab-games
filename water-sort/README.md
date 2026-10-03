# 보글보글 실험실

English name: Bubbly Lab. Previously Water Sort; the `/water-sort/` URL, session key and database identifiers remain stable so existing links, saved games and rankings continue to work.

Public game: https://game.archerlab.dev/water-sort/

The React/Vite source lives outside the deployed folder, in `../water-sort-src/`. Run `npm ci`, `npm test`, and `npm run build` there. The build writes the static entry, hashed bundles, and assets into this folder (`water-sort/`). Only the built files are meant to be published from here; commit them with source changes. The game-api Worker imports `water-sort-src/worker` and `water-sort-src/lib` directly.

The ranking API runs inside the shared `game-api` Worker at `/water-sort/challenge`, using the shared D1 binding and the isolated `water_sort_runs` table. The Worker owns boards, deadlines, score, version checks, and ranking registration. Client bundles do not include the challenge catalog. The previous Sites Worker is no longer required.

For local play, run the repository's `npx wrangler dev --config wrangler.game-api.toml --port 8787`, then `npm run dev` in `water-sort-src/` and open http://127.0.0.1:3010/water-sort/ .

Every stage has 60 seconds, including pour animation and time spent in another tab or app during play. Difficulty grows through 100 stages; the catalogue has three verified layouts per stage plus randomized colors and bottle order. Confirming Home marks the run as left on the server, but the stage deadline is a server wall-clock time that never pauses: time away from the game counts toward the limit, so leaving, switching tabs or reloading cannot stretch a stage. Continue reopens input on the same board with only the time that is left, and a run whose time ran out while the player was away ends as a timeout (Continue then shows the results so the score can still be registered). A cleared stage still hands off to the next one at its fixed time, and cannot award points again. Reload synchronizes and marks a still-valid run as left before enabling Continue. An already expired run cannot be revived.

The start screen always shows New Game above Continue. Continue is enabled only for a server-verified unfinished run, including runs the player has left. Ranking opens the leaderboard directly, without a separate record button. Players register their score from the game-over results screen. New Game asks before replacing an unregistered run.

Server-only fields (the optional starting checkpoint and the pour-timing record) are excluded from API responses. Leave and resume use version-checked atomic writes, reject client-provided boards/timers/scores, and reject stale requests. Neither resume nor ordinary sync ever refreshes a timer or board.

Pouring locks only its source and destination bottles. Disjoint pairs animate immediately on one shared canvas; versioned API writes are serialized while visual feedback remains immediate. Up to five waiting pours can be reserved with click, keyboard or drag. Reservations start in input order and validate against the board after earlier planned moves. Bottle badges show their waiting positions. Repeating the last reserved pair removes only that last reservation; Escape cancels all waiting reservations. There is no erase button. Home, dialogs, backgrounding, resize, timeout, a confirmed clear and network failure cancel pending reservations. The server requires every active pour to finish before counting a clear or its time bonus.

Full monochrome bottles show a checkmarked completion seal and a glow matching their liquid. A short ripple and particle burst appear only after server confirmation and visual settling. Existing full bottles receive the steady seal without replaying a burst, and reduced motion keeps static feedback.

Confirmed dead ends immediately open the game-over results with an explanation. No-legal-move checks run in the pour response; deeper bounded search uses a warmed browser Web Worker without blocking gestures or animations. Only a local blocked result requests server verification; normal play needs no extra inspection request. Inconclusive searches never end a run. See [dead-end behavior and validation](../docs/bubbly-lab-dead-end.md).


## Score-manipulation protections

All of these run in the `game-api` Worker (`water-sort-src/worker/`, `water-sort-src/lib/`); none trusts a client clock.

1. **Time away counts.** `expire()` ignores the "left" flag, so the server wall clock decides every deadline. Resume keeps the board and the original deadline.
2. **Start rate limit.** `rate-limit.ts` counts runs per salted-hash client key (IPv6 by /64) stored in `water_sort_runs.ip_hash`: 20 starts per 10 minutes and 150 per 24 hours, then `429 rate_limited` with `Retry-After`. The raw address is never stored. Optional secret `WATER_SORT_IP_SALT` salts the hash.
3. **No DDL on requests; cached leaderboard.** The Worker never runs `CREATE`/`ALTER`. Apply `migrations/water-sort-0001-schema.sql` (idempotent) and `migrations/water-sort-0002-start-rate-limit.sql` (once, adds `ip_hash`) with `wrangler d1 execute` before deploying a Worker that needs them. The board read is cached for 15 seconds (isolate memory plus the Cache API where the host supports it; the Cache API is a no-op on `*.workers.dev`) and is dropped when anyone registers.
4. **Bot defense.** *Turnstile* is off until both `TURNSTILE_SITE_KEY` (public var) and `TURNSTILE_SECRET_KEY` (secret) exist on the Worker. When on, `start` and `register` need a token (`turnstile` field, action-bound); the page learns the site key from `GET /water-sort/challenge?config=1`, so enabling it needs no front-end rebuild. A missing or rejected token returns `403 bot`; if Cloudflare's verification service is unreachable the request is allowed and logged (fail open). *Pour timing* (`lib/pour-timing.ts`): the server records the gaps between accepted pours; registering is refused with `403 bot` after 12 consecutive gaps under 100 ms, or when the last 24 gaps vary by less than 2 percent.
5. **Nickname filter.** `lib/nickname.ts` validates on `register` (`400 nickname_banned`): Korean and English profanity, sexual terms and slurs, with spacing and symbol stripping, full-width and look-alike letters, leetspeak, doubled letters and Hangul typed as jamo. Everyday words that contain a fragment (Class, 조지, 십자가 ...) are allowed. The leaderboard also hides stored names that fail the filter.
6. **Stale-run cleanup.** A daily cron (`30 19 * * *` UTC, 04:30 KST) deletes up to 500 runs with `nickname IS NULL` created more than 3 days ago (`worker/cleanup.ts`). Registered rows and other tables are untouched.
