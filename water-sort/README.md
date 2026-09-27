# 보글보글 실험실

English name: Bubbly Lab. Previously Water Sort; the `/water-sort/` URL, session key and database identifiers remain stable so existing links, saved games and rankings continue to work.

Public game: https://game.archerlab.dev/water-sort/

The React/Vite source is in `source/`. Run `npm ci`, `npm test`, and `npm run build` there. The build writes the static entry, hashed bundles, and assets into this folder without deleting source files. Commit the built files with source changes.

The ranking API runs inside the shared `game-api` Worker at `/water-sort/challenge`, using the shared D1 binding and the isolated `water_sort_runs` table. The Worker owns boards, deadlines, score, version checks, and ranking registration. Client bundles do not include the challenge catalog. The previous Sites Worker is no longer required.

For local play, run the repository's `npx wrangler dev --config wrangler.game-api.toml --port 8787`, then `npm run dev` in `source/` and open http://127.0.0.1:3010/water-sort/ .

Every stage still has 60 seconds, including pour animation. Difficulty grows through 100 stages; the catalogue has three verified layouts per stage plus randomized colors and bottle order. Home and Continue never pause or reset the server deadline.

The start screen always shows New Game above Continue. Continue is enabled only for a server-verified unfinished run with time left, including the fixed next-stage deadline after a clear. Expired unregistered records remain accessible from Ranking → View Record. New Game asks before replacing an unregistered run.
