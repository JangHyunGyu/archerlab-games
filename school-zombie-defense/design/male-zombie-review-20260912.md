# Male zombie appearance review — 2026-09-12

The athlete's healthy skin and focused expression read as a living runner. The
normal male variants, teacher, guard and janitor also needed stronger undead
features. Replace those five categories (eight identities) with hollow cloudy
eyes, corpse-colored skin, sunken cheeks, slack mouths and loose reaching hands.
Preserve their clothing, build, roles, spawn rules, speed and health.

## Camera contract

This is a vertical defense game. Enemies travel from the top of the screen toward
the player at the bottom. **Every locomotion frame must face straight toward the
viewer:** face and chest forward, both eyes and shoulders visible. Do not use
three-quarter, profile or diagonal walking poses. Uneven posture must not rotate
the character away from the player. Collapse uses the original pose reference;
the frontal locomotion rule does not change death/corpse orientation.

## Assets and continuity

- Retain all four normal male identities in their original variant rows.
- Supply four alternating frontal steps per identity. Preserve the original
  collapse sequences: 12 frames for each normal variant, four for teacher,
  guard and janitor, and eight for athlete. The last frame is the persistent corpse.
- Repaint the poses from commit `46c0b9bd`. Normal bodies retain their head-right,
  feet-left direction; teacher, guard, janitor and athlete retain head-left,
  feet-right. Preserve the original knees, elbows, sideward tilt and body contact.
  Do not introduce a skyward-looking, arms-spread recoil or a spread-eagle body.
- Retain each original walk height and foot baseline. Import death repaints at
  their original relative visible coverage, adjusted for the new walking art.
  Bake the established per-frame anatomy corrections into the PNGs, keeping
  sufficient transparent padding for full-length corpses. Use uniform resizing;
  never stretch a crouched or lying pose to standing height.
- Review actual head, torso and limb proportions across walking, collapse and
  corpse. Coverage is a useful regression check, not proof of anatomical accuracy.
  Regenerate every alpha anchor and final-frame bound after packing.
- Extract the generated chroma backing and pack transparent PNG/WebP pairs.
  All 26 runtime assets live in `assets/images/`; no runtime generation is used.
- Exact built-in image-generation prompts and selected source filenames are in
  [male-zombie-design-v1.json](male-zombie-design-v1.json). Import only the selected
  walking frames, then the pose-preserving death repaint with
  `scripts/pack-zombie-death-repaint.mjs`. The source filenames identify originals
  in Codex generated_images; runtime assets are fully shipped in this repository.
- The user's continuity requirements are permanent instructions in repository
  `AGENTS.md` and workspace `D:/workspace/AGENTS.md`.

## Verification

Review front orientation, alternating feet, identity, scale and collapse in the
actual GameScene at gameplay sizes, including mirrored sprites. The regression
suite measures every walking and death frame, final bounds, transition anchors,
PNG/WebP alpha parity and visible-area continuity. Run the repository test suite
and asset manifest check before publishing.
