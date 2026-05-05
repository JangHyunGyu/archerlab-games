from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "effects" / "source" / "combat_vfx_sheet_black.png"
OUT_DIR = ROOT / "assets" / "effects" / "combat"

ROWS = [
    "basic_stab",
    "monster_hit",
    "monster_crit",
    "monster_death",
]
COLS = 6


def black_to_alpha(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    pixels = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = pixels[x, y]
            glow = max(r, g, b)
            if glow <= 3:
                pixels[x, y] = (r, g, b, 0)
                continue
            alpha = int(min(255, ((glow - 3) / 252) ** 0.66 * 255))
            pixels[x, y] = (r, g, b, alpha)
    return rgba


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(SRC).convert("RGBA")
    cell_w = sheet.width // COLS
    cell_h = sheet.height // len(ROWS)

    for row_index, row_name in enumerate(ROWS):
        for col in range(COLS):
            cell = sheet.crop((
                col * cell_w,
                row_index * cell_h,
                (col + 1) * cell_w,
                (row_index + 1) * cell_h,
            ))
            out = black_to_alpha(cell)
            out_path = OUT_DIR / f"{row_name}_{col}.png"
            out.save(out_path)
            print(f"{row_name}_{col}: {out.width}x{out.height}")


if __name__ == "__main__":
    main()
