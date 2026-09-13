# Ranking delivery and recovery

## Confirmed failure paths

- Lumen Shift returned `false` when its event queue was already empty. Submitting immediately after a successful automatic flush therefore failed without sending a ranking request.
- Blockpang and Jewelria removed events before `fetch` completed. A network rejection or malformed response could lose the removed batch. Several clients also permanently disabled ranking after a transient request failure.
- Lumen Shift and the shared client discarded older queued events at 96 entries. Events recorded before the session response were dropped in Lumen Shift.
- The API expired sessions after six hours and deleted them whenever another session was created. Saved games and delayed uploads could lose their verification source.
- Ranking insert, session consumption, rank lookup and leaderboard cleanup were separate operations. A failure after insertion could return an error despite saving; another attempt then failed as already submitted. Additive events lacked a general request receipt.
- The API deleted records outside the top 100 and older runs under the same name. Parking also required a successful leaderboard read before it would save.
- Shadow Survival treated delayed or sparse progress requests as invalid even when the elapsed game time was plausible.

Production D1 schema and indexes were inspected. The available production error log did not contain matching historical failures; these findings are confirmed code paths and regression reproductions, not attribution of a particular past player's request.

## Current delivery contract

1. Each game journals score events as they occur, before an in-flight request can delay later events. The shared transport journals session creation and the final submission with a stable request ID and a predecessor ID. Names and final snapshots are preserved before waiting for score synchronization.
2. Browser records use separate localStorage keys, with IndexedDB as a second durable store. Failure to write one does not discard the other. Pending records survive navigation, reload and visiting a different game on the same origin. Multi-tab queues cannot replace each other wholesale.
3. A Durable Object per run saves commands independently of D1 before acknowledging reception. Dependencies preserve the order of session creation, score events and final submission. Alarms retry D1 failures indefinitely with capped backoff, including after browser closure or object restart.
4. D1 commits score changes and the request receipt in one `batch` transaction. Ranking archival, leaderboard insertion and session consumption are in that same transaction. Lost responses and concurrent retries cannot double-add a score or consume a session without its ranking.
5. `ranking_submissions` keeps every submitted run. `rankings` retains verified records; ranking queries still show the best result per normalized nickname. There is no top-100 deletion or six-hour session expiry. The additive migration archives existing rows that still contain session IDs.
6. `pending` explicitly means a retained record awaiting verification/registration. The UI does not label it as registered. Aborting a screen's wait does not cancel its queued event. Invalid gameplay remains retained as `review` and is not published as a valid score.

The current score validators, profile ownership checks, deterministic board replay, score ceilings and elapsed-time upper bounds still apply. Network cadence itself is no longer used to reject Shadow Survival progress.

## Verification and operations

- `npm run test:ranking`: real SQLite transaction tests with injected database outages, mid-transaction errors, lost commit responses, object restart, out-of-order delivery, duplicate submissions, wrong payloads, browser reload, storage quota failures, two tabs and aborts.
- `npm test`: all nine game targets, shared runtime/API checks and asset checks. Lumen Shift also checks submission after an empty successful flush.
- Local Wrangler runtime plus browser: offline score, queued nickname, reload, reconnect and confirmed ranking; responsive notice at small/large phone, landscape, tablet and desktop widths; dynamic reduced viewport height and keyboard dismissal.
- Run the one-time additive archival migration with `npx wrangler d1 execute archerlab_db --remote --config wrangler.game-api.toml --file migrations/ranking-delivery.sql` before the initial Worker deployment. This was applied to production on 2026-09-13. The Worker also creates missing delivery tables at runtime. The GitHub deployment workflow runs the recovery tests and deploys the Worker; its restricted deployment token does not need D1 import permission or rerun the archival migration on every push.
- Production deployment on 2026-09-13 used authenticated local Wrangler (`npx wrangler deploy --config wrangler.game-api.toml`). The existing GitHub `CLOUDFLARE_API_TOKEN` returned authentication error 10000 for both D1 import and Worker service access; unattended Worker deployments need a valid token with access to this account's Worker. This does not affect the deployed Worker's runtime D1 binding or recovery alarms. Never copy a personal OAuth session into CI as a workaround.
- Worker logs use `ranking_delivery_retry`, `ranking_delivery_database_unavailable`, `ranking_delivery_review` and `ranking_delivery_unavailable`. Request IDs and game IDs identify failures without logging player names or profile secrets.

## Practical limits

A browser-only offline record cannot reach the backend until that browser reconnects or the player revisits this origin. Clearing both browser stores or losing the device before server reception destroys that last copy; the client explicitly reports when neither local persistence nor server acceptance succeeds. A user who deliberately skips submission has not provided a ranking name/intent. Previously deleted sessions/records cannot be reconstructed from a source that no longer exists. Retaining an invalid payload does not justify bypassing score validation or inventing a score.
