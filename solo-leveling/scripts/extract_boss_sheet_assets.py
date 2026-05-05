from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "bosses" / "source" / "boss_sheet_alpha.png"
OUT = ROOT / "assets" / "bosses" / "source"

ORDER = ["igris", "tusk", "beru"]


def trim_alpha(img: Image.Image, pad_ratio: float = 0.035) -> Image.Image:
    alpha = img.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return img
    x0, y0, x1, y1 = bbox
    pad = max(12, round(max(x1 - x0, y1 - y0) * pad_ratio))
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(img.width, x1 + pad)
    y1 = min(img.height, y1 + pad)
    return img.crop((x0, y0, x1, y1))


def clean_alpha(img: Image.Image) -> Image.Image:
    r, g, b, a = img.split()
    a = a.point(lambda v: 0 if v < 18 else v)
    return Image.merge("RGBA", (r, g, b, a))


def main() -> None:
    sheet = Image.open(SRC).convert("RGBA")
    w, h = sheet.size
    # The generated bosses intentionally have huge weapons/capes, so their
    # silhouettes cross the nominal grid. Use tuned column cuts to keep each
    # boss clean and avoid neighboring fragments.
    boxes = [
        (0, 0, round(w * 0.335), h),
        (round(w * 0.355), 0, round(w * 0.665), h),
        (round(w * 0.705), 0, w, h),
    ]

    OUT.mkdir(parents=True, exist_ok=True)
    for key, box in zip(ORDER, boxes):
        crop = sheet.crop(box)
        crop = trim_alpha(clean_alpha(crop))
        crop.save(OUT / f"{key}.png")
        print(f"{key}: {crop.width}x{crop.height}")


if __name__ == "__main__":
    main()
