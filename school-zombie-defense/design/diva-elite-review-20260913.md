# Diva addition and elite walk correction — 2026-09-13

Added Diva, a mature adult woman zombie with an eight-head hourglass silhouette,
silver-blonde hair, a ragged burgundy dress, shredded black jacket, torn stockings
and ankle boots. She enters the ordinary weighted horde from level 3; elite rolls
retain the existing elite character. Her 182px display cell keeps her taller than
the nurse without approaching the elite's 220px cell.

The original elite atlas held the same lead foot in all four frames. Its new
contact and passing poses alternate the leading leg while keeping the head and
torso facing the viewer. Both full boots remain visible. The elite retains its
existing stats, four-frame rate, fall atlas and persistent final corpse.

Diva has four frontal walking frames and eight collapse frames. Her collapse
repaints the nurse's established sequence: knees buckle, hand braces, hip lands,
and body settles on its side with head left and folded legs right. The mirrored
instance retains the same anatomy and reverses that orientation consistently.
The final death frame remains the persistent corpse; no separate corpse image is
loaded. All collapse frames use one import scale and one runtime size factor.
No pose is normalized to standing height or individually shrunk to fit a cell.

## Artwork and reproduction

Artwork was made with built-in `image_gen`. Exact prompts, references, generated
filenames and output paths are in [diva-elite-v1.json](diva-elite-v1.json).
The selected sources are committed under `source-assets/diva-elite-v1/`.
The first elite output contained a baked checkerboard; its background was
regenerated as a flat chroma matte before import. Generated row gutters are
measured rather than assuming that the rows split the source canvas exactly.

From the repository root:

```text
python school-zombie-defense/scripts/pack-diva-elite.py
python school-zombie-defense/scripts/measure-zombie-motion.py
npm run assets:build
```

The importer only extracts the matte, resizes uniformly and packs cells. It
writes PNG/WebP pairs for `zombie-walk-diva`, `zombie-death-diva-sheet` and
`zombie-walk-elite`. Stage new image paths before rebuilding the manifest, since
the manifest inventories tracked files. Game code, motion anchors and the
service worker use the `20260913-diva-elite-v1` cache version.

## Verification

- `npm test`: all nine games, shared runtime, API and 2,903-asset manifest pass.
- New regression checks exercise the real weighted picker at six levels, elite
  roll preservation, atlas registration, alpha parity, transparent margins,
  chroma spill and the opposite elite foot contacts in every variant row.
- Existing motion/placement tests cover 17 types and 22 death atlases, every
  collapse frame, mirrored centroids, body coverage and the persistent last frame.
- Visual review uses the loaded production GameScene textures and collapse
  methods: frontal contacts, every Diva collapse pose, both mirror orientations,
  and the final corpse against the actual battlefield at gameplay scale.
- Reviewed 320×568 and 430×932 phones, 768×1024 and 1024×768 tablets, 844×390
  landscape, 540×960 desktop game size, and a 430×760 dynamic-height viewport.
  Simulated 44px top / 34px bottom safe areas retain the whole game canvas.
  Browser viewport tests use mouse input; the existing coarse-pointer landscape
  rotation guidance and reduced-motion behavior remain in place.
- Real level-3 combat runs with the new weighted pool; keyboard speed switching
  and pause/resume controls respond. No browser errors were recorded.

Local diagnostic fixtures and captures live outside the shipped game, under
`D:/workspace/_qa/zombie-expansion-20260913/`.
