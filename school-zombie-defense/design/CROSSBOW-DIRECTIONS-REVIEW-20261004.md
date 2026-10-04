# Crossbow clock-direction review, 2026-10-04

The 9 semantic columns and actual projectile targeting were correct, but that
did not establish that the artwork's bolt rail followed the same direction.
The 11:00 pose resembled 10:30, and 11:30 swung left during release/recovery.

Eight left-side source cells (11:00 and 11:30, four frames each) were replaced
with a reviewed built-in imagegen edit. The original 10:00, 10:30 and 12:00
source cells remain. All four right-side directions are exact RGBA horizontal
mirrors of their left-side partners in every atlas:

| Source | Mirror |
| --- | --- |
| 10:00 | 14:00 (2:00) |
| 10:30 | 13:30 (1:30) |
| 11:00 | 13:00 (1:00) |
| 11:30 | 12:30 |

The edited copper rails measure approximately -124 to -126 degrees at 11:00
and -109 to -111 degrees at 11:30. Their requested directions are -120 and
-105 degrees respectively. Each remains within its 15-degree direction cell;
frame-to-frame drift is below 4 degrees. These measurements exclude the
transverse bow limbs and hair. A regression check now measures the visible
rail in all four corrected directions and all four atlas frames, supplementing
the existing mirror, alpha, scale, footing and muzzle-contact checks.

The new release tips were registered at [-38, -181] and [-22, -185] world
pixels, with mirrored right-side offsets. Attack direction locking, timing
and target-directed projectile physics remain unchanged. Texture and service
worker cache keys were updated so existing installations load the correction.

Production atlas paths: `assets/images/character-a{,-attack-1,-attack-2,-attack-3}.{png,webp}`.
Approved replacement inputs and checksums: `design/source-assets/crossbow-v1/`.
Imagegen prompts and visual evidence: `C:/workspace/output/zombie-crossbow-20261004/`.
Accepted prompt: `design/source-assets/crossbow-v1/clock-direction-edit-prompt-20261004.txt`.
The first generated candidate was rejected for colored alpha-edge contamination.
The accepted second candidate used a flat blue background, guarded key removal,
and the existing body/foot registration tool before mirroring. No backend code
or backend version changed.

Validation includes all project checks and real Chrome/Phaser execution of
9 target angles through ready, release and recovery. Each selects the expected
column and its projectile travels from the registered tip toward its target.
The wallet/browser integration check also verifies the existing color grading
on all 36 cells and continued profile/reward behavior after the asset change.
