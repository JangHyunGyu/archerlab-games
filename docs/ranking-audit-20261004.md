# All-game reward, save and ranking audit — 2026-10-04

Scope: all 10 entries in `config/games.json`, including the nine games other than
School Zombie Defense. This is a source audit with boundary, failure-injection
and browser reproductions. It does not attribute a historical player's failure
without their session/request record.

Only School Zombie Defense has the server-backed cumulative spending wallet.
The other games store scores, best results or puzzle progress, rather than money
that should be credited to that wallet.

| Game | Save/registration path inspected | Result |
| --- | --- | --- |
| School Zombie Defense | Profile authentication, additive net reward claims, wallet revisions, reroll deductions, stage ledger, independent ranking | Existing speed-independent reward/stage verifier and atomic, idempotent wallet credit pass regression tests; unchanged in this audit. |
| Shadow Survival / Solo Leveling | Character-specific sessions, cumulative survival snapshots, scene restart/shutdown, local continuation policy | Fixed rejection above level 30, 7,200 seconds or 100,000 kills, and stale scene responses. Continued local saves remain unranked under the existing policy. |
| Lumen Shift | Clear/zone formulas, asynchronous session/queue, submission | Fixed level 80, combo 300, zone line 120 and 3,000,000 score ceilings absent from gameplay. Old requests cannot change a restarted run's queue/session. Combos must fit the session event sequence. |
| Cat Tower | Merge formulas/sequence, final merge, save snapshot/pending events, submission | Fixed the 500,000 score and 30-combo ceilings, stale request writes and missing session IDs in saves made before the session response. Legacy offline saves can recover their journal session by event IDs. |
| Blockpang | Seeded pieces, authoritative board replay, move sequence, board/seed save snapshot | Fixed the 500,000 score ceiling, stale request writes and missing session IDs in offline saves. Legacy saves recover only a uniquely matching seed-bound start request. |
| Jewelria | Match formulas/sequence, eight-stage progression, timer pause, best score and local rank archive | Fixed the 600,000 score and 100-combo ceilings and stale request writes. There is no cumulative currency wallet. |
| Jelly Pang 2048 | Seeded tile spawns, authoritative merge replay, move sequence, final verified score | Fixed the 5,000,000 score and rank-20 merge ceilings, stale responses and overlapping uploads. Numeric tile ranks remain bounded by exact integer arithmetic. |
| Parking Escape | Catalog's finite level limit, clear events, progression save, registration | Catalog limit fits the server range. Fixed stale session/failure callbacks across restarts; clear-event errors cannot disable a new run. |
| Bubbly Lab / Water Sort | Separate versioned D1 challenge API, authoritative pours, server deadlines, replay/result proof, CAS registration, credential restore | Existing tests pass for concurrent registration, repeat submissions, reload/away deadlines, zero-clear results and forged-score rejection. Cache invalidation failures are already caught. It has its own retry UI rather than the shared registration outbox. |
| Slime Volley | Local and authoritative online room/set scores | No ranking POST or cumulative wallet exists. Match scores and reset/set-win rules were reviewed; game validation passes. |

## Changes and safeguards

The score ceilings for the five scoring puzzle games now bound exact integer
arithmetic, instead of inventing a gameplay ending. Shadow level and kill counts
also require safe integers. This does not accept arbitrary scores: the server
continues validating formulas, event/move sequences, seeded board replay,
session ownership, final verified-score equality and atomic submission receipts.
The puzzle earning-rate checks still defer implausibly fast uploads with a
retryable response. Shadow's score itself is survival seconds, so its elapsed
session plausibility check remains retryable; no game-speed selector is present
in that game. School Zombie's accelerated clock is not used to reject rewards.

Each client now identifies its active run when handling an asynchronous result.
Old responses cannot replace the current session, clear its pending event queue,
reset its upload promise, alter its verified score or mark the new run failed.
Jelly Pang shares one upload promise across concurrent flush calls.

The durable server queue rechecks retained requests rejected by the former
limits, once per job, through the ordinary verifier and receipt transaction.
Dependent submissions can then complete. Invalid payloads stay under review;
rechecking them cannot publish a score or repeatedly execute them on each alarm.
A browser need not remain open once the server has retained the commands.

Browser cache keys and changed module/script URLs were refreshed, including the
English entry pages. Backend and verification protocol versions are unchanged.

## Validation

- `npm test`: all 10 game targets, shared checks, API checks and the 2,979-file
  asset manifest passed.
- `npm run test:ranking`: 91 tests passed. New coverage includes former ceilings,
  integer overflow, forged elapsed time, stale success/failure responses,
  overlapping uploads, offline-save session restoration, alarm revalidation and
  a lost committed response followed by D1 outage for all seven other shared
  ranking game types.
- `node scripts/verify-ranking-audit.cjs`: Chrome loaded all seven other shared
  ranking games with no page errors. Each retained an offline submission intent
  across reload, then saved its complete score exactly once after reconnecting.
  Every API call in this harness goes to local SQLite; no production QA scores
  are created. The browser checks the native-storage/shared-delivery integration;
  the client race tests separately execute the game's actual ranking methods.
- Boundary fixtures model an already verified long-run prefix; they do not claim
  to have manually played a multi-hour run or generated rank-21 tiles in a short
  browser session.

Records that never reached the server require the browser's retained copy to
reconnect. Missing/deleted local or server history cannot be reconstructed by
inventing a score. Water Sort deliberately keeps its server deadline while away
and cleans up unregistered runs after its existing grace period.
