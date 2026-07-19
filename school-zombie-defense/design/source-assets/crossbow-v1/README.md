# Crossbow v1 reviewed source cells

This directory preserves the 20 reviewed source cells used to build the
crossbow defender's production action sheets. `f0` is the direction's
Higgsfield key pose; `f1` through `f3` are explicit frames selected from
that direction's attack video.

The source images retain their native resolutions. Every cell has a guarded
soft alpha matte removed from its uniform blue chroma background. Key-like
edge pixels use max-channel thresholds 24/96;
distant navy and cyan pixels remain byte-for-byte opaque. Directions
`c5` through `c8` are deterministic horizontal mirrors created later by
`tools/finalize-defender-action-directions.py`.

## Rebuild these reviewed cells

```powershell
python school-zombie-defense/tools/prepare-crossbow-source-cells.py --manifest school-zombie-defense/design/source-assets/crossbow-v1/generated/selections.json --transparent-threshold 24 --opaque-threshold 96 --force
```

This command modifies only this reviewed-source directory. Build production
PNG/WebP strips separately after visual approval with:

```powershell
python school-zombie-defense/tools/finalize-defender-action-directions.py --crossbow-only
```

## Inputs and frame selections

Paths below are relative to `crossbow-v1/generated`. Full SHA-256 values
pin the exact Higgsfield downloads used for the extraction.

| Direction | Key pose PNG / SHA-256 | Attack MP4 / SHA-256 | f1 | f2 | f3 |
| --- | --- | --- | --- | --- | --- |
| c0 | `c0-keypose-candidate-2-2a61855f-91c3-46b4-ad98-f30cec41e129.png`<br>`525732ce14126d29658a9c2e335e6a8cf2c09bd6de9f1ee0ecd638d9877b3588` | `c0-attack-candidate-1-8e85a947-134a-4d58-aa32-d7e2ab032cf8.mp4`<br>`753d9627a4e3d9302536e20f97a2ea8d0ea454bc8598a00bc96e23a0f5ec6b9c` | frame_index=3 | frame_index=7 | frame_index=11 |
| c1 | `c1-keypose-candidate-2-1c0abd59-62a5-4530-b40f-b63c7075ad0b.png`<br>`78cd7c0aa2c8e6610893d25c2a68a052bdb71f9321aa613d8be49fba28f7c0e7` | `c1-attack-seedance2-candidate-1-ab8a9381-e18a-4969-acf6-fbe4d957c799.mp4`<br>`efd5d19ddde84da3402a85aa9c4061376e68aa05b06958ce1ef0eeeca651f71b` | frame_index=4 | frame_index=12 | frame_index=20 |
| c2 | `c2-keypose-candidate-2-7b299a3a-f895-4d68-ae23-cf1f1c4e821e.png`<br>`d8b1ed3746c24a7ad7f85b18c9ac040f00a04dc5c9d564f716aad3b15e7d0c39` | `c2-attack-candidate-1-e37eb58c-b5a2-4199-877b-9764611b587a.mp4`<br>`955eeae30056d1effa9feba8eb74d305c26094ba430c3f9f1330a62c21bf7309` | frame_index=2 | frame_index=5 | frame_index=8 |
| c3 | `c3-keypose-attempt2-candidate-2-f345d30b-4bd7-472f-947a-aab1c43100ed.png`<br>`ecdc5d4ea6d176ab9da3967107a6bdd6e0da388769961a5e0c2cb29f97f0d77f` | `c3-attack-candidate-1-7184f58f-d434-4134-a015-a22abfa26596.mp4`<br>`22590ab19a24bb0a9d4d15cb0962b7f066aa3de11b4298b46d5cea7354d6968c` | frame_index=3 | frame_index=7 | frame_index=11 |
| c4 | `c4-keypose-attempt2-candidate-1-08fd200f-7997-4e77-a047-5429039c3c7f.png`<br>`72c91544ae41f604af4aaad343c47ba98eb61d26e57ec09156309127d856ed62` | `c4-attack-candidate-1-38027564-7e42-4dba-ab7c-5ec3083bddeb.mp4`<br>`28656b8d2ace51d161cbb6fe20f4be558e3ac41dbaa3b6708a6471803c06a19f` | frame_index=6 | frame_index=13 | frame_index=21 |

`SHA256SUMS` records the exact 20 alpha-PNG outputs.
