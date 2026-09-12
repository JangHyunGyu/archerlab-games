# Allied character and weapon review — 2026-09-12

Scope: all eight defenders, their nine aiming directions and four attack frames,
portraits, projectile art, muzzle effects, and sniper volume. Zombie changes are
outside this change.

## Corrections

| Finding | Result |
| --- | --- |
| F switches the bottle to the other hand between ready and leftward throws. C/G/H also use separately drawn ready and attack bodies. | Ready poses now use the corresponding attack source for all nine directions, including the idle aliases. Missing attack sources retain the existing fallback. |
| F/G recovery snaps back to a separately posed body. | Short recovery blends soften the transition; the existing crossbow blend remains. |
| Every bullet shifts the whole defender down three pixels. Rifle bursts repeatedly drag planted feet. | The authored attack frames provide recoil without an additional whole-body translation. |
| At low FPS / accelerated game speed, only one attack frame advances per update. | Elapsed frames are consumed together, preserving release and recovery timing and firing the callback once. |
| Pistol/rifle/sniper flight art includes a cartridge case; shock flight art includes a metal component. | Transparent copper projectiles and a blue-violet energy bolt replace those four PNG/WebP pairs. Rifle and sniper share one generated source, packed separately. |
| All muzzle sprites share a left-edge anchor, displacing the bright flash from the barrel. | Each existing firearm/crossbow flash uses its own ignition anchor. |
| Molotov throws and electric/nail weapons reuse large firearm flames. | Molotov: small embers. Shock: blue-violet discharge. Nail gun: short mechanical sparks. Each effect is tracked and disposed. |
| Sniper sound is slightly buried in the mix. | Weapon intensity 1.18 → 1.30, a 10.2% gain increase (about 0.84 dB); the shared mix is unchanged. |

The initially suspected missing rocket in the 12:30 recovery pose did not
reproduce when checking the source PNG, WebP and actual game renderer. No rocket
character redraw was made. The smaller differences in crossbow palette and
portrait rendering remain aesthetic follow-up candidates, rather than confirmed
animation defects addressed in this pass.

## Asset reproduction

Built-in image_gen generated the three source images. Exact prompts and original
generated filenames are recorded in [allied-weapons-v1.json](allied-weapons-v1.json).
Sources are checked in under `source-assets/allied-projectiles-v1/`.

Run `python school-zombie-defense/tools/pack-allied-projectiles.py` from the
repository root, then `npm run assets:build`. Packing measures visible alpha,
trims the surrounding padding, preserves aspect ratio and alpha, and writes:

- `assets/images/projectile-pistol.{png,webp}`
- `assets/images/projectile-rifle.{png,webp}`
- `assets/images/projectile-sniper.{png,webp}`
- `assets/images/projectile-shock.{png,webp}`

Character source sheets are preserved; ready/attack continuity is corrected in
texture selection. Projectile requests, game.js and the service worker have a
new cache version.

## Validation

- `npm test`: all nine games, shared runtime, API and asset manifest pass.
- New regression coverage checks all 36 changed ready directions, aliases and
  fallback, release/recovery timing at 60 FPS and 100 ms update steps, unique
  release callbacks, discharge placement/disposal, flash origins, sniper gain,
  PNG/WebP alpha equality and minimum visible projectile size.
- Browser QA uses the production GameScene methods and loaded textures. Reviewed
  left/center/right release poses, all eight allied weapons in live combat and
  2x speed. No browser errors were recorded.
- Sniper gain was verified in the playback path; no subjective listening score
  is claimed.
