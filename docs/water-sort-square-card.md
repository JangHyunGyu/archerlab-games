# Water Sort square card and portal navigation — 2026-09-28

Replaced the old landscape, botanical-style card with a newly generated square illustration matching the existing anime potion lab. The reference was the game's `water-sort/lab-background.png`: pastel lavender, turquoise and pink glassware, warm magical laboratory, and the blue droplet scientist. Generation used the built-in image generation tool; no specific model version is claimed. The original output is 1254×1254. The WebP delivery copy is 252,388 bytes.

Assets: `water-sort/source/public/og.png`, `water-sort/source/public/og.webp`, built copies at `water-sort/og.png` and `water-sort/og.webp`; matching homepage assets are in `archerlab/assets/images/water-sort_link.png` and `.webp`.

Both homepage languages now place Water Sort first, including the structured project list. The image is inside the same 1:1 picture wrapper as other cards. The games portal also puts Water Sort first and preserves the whole square illustration. The game start screen has a same-tab `https://archerlab.dev/` link beside the sound control; shared immersive handling exits fullscreen when following it.

Initial boards continue to come from a catalog with verified solutions. Randomization changes only color labels and tube order, so it cannot destroy solvability. A new seeded regression check solves 300 randomized starts spanning all 100 stages, verifies four units per color and two empty tubes, and legally replays every computed solution. This complements the existing checks for all 300 original variants. It does not promise that every sequence of player mistakes stays solvable.

## Korean review

Scope: one new player-facing label. Original and final are both “Archerlab으로 가기”. No changes to other Korean copy. Diagnosis found no translation artifacts or ambiguous destination; a contextual rewrite was considered but retaining the direct label was clearer. Independent reviewer `/root/home_label_review` checked the label against the existing start-screen actions and recommended keeping it. Formal before/after verification is recorded in the local review folder; all six content/register checks pass. The final source label matches the reviewed wording.

Formal change-rate gate: 0.0%, OK. Browser verification covered 320×568, 430×932, 768×1024, 1024×768, 667×375, 844×390, and 1440×900. The added link is 44 pixels tall and visible without overflow, including the saved-run menu. The fresh-start menu was also visually checked at 320×568. Clicking the link navigated to Archerlab in the same tab. Main card ordering and exact square picture bounds were checked on mobile and desktop; the mobile layout required a scoped square override because other compact cards stretch their images vertically. Game tests: 29 passed. Main-site validation: 183 checks passed, plus its browser handoff tests and build. Shared game-platform checks passed.
