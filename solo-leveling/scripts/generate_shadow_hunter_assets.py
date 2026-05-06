from __future__ import annotations

from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

from image_formats import save_png_and_webp


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "player" / "source" / "shadow_hunter_source_alpha.png"
OUT_DIR = ROOT / "assets" / "player" / "motion"
PREVIEW = ROOT / "assets" / "player" / "player_idle.png"
SHEET = ROOT / "assets" / "player" / "player_motion_sheet.png"

FRAME_W = 112
FRAME_H = 144
BASE_BODY_H = 132
FOOT_Y = 139


def alpha_bbox(img: Image.Image) -> tuple[int, int, int, int]:
    alpha = img.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        raise RuntimeError("source image has no visible pixels")
    return bbox


def fit_source() -> Image.Image:
    src = Image.open(SRC).convert("RGBA")
    crop = src.crop(alpha_bbox(src))
    scale = BASE_BODY_H / crop.height
    w = round(crop.width * scale)
    h = round(crop.height * scale)
    return crop.resize((w, h), Image.Resampling.LANCZOS)


def tint_rgba(img: Image.Image, rgb: tuple[int, int, int], amount: float) -> Image.Image:
    base = Image.new("RGBA", img.size, (*rgb, 0))
    r, g, b, a = img.split()
    tint = Image.new("RGBA", img.size, (*rgb, 255))
    blended = Image.blend(img, tint, amount)
    blended.putalpha(a)
    return Image.alpha_composite(base, blended)


def draw_shadow(draw: ImageDraw.ImageDraw, x: float, y: float, scale: float, alpha: int = 96) -> None:
    rx = 31 * scale
    ry = 8 * scale
    for i, mul in enumerate((1.45, 1.05, 0.72)):
        a = max(0, alpha - i * 28)
        draw.ellipse(
            [x - rx * mul, y - ry * mul, x + rx * mul, y + ry * mul],
            fill=(8, 2, 26, a),
        )


def draw_wisps(layer: Image.Image, phase: float, power: float = 1.0) -> None:
    draw = ImageDraw.Draw(layer, "RGBA")
    for i in range(5):
        t = phase + i * 1.27
        x = FRAME_W * 0.5 + math.sin(t) * (23 + i * 2)
        y = 94 + i * 5 + math.cos(t * 0.7) * 3
        h = 20 + math.sin(t * 1.3) * 5
        color = (126, 55, 255, round(36 * power))
        draw.ellipse([x - 3, y - h, x + 4, y + h], fill=color)
    layer.alpha_composite(layer.filter(ImageFilter.GaussianBlur(0.3)))


def transform_actor(
    actor: Image.Image,
    *,
    flip: bool = False,
    scale_x: float = 1.0,
    scale_y: float = 1.0,
    angle: float = 0.0,
    brightness: float = 1.0,
    contrast: float = 1.0,
    tint: tuple[tuple[int, int, int], float] | None = None,
) -> Image.Image:
    img = actor
    if flip:
        img = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if brightness != 1.0:
        img = ImageEnhance.Brightness(img).enhance(brightness)
    if contrast != 1.0:
        img = ImageEnhance.Contrast(img).enhance(contrast)
    if tint:
        img = tint_rgba(img, tint[0], tint[1])
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


def render_frame(
    actor: Image.Image,
    *,
    name: str,
    flip: bool = False,
    dx: float = 0,
    dy: float = 0,
    angle: float = 0,
    scale_x: float = 1,
    scale_y: float = 1,
    shadow_scale: float = 1,
    brightness: float = 1,
    contrast: float = 1,
    tint: tuple[tuple[int, int, int], float] | None = None,
    wisp_phase: float = 0,
    wisp_power: float = 0.7,
    slash: float | None = None,
    stab_angle: float | None = None,
    stab_power: float = 0.0,
    stab_side: int = 1,
) -> Image.Image:
    canvas = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    back = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    draw_wisps(back, wisp_phase, wisp_power)
    canvas.alpha_composite(back)

    img = transform_actor(
        actor,
        flip=flip,
        scale_x=scale_x,
        scale_y=scale_y,
        angle=angle,
        brightness=brightness,
        contrast=contrast,
        tint=tint,
    )
    paste_center_bottom(canvas, img, dx, dy)

    if slash is not None:
        fx = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
        fd = ImageDraw.Draw(fx, "RGBA")
        alpha = round(150 * max(0, min(1, slash)))
        fd.arc([14, 30, 105, 120], start=214, end=330, fill=(156, 87, 255, alpha), width=7)
        fd.arc([18, 36, 101, 112], start=215, end=326, fill=(230, 224, 255, round(alpha * 0.45)), width=2)
        fx = fx.filter(ImageFilter.GaussianBlur(0.25))
        canvas.alpha_composite(fx)

    if stab_angle is not None and stab_power > 0:
        fx = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
        fd = ImageDraw.Draw(fx, "RGBA")
        p = max(0, min(1, stab_power))
        ca = math.cos(stab_angle)
        sa = math.sin(stab_angle)
        px = -sa
        py = ca
        side = 1 if stab_side >= 0 else -1

        chest_x = FRAME_W * 0.5 + ca * 4 + px * side * 8
        chest_y = 84 + sa * 8 + py * side * 8
        hand_x = FRAME_W * 0.5 + ca * (16 + 24 * p) + px * side * (10 - 4 * p)
        hand_y = 84 + sa * (16 + 24 * p) + py * side * (10 - 4 * p)
        tip_x = hand_x + ca * (20 + 16 * p)
        tip_y = hand_y + sa * (20 + 16 * p)
        blade_w = 4 + 2 * p

        fd.line([chest_x, chest_y, hand_x, hand_y], fill=(10, 5, 18, round(205 * p)), width=8)
        fd.line([chest_x, chest_y, hand_x, hand_y], fill=(55, 34, 86, round(160 * p)), width=4)
        fd.line([hand_x, hand_y, tip_x, tip_y], fill=(238, 234, 255, round(235 * p)), width=round(blade_w))
        fd.line([hand_x - px * 5, hand_y - py * 5, hand_x + px * 5, hand_y + py * 5],
                fill=(156, 87, 255, round(210 * p)), width=4)
        fd.line([tip_x - ca * 42, tip_y - sa * 42, tip_x, tip_y],
                fill=(150, 86, 255, round(90 * p)), width=3)
        fd.ellipse([tip_x - 5, tip_y - 5, tip_x + 5, tip_y + 5], fill=(205, 170, 255, round(72 * p)))
        fx = fx.filter(ImageFilter.GaussianBlur(0.18))
        canvas.alpha_composite(fx)

    out = OUT_DIR / f"{name}.png"
    save_png_and_webp(canvas, out)
    return canvas


def build_sheet(frames: list[Image.Image]) -> None:
    cols = 8
    rows = math.ceil(len(frames) / cols)
    sheet = Image.new("RGBA", (FRAME_W * cols, FRAME_H * rows), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        x = (i % cols) * FRAME_W
        y = (i // cols) * FRAME_H
        sheet.alpha_composite(frame, (x, y))
    save_png_and_webp(sheet, SHEET)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    actor = fit_source()
    frames: list[Image.Image] = []

    idle_specs = [
        dict(dy=0, angle=-0.6, scale_x=1.00, scale_y=1.000, wisp_phase=0.0),
        dict(dy=-1, angle=0.2, scale_x=0.996, scale_y=1.010, wisp_phase=0.7),
        dict(dy=-2, angle=0.5, scale_x=0.992, scale_y=1.016, wisp_phase=1.4),
        dict(dy=-1, angle=-0.2, scale_x=0.996, scale_y=1.010, wisp_phase=2.1),
    ]
    for i, spec in enumerate(idle_specs):
        frames.append(render_frame(actor, name=f"player_idle_{i}", **spec))

    walk_phases = [
        (0, 0, -2.5, 1.018, 0.990),
        (2, -2, 3.2, 0.990, 1.028),
        (0, 0, 2.5, 1.018, 0.990),
        (-2, -2, -3.2, 0.990, 1.028),
    ]
    for direction in ("down", "right", "up", "left"):
        for i, (dx, dy, ang, sx, sy) in enumerate(walk_phases):
            flip = direction == "right"
            side = 1 if direction == "right" else -1 if direction == "left" else 0
            darken = 0.88 if direction == "up" else 1.0
            direction_dx = dx + side * 3
            direction_angle = ang + side * 3
            if direction in ("down", "up"):
                direction_angle = ang * 0.45
            frames.append(
                render_frame(
                    actor,
                    name=f"player_walk_{direction}_{i}",
                    flip=flip,
                    dx=direction_dx,
                    dy=dy,
                    angle=direction_angle,
                    scale_x=sx,
                    scale_y=sy,
                    brightness=darken,
                    contrast=1.05,
                    wisp_phase=i * 0.9 + side,
                    wisp_power=0.95,
                    shadow_scale=1.04,
                )
            )

    attack_specs = [
        dict(dx=-4, dy=0, angle=-8, scale_x=1.02, scale_y=0.99, slash=0.0),
        dict(dx=2, dy=-2, angle=7, scale_x=0.99, scale_y=1.02, slash=0.45),
        dict(dx=8, dy=-3, angle=13, scale_x=1.02, scale_y=0.98, slash=0.9),
        dict(dx=7, dy=-2, angle=8, scale_x=1.01, scale_y=0.99, slash=0.65),
        dict(dx=1, dy=0, angle=-3, scale_x=1.00, scale_y=1.00, slash=0.25),
        dict(dx=0, dy=0, angle=0, scale_x=1.00, scale_y=1.00, slash=0.0),
    ]
    for i, spec in enumerate(attack_specs):
        frames.append(render_frame(actor, name=f"player_attack_{i}", wisp_phase=i, wisp_power=1.15, **spec))

    directional_attack_specs = [
        dict(reach=0.10, dx=-3, dy=0, angle=-7, scale_x=1.01, scale_y=1.00),
        dict(reach=0.34, dx=2, dy=-2, angle=5, scale_x=0.995, scale_y=1.018),
        dict(reach=0.88, dx=8, dy=-3, angle=12, scale_x=1.035, scale_y=0.975),
        dict(reach=1.00, dx=10, dy=-2, angle=9, scale_x=1.045, scale_y=0.970),
        dict(reach=0.46, dx=3, dy=0, angle=-2, scale_x=1.010, scale_y=0.995),
        dict(reach=0.05, dx=0, dy=0, angle=0, scale_x=1.000, scale_y=1.000),
    ]
    attack_dirs = {
        "right": dict(stab_angle=0, flip=True, side=1, dx_mul=1, dy_mul=0, brightness=1.0),
        "left": dict(stab_angle=math.pi, flip=False, side=-1, dx_mul=-1, dy_mul=0, brightness=1.0),
        "down": dict(stab_angle=math.pi / 2, flip=False, side=1, dx_mul=0, dy_mul=1, brightness=1.0),
        "up": dict(stab_angle=-math.pi / 2, flip=False, side=-1, dx_mul=0, dy_mul=-1, brightness=0.88),
    }
    for direction, cfg in attack_dirs.items():
        for i, spec in enumerate(directional_attack_specs):
            reach = spec["reach"]
            dx = spec["dx"] * cfg["dx_mul"]
            dy = spec["dy"] + spec["dx"] * 0.35 * cfg["dy_mul"]
            if direction in ("up", "down"):
                angle = spec["angle"] * 0.35
                scale_x = spec["scale_x"] * (1 + reach * 0.012)
                scale_y = spec["scale_y"] * (1 - reach * 0.018)
            else:
                angle = spec["angle"] * cfg["dx_mul"]
                scale_x = spec["scale_x"]
                scale_y = spec["scale_y"]
            frames.append(render_frame(
                actor,
                name=f"player_attack_{direction}_{i}",
                flip=cfg["flip"],
                dx=dx,
                dy=dy,
                angle=angle,
                scale_x=scale_x,
                scale_y=scale_y,
                brightness=cfg["brightness"],
                contrast=1.08,
                wisp_phase=i * 0.75 + reach,
                wisp_power=1.2,
                shadow_scale=1.08,
            ))

    hit_specs = [
        dict(dx=-5, dy=1, angle=-7, tint=((255, 90, 90), 0.25), brightness=1.2, contrast=1.12),
        dict(dx=1, dy=0, angle=2, tint=((120, 170, 255), 0.08), brightness=0.92, contrast=1.0),
    ]
    for i, spec in enumerate(hit_specs):
        frames.append(render_frame(actor, name=f"player_hit_{i}", wisp_phase=3 + i, wisp_power=0.5, **spec))

    save_png_and_webp(frames[0], PREVIEW)
    build_sheet(frames)
    print(f"Generated {len(frames)} frames at {OUT_DIR}")


if __name__ == "__main__":
    main()
