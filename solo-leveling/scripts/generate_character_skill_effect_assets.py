from __future__ import annotations

from pathlib import Path
import math
from random import Random

from PIL import Image, ImageDraw, ImageFilter


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
    img.save(OUT_DIR / f"{name}.png")


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
    icon.save(ICON_DIR / f"{key}.png")


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


def light_flurry_slash() -> Image.Image:
    rng = Random(101)
    size = 320
    img = radial_glow(size, (255, 228, 114), 95, 0.42, power=2.4, center=(168, 138), squash_y=0.72)

    for off, width, alpha in [(-32, 11, 190), (-10, 16, 235), (15, 12, 205), (39, 7, 140)]:
        draw_glow_arc(
            img,
            [24, 48 + off, 304, 250 + off],
            202,
            337,
            (255, 223, 92),
            width=width,
            glow_width=width + 18,
            alpha=alpha,
            glow_alpha=90,
            blur=8,
        )
        draw_glow_arc(
            img,
            [40, 64 + off, 288, 226 + off],
            206,
            332,
            (255, 255, 238),
            width=max(3, width // 3),
            glow_width=width + 5,
            alpha=round(alpha * 0.75),
            glow_alpha=60,
            blur=3,
        )

    draw_glow_line(img, [(54, 216), (142, 156), (286, 70)], (255, 255, 246), width=4, glow_width=17, alpha=235)
    draw_glow_line(img, [(72, 246), (158, 178), (308, 98)], (255, 204, 68), width=3, glow_width=14, alpha=165)
    add_sparks(img, rng, (255, 246, 190), count=28, center=(172, 150), min_r=34, max_r=142, length=(6, 20), alpha=(80, 170))
    add_particles(img, rng, (255, 222, 96), count=38, center=(174, 150), min_r=26, max_r=146, size_range=(1.1, 2.6), alpha_range=(60, 145), stretch=0.65)
    return img.filter(ImageFilter.GaussianBlur(0.12))


def light_flurry_hit() -> Image.Image:
    rng = Random(102)
    size = 192
    img = radial_glow(size, (255, 225, 102), 145, 0.48, power=2.1)
    d = ImageDraw.Draw(img, "RGBA")
    cx = cy = size // 2

    for i in range(16):
        a = math.tau * i / 16
        inner = 16 if i % 2 else 8
        outer = 86 if i % 2 else 76
        draw_glow_line(
            img,
            [(cx + math.cos(a) * inner, cy + math.sin(a) * inner),
             (cx + math.cos(a) * outer, cy + math.sin(a) * outer)],
            (255, 251, 218),
            width=2 if i % 2 else 3,
            glow_width=9,
            alpha=190,
            glow_alpha=72,
            blur=3,
        )

    d.polygon(poly_points(cx, cy, [48, 18], 12, -math.pi / 2), outline=(255, 246, 180, 220), fill=(255, 224, 88, 42))
    d.ellipse([66, 66, 126, 126], outline=(255, 255, 232, 235), width=5)
    d.ellipse([80, 80, 112, 112], fill=(255, 255, 236, 150))
    add_particles(img, rng, (255, 248, 190), count=30, center=(cx, cy), min_r=35, max_r=87, size_range=(1.0, 2.4), alpha_range=(80, 175))
    return img.filter(ImageFilter.GaussianBlur(0.1))


def tiger_roar_wave() -> Image.Image:
    rng = Random(201)
    size = 320
    img = radial_glow(size, (122, 222, 255), 95, 0.46, power=2.0)
    d = ImageDraw.Draw(img, "RGBA")
    cx = cy = size // 2

    for r, alpha, width in [(58, 125, 4), (86, 185, 8), (118, 150, 7), (146, 82, 5)]:
        draw_glow_arc(
            img,
            [cx - r, cy - r, cx + r, cy + r],
            0,
            359,
            (204, 246, 255),
            width=width,
            glow_width=width + 14,
            alpha=alpha,
            glow_alpha=58,
            blur=5,
        )

    for i in range(18):
        a = math.tau * i / 18
        inner = 44 + (i % 3) * 8
        outer = 143 - (i % 2) * 10
        draw_glow_line(
            img,
            [(cx + math.cos(a) * inner, cy + math.sin(a) * inner),
             (cx + math.cos(a) * outer, cy + math.sin(a) * outer)],
            (221, 252, 255),
            width=2,
            glow_width=8,
            alpha=112,
            glow_alpha=42,
            blur=3,
        )

    for i in range(6):
        a = -0.78 + i * 0.31
        x = cx + math.cos(a) * 48
        y = cy + math.sin(a) * 48
        d.polygon(
            [(x, y), (cx + math.cos(a - 0.08) * 138, cy + math.sin(a - 0.08) * 138),
             (cx + math.cos(a + 0.08) * 124, cy + math.sin(a + 0.08) * 124)],
            fill=(178, 235, 255, 34),
        )

    add_particles(img, rng, (218, 250, 255), count=42, center=(cx, cy), min_r=62, max_r=148, size_range=(1.1, 3.0), alpha_range=(45, 125))
    return img.filter(ImageFilter.GaussianBlur(0.15))


def tiger_claw() -> Image.Image:
    rng = Random(202)
    size = 224
    img = radial_glow(size, (140, 222, 255), 72, 0.42, power=2.2, center=(118, 108), squash_y=0.82)

    for i, x in enumerate((76, 112, 148)):
        y = 26 + i * 13
        draw_glow_arc(
            img,
            [x - 112, y - 28, x + 56, y + 166],
            202,
            286,
            (225, 251, 255),
            width=9,
            glow_width=24,
            alpha=225,
            glow_alpha=90,
            blur=6,
        )
        draw_glow_arc(
            img,
            [x - 98, y - 20, x + 44, y + 150],
            205,
            282,
            (85, 196, 255),
            width=4,
            glow_width=10,
            alpha=150,
            glow_alpha=65,
            blur=2.5,
        )

    add_sparks(img, rng, (218, 250, 255), count=24, center=(114, 110), min_r=36, max_r=98, length=(7, 22), alpha=(70, 160))
    add_particles(img, rng, (122, 222, 255), count=34, center=(114, 112), min_r=20, max_r=103, size_range=(0.9, 2.2), alpha_range=(50, 125), stretch=0.8)
    return img.filter(ImageFilter.GaussianBlur(0.12))


def flame_brand_burst() -> Image.Image:
    rng = Random(301)
    size = 320
    img = radial_glow(size, (255, 62, 14), 180, 0.48, power=1.85)
    d = ImageDraw.Draw(img, "RGBA")
    cx = cy = size // 2

    flame_layer = blank(size)
    fd = ImageDraw.Draw(flame_layer, "RGBA")
    for i in range(28):
        a = math.tau * i / 28 + rng.uniform(-0.08, 0.08)
        r1 = rng.uniform(22, 48)
        r2 = rng.uniform(116, 156)
        spread = rng.uniform(0.045, 0.11)
        hot = rng.random() < 0.42
        color = (255, 208, 88, 138) if hot else (255, 90, 26, 126)
        fd.polygon(
            [
                (cx + math.cos(a - spread) * r1, cy + math.sin(a - spread) * r1),
                (cx + math.cos(a) * r2, cy + math.sin(a) * r2),
                (cx + math.cos(a + spread) * r1, cy + math.sin(a + spread) * r1),
            ],
            fill=color,
        )
    composite(img, flame_layer, 2.2)

    for r, color, alpha, width in [
        (52, (255, 246, 164), 165, 4),
        (84, (255, 170, 54), 210, 7),
        (122, (255, 70, 24), 160, 8),
        (150, (255, 112, 34), 78, 5),
    ]:
        draw_glow_arc(
            img,
            [cx - r, cy - r, cx + r, cy + r],
            0,
            359,
            color,
            width=width,
            glow_width=width + 16,
            alpha=alpha,
            glow_alpha=70,
            blur=6,
        )

    d.ellipse([104, 104, 216, 216], fill=(255, 228, 110, 92), outline=(255, 246, 168, 180), width=4)
    add_sparks(img, rng, (255, 198, 76), count=42, center=(cx, cy), min_r=48, max_r=154, length=(7, 28), alpha=(70, 180), width=2)
    add_particles(img, rng, (255, 86, 28), count=58, center=(cx, cy), min_r=36, max_r=156, size_range=(1.1, 3.6), alpha_range=(55, 150))
    return img.filter(ImageFilter.GaussianBlur(0.18))


def flame_brand_mark() -> Image.Image:
    rng = Random(302)
    size = 192
    img = radial_glow(size, (255, 76, 20), 112, 0.42, power=2.4)
    d = ImageDraw.Draw(img, "RGBA")
    cx = cy = size // 2

    for r, alpha, width in [(42, 190, 4), (58, 155, 3), (72, 92, 3)]:
        draw_glow_arc(
            img,
            [cx - r, cy - r, cx + r, cy + r],
            16,
            344,
            (255, 138, 38),
            width=width,
            glow_width=width + 9,
            alpha=alpha,
            glow_alpha=54,
            blur=4,
        )

    d.polygon(poly_points(cx, cy, [78, 22], 8, math.pi / 8), outline=(255, 212, 88, 205), fill=(255, 82, 22, 38))
    d.polygon([(cx, 16), (cx + 26, cy), (cx, 176), (cx - 26, cy)], outline=(255, 236, 144, 220), fill=(255, 110, 22, 48))
    for i in range(6):
        a = math.tau * i / 6 + 0.18
        draw_glow_line(
            img,
            [(cx + math.cos(a) * 28, cy + math.sin(a) * 28),
             (cx + math.cos(a) * 71, cy + math.sin(a) * 71)],
            (255, 194, 62),
            width=2,
            glow_width=8,
            alpha=150,
            glow_alpha=52,
            blur=2.5,
        )
    add_particles(img, rng, (255, 176, 54), count=26, center=(cx, cy), min_r=30, max_r=82, size_range=(0.9, 2.1), alpha_range=(60, 145))
    return img.filter(ImageFilter.GaussianBlur(0.08))


def sanctuary_oath_aura() -> Image.Image:
    rng = Random(401)
    size = 320
    img = radial_glow(size, (72, 242, 176), 126, 0.5, power=2.0)
    d = ImageDraw.Draw(img, "RGBA")
    cx = cy = size // 2

    for r, alpha, width in [(50, 125, 3), (82, 185, 5), (116, 150, 4), (146, 72, 3)]:
        draw_glow_arc(
            img,
            [cx - r, cy - r, cx + r, cy + r],
            0,
            359,
            (154, 255, 212),
            width=width,
            glow_width=width + 12,
            alpha=alpha,
            glow_alpha=54,
            blur=4.5,
        )

    for sides, r, alpha, rot in [(6, 92, 118, 0.52), (8, 124, 82, 0.18)]:
        points = poly_points(cx, cy, [r], sides, rot)
        d.line(points + [points[0]], fill=(216, 255, 236, alpha), width=2)

    for i in range(10):
        a = math.tau * i / 10
        draw_glow_line(
            img,
            [(cx + math.cos(a) * 42, cy + math.sin(a) * 42),
             (cx + math.cos(a + 0.16) * 118, cy + math.sin(a + 0.16) * 118)],
            (200, 255, 232),
            width=2,
            glow_width=7,
            alpha=92,
            glow_alpha=35,
            blur=2,
        )

    d.polygon(poly_points(cx, cy, [36, 17], 12, -math.pi / 2), fill=(205, 255, 232, 62), outline=(230, 255, 244, 155))
    add_particles(img, rng, (154, 255, 212), count=58, center=(cx, cy), min_r=42, max_r=148, size_range=(1.0, 2.8), alpha_range=(45, 132))
    return img.filter(ImageFilter.GaussianBlur(0.12))


def sanctuary_shield() -> Image.Image:
    rng = Random(402)
    size = 224
    img = radial_glow(size, (72, 242, 176), 100, 0.42, power=2.0, center=(112, 94), squash_y=1.15)
    d = ImageDraw.Draw(img, "RGBA")

    outer = [(112, 12), (176, 42), (162, 154), (112, 210), (62, 154), (48, 42)]
    inner = [(112, 31), (157, 54), (146, 142), (112, 184), (78, 142), (67, 54)]
    core = [(112, 49), (140, 66), (132, 126), (112, 154), (92, 126), (84, 66)]

    glow = blank(size)
    gd = ImageDraw.Draw(glow, "RGBA")
    gd.polygon(outer, outline=(124, 255, 212, 170), fill=(72, 242, 176, 34))
    composite(img, glow, 6)
    d.polygon(outer, outline=(164, 255, 220, 230), fill=(72, 242, 176, 30))
    d.line(outer + [outer[0]], fill=(226, 255, 242, 142), width=3)
    d.polygon(inner, outline=(226, 255, 242, 122), fill=(84, 255, 188, 22))
    d.polygon(core, outline=(198, 255, 232, 92), fill=(205, 255, 232, 24))

    for p in inner:
        d.line([(112, 92), p], fill=(216, 255, 236, 58), width=2)
    d.line([(112, 28), (112, 186)], fill=(238, 255, 246, 118), width=2)
    d.line([(70, 62), (154, 62)], fill=(238, 255, 246, 88), width=2)
    d.line([(82, 140), (142, 140)], fill=(238, 255, 246, 72), width=2)
    add_particles(img, rng, (164, 255, 220), count=26, center=(112, 106), min_r=52, max_r=102, size_range=(0.8, 2.0), alpha_range=(42, 122))
    return img.filter(ImageFilter.GaussianBlur(0.08))


def shadow_recruit_rune() -> Image.Image:
    rng = Random(501)
    size = 256
    img = radial_glow(size, (112, 56, 255), 145, 0.5, power=2.15)
    d = ImageDraw.Draw(img, "RGBA")
    cx = cy = size // 2

    for r, alpha, width in [(44, 185, 3), (68, 170, 4), (92, 118, 4), (112, 70, 3)]:
        draw_glow_arc(
            img,
            [cx - r, cy - r, cx + r, cy + r],
            0,
            359,
            (174, 112, 255),
            width=width,
            glow_width=width + 11,
            alpha=alpha,
            glow_alpha=58,
            blur=4.8,
        )

    for i in range(12):
        a = math.tau * i / 12
        inner = 34 if i % 2 else 52
        outer = 108
        draw_glow_line(
            img,
            [(cx + math.cos(a) * inner, cy + math.sin(a) * inner),
             (cx + math.cos(a) * outer, cy + math.sin(a) * outer)],
            (190, 128, 255),
            width=2,
            glow_width=8,
            alpha=94,
            glow_alpha=38,
            blur=2.3,
        )

    for i in range(8):
        a = math.tau * i / 8 + 0.2
        x = cx + math.cos(a) * 88
        y = cy + math.sin(a) * 88
        d.polygon(poly_points(x, y, [8, 3], 4, a), fill=(221, 198, 255, 135))

    for i in range(7):
        a = -2.55 + i * 0.23
        base_x = cx + math.cos(a) * 60
        base_y = cy + math.sin(a) * 60
        tip_x = cx + math.cos(a) * (104 + (i % 2) * 14)
        tip_y = cy + math.sin(a) * (104 + (i % 2) * 14)
        d.polygon(
            [(base_x - 5, base_y + 8), (tip_x, tip_y), (base_x + 8, base_y - 5)],
            fill=(72, 14, 160, 88),
        )

    d.arc([42, 42, 214, 214], 210, 333, fill=(238, 220, 255, 145), width=6)
    d.arc([64, 64, 192, 192], 32, 172, fill=(130, 72, 255, 125), width=5)
    add_particles(img, rng, (180, 122, 255), count=48, center=(cx, cy), min_r=38, max_r=118, size_range=(0.9, 2.5), alpha_range=(45, 130))
    return img.filter(ImageFilter.GaussianBlur(0.12))


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
    assets = {
        "light_flurry_slash": light_flurry_slash(),
        "light_flurry_hit": light_flurry_hit(),
        "tiger_roar_wave": tiger_roar_wave(),
        "tiger_claw": tiger_claw(),
        "flame_brand_burst": flame_brand_burst(),
        "flame_brand_mark": flame_brand_mark(),
        "sanctuary_oath_aura": sanctuary_oath_aura(),
        "sanctuary_shield": sanctuary_shield(),
        "shadow_recruit_rune": shadow_recruit_rune(),
    }
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
