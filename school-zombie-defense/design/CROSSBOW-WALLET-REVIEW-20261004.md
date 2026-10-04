# Crossbow appearance and wallet review — 2026-10-04

The earlier crossbow review covered motion continuity but missed appearance drift. The nine ready directions and three attack atlases visibly varied between pale pink and yellow skin, pink and orange hair, and green and dark blue skirts.

`harmonizeCrossbowPalette` now corrects those materials once when constructing runtime textures. It preserves source alpha, body geometry, mirrored poses, attack timing and measured projectile origins. Two built-in imagegen edit candidates were reviewed and rejected because they changed weapon detail and produced noisy transparent edges. The original pose atlases remain the geometry source. Prompts and before/after boards are in the workspace QA directory `../output/zombie-crossbow-20261004`.

The real-browser atlas comparison checks all 36 ready/attack cells. Every alpha pixel matches the ungraded runtime source. Median leg-skin channels vary by at most seven RGB levels across all cells. The palette pass creates no per-frame work or additional retained textures.

Wallet corrections:

- Never erase an existing profile or create a replacement after 401/404. Keep the credentials and block unverifiable play.
- Back up profile credentials in IndexedDB, recover them before profile creation (including a verified same-account backup after a damaged local secret), and require confirmed credential storage before allowing a first run. Web Locks serialize first-time profile creation across tabs where supported.
- Include a monotonically increasing `profile_revision` in wallet responses. Reject older receipts and responses for another profile.
- Revalidate retained clock/net-reroll rejections. Allow later independently verified progress, final payment and ranking past a rejected optional reward snapshot. Invalid stage evidence still blocks ranking.
- Persist current reward checkpoints during kills, wave changes and rerolls. Drafts never credit active games. A live tab holds a reward Web Lock; reload/navigation recovers abandoned drafts without finalizing another active tab, including copied sessionStorage. Browsers without Web Locks recover only the same tab's drafts.
- Finalize on pagehide and scene disposal. A bfcache return goes to the menu rather than resuming an already credited battle.
- Keep run money available for retry if final banking cannot be retained. Settle zero-net runs as well, releasing their checkpoints and leases.
- Wrap long storage error notices within the board and respect reduced-motion preferences.

Validation: full `npm test`, the zombie game test matrix, 50 ranking/delivery tests, nine profile persistence tests, and real Chrome with the Worker/D1 routed to local SQLite. Browser cases cover 100 → 104 → 108 → 112 → 116, offline reload, full localStorage, IDB credential recovery, 401/404, simultaneous profile reads, stale receipts, copied active tabs, and four phone/tablet/desktop viewport sizes. No production test wallets or rankings are created.

Coin addition, final reward state and the unique claim remain one D1 batch. [D1 batch documentation](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) specifies sequential statements and rollback of the batch on failure. Existing tests inject failure into every bank statement, lost responses, and concurrent claims.

A read-only production D1 query checked 148 profiles and 95 paid claims. It found zero negative balances and zero differences between total claimed coins and each profile's cash plus the full cost of its current upgrades. The query wrote zero rows. This verifies already-credited wallets; interrupted records not yet claimed are tested separately through durable recovery.

Backend version constants are unchanged. Publish through main: git push triggers Pages; deploy the Worker separately using `wrangler.game-api.toml`.
