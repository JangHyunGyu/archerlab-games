# Archer v14 reviewed source cells

This directory preserves only the reviewed source cells used to build the
production archer action sheets. Each `a-f{frame}-c{direction}.png` file is an
approved input for one of four animation phases (`f0` through `f3`) and one of
the five source directions (`c0` through `c4`).

Directions `c5` through `c8` are generated as deterministic horizontal
counterparts by `tools/finalize-defender-action-directions.py`; rejected
candidates, extracted video frames, contact sheets, and visual-QA crops remain
local artifacts and are intentionally not versioned.

Rebuild the production archer sheets from a clean checkout with:

```powershell
python school-zombie-defense/tools/finalize-defender-action-directions.py --bow-only
```

`SHA256SUMS` records the exact reviewed inputs used for archer asset version
`20260718-bow-video-directions-v14`.
