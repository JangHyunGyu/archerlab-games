from __future__ import annotations

from collections import deque
from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

from image_formats import save_png_and_webp


ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHEET = ROOT / "assets" / "player" / "characters" / "generated_character_source_sheet.png"
OUT_ROOT = ROOT / "assets" / "player" / "characters"

FRAME_W = 112
FRAME_H = 144
FOOT_Y = 139
BODY_H = 132
MAX_BODY_W = 106

FRAMES = [
    *[f"idle_{i}" for i in range(4)],
    *[f"walk_{d}_{i}" for d in ("down", "right", "up", "left") for i in range(4)],
    *[f"attack_{i}" for i in range(6)],
    *[f"attack_{d}_{i}" for d in ("down", "right", "up", "left") for i in range(6)],
    *[f"hit_{i}" for i in range(2)],
]

CHARACTERS = [
    {
        "id": "light_swordswoman",
        "source_index": 1,
        "accent": (255, 225, 126),
        "glow": (255, 242, 182),
        "shadow": (38, 28, 6),
        "scale": 0.98,
        "effect": "light",
    },
    {
        "id": "white_tiger_brawler",
        "source_index": 2,
        "accent": (169, 232, 255),
        "glow": (222, 252, 255),
        "shadow": (8, 18, 26),
        "scale": 1.03,
        "effect": "tiger",
    },
    {
        "id": "flame_mage",
        "source_index": 3,
        "accent": (255, 104, 38),
        "glow": (255, 178, 72),
        "shadow": (36, 4, 0),
        "scale": 0.99,
        "effect": "flame",
    },
    {
        "id": "sanctuary_healer",
        "source_index": 4,
        "accent": (104, 242, 185),
        "glow": (186, 255, 222),
        "shadow": (2, 28, 20),
        "scale": 0.99,
        "effect": "healer",
    },
]


def is_green_pixel(r: int, g: int, b: int) -> bool:
    return g > 145 and g > r * 1.35 and g > b * 1.35


def remove_green(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    pixels = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = pixels[x, y]
            if is_green_pixel(r, g, b):
                pixels[x, y] = (r, g, b, 0)
            elif a > 0 and g > 80:
                # Gentle despill on antialiased edges.
                pixels[x, y] = (r, min(g, max(r, b) + 34), b, a)
    return img


def alpha_bbox(img: Image.Image) -> tuple[int, int, int, int]:
    bbox = img.getchannel("A").getbbox()
    if not bbox:
        raise RuntimeError("image has no visible pixels")
    return bbox


def isolate_main_subject(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    alpha = img.getchannel("A")
    w, h = img.size
    seen = [[False] * w for _ in range(h)]
    comps: list[dict] = []

    for y in range(h):
        for x in range(w):
            if seen[y][x] or alpha.getpixel((x, y)) <= 18:
                continue
            q = deque([(x, y)])
            seen[y][x] = True
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
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and alpha.getpixel((nx, ny)) > 18:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            if len(pixels) > 24:
                comps.append({
                    "pixels": pixels,
                    "bbox": (min_x, min_y, max_x + 1, max_y + 1),
                    "area": len(pixels),
                })

    if not comps:
        return img

    main = max(comps, key=lambda c: c["area"])
    mx1, my1, mx2, my2 = main["bbox"]
    margin_x = max(42, round((mx2 - mx1) * 0.18))
    margin_y = max(36, round((my2 - my1) * 0.10))
    keep_box = (mx1 - margin_x, my1 - margin_y, mx2 + margin_x, my2 + margin_y)

    keep_pixels: set[tuple[int, int]] = set()
    for comp in comps:
        x1, y1, x2, y2 = comp["bbox"]
        cx = (x1 + x2) / 2
        cy = (y1 + y2) / 2
        keep = comp is main or (
            keep_box[0] <= cx <= keep_box[2]
            and keep_box[1] <= cy <= keep_box[3]
        )
        if keep:
            keep_pixels.update(comp["pixels"])

    out = img.copy()
    px = out.load()
    for y in range(h):
        for x in range(w):
            if (x, y) not in keep_pixels:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)
    return out.crop(alpha_bbox(out))


def connected_components(mask: list[list[bool]]) -> list[tuple[int, int, int, int, int]]:
    h = len(mask)
    w = len(mask[0])
    seen = [[False] * w for _ in range(h)]
    comps: list[tuple[int, int, int, int, int]] = []
    for y in range(h):
        for x in range(w):
            if not mask[y][x] or seen[y][x]:
                continue
            q = deque([(x, y)])
            seen[y][x] = True
            min_x = max_x = x
            min_y = max_y = y
            count = 0
            while q:
                cx, cy = q.popleft()
                count += 1
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            if count > 900:
                comps.append((min_x, min_y, max_x + 1, max_y + 1, count))
    return comps


def extract_sources(sheet: Image.Image) -> list[Image.Image]:
    alpha_img = remove_green(sheet)
    alpha = alpha_img.getchannel("A")
    w, h = alpha_img.size
    seen = [bytearray(w) for _ in range(h)]
    comps: list[dict] = []

    for y in range(h):
        for x in range(w):
            if seen[y][x] or alpha.getpixel((x, y)) <= 18:
                continue
            q = deque([(x, y)])
            seen[y][x] = 1
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
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and alpha.getpixel((nx, ny)) > 18:
                        seen[ny][nx] = 1
                        q.append((nx, ny))
            if len(pixels) > 900:
                comps.append({
                    "pixels": pixels,
                    "bbox": (min_x, min_y, max_x + 1, max_y + 1),
                    "area": len(pixels),
                })

    comps.sort(key=lambda c: c["area"], reverse=True)
    comps = comps[:5]
    comps.sort(key=lambda c: (c["bbox"][0] + c["bbox"][2]) / 2)

    if len(comps) != 5:
        raise RuntimeError(f"expected 5 character components, found {len(comps)}")

    src_px = alpha_img.load()
    sources: list[Image.Image] = []
    for comp in comps:
        min_x, min_y, max_x, max_y = comp["bbox"]
        pad_x = 18
        pad_y = 14
        out = Image.new("RGBA", (max_x - min_x + pad_x * 2, max_y - min_y + pad_y * 2), (0, 0, 0, 0))
        out_px = out.load()
        for px, py in comp["pixels"]:
            out_px[px - min_x + pad_x, py - min_y + pad_y] = src_px[px, py]
        sources.append(out.crop(alpha_bbox(out)))
    return sources


def fit_actor(src: Image.Image, cfg: dict) -> Image.Image:
    bbox = alpha_bbox(src)
    crop = src.crop(bbox)
    scale = min(BODY_H / crop.height, MAX_BODY_W / crop.width) * cfg["scale"]
    w = max(1, round(crop.width * scale))
    h = max(1, round(crop.height * scale))
    return crop.resize((w, h), Image.Resampling.LANCZOS)


def transform_actor(
    actor: Image.Image,
    *,
    flip: bool = False,
    scale_x: float = 1.0,
    scale_y: float = 1.0,
    angle: float = 0.0,
    brightness: float = 1.0,
    contrast: float = 1.0,
) -> Image.Image:
    img = actor
    if flip:
        img = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if brightness != 1.0:
        img = ImageEnhance.Brightness(img).enhance(brightness)
    if contrast != 1.0:
        img = ImageEnhance.Contrast(img).enhance(contrast)
    if scale_x != 1.0 or scale_y != 1.0:
        img = img.resize(
            (max(1, round(img.width * scale_x)), max(1, round(img.height * scale_y))),
            Image.Resampling.LANCZOS,
        )
    if angle:
        img = img.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    return img


def paste_center_bottom(canvas: Image.Image, img: Image.Image, dx: float = 0, dy: float = 0) -> None:
    x = round((FRAME_W - img.width) / 2 + dx)
    y = round(FOOT_Y - img.height + dy)
    canvas.alpha_composite(img, (x, y))


def tinted_copy(img: Image.Image, color: tuple[int, int, int], alpha: float) -> Image.Image:
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    src = img.convert("RGBA")
    src_alpha = src.getchannel("A")
    tint_alpha = src_alpha.point(lambda a: round(a * alpha))
    out.paste((*color, 0), (0, 0, img.width, img.height))
    px = out.load()
    apx = tint_alpha.load()
    for y in range(img.height):
        for x in range(img.width):
            a = apx[x, y]
            if a:
                px[x, y] = (*color, a)
    return out


def motion_line(
    layer: Image.Image,
    points: list[tuple[float, float]],
    color: tuple[int, int, int],
    width: int,
    alpha: int,
    blur: float = 0.0,
) -> None:
    temp = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(temp, "RGBA")
    d.line(points, fill=(*color, alpha), width=width, joint="curve")
    if blur:
        temp = temp.filter(ImageFilter.GaussianBlur(blur))
    layer.alpha_composite(temp)


def attack_vector(direction: str) -> tuple[float, float]:
    if direction == "left":
        return -1, 0
    if direction == "up":
        return 0, -1
    if direction == "down":
        return 0, 1
    return 1, 0


def burst_lines(
    layer: Image.Image,
    cx: float,
    cy: float,
    color: tuple[int, int, int],
    alpha: int,
    *,
    radius: float = 24,
    rays: int = 8,
    width: int = 2,
) -> None:
    d = ImageDraw.Draw(layer, "RGBA")
    for i in range(rays):
        ang = (math.tau / rays) * i
        inner = radius * 0.32
        d.line(
            [
                cx + math.cos(ang) * inner,
                cy + math.sin(ang) * inner,
                cx + math.cos(ang) * radius,
                cy + math.sin(ang) * radius,
            ],
            fill=(*color, alpha),
            width=width,
        )


def draw_ground_shadow(layer: Image.Image, cfg: dict, scale: float = 1.0) -> None:
    d = ImageDraw.Draw(layer, "RGBA")
    cx = FRAME_W / 2
    cy = FOOT_Y - 4
    color = cfg["shadow"]
    for i, mul in enumerate((1.2, 0.86, 0.55)):
        alpha = 72 - i * 22
        rx = 30 * scale * mul
        ry = 8 * scale * mul
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(*color, alpha))


def draw_idle_effect(layer: Image.Image, cfg: dict, phase: float, power: float = 1.0) -> None:
    d = ImageDraw.Draw(layer, "RGBA")
    accent = cfg["accent"]
    effect = cfg["effect"]
    if effect == "shadow":
        for i in range(6):
            t = phase + i * 1.17
            x = FRAME_W * 0.5 + math.sin(t) * (24 + i)
            y = 98 + math.cos(t * 0.75) * 5
            d.ellipse([x - 4, y - 22, x + 5, y + 18], fill=(*accent, round(32 * power)))
    elif effect == "light":
        d.arc([30, 8, 82, 56], 200, 340, fill=(*accent, round(62 * power)), width=2)
    elif effect == "tiger":
        for i in range(3):
            y = 94 + i * 8
            d.line([24, y, 40, y - 12], fill=(*accent, round(42 * power)), width=2)
            d.line([88, y, 72, y - 12], fill=(*accent, round(42 * power)), width=2)
    elif effect == "flame":
        for i in range(5):
            x = 34 + i * 11
            y = 126 + math.sin(phase + i) * 3
            d.polygon([(x, y), (x + 4, y - 19), (x + 9, y), (x + 4, y - 8)], fill=(*accent, round(48 * power)))
    elif effect == "healer":
        d.arc([28, 10, 84, 58], 0, 360, fill=(*accent, round(50 * power)), width=2)
        d.arc([22, 62, 90, 134], 24, 156, fill=(*accent, round(44 * power)), width=2)


def draw_attack_effect(layer: Image.Image, cfg: dict, direction: str, power: float) -> None:
    d = ImageDraw.Draw(layer, "RGBA")
    accent = cfg["accent"]
    effect = cfg["effect"]
    alpha = round(170 * max(0, min(1, power)))
    if power <= 0:
        return

    vx, vy = attack_vector(direction)
    px = -vy
    py = vx
    cx = FRAME_W / 2
    cy = 82
    start_x = cx - vx * 30 - px * 10
    start_y = cy - vy * 28 - py * 10
    mid_x = cx + vx * 10
    mid_y = cy + vy * 8
    end_x = cx + vx * 42 + px * 8
    end_y = cy + vy * 38 + py * 8

    if effect == "flame":
        if direction in ("left", "right"):
            flame = [
                (start_x - vx * 3, start_y + py * 18),
                (mid_x + vx * 16 - px * 15, mid_y - py * 18),
                (end_x + vx * 14, end_y - py * 7),
                (mid_x + px * 16, mid_y + py * 22),
            ]
            d.polygon(flame, fill=(*accent, round(alpha * 0.55)))
            motion_line(layer, [(start_x, start_y + 18), (mid_x, mid_y - 18), (end_x + vx * 18, end_y - 2)], cfg["glow"], 7, alpha, 2.2)
            motion_line(layer, [(start_x, start_y + 26), (mid_x + vx * 16, mid_y + 10), (end_x + vx * 24, end_y + 10)], accent, 11, round(alpha * 0.58), 4.0)
        else:
            d.ellipse([23, 42, 89, 126], outline=(*accent, alpha), width=5)
            motion_line(layer, [(cx, cy - vy * 42), (mid_x + px * 16, mid_y), (cx, cy + vy * 46)], cfg["glow"], 8, alpha, 2.0)
        d.ellipse([end_x - 13, end_y - 13, end_x + 13, end_y + 13], fill=(*cfg["glow"], round(alpha * 0.42)))
        d.ellipse([end_x - 8, end_y - 8, end_x + 8, end_y + 8], fill=(255, 238, 138, round(alpha * 0.65)))
        for i in range(9):
            sx = mid_x + vx * (i * 6 - 8) + math.sin(i * 1.6) * 12
            sy = mid_y + vy * (i * 5 - 8) + math.cos(i * 1.7) * 17
            d.polygon([(sx, sy), (sx + 3, sy - 12), (sx + 8, sy), (sx + 4, sy - 5)], fill=(*cfg["glow"], round(alpha * 0.58)))
    elif effect == "tiger":
        if direction in ("left", "right"):
            for i, off in enumerate((-16, -5, 6, 17)):
                a = round(alpha * (0.92 - i * 0.08))
                motion_line(
                    layer,
                    [
                        (start_x - px * off, start_y - py * off),
                        (mid_x + vx * 16 - px * (off * 0.4), mid_y + py * (off * 0.4)),
                        (end_x + vx * 10 + px * off, end_y + py * off),
                    ],
                    cfg["glow"],
                    4,
                    a,
                    0.7,
                )
            d.ellipse([end_x - 18, end_y - 18, end_x + 18, end_y + 18], outline=(*accent, alpha), width=4)
            burst_lines(layer, end_x, end_y, cfg["glow"], round(alpha * 0.65), radius=23, rays=9, width=2)
        else:
            for off in (-18, -6, 6, 18):
                motion_line(
                    layer,
                    [
                        (cx + off, cy - vy * 46),
                        (cx + off * 0.35 + vx * 10, cy),
                        (cx - off * 0.2, cy + vy * 46),
                    ],
                    cfg["glow"],
                    4,
                    round(alpha * 0.86),
                    0.7,
                )
            d.ellipse([24, 78, 88, 126], outline=(*accent, round(alpha * 0.72)), width=4)
            burst_lines(layer, cx, 103, cfg["glow"], round(alpha * 0.5), radius=23, rays=8, width=2)
    elif effect == "healer":
        d.ellipse([20, 38, 96, 116], outline=(*accent, round(alpha * 0.72)), width=4)
        d.ellipse([34, 52, 82, 100], outline=(*cfg["glow"], round(alpha * 0.55)), width=2)
        for ang in (0, 60, 120):
            r = math.radians(ang)
            x1 = cx + math.cos(r) * 27
            y1 = cy + math.sin(r) * 27
            x2 = cx - math.cos(r) * 27
            y2 = cy - math.sin(r) * 27
            d.line([x1, y1, x2, y2], fill=(*cfg["glow"], round(alpha * 0.55)), width=2)
        d.line([cx - 28, cy, cx + 28, cy], fill=(*cfg["glow"], round(alpha * 0.72)), width=3)
        d.line([cx, cy - 28, cx, cy + 28], fill=(*cfg["glow"], round(alpha * 0.72)), width=3)
        motion_line(layer, [(start_x, start_y), (mid_x + px * 16, mid_y + py * 16), (end_x, end_y)], (236, 255, 191), 5, round(alpha * 0.82), 1.4)
        d.ellipse([end_x - 10, end_y - 10, end_x + 10, end_y + 10], fill=(*cfg["glow"], round(alpha * 0.45)))
    elif effect == "light":
        for off, width, mul in ((-14, 6, 0.55), (0, 5, 0.95), (14, 3, 0.64)):
            motion_line(
                layer,
                [
                    (start_x - px * off, start_y - py * off),
                    (mid_x + vx * 15 + px * off * 0.4, mid_y + vy * 12 + py * off * 0.4),
                    (end_x + vx * 18 + px * off, end_y + vy * 8 + py * off),
                ],
                cfg["glow"] if off else (255, 255, 236),
                width,
                round(alpha * mul),
                1.0 if off else 0.55,
            )
        d.arc([14, 28, 100, 116], 205, 332, fill=(*accent, round(alpha * 0.7)), width=3)
        burst_lines(layer, end_x, end_y, (255, 255, 236), round(alpha * 0.5), radius=20, rays=8, width=2)
    else:
        motion_line(layer, [(start_x, start_y), (mid_x, mid_y), (end_x, end_y)], accent, 6, alpha, 1.2)
        motion_line(layer, [(start_x, start_y), (mid_x, mid_y), (end_x, end_y)], cfg["glow"], 3, round(alpha * 0.45), 0.6)


def render_frame(actor: Image.Image, cfg: dict, name: str) -> Image.Image:
    canvas = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    back = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))

    direction = "right"
    frame_idx = 0
    if name.startswith("walk_"):
        _, direction, idx = name.split("_")
        frame_idx = int(idx)
    elif name.startswith("attack_"):
        parts = name.split("_")
        if len(parts) == 3:
            direction = parts[1]
            frame_idx = int(parts[2])
        else:
            frame_idx = int(parts[1])
    elif name.startswith("idle_") or name.startswith("hit_"):
        frame_idx = int(name.split("_")[-1])

    draw_ground_shadow(back, cfg, 1.08 if cfg["effect"] == "tiger" else 1.0)
    draw_idle_effect(back, cfg, frame_idx * 0.8, 0.9)
    canvas.alpha_composite(back)

    flip = direction == "right"
    brightness = 0.88 if direction == "up" else 1.0
    contrast = 1.04
    dx = 0
    dy = 0
    angle = 0.0
    scale_x = 1.0
    scale_y = 1.0

    if name.startswith("idle_"):
        breath = math.sin(frame_idx * math.pi / 2)
        dy = -1.2 * max(0, breath)
        scale_x = 1 - breath * 0.006
        scale_y = 1 + breath * 0.01
        angle = [-0.5, 0.2, 0.5, -0.2][frame_idx % 4]
    elif name.startswith("walk_"):
        phases = [
            (0, 0, -2.6, 1.018, 0.99),
            (2, -2, 3.2, 0.99, 1.028),
            (0, 0, 2.6, 1.018, 0.99),
            (-2, -2, -3.2, 0.99, 1.028),
        ]
        dx, dy, angle, scale_x, scale_y = phases[frame_idx % 4]
        if direction == "left":
            flip = False
            dx = -dx - 2
            angle = -angle
        elif direction == "right":
            dx = dx + 2
        else:
            flip = False
            angle *= 0.45
            dx *= 0.35
            if direction == "up":
                dy -= 1
    elif name.startswith("attack_"):
        if cfg["effect"] == "light":
            specs = [
                (-7, 0, -10, 1.02, 0.99, 0.04),
                (3, -2, 8, 0.98, 1.03, 0.32),
                (12, -4, 17, 1.04, 0.97, 0.92),
                (17, -3, 12, 1.06, 0.96, 1.00),
                (7, -1, -4, 1.02, 0.99, 0.48),
                (0, 0, 0, 1.0, 1.0, 0.05),
            ]
        elif cfg["effect"] == "tiger":
            specs = [
                (-6, 1, -6, 1.08, 0.94, 0.04),
                (4, -4, 8, 0.94, 1.07, 0.36),
                (14, -5, 17, 1.12, 0.90, 0.96),
                (18, -2, 7, 1.17, 0.87, 1.00),
                (6, 1, -5, 1.06, 0.95, 0.44),
                (0, 0, 0, 1.0, 1.0, 0.05),
            ]
        elif cfg["effect"] == "flame":
            specs = [
                (-3, 0, -4, 1.01, 1.0, 0.06),
                (1, -4, 6, 0.98, 1.03, 0.42),
                (5, -7, -9, 1.02, 0.99, 0.88),
                (8, -7, -13, 1.04, 0.97, 1.00),
                (3, -3, 5, 1.01, 1.0, 0.52),
                (0, 0, 0, 1.0, 1.0, 0.06),
            ]
        elif cfg["effect"] == "healer":
            specs = [
                (-2, 0, -3, 1.0, 1.0, 0.06),
                (0, -4, 4, 0.99, 1.03, 0.36),
                (4, -7, 8, 1.01, 1.01, 0.82),
                (7, -6, -7, 1.02, 0.99, 1.00),
                (2, -3, 2, 1.0, 1.01, 0.50),
                (0, 0, 0, 1.0, 1.0, 0.07),
            ]
        else:
            specs = [
                (-4, 0, -8, 1.02, 0.99, 0.05),
                (2, -2, 6, 0.99, 1.02, 0.35),
                (8, -3, 13, 1.03, 0.98, 0.86),
                (10, -2, 9, 1.04, 0.97, 1.00),
                (3, 0, -2, 1.01, 0.995, 0.46),
                (0, 0, 0, 1.0, 1.0, 0.05),
            ]
        reach, dy, angle, scale_x, scale_y, power = specs[frame_idx % 6]
        dx = reach
        if direction == "left":
            flip = False
            dx = -reach
            angle = -angle
        elif direction == "up":
            flip = False
            dy -= max(0, reach) * 0.72
            dx = 0
            angle *= 0.35
            brightness = 0.9
        elif direction == "down":
            flip = False
            dy += max(0, reach) * 0.62
            dx = 0
            angle *= 0.35
        if cfg["effect"] in ("flame", "healer"):
            brightness = max(brightness, 1.04)
            contrast = 1.08
        draw_attack_effect(canvas, cfg, direction, power)
    elif name.startswith("hit_"):
        flip = False
        dx = [-5, 1][frame_idx % 2]
        dy = [1, 0][frame_idx % 2]
        angle = [-7, 2][frame_idx % 2]
        brightness = [1.18, 0.92][frame_idx % 2]
        contrast = 1.12

    transformed = transform_actor(
        actor,
        flip=flip,
        scale_x=scale_x,
        scale_y=scale_y,
        angle=angle,
        brightness=brightness,
        contrast=contrast,
    )
    if name.startswith("attack_") and frame_idx in (1, 2, 3, 4):
        vx, vy = attack_vector(direction)
        ghost_alpha = {1: 0.07, 2: 0.16, 3: 0.13, 4: 0.07}[frame_idx]
        if cfg["effect"] == "tiger":
            ghost_alpha *= 0.78
        elif cfg["effect"] == "light":
            ghost_alpha *= 0.9
        ghost = tinted_copy(transformed, cfg["glow"], ghost_alpha).filter(ImageFilter.GaussianBlur(1.1))
        paste_center_bottom(canvas, ghost, dx - vx * (10 + frame_idx * 2), dy - vy * (7 + frame_idx * 2) + 1)
        if frame_idx in (2, 3):
            ghost2 = tinted_copy(transformed, cfg["accent"], ghost_alpha * 0.42).filter(ImageFilter.GaussianBlur(1.4))
            paste_center_bottom(canvas, ghost2, dx - vx * (18 + frame_idx * 2), dy - vy * (12 + frame_idx * 2) + 2)
    paste_center_bottom(canvas, transformed, dx, dy)

    if name.startswith("attack_"):
        top = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
        draw_attack_effect(top, cfg, direction, 0.45 if frame_idx in (2, 3) else 0.18)
        top = top.filter(ImageFilter.GaussianBlur(0.25))
        canvas.alpha_composite(top)

    return canvas


def make_portrait(src: Image.Image, cfg: dict) -> Image.Image:
    size = 256
    bg = Image.new("RGBA", (size, size), (3, 6, 14, 255))
    d = ImageDraw.Draw(bg, "RGBA")
    accent = cfg["accent"]
    glow = cfg["glow"]
    d.rectangle([0, 0, size - 1, size - 1], outline=(*accent, 185), width=4)
    for i in range(5):
        d.ellipse([18 - i * 6, 34 - i * 4, 238 + i * 6, 260 + i * 4], outline=(*glow, 28 - i * 4), width=3)
    d.rectangle([10, size - 54, size - 10, size - 10], fill=(4, 8, 18, 176))

    crop = src.crop(alpha_bbox(src))
    target_h = 224 if crop.height > crop.width * 1.2 else 206
    scale = min(target_h / crop.height, 216 / crop.width)
    actor = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.Resampling.LANCZOS)
    bg.alpha_composite(actor, ((size - actor.width) // 2, size - actor.height - 10))
    return bg


def main() -> None:
    if not SOURCE_SHEET.exists():
        raise FileNotFoundError(SOURCE_SHEET)

    sheet = Image.open(SOURCE_SHEET).convert("RGBA")
    sources = extract_sources(sheet)

    for cfg in CHARACTERS:
        source = sources[cfg["source_index"]]
        char_dir = OUT_ROOT / cfg["id"]
        motion_dir = char_dir / "motion"
        motion_dir.mkdir(parents=True, exist_ok=True)

        save_png_and_webp(source, char_dir / "source.png")
        actor = fit_actor(source, cfg)
        save_png_and_webp(make_portrait(source, cfg), char_dir / "portrait.png")

        for frame_name in FRAMES:
            frame = render_frame(actor, cfg, frame_name)
            save_png_and_webp(frame, motion_dir / f"{frame_name}.png")

        print(f"generated original asset set: {cfg['id']} ({len(FRAMES)} frames)")


if __name__ == "__main__":
    main()
