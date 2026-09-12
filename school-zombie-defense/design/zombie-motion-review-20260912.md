# Zombie motion review — 2026-09-12

The old death scale matched only the first frame's height. A crouched first
pose therefore enlarged the whole body, while some final corpse frames shrank.
The handoff also changed the sprite origin and randomly mirrored the character.

## Changes

- Reviewed all 16 zombie types (256 walking cells and 136 final death cells).
- Regenerated crawler, spider, runner, athlete and charger with the built-in
  image generation tool. Crawler/spider alternate planted hands; the upright
  cycles alternate legs. Their death sheets now contain eight frames.
- Imported transparent PNG/WebP pairs using the same pixel scale through each
  walk/death set, retaining the established gameplay height. Source atlases
  use a flat chroma backing because the first transparent requests returned
  painted checkerboards. Those checkerboard drafts were rejected.
- Applied reviewed per-frame scale corrections to the remaining mismatches;
  a folded pose keeps its shape rather than stretching to standing height.
- Align the visible body centers at death, preserve facing, and blend the
  handoff for 80 ms. The corrected last death frame remains the persistent corpse.
- Resize around the measured alpha center, including Phaser's texture-flip
  behavior. Blood anchors and shadows follow the corrected corpse bounds.

## Assets and reproduction

The 20 shipped files are `assets/images/zombie-walk-{type}.{png,webp}` and
`assets/images/zombie-death-{type}-sheet.{png,webp}` for the five types above.
Exact prompts and selected generated source filenames are in
[zombie-motion-v1.json](zombie-motion-v1.json). Original generated files remain
in the Codex generated-images directory; shipped assets are in this repository.

With ImageMagick available, run `node scripts/pack-zombie-motion.mjs TYPE SOURCE`
from this game directory. For runner and athlete, first import the full atlas,
then import the selected 2×2 walk sheet with `--walk-only`.
Run `python scripts/measure-zombie-motion.py` (Pillow required) after replacing
an atlas, then rebuild the root asset manifest. WebP uses quality 88 with
lossless alpha; the PNG fallback and WebP silhouette must match exactly.

## Verification

- `npm run test:game -- --game=school-zombie-defense`
- `npm test` — all nine games, shared runtime, API and asset manifest.
- Regression coverage measures every death frame, both walk/death anchors,
  all PNG/WebP alpha pairs, mirrored transforms, timer progression and cleanup.
- Local browser QA uses the actual GameScene corpse code at gameplay sizes,
  with all 16 types and both facing directions. Runtime QA helpers stay in
  ignored `tmp/zombie-motion-review/`; they are not part of the game.

Visible alpha area is a regression envelope, not an anatomical measurement:
folding and foreshortening change the area. Visual review remains necessary
when replacing an atlas.
