# Combat VFX direction audit — updated 2026-07-17

All 25 character attacks and skills now declare one runtime orientation contract.

| Character | Basic attack | Lv5 | Lv10 | Lv15 | Lv20 |
| --- | --- | --- | --- | --- | --- |
| Shadow Monarch | body thrust | projectile | forward arc | target impact | self radial |
| Light Swordswoman | body arc | projectile | forward arc | target impact | self radial |
| White Tiger Brawler | body arc | forward arc | forward arc | self radial | self radial |
| Flame Mage | projectile | projectile | forward arc | target impact | self radial |
| Sanctuary Healer | target impact | self radial | forward arc | target impact | self radial |

Direction corrections:

- Shadow basic attack uses two slim +X dagger trails. They begin at opposite hands, converge in a narrow forward cross, and are never flipped horizontally, so both tips always travel away from the character toward the target.
- Light basic sword attack keeps its forward axis fixed and mirrors the image vertically for alternating sweeps. The removed `side * 0.55` rotation was able to turn one half of the attack into a near-vertical stab.
- Light Lance's alpha axis is diagonal, but its sharp spear tip is on the down-left end. It rotates counter-clockwise by 135 degrees so the tip, rather than the tail, follows the projectile path.
- White Tiger's basic claw and Fang Combo both point down-right in their source frames. They rotate counter-clockwise by 45 degrees; the basic attack negates that offset after vertical mirroring so both swing parities still point outward.
- Flame Spark rotates its measured 26-degree down-right source axis counter-clockwise by about 25.7 degrees and stays locked to its travel vector without rotational wobble.
- Flame Bolt rotates its down-right source art counter-clockwise by 45 degrees so the fire head follows the projectile path.
- Flame Arc rotates clockwise by 135 degrees, placing its open side toward the player and the dense convex fire edge toward the target.
- Light Crescent rotates by -90 degrees, placing the open side toward the player and the convex edge toward the target.
- Sanctuary Arc rotates by 180 degrees for the same player-to-target outward sweep.
- Target impacts and self-centered radial effects ignore aim rotation by contract.

## Exhaustive pixel audit

- Directional effects: 13 sequences × 6 frames = 78 frames. Six narrow projectile/thrust sequences are checked frame-by-frame with alpha-weighted principal-axis measurement after applying their runtime offset. Broader claw and crescent art is checked with a signed visual forward-axis contract; crescent direction is additionally disambiguated with the corrected forward alpha centroid because principal axes alone cannot distinguish a 180-degree reversal. Symmetric cross-slashes are intentionally kept at zero offset and aimed by their spawn placement.
- Non-directional effects: 12 sequences × 6 frames = 72 frames. Target impacts and self-centered radial effects are checked for a centered rotation pivot and a zero rotation offset.
- Total: 25 sequences and 150/150 authored PNG frames. Non-directional alpha centroids must stay within 96 pixels of the 512×512 canvas center; directional reveal frames may extend to 160 pixels because their first/last stages intentionally expose only a tip or tail. Every PCA-measurable corrected frame must stay within 20 degrees of the character-to-target line, including intentionally sparse first/last reveal stages.

The shared resolver is used by basic attacks, projectile skills, and forward slash skills. Static validation requires all 25 weapon configs to keep the audited orientation and asset-specific offset, while the pixel regression test re-reads all 150 source frames.
