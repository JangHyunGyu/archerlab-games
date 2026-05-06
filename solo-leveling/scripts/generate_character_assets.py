from __future__ import annotations

from collections import deque
from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


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

    if direction == "left":
        arc_box = [2, 28, 96, 126]
        start, end = 208, 332
    elif direction == "up":
        arc_box = [16, 4, 102, 100]
        start, end = 46, 166
    elif direction == "down":
        arc_box = [12, 44, 106, 138]
        start, end = 206, 326
    else:
        arc_box = [16, 28, 110, 126]
        start, end = 208, 332

    if effect == "flame":
        d.ellipse([16, 34, 104, 122], outline=(*accent, alpha), width=5)
        d.ellipse([30, 48, 90, 108], outline=(*cfg["glow"], round(alpha * 0.65)), width=3)
    elif effect == "tiger":
        for i in range(3):
            y = 54 + i * 13
            d.arc([36, y - 30, 120, y + 28], 190, 250, fill=(*accent, alpha), width=4)
    elif effect == "healer":
        d.ellipse([22, 38, 94, 116], outline=(*accent, round(alpha * 0.75)), width=4)
        d.arc([28, 20, 84, 78], 0, 360, fill=(*cfg["glow"], round(alpha * 0.42)), width=2)
    elif effect == "light":
        d.arc(arc_box, start, end, fill=(*cfg["glow"], alpha), width=5)
        d.line([24, 80, 98, 38], fill=(255, 255, 236, round(alpha * 0.75)), width=2)
    else:
        d.arc(arc_box, start, end, fill=(*accent, alpha), width=6)
        d.arc([arc_box[0] + 6, arc_box[1] + 6, arc_box[2] - 6, arc_box[3] - 6], start, end, fill=(*cfg["glow"], round(alpha * 0.42)), width=2)


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
        specs = [
            (-4, 0, -8, 1.02, 0.99, 0.05),
            (2, -2, 6, 0.99, 1.02, 0.35),
            (8, -3, 13, 1.03, 0.98, 0.86),
            (10, -2, 9, 1.04, 0.97, 1.00),
            (3, 0, -2, 1.01, 0.995, 0.46),
            (0, 0, 0, 1.0, 1.0, 0.05),
        ]
        dx, dy, angle, scale_x, scale_y, power = specs[frame_idx % 6]
        if direction == "left":
            flip = False
            dx = -dx
            angle = -angle
        elif direction == "up":
            flip = False
            dy -= abs(dx) * 0.35
            dx *= 0.2
            angle *= 0.35
            brightness = 0.9
        elif direction == "down":
            flip = False
            dy += abs(dx) * 0.28
            dx *= 0.2
            angle *= 0.35
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

        source.save(char_dir / "source.png")
        actor = fit_actor(source, cfg)
        make_portrait(source, cfg).save(char_dir / "portrait.png")

        for frame_name in FRAMES:
            frame = render_frame(actor, cfg, frame_name)
            frame.save(motion_dir / f"{frame_name}.png")

        print(f"generated original asset set: {cfg['id']} ({len(FRAMES)} frames)")


if __name__ == "__main__":
    main()
