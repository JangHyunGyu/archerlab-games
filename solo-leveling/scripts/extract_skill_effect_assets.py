from pathlib import Path

from PIL import Image

from image_formats import save_png_and_webp


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "effects" / "source" / "skill_effects_sheet_black.png"
OUT_DIR = ROOT / "assets" / "effects"

EFFECTS = [
    ("shadow_dagger", 0, 0),
    ("shadow_slash", 1, 0),
    ("ruler_authority", 0, 1),
    ("dragon_fear", 1, 1),
]


def black_to_alpha(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    pixels = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = pixels[x, y]
            glow = max(r, g, b)
            if glow <= 4:
                pixels[x, y] = (r, g, b, 0)
                continue
            alpha = int(min(255, ((glow - 4) / 251) ** 0.72 * 255))
            pixels[x, y] = (r, g, b, alpha)
    return rgba


def crop_visible(img: Image.Image, padding: int = 10) -> Image.Image:
    bbox = img.getchannel("A").getbbox()
    if not bbox:
        return img
    left, top, right, bottom = bbox
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(img.width, right + padding)
    bottom = min(img.height, bottom + padding)
    return img.crop((left, top, right, bottom))


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(SRC).convert("RGBA")
    cell_w = sheet.width // 2
    cell_h = sheet.height // 2

    for name, col, row in EFFECTS:
        cell = sheet.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))
        out = crop_visible(black_to_alpha(cell))
        out_path = OUT_DIR / f"{name}.png"
        save_png_and_webp(out, out_path)
        print(f"{name}: {out.width}x{out.height} -> {out_path}")


if __name__ == "__main__":
    main()
