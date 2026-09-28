# 보글보글 실험실

English name: Bubbly Lab. Previously Water Sort; the `/water-sort/` URL, session key and database identifiers remain stable so existing links, saved games and rankings continue to work.

Public game: https://game.archerlab.dev/water-sort/

The React/Vite source is in `source/`. Run `npm ci`, `npm test`, and `npm run build` there. The build writes the static entry, hashed bundles, and assets into this folder without deleting source files. Commit the built files with source changes.

The ranking API runs inside the shared `game-api` Worker at `/water-sort/challenge`, using the shared D1 binding and the isolated `water_sort_runs` table. The Worker owns boards, deadlines, score, version checks, and ranking registration. Client bundles do not include the challenge catalog. The previous Sites Worker is no longer required.

For local play, run the repository's `npx wrangler dev --config wrangler.game-api.toml --port 8787`, then `npm run dev` in `source/` and open http://127.0.0.1:3010/water-sort/ .

Every stage has 60 seconds, including pour animation and time spent in another tab or app during play. Difficulty grows through 100 stages; the catalogue has three verified layouts per stage plus randomized colors and bottle order. Confirming Home suspends the run on the server. Continue atomically restores the current stage's initial board and grants a fresh 60 seconds. Earlier points and the accumulated pour count remain; a cleared stage cannot award points again. Reload synchronizes and suspends a still-valid run before enabling Continue. An already expired run cannot be revived.

The start screen always shows New Game above Continue. Continue is enabled only for a server-verified unfinished run, including suspended runs. Ranking opens the leaderboard directly, without a separate record button. Players register their score from the game-over results screen. New Game asks before replacing an unregistered run.

The private server checkpoint is excluded from API responses. Legacy runs without a checkpoint receive one verified same-level starting board on their first restart; subsequent restarts reuse it. Leave and resume use version-checked atomic writes, reject client-provided boards/timers/scores, and reject stale requests. Ordinary sync never refreshes a timer or board.

Pouring locks only its source and destination bottles. Disjoint pairs animate immediately on one shared canvas; versioned API writes are serialized while visual feedback remains immediate. Up to five waiting pours can be reserved with click, keyboard or drag. Reservations start in input order and validate against the board after earlier planned moves. Bottle badges show their waiting positions. Repeating the last reserved pair removes only that last reservation; Escape cancels all waiting reservations. There is no erase button. Home, dialogs, backgrounding, resize, timeout, a confirmed clear and network failure cancel pending reservations. The server requires every active pour to finish before counting a clear or its time bonus.

Full monochrome bottles show a checkmarked completion seal and a glow matching their liquid. A short ripple and particle burst appear only after server confirmation and visual settling. Existing full bottles receive the steady seal without replaying a burst, and reduced motion keeps static feedback.

Confirmed dead ends immediately open the game-over results with an explanation. No-legal-move checks run in the pour response; deeper bounded search uses a warmed browser Web Worker without blocking gestures or animations. Only a local blocked result requests server verification; normal play needs no extra inspection request. Inconclusive searches never end a run. See [dead-end behavior and validation](../docs/bubbly-lab-dead-end.md).
