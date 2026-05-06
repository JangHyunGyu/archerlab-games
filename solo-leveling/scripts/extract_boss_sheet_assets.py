from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

from image_formats import save_png_and_webp


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "bosses" / "source" / "boss_sheet_alpha.png"
OUT = ROOT / "assets" / "bosses" / "source"

ORDER = ["igris", "tusk", "beru"]
ALPHA_THRESHOLD = 18


def alpha_components(img: Image.Image) -> list[dict]:
    alpha = img.getchannel("A")
    w, h = img.size
    seen = bytearray(w * h)
    comps: list[dict] = []

    for y in range(h):
        for x in range(w):
            idx = y * w + x
            if seen[idx] or alpha.getpixel((x, y)) <= ALPHA_THRESHOLD:
                continue

            q = deque([(x, y)])
            seen[idx] = 1
            pixels: list[tuple[int, int]] = []
            min_x = max_x = x
            min_y = max_y = y

            while q:
                cx, cy = q.popleft()
                pixels.append((cx, cy))
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)

                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        nidx = ny * w + nx
                        if not seen[nidx] and alpha.getpixel((nx, ny)) > ALPHA_THRESHOLD:
                            seen[nidx] = 1
                            q.append((nx, ny))

            if len(pixels) > 500:
                comps.append({
                    "pixels": pixels,
                    "bbox": (min_x, min_y, max_x + 1, max_y + 1),
                    "area": len(pixels),
                })

    return comps


def crop_component(img: Image.Image, comp: dict, pad_ratio: float = 0.035) -> Image.Image:
    x0, y0, x1, y1 = comp["bbox"]
    pad = max(12, round(max(x1 - x0, y1 - y0) * pad_ratio))
    crop_box = (
        max(0, x0 - pad),
        max(0, y0 - pad),
        min(img.width, x1 + pad),
        min(img.height, y1 + pad),
    )
    left, top, right, bottom = crop_box
    out = Image.new("RGBA", (right - left, bottom - top), (0, 0, 0, 0))
    src_px = img.load()
    out_px = out.load()
    for px, py in comp["pixels"]:
        out_px[px - left, py - top] = src_px[px, py]
    return out


def clean_alpha(img: Image.Image) -> Image.Image:
    r, g, b, a = img.split()
    a = a.point(lambda v: 0 if v < 18 else v)
    return Image.merge("RGBA", (r, g, b, a))


def main() -> None:
    sheet = clean_alpha(Image.open(SRC).convert("RGBA"))
    comps = sorted(alpha_components(sheet), key=lambda comp: (comp["bbox"][0] + comp["bbox"][2]) / 2)
    if len(comps) != len(ORDER):
        details = [f"{comp['bbox']} area={comp['area']}" for comp in comps]
        raise RuntimeError(f"expected {len(ORDER)} boss components, found {len(comps)}: {details}")

    OUT.mkdir(parents=True, exist_ok=True)
    for key, comp in zip(ORDER, comps):
        crop = crop_component(sheet, comp)
        save_png_and_webp(crop, OUT / f"{key}.png")
        print(f"{key}: {crop.width}x{crop.height} bbox={comp['bbox']} area={comp['area']}")


if __name__ == "__main__":
    main()
