# Zombie design review — 2026-09-12

Reviewed the 16 walking designs beside their collapse frames at gameplay size.
This review concerns appearance; the preceding motion review covers scale and placement.

| Type | Design finding |
| --- | --- |
| nurse | Loose coat and full scrubs hide the silhouette. The old collapse art also changes the face and clothing folds noticeably. Selected for this replacement. |
| normal | Flat cel shading and sparse facial detail stand apart from the textured special enemies. A future style pass should keep the useful color variants. |
| student / screamer | Similar dark school uniforms and hair make their roles difficult to tell apart from appearance alone. The screamer would benefit from stronger head/arm posture. |
| bloom | The shoulder growth gives it an identity, but many small shapes compete at mobile size. Larger grouped shapes would read more clearly. |
| athlete | Red sportswear reads well, but the face can look like an angry living runner. Stronger undead facial coloring would help. |
| elite / volatile | Their long dark coats overlap in shape; the volatile's orange glow is the stronger visual identifier. |
| brute / teacher / guard / janitor | Distinct body mass or occupational clothing makes these recognizable. Preserve those identifiers. |
| runner / crawler / spider / charger | Motion and silhouette are readable after the preceding replacement. Preserve their movement roles. |

## Adult nurse replacement

The new nurse is explicitly a mature adult around 30, with a fitted ivory dress,
teal waist trim, asymmetrically torn sleeves and hem, dark distressed tights and
ankle boots. A nurse cap, ID badge, cloudy eyes and desaturated skin preserve the
occupational and undead identity. Opaque coverage stays in place through the
collapse sequence. School-uniform characters are outside this wardrobe change.

Walking and collapse are generated together, then mechanically keyed and packed
on the same scale. The final collapse frame remains the corpse. The nurse keeps
the existing gameplay size, statistics, spawn rules and walk rate.

Generation mode and exact prompts: `nurse-design-v1.json`.

## Validation

- Inspect all four walk poses for alternating foot contact and matching face/outfit.
- Inspect all eight collapse frames and the held final frame at gameplay size.
- Regenerate alpha centers and final bounds after importing the atlas.
- Run the game matrix and repository checks, including PNG/WebP alpha parity and
  body-area continuity. Review the actual game with both sprite orientations.

Completed: `npm test` passes with the current survival UI, including all nine games,
the UI surface tests, shared/API checks and the 2,893-asset manifest. The nurse's
four walk poses, eight collapse frames and both orientations were reviewed in the
actual local game. No browser errors occurred. Collapse visible-area ratios are
0.814–1.161 relative to the walk median, without the old per-frame size corrections.
