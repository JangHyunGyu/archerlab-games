from __future__ import annotations

from pathlib import Path

import numpy as np
from scipy import ndimage
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "enemies" / "source" / "enemy_sheet_alpha.png"
OUT = ROOT / "assets" / "enemies" / "source"

ORDER = [
    "goblin",
    "antSoldier",
    "orc",
    "iceBear",
    "stoneGolem",
    "darkMage",
    "ironKnight",
    "demonWarrior",
]


def trim_alpha(img: Image.Image, pad_ratio: float = 0.08) -> Image.Image:
    alpha = img.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return img
    x0, y0, x1, y1 = bbox
    pad = max(8, round(max(x1 - x0, y1 - y0) * pad_ratio))
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(img.width, x1 + pad)
    y1 = min(img.height, y1 + pad)
    return img.crop((x0, y0, x1, y1))


def remove_dark_corner_noise(img: Image.Image) -> Image.Image:
    # Keep only pixels with meaningful alpha. The chroma-key helper can leave
    # tiny near-transparent edge specks; trimming alone would keep them.
    r, g, b, a = img.split()
    cleaned_a = a.point(lambda v: 0 if v < 18 else v)
    out = Image.merge("RGBA", (r, g, b, cleaned_a))
    return out


def main() -> None:
    sheet = Image.open(SRC).convert("RGBA")
    alpha = np.array(sheet.getchannel("A"))
    mask = alpha > 18
    # Generated sheets can leave swords/antennae slightly detached. A light
    # dilation connects those parts without merging separate monsters.
    mask = ndimage.binary_dilation(mask, iterations=2)
    labels, count = ndimage.label(mask, structure=np.ones((3, 3), dtype=np.uint8))

    comps = []
    for label_id in range(1, count + 1):
        ys, xs = np.where(labels == label_id)
        if len(xs) < 500:
            continue
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        area = len(xs)
        comps.append((area, x0, y0, x1, y1))

    comps = sorted(comps, reverse=True)[:8]
    if len(comps) != 8:
        raise RuntimeError(f"expected 8 enemy components, found {len(comps)}")

    # Restore the visual prompt order: top row left-to-right, then bottom row.
    comps = sorted(comps, key=lambda c: ((c[2] + c[4]) / 2, (c[1] + c[3]) / 2))
    top = sorted(comps[:4], key=lambda c: (c[1] + c[3]) / 2)
    bottom = sorted(comps[4:], key=lambda c: (c[1] + c[3]) / 2)
    comps = top + bottom

    OUT.mkdir(parents=True, exist_ok=True)
    for key, (_, x0, y0, x1, y1) in zip(ORDER, comps):
        pad = max(12, round(max(x1 - x0, y1 - y0) * 0.06))
        crop_box = (
            max(0, x0 - pad),
            max(0, y0 - pad),
            min(sheet.width, x1 + pad),
            min(sheet.height, y1 + pad),
        )
        trimmed = sheet.crop(crop_box)
        trimmed = remove_dark_corner_noise(trimmed)
        trimmed = trim_alpha(trimmed, pad_ratio=0.03)
        trimmed.save(OUT / f"{key}.png")
        print(f"{key}: {trimmed.width}x{trimmed.height}")


if __name__ == "__main__":
    main()
