# Combat VFX direction audit — 2026-07-16

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
- Light Lance rotates its up-right source art clockwise by 45 degrees so the spear tip follows the projectile path.
- Flame Spark rotates its measured 26-degree down-right source axis counter-clockwise by about 25.7 degrees and stays locked to its travel vector without rotational wobble.
- Flame Bolt rotates its down-right source art counter-clockwise by 45 degrees so the fire head follows the projectile path.
- Light Crescent rotates by -90 degrees, placing the open side toward the player and the convex edge toward the target.
- Sanctuary Arc rotates by 180 degrees for the same player-to-target outward sweep.
- Target impacts and self-centered radial effects ignore aim rotation by contract.

The shared resolver is used by basic attacks, projectile skills, and forward slash skills. Static validation requires all 25 weapon configs to keep the audited orientation and asset-specific offset.
