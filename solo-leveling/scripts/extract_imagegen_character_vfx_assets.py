from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

from image_formats import save_png_and_webp


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "effects" / "source" / "character_vfx_imagegen_sheet.png"
BASIC_OUT = ROOT / "assets" / "effects" / "basic_attacks"
SKILL_OUT = ROOT / "assets" / "effects" / "character_skills"
ICON_OUT = ROOT / "assets" / "ui" / "icons"

GRID = [
    ("basic", "flame_fireball", None, (255, 122, 52), (48, 10, 0)),
    ("basic", "light_sword_slash", None, (255, 216, 106), (42, 32, 6)),
    ("basic", "sanctuary_mace_slam", None, (102, 242, 176), (2, 34, 22)),
    ("basic", "tiger_claw_swipe", None, (191, 234, 255), (9, 28, 40)),
    ("skill", "light_pierce", "lightPierce", (255, 216, 106), (42, 32, 6)),
    ("skill", "light_lance", "lightLance", (255, 216, 106), (42, 32, 6)),
    ("skill", "tiger_palm", "tigerPalm", (191, 234, 255), (9, 28, 40)),
    ("skill", "tiger_fang", "tigerFang", (191, 234, 255), (9, 28, 40)),
    ("skill", "flame_spark", "flameSpark", (255, 122, 52), (48, 10, 0)),
    ("skill", "flame_bolt", "flameBolt", (255, 122, 52), (48, 10, 0)),
    ("skill", "sanctuary_strike", "sanctuaryStrike", (102, 242, 176), (2, 34, 22)),
    ("skill", "sanctuary_orb", "sanctuaryOrb", (102, 242, 176), (2, 34, 22)),
    ("skill", "light_crescent", "lightCrescent", (255, 216, 106), (42, 32, 6)),
    ("skill", "tiger_rend", "tigerRend", (191, 234, 255), (9, 28, 40)),
    ("skill", "flame_arc", "flameArc", (255, 122, 52), (48, 10, 0)),
    ("skill", "sanctuary_arc", "sanctuaryArc", (102, 242, 176), (2, 34, 22)),
]


def black_to_alpha(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    px = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, _ = px[x, y]
            glow = max(r, g, b)
            if glow <= 5:
                px[x, y] = (r, g, b, 0)
                continue
            alpha = min(255, round(((glow - 5) / 250) ** 0.66 * 255))
            px[x, y] = (r, g, b, alpha)
    return rgba


def crop_visible(img: Image.Image, padding: int = 18) -> Image.Image:
    alpha = img.getchannel("A").point(lambda v: 255 if v > 8 else 0)
    bbox = alpha.getbbox()
    if not bbox:
        return img
    left, top, right, bottom = bbox
    return img.crop((
        max(0, left - padding),
        max(0, top - padding),
        min(img.width, right + padding),
        min(img.height, bottom + padding),
    ))


def save_icon(effect: Image.Image, icon_key: str, color: tuple[int, int, int], dark: tuple[int, int, int]) -> None:
    ICON_OUT.mkdir(parents=True, exist_ok=True)
    icon = Image.new("RGBA", (64, 64), (*dark, 238))
    d = ImageDraw.Draw(icon, "RGBA")
    d.rounded_rectangle([1, 1, 62, 62], radius=8, outline=(*color, 190), width=2)
    d.rounded_rectangle([6, 6, 57, 57], radius=6, outline=(*color, 78), width=1)

    subject = crop_visible(effect, padding=0)
    bbox = subject.getchannel("A").getbbox()
    if bbox:
        subject = subject.crop(bbox)
        scale = min(52 / subject.width, 52 / subject.height)
        subject = subject.resize(
            (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
            Image.Resampling.LANCZOS,
        )
        icon.alpha_composite(subject, ((64 - subject.width) // 2, (64 - subject.height) // 2))
    save_png_and_webp(icon, ICON_OUT / f"{icon_key}.png")


def main() -> None:
    if not SRC.exists():
        raise FileNotFoundError(SRC)

    sheet = Image.open(SRC).convert("RGBA")
    save_png_and_webp(sheet, SRC)

    cell_w = sheet.width // 4
    cell_h = sheet.height // 4
    for index, (kind, name, icon_key, color, dark) in enumerate(GRID):
        col = index % 4
        row = index // 4
        cell = sheet.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h))
        out = crop_visible(black_to_alpha(cell))
        out_dir = BASIC_OUT if kind == "basic" else SKILL_OUT
        save_png_and_webp(out, out_dir / f"{name}.png")
        if icon_key:
            save_icon(out, icon_key, color, dark)
        print(f"{kind} {name}: {out.width}x{out.height}")


if __name__ == "__main__":
    main()
