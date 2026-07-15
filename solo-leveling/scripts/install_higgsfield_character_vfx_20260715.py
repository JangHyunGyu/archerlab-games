from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat

from build_character_motion_v2 import remove_green_chroma
ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "effects" / "source"
SKILL_DIR = ROOT / "assets" / "effects" / "character_skills"
BASIC_DIR = ROOT / "assets" / "effects" / "basic_attacks"
CANVAS_SIZE = 512
CONTENT_SIZE = 472
FRAME_COUNT = 6


def save_effect_pair(image: Image.Image, png_path: Path) -> None:
    """Save many VFX frames quickly while keeping the runtime WebP lossless."""

    png_path.parent.mkdir(parents=True, exist_ok=True)
    frame = image.convert("RGBA")
    frame.save(png_path, "PNG", compress_level=6)
    frame.save(png_path.with_suffix(".webp"), "WEBP", lossless=True, quality=100, method=3)

HIGGSFIELD_TARGETS = {
    "higgsfield_20260715_rulers_authority_chromakey.png": ("rulers_authority", True),
    "higgsfield_20260715_dragon_fear_chromakey.png": ("dragon_fear", True),
    "higgsfield_20260715_light_lance_pierce_chromakey.png": ("light_lance_pierce", False),
    "higgsfield_20260715_tiger_fang_combo_chromakey.png": ("tiger_fang_combo", False),
    "higgsfield_20260715_tiger_rend_chromakey.png": ("tiger_rend", False),
    "higgsfield_20260715_tiger_quake_chromakey.png": ("tiger_quake", False),
    "higgsfield_20260715_tiger_guard_chromakey.png": ("tiger_guard", False),
}

SKILL_EFFECT_KINDS = {
    "shadow_dagger": "projectile",
    "shadow_slash": "slash",
    "rulers_authority": "burst",
    "dragon_fear": "aura",
    "light_lance_pierce": "projectile",
    "light_crescent": "slash",
    "light_judgment": "burst",
    "light_sanctum": "aura",
    "tiger_fang_combo": "slash",
    "tiger_rend": "slash",
    "tiger_quake": "burst",
    "tiger_guard": "aura",
    "flame_bolt": "projectile",
    "flame_arc": "slash",
    "flame_meteor": "burst",
    "flame_inferno": "aura",
    "sanctuary_pulse": "projectile",
    "sanctuary_arc": "slash",
    "sanctuary_seal": "burst",
    "sanctuary_field": "aura",
}

BASIC_EFFECT_KINDS = {
    "shadow_dagger_slash": "slash",
    "light_sword_slash": "slash",
    "tiger_claw_swipe": "slash",
    "flame_fireball": "projectile",
    "sanctuary_mace_slam": "burst",
}

FRAME_PROFILES = {
    "slash": (
        (0.64, 0.34, 0.30),
        (0.80, 0.68, 0.58),
        (0.94, 0.92, 0.84),
        (1.00, 1.00, 1.00),
        (1.07, 0.72, 1.00),
        (1.13, 0.34, 1.00),
    ),
    "burst": (
        (0.45, 0.28, 0.34),
        (0.66, 0.62, 0.58),
        (0.86, 0.90, 0.82),
        (1.00, 1.00, 1.00),
        (1.09, 0.74, 1.00),
        (1.17, 0.30, 1.00),
    ),
    "aura": (
        (0.64, 0.30, 1.00),
        (0.80, 0.60, 1.00),
        (0.94, 0.88, 1.00),
        (1.00, 1.00, 1.00),
        (1.08, 0.70, 1.00),
        (1.16, 0.28, 1.00),
    ),
    "projectile": (
        (0.82, 0.62, 1.00),
        (0.91, 0.82, 1.00),
        (0.98, 1.00, 1.00),
        (1.04, 0.94, 1.00),
        (0.98, 0.82, 1.00),
        (0.90, 0.66, 1.00),
    ),
}


def grade_shadow_palette(image: Image.Image) -> Image.Image:
    """Move chroma-reflected cyan/red edges back into the violet shadow palette."""

    rgba = image.convert("RGBA")
    graded: list[tuple[int, int, int, int]] = []
    for red, green, blue, alpha in rgba.get_flattened_data():
        if alpha > 3 and blue > red * 1.15 and green > red * 1.15:
            highlight = max(green, blue)
            red = max(red, round(highlight * 0.72))
            green = min(green, round(highlight * 0.68))
        elif alpha > 3 and red > blue * 1.35 and red > green * 1.25:
            highlight = red
            red = round(highlight * 0.72)
            green = min(green, round(highlight * 0.45))
            blue = max(blue, highlight)
        graded.append((red, green, blue, alpha))
    rgba.putdata(graded)
    return rgba


def normalize_higgsfield_asset(source: Image.Image, shadow_palette: bool) -> tuple[Image.Image, float, float]:
    clean, removed_ratio, residual_ratio = remove_green_chroma(source)
    if shadow_palette:
        clean = grade_shadow_palette(clean)

    bbox = clean.getchannel("A").getbbox()
    if not bbox:
        raise ValueError("chroma removal produced an empty effect")

    content = clean.crop(bbox)
    scale = min(CONTENT_SIZE / content.width, CONTENT_SIZE / content.height)
    size = (
        max(1, round(content.width * scale)),
        max(1, round(content.height * scale)),
    )
    content = content.resize(size, Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    offset = ((CANVAS_SIZE - size[0]) // 2, (CANVAS_SIZE - size[1]) // 2)
    canvas.alpha_composite(content, offset)
    return canvas, removed_ratio, residual_ratio


def dominant_glow_color(image: Image.Image) -> tuple[int, int, int]:
    alpha = image.getchannel("A")
    stats = ImageStat.Stat(image.convert("RGB"), mask=alpha)
    means = stats.mean[:3]
    peak = max(means) or 1
    return tuple(min(255, round(value / peak * 255)) for value in means)


def scaled_on_canvas(image: Image.Image, scale: float) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        return Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    content = image.crop(bbox)
    size = (
        max(1, round(content.width * scale)),
        max(1, round(content.height * scale)),
    )
    content = content.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    offset = ((CANVAS_SIZE - size[0]) // 2, (CANVAS_SIZE - size[1]) // 2)
    canvas.alpha_composite(content, offset)
    return canvas


def reveal_mask(image: Image.Image, kind: str, amount: float) -> Image.Image:
    mask = Image.new("L", image.size, 0)
    if amount >= 0.999 or kind in {"aura", "projectile"}:
        return Image.new("L", image.size, 255)

    bbox = image.getchannel("A").getbbox() or (0, 0, image.width, image.height)
    left, top, right, bottom = bbox
    draw = ImageDraw.Draw(mask)
    if kind == "slash":
        reveal_right = left + round((right - left) * amount)
        feather = max(10, round((right - left) * 0.08))
        draw.rectangle((left - feather, top - feather, reveal_right, bottom + feather), fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    else:
        cx = (left + right) / 2
        cy = (top + bottom) / 2
        half_w = max(8, (right - left) * amount / 2)
        half_h = max(8, (bottom - top) * amount / 2)
        draw.ellipse((cx - half_w, cy - half_h, cx + half_w, cy + half_h), fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(max(8, round(min(half_w, half_h) * 0.14))))
    return mask


def render_animation_frame(source: Image.Image, kind: str, frame_index: int) -> Image.Image:
    scale, opacity, reveal = FRAME_PROFILES[kind][frame_index]
    frame = scaled_on_canvas(source, scale)
    alpha = frame.getchannel("A")
    alpha = ImageChops.multiply(alpha, reveal_mask(frame, kind, reveal))

    if frame_index == FRAME_COUNT - 1 and kind != "projectile":
        eroded = alpha.filter(ImageFilter.MinFilter(9))
        edge = ImageChops.subtract(alpha, eroded)
        faint_body = alpha.point(lambda value: round(value * 0.28))
        alpha = ImageChops.lighter(edge, faint_body)

    alpha = alpha.point(lambda value: min(255, round(value * opacity)))
    frame.putalpha(alpha)

    glow_color = dominant_glow_color(source)
    glow_alpha = alpha.filter(ImageFilter.GaussianBlur(10 if frame_index < 3 else 6))
    glow_strength = 0.34 if frame_index < 3 else 0.20
    glow_alpha = glow_alpha.point(lambda value: round(value * glow_strength))
    glow = Image.new("RGBA", frame.size, (*glow_color, 0))
    glow.putalpha(glow_alpha)

    output = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    output.alpha_composite(glow)
    output.alpha_composite(frame)
    return output


def install_higgsfield_assets() -> list[str]:
    failures: list[str] = []
    for source_name, (output_name, shadow_palette) in HIGGSFIELD_TARGETS.items():
        source_path = SOURCE_DIR / source_name
        if not source_path.is_file():
            failures.append(f"missing source: {source_path}")
            continue

        output, removed_ratio, residual_ratio = normalize_higgsfield_asset(
            Image.open(source_path),
            shadow_palette,
        )
        save_effect_pair(output, SKILL_DIR / f"{output_name}.png")
        print(
            f"installed {output_name}: alpha={output.getchannel('A').getbbox()}, "
            f"chroma_removed={removed_ratio:.1%}, green_residue={residual_ratio:.2%}"
        )
    return failures


def build_sequence(source_dir: Path, effect_name: str, kind: str) -> str | None:
    source_path = source_dir / f"{effect_name}.png"
    if not source_path.is_file():
        return f"missing peak frame: {source_path}"

    source = Image.open(source_path).convert("RGBA")
    frames_dir = source_dir / "frames"
    for frame_index in range(FRAME_COUNT):
        frame = render_animation_frame(source, kind, frame_index)
        if frame.size != (CANVAS_SIZE, CANVAS_SIZE):
            raise ValueError(f"unexpected frame size for {effect_name}_{frame_index}: {frame.size}")
        save_effect_pair(frame, frames_dir / f"{effect_name}_{frame_index}.png")
    print(f"animated {effect_name}: {FRAME_COUNT} frames ({kind})")
    return None


def main() -> int:
    failures = install_higgsfield_assets()
    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1

    for effect_name, kind in SKILL_EFFECT_KINDS.items():
        failure = build_sequence(SKILL_DIR, effect_name, kind)
        if failure:
            failures.append(failure)
    for effect_name, kind in BASIC_EFFECT_KINDS.items():
        failure = build_sequence(BASIC_DIR, effect_name, kind)
        if failure:
            failures.append(failure)

    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1
    print(f"installed {len(HIGGSFIELD_TARGETS)} Higgsfield peaks and {len(SKILL_EFFECT_KINDS) + len(BASIC_EFFECT_KINDS)} six-frame sequences")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
