from __future__ import annotations

from pathlib import Path
import math
from random import Random

from PIL import Image, ImageDraw, ImageFilter

from image_formats import save_png_and_webp


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "effects" / "character_skills"
ICON_DIR = ROOT / "assets" / "ui" / "icons"


def blank(size: int | tuple[int, int]) -> Image.Image:
    if isinstance(size, int):
        size = (size, size)
    return Image.new("RGBA", size, (0, 0, 0, 0))


def save(img: Image.Image, name: str) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    img = cleanup_alpha(img)
    save_png_and_webp(img, OUT_DIR / f"{name}.png")


def save_icon(effect_img: Image.Image, key: str, color: tuple[int, int, int], dark: tuple[int, int, int]) -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    icon = Image.new("RGBA", (64, 64), (*dark, 235))
    d = ImageDraw.Draw(icon, "RGBA")
    d.rounded_rectangle([1, 1, 62, 62], radius=8, outline=(*color, 180), width=2)
    d.rounded_rectangle([6, 6, 57, 57], radius=6, outline=(*color, 70), width=1)

    subject = effect_img.copy()
    bbox = subject.getchannel("A").getbbox()
    if bbox:
        subject = subject.crop(bbox)
        scale = min(48 / subject.width, 48 / subject.height)
        subject = subject.resize((max(1, round(subject.width * scale)), max(1, round(subject.height * scale))), Image.Resampling.LANCZOS)
        icon.alpha_composite(subject, ((64 - subject.width) // 2, (64 - subject.height) // 2))
    save_png_and_webp(icon, ICON_DIR / f"{key}.png")


def cleanup_alpha(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a <= 4:
                px[x, y] = (r, g, b, 0)
    return img


def alpha_blur(layer: Image.Image, radius: float) -> Image.Image:
    return layer.filter(ImageFilter.GaussianBlur(radius))


def composite(base: Image.Image, layer: Image.Image, blur: float = 0) -> None:
    if blur > 0:
        layer = alpha_blur(layer, blur)
    base.alpha_composite(layer)


def radial_glow(
    size: int,
    color: tuple[int, int, int],
    alpha: int,
    radius_mult: float = 0.48,
    *,
    power: float = 2.0,
    center: tuple[float, float] | None = None,
    squash_y: float = 1.0,
) -> Image.Image:
    img = blank(size)
    px = img.load()
    cx, cy = center or ((size - 1) / 2, (size - 1) / 2)
    max_r = size * radius_mult
    for y in range(size):
        for x in range(size):
            dy = (y - cy) / squash_y
            d = math.hypot(x - cx, dy) / max_r
            if d <= 1:
                a = round(alpha * (1 - d) ** power)
                px[x, y] = (*color, a)
    return img


def draw_glow_line(
    img: Image.Image,
    points: list[tuple[float, float]],
    color: tuple[int, int, int],
    *,
    width: int,
    glow_width: int,
    alpha: int = 230,
    glow_alpha: int = 120,
    blur: float = 6,
) -> None:
    glow = blank(img.size)
    gd = ImageDraw.Draw(glow, "RGBA")
    gd.line(points, fill=(*color, glow_alpha), width=glow_width, joint="curve")
    composite(img, glow, blur)

    core = blank(img.size)
    cd = ImageDraw.Draw(core, "RGBA")
    cd.line(points, fill=(*color, alpha), width=width, joint="curve")
    composite(img, core)


def draw_glow_arc(
    img: Image.Image,
    bbox: list[float],
    start: float,
    end: float,
    color: tuple[int, int, int],
    *,
    width: int,
    glow_width: int,
    alpha: int = 220,
    glow_alpha: int = 110,
    blur: float = 7,
) -> None:
    glow = blank(img.size)
    gd = ImageDraw.Draw(glow, "RGBA")
    gd.arc(bbox, start, end, fill=(*color, glow_alpha), width=glow_width)
    composite(img, glow, blur)

    core = blank(img.size)
    cd = ImageDraw.Draw(core, "RGBA")
    cd.arc(bbox, start, end, fill=(*color, alpha), width=width)
    composite(img, core)


def poly_points(cx: float, cy: float, radii: list[float], sides: int, angle: float = 0) -> list[tuple[float, float]]:
    points = []
    for i in range(sides):
        r = radii[i % len(radii)]
        a = angle + math.tau * i / sides
        points.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return points


def add_particles(
    img: Image.Image,
    rng: Random,
    color: tuple[int, int, int],
    *,
    count: int,
    center: tuple[float, float],
    min_r: float,
    max_r: float,
    size_range: tuple[float, float],
    alpha_range: tuple[int, int],
    stretch: float = 1.0,
) -> None:
    layer = blank(img.size)
    d = ImageDraw.Draw(layer, "RGBA")
    cx, cy = center
    for _ in range(count):
        a = rng.random() * math.tau
        r = rng.uniform(min_r, max_r)
        x = cx + math.cos(a) * r
        y = cy + math.sin(a) * r * stretch
        s = rng.uniform(*size_range)
        alpha = rng.randint(*alpha_range)
        d.ellipse([x - s, y - s, x + s, y + s], fill=(*color, alpha))
    composite(img, layer, 0.45)


def add_sparks(
    img: Image.Image,
    rng: Random,
    color: tuple[int, int, int],
    *,
    count: int,
    center: tuple[float, float],
    min_r: float,
    max_r: float,
    length: tuple[float, float],
    alpha: tuple[int, int],
    width: int = 2,
) -> None:
    layer = blank(img.size)
    d = ImageDraw.Draw(layer, "RGBA")
    cx, cy = center
    for _ in range(count):
        a = rng.random() * math.tau
        r = rng.uniform(min_r, max_r)
        l = rng.uniform(*length)
        x = cx + math.cos(a) * r
        y = cy + math.sin(a) * r
        d.line(
            [x, y, x + math.cos(a) * l, y + math.sin(a) * l],
            fill=(*color, rng.randint(*alpha)),
            width=width,
        )
    composite(img, layer, 0.25)


CHARACTER_WEAPON_EFFECTS = {
    "light_pierce": {"icon": "lightPierce", "kind": "pierce", "motif": "light", "color": (255, 216, 106), "glow": (255, 255, 244), "dark": (42, 32, 6)},
    "light_lance": {"icon": "lightLance", "kind": "projectile", "motif": "light", "color": (255, 216, 106), "glow": (255, 255, 244), "dark": (42, 32, 6)},
    "light_crescent": {"icon": "lightCrescent", "kind": "slash", "motif": "light", "color": (255, 216, 106), "glow": (255, 255, 244), "dark": (42, 32, 6)},
    "light_judgment": {"icon": "lightJudgment", "kind": "area", "motif": "light", "color": (255, 216, 106), "glow": (255, 255, 244), "dark": (42, 32, 6)},
    "light_sanctum": {"icon": "lightSanctum", "kind": "aura", "motif": "light", "color": (255, 216, 106), "glow": (255, 255, 244), "dark": (42, 32, 6)},
    "tiger_palm": {"icon": "tigerPalm", "kind": "pierce", "motif": "tiger", "color": (191, 234, 255), "glow": (255, 255, 255), "dark": (9, 28, 40)},
    "tiger_fang": {"icon": "tigerFang", "kind": "projectile", "motif": "tiger", "color": (191, 234, 255), "glow": (255, 255, 255), "dark": (9, 28, 40)},
    "tiger_rend": {"icon": "tigerRend", "kind": "slash", "motif": "tiger", "color": (191, 234, 255), "glow": (255, 255, 255), "dark": (9, 28, 40)},
    "tiger_quake": {"icon": "tigerQuake", "kind": "area", "motif": "tiger", "color": (191, 234, 255), "glow": (255, 255, 255), "dark": (9, 28, 40)},
    "tiger_guard": {"icon": "tigerGuard", "kind": "aura", "motif": "tiger", "color": (191, 234, 255), "glow": (255, 255, 255), "dark": (9, 28, 40)},
    "flame_spark": {"icon": "flameSpark", "kind": "pierce", "motif": "flame", "color": (255, 122, 52), "glow": (255, 216, 106), "dark": (48, 10, 0)},
    "flame_bolt": {"icon": "flameBolt", "kind": "projectile", "motif": "flame", "color": (255, 122, 52), "glow": (255, 216, 106), "dark": (48, 10, 0)},
    "flame_arc": {"icon": "flameArc", "kind": "slash", "motif": "flame", "color": (255, 122, 52), "glow": (255, 216, 106), "dark": (48, 10, 0)},
    "flame_meteor": {"icon": "flameMeteor", "kind": "area", "motif": "flame", "color": (255, 122, 52), "glow": (255, 216, 106), "dark": (48, 10, 0)},
    "flame_inferno": {"icon": "flameInferno", "kind": "aura", "motif": "flame", "color": (255, 122, 52), "glow": (255, 216, 106), "dark": (48, 10, 0)},
    "sanctuary_strike": {"icon": "sanctuaryStrike", "kind": "pierce", "motif": "sanctuary", "color": (102, 242, 176), "glow": (232, 255, 245), "dark": (2, 34, 22)},
    "sanctuary_orb": {"icon": "sanctuaryOrb", "kind": "projectile", "motif": "sanctuary", "color": (102, 242, 176), "glow": (232, 255, 245), "dark": (2, 34, 22)},
    "sanctuary_arc": {"icon": "sanctuaryArc", "kind": "slash", "motif": "sanctuary", "color": (102, 242, 176), "glow": (232, 255, 245), "dark": (2, 34, 22)},
    "sanctuary_seal": {"icon": "sanctuarySeal", "kind": "area", "motif": "sanctuary", "color": (102, 242, 176), "glow": (232, 255, 245), "dark": (2, 34, 22)},
    "sanctuary_field": {"icon": "sanctuaryField", "kind": "aura", "motif": "sanctuary", "color": (102, 242, 176), "glow": (232, 255, 245), "dark": (2, 34, 22)},
}


def draw_motif_marks(img: Image.Image, cfg: dict, center: tuple[int, int], radius: int, alpha: int) -> None:
    d = ImageDraw.Draw(img, "RGBA")
    cx, cy = center
    color = cfg["glow"]
    motif = cfg["motif"]
    if motif == "tiger":
        for i in range(3):
            y = cy - 18 + i * 18
            d.arc([cx - radius, y - 42, cx + radius * 0.55, y + 42], 198, 278, fill=(*color, alpha), width=3)
    elif motif == "flame":
        for i in range(7):
            a = math.tau * i / 7
            x = cx + math.cos(a) * radius * 0.45
            y = cy + math.sin(a) * radius * 0.45
            d.polygon([(x, y + 10), (x + 7, y - 12), (x + 15, y + 10), (x + 7, y + 2)], fill=(*cfg["color"], round(alpha * 0.6)))
    elif motif == "sanctuary":
        for sides, rr in [(6, radius * 0.5), (8, radius * 0.75)]:
            points = poly_points(cx, cy, [rr], sides, math.pi / sides)
            d.line(points + [points[0]], fill=(*color, alpha), width=2)
    else:
        for i in range(10):
            a = math.tau * i / 10
            d.line([cx, cy, cx + math.cos(a) * radius, cy + math.sin(a) * radius], fill=(*color, round(alpha * 0.38)), width=2)


def weapon_pierce_effect(cfg: dict) -> Image.Image:
    rng = Random(cfg["icon"])
    size = 224
    img = radial_glow(size, cfg["color"], 100, 0.42, power=2.2, center=(118, 108), squash_y=0.75)
    draw_glow_line(img, [(34, 146), (96, 112), (190, 70)], cfg["glow"], width=6, glow_width=24, alpha=230, glow_alpha=105, blur=7)
    draw_glow_line(img, [(46, 166), (104, 128), (178, 94)], cfg["color"], width=4, glow_width=15, alpha=190, glow_alpha=80, blur=5)
    d = ImageDraw.Draw(img, "RGBA")
    d.polygon([(168, 64), (204, 54), (183, 88)], fill=(*cfg["glow"], 205))
    draw_motif_marks(img, cfg, (108, 112), 48, 80)
    add_sparks(img, rng, cfg["glow"], count=24, center=(116, 112), min_r=18, max_r=92, length=(6, 20), alpha=(55, 150))
    return img.filter(ImageFilter.GaussianBlur(0.1))


def weapon_projectile_effect(cfg: dict) -> Image.Image:
    rng = Random(cfg["icon"])
    size = 224
    img = radial_glow(size, cfg["color"], 118, 0.4, power=2.1, center=(132, 104), squash_y=0.72)
    draw_glow_line(img, [(22, 146), (74, 126), (160, 88), (206, 72)], cfg["color"], width=10, glow_width=32, alpha=205, glow_alpha=108, blur=8)
    draw_glow_line(img, [(78, 126), (158, 90), (205, 72)], cfg["glow"], width=4, glow_width=13, alpha=235, glow_alpha=90, blur=4)
    d = ImageDraw.Draw(img, "RGBA")
    if cfg["motif"] == "sanctuary":
        d.ellipse([132, 66, 190, 124], outline=(*cfg["glow"], 225), fill=(*cfg["color"], 72), width=5)
    elif cfg["motif"] == "tiger":
        d.polygon([(162, 56), (210, 74), (162, 104), (174, 80)], fill=(*cfg["glow"], 220))
    else:
        d.polygon([(152, 54), (210, 72), (154, 104), (174, 78)], fill=(*cfg["glow"], 220))
    add_particles(img, rng, cfg["color"], count=36, center=(102, 116), min_r=24, max_r=106, size_range=(0.9, 2.6), alpha_range=(55, 145), stretch=0.72)
    return img.filter(ImageFilter.GaussianBlur(0.12))


def weapon_slash_effect(cfg: dict) -> Image.Image:
    rng = Random(cfg["icon"])
    size = 320
    img = radial_glow(size, cfg["color"], 92, 0.42, power=2.2, center=(170, 150), squash_y=0.7)
    for off, width, alpha in [(-24, 10, 170), (2, 15, 225), (30, 8, 135)]:
        draw_glow_arc(img, [22, 56 + off, 300, 256 + off], 204, 336, cfg["color"], width=width, glow_width=width + 20, alpha=alpha, glow_alpha=86, blur=7)
        draw_glow_arc(img, [42, 72 + off, 282, 232 + off], 207, 330, cfg["glow"], width=max(3, width // 3), glow_width=width + 5, alpha=round(alpha * 0.78), glow_alpha=54, blur=3)
    draw_motif_marks(img, cfg, (162, 158), 88, 70)
    add_sparks(img, rng, cfg["glow"], count=32, center=(164, 154), min_r=34, max_r=150, length=(7, 24), alpha=(55, 155))
    return img.filter(ImageFilter.GaussianBlur(0.12))


def weapon_area_effect(cfg: dict) -> Image.Image:
    rng = Random(cfg["icon"])
    size = 320
    img = radial_glow(size, cfg["color"], 132, 0.49, power=2.0)
    d = ImageDraw.Draw(img, "RGBA")
    cx = cy = size // 2
    for r, alpha, width in [(48, 160, 3), (78, 205, 5), (112, 145, 5), (146, 82, 4)]:
        draw_glow_arc(img, [cx - r, cy - r, cx + r, cy + r], 0, 359, cfg["color"], width=width, glow_width=width + 13, alpha=alpha, glow_alpha=62, blur=5)
    for sides, rr, rot in [(4, 52, math.pi / 4), (6, 92, 0.18), (8, 126, 0.0)]:
        points = poly_points(cx, cy, [rr], sides, rot)
        d.line(points + [points[0]], fill=(*cfg["glow"], 118), width=2)
    draw_motif_marks(img, cfg, (cx, cy), 108, 92)
    add_particles(img, rng, cfg["glow"], count=58, center=(cx, cy), min_r=36, max_r=148, size_range=(1.0, 2.8), alpha_range=(45, 135))
    return img.filter(ImageFilter.GaussianBlur(0.12))


def weapon_aura_effect(cfg: dict) -> Image.Image:
    rng = Random(cfg["icon"])
    size = 320
    img = radial_glow(size, cfg["color"], 120, 0.5, power=1.95)
    cx = cy = size // 2
    for r, alpha, width in [(58, 120, 3), (92, 175, 5), (128, 120, 4), (154, 72, 3)]:
        draw_glow_arc(img, [cx - r, cy - r, cx + r, cy + r], 0, 359, cfg["color"], width=width, glow_width=width + 14, alpha=alpha, glow_alpha=58, blur=4.5)
    for i in range(12):
        a = math.tau * i / 12
        draw_glow_line(img, [(cx + math.cos(a) * 42, cy + math.sin(a) * 42), (cx + math.cos(a + 0.13) * 132, cy + math.sin(a + 0.13) * 132)], cfg["glow"], width=2, glow_width=8, alpha=82, glow_alpha=34, blur=2)
    draw_motif_marks(img, cfg, (cx, cy), 118, 88)
    add_particles(img, rng, cfg["color"], count=62, center=(cx, cy), min_r=44, max_r=150, size_range=(0.9, 2.8), alpha_range=(42, 125))
    return img.filter(ImageFilter.GaussianBlur(0.12))


def weapon_effect(cfg: dict) -> Image.Image:
    if cfg["kind"] == "pierce":
        return weapon_pierce_effect(cfg)
    if cfg["kind"] == "projectile":
        return weapon_projectile_effect(cfg)
    if cfg["kind"] == "slash":
        return weapon_slash_effect(cfg)
    if cfg["kind"] == "area":
        return weapon_area_effect(cfg)
    return weapon_aura_effect(cfg)


def main() -> None:
    assets = {}
    for name, cfg in CHARACTER_WEAPON_EFFECTS.items():
        assets[name] = weapon_effect(cfg)

    for name, img in assets.items():
        save(img, name)
        print(f"generated {name}.png {img.size}")

    for name, cfg in CHARACTER_WEAPON_EFFECTS.items():
        save_icon(assets[name], cfg["icon"], cfg["color"], cfg["dark"])
        print(f"generated icon {cfg['icon']}.png")


if __name__ == "__main__":
    main()
