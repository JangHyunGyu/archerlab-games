from __future__ import annotations

import math
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "effects" / "source" / "higgsfield_20260716"
SKILL_DIR = ROOT / "assets" / "effects" / "character_skills"
BASIC_DIR = ROOT / "assets" / "effects" / "basic_attacks"
ICON_DIR = ROOT / "assets" / "ui" / "icons"
CANVAS_SIZE = 512
CONTENT_SIZE = 472
ICON_SIZE = 128
FRAME_COUNT = 6

STYLE_FORMULA = (
    "High-detail semi-realistic painterly anime action-RPG VFX with physically convincing "
    "energy, smoke, sparks, embers, pressure distortion, and textured luminous cores; never "
    "flat vector art or symbolic emblems. Shapes use crisp directional silhouettes, tapered "
    "motion trails, layered particles, restrained fine detail, and no heavy outlines. Shadow "
    "is violet-black, light ivory-gold with pale teal, tiger icy white-blue with restrained "
    "violet, flame orange-red, sanctuary mint-white with subtle gold. Cinematic dark-dungeon "
    "lighting, high foreground contrast, consistent top-down three-quarter perspective, "
    "readable at 64–128 pixels."
)


@dataclass(frozen=True)
class EffectTarget:
    name: str
    family: str
    kind: str
    icon: str
    basic: bool
    key: tuple[int, int, int]


GREEN = (0, 255, 0)
MAGENTA = (255, 0, 255)

TARGETS = (
    EffectTarget("shadow_dagger_slash", "shadow", "thrust", "basicDagger", True, GREEN),
    EffectTarget("shadow_dagger", "shadow", "projectile", "shadowDagger", False, GREEN),
    EffectTarget("shadow_slash", "shadow", "slash", "shadowSlash", False, GREEN),
    EffectTarget("rulers_authority", "shadow", "burst", "rulersAuthority", False, GREEN),
    EffectTarget("dragon_fear", "shadow", "aura", "dragonFear", False, GREEN),
    EffectTarget("light_sword_slash", "light", "slash", "lightPierce", True, MAGENTA),
    EffectTarget("light_lance_pierce", "light", "projectile", "lightLance", False, MAGENTA),
    EffectTarget("light_crescent", "light", "slash", "lightCrescent", False, MAGENTA),
    EffectTarget("light_judgment", "light", "burst", "lightJudgment", False, MAGENTA),
    EffectTarget("light_sanctum", "light", "aura", "lightSanctum", False, MAGENTA),
    EffectTarget("tiger_claw_swipe", "tiger", "slash", "tigerPalm", True, GREEN),
    EffectTarget("tiger_fang_combo", "tiger", "slash", "tigerFang", False, GREEN),
    EffectTarget("tiger_rend", "tiger", "slash", "tigerRend", False, GREEN),
    EffectTarget("tiger_quake", "tiger", "burst", "tigerQuake", False, GREEN),
    EffectTarget("tiger_guard", "tiger", "aura", "tigerGuard", False, GREEN),
    EffectTarget("flame_fireball", "flame", "projectile", "flameSpark", True, MAGENTA),
    EffectTarget("flame_bolt", "flame", "projectile", "flameBolt", False, MAGENTA),
    EffectTarget("flame_arc", "flame", "slash", "flameArc", False, MAGENTA),
    EffectTarget("flame_meteor", "flame", "burst", "flameMeteor", False, MAGENTA),
    EffectTarget("flame_inferno", "flame", "aura", "flameInferno", False, MAGENTA),
    EffectTarget("sanctuary_mace_slam", "sanctuary", "burst", "sanctuaryStrike", True, MAGENTA),
    EffectTarget("sanctuary_pulse", "sanctuary", "projectile", "sanctuaryOrb", False, MAGENTA),
    EffectTarget("sanctuary_arc", "sanctuary", "slash", "sanctuaryArc", False, MAGENTA),
    EffectTarget("sanctuary_seal", "sanctuary", "burst", "sanctuarySeal", False, MAGENTA),
    EffectTarget("sanctuary_field", "sanctuary", "aura", "sanctuaryField", False, MAGENTA),
)

FAMILY_COLORS = {
    "shadow": (158, 82, 255),
    "light": (255, 218, 104),
    "tiger": (160, 230, 255),
    "flame": (255, 104, 42),
    "sanctuary": (100, 238, 180),
}

PEAK_CONTENT_SIZES = {
    "shadow_dagger_slash": 340,
    "shadow_dagger": 400,
    "light_sword_slash": 300,
    "light_lance_pierce": 440,
    "tiger_claw_swipe": 340,
    "flame_fireball": 180,
    "flame_bolt": 440,
    "sanctuary_mace_slam": 320,
    "sanctuary_pulse": 420,
}

STAGE_PROFILES = {
    "thrust": (
        (0.72, 0.30, 0.24, -14, 0),
        (0.84, 0.62, 0.52, -8, 0),
        (0.94, 0.88, 0.82, -3, 0),
        (1.00, 1.00, 1.00, 0, 0),
        (1.06, 0.66, 1.00, 4, 0),
        (1.12, 0.30, 1.00, 8, 0),
    ),
    "slash": (
        (0.72, 0.30, 0.22, -14, 4),
        (0.84, 0.62, 0.50, -8, 2),
        (0.94, 0.88, 0.80, -3, 1),
        (1.00, 1.00, 1.00, 0, 0),
        (1.06, 0.66, 1.00, 4, -1),
        (1.12, 0.30, 1.00, 8, -2),
    ),
    "projectile": (
        (0.78, 0.34, 0.28, -14, 0),
        (0.88, 0.66, 0.52, -8, 0),
        (0.96, 0.90, 0.78, -3, 0),
        (1.00, 1.00, 1.00, 0, 0),
        (1.04, 0.70, 1.00, 4, 0),
        (1.08, 0.32, 1.00, 8, 0),
    ),
    "burst": (
        (0.46, 0.28, 0.30, 0, 0),
        (0.66, 0.60, 0.58, 0, 0),
        (0.86, 0.88, 0.84, 0, 0),
        (1.00, 1.00, 1.00, 0, 0),
        (1.09, 0.68, 1.00, 0, 0),
        (1.18, 0.28, 1.00, 0, 0),
    ),
    "aura": (
        (0.62, 0.28, 0.32, 0, 0),
        (0.78, 0.58, 0.60, 0, 0),
        (0.92, 0.86, 0.84, 0, 0),
        (1.00, 1.00, 1.00, 0, 0),
        (1.07, 0.66, 1.00, 0, 0),
        (1.14, 0.26, 1.00, 0, 0),
    ),
}


def clamp_byte(value: float) -> int:
    return max(0, min(255, round(value)))


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if value <= edge0:
        return 0.0
    if value >= edge1:
        return 1.0
    position = (value - edge0) / (edge1 - edge0)
    return position * position * (3.0 - 2.0 * position)


def remove_chroma(image: Image.Image, key: tuple[int, int, int]) -> tuple[Image.Image, float, float]:
    """Recover alpha from a flat key while undoing edge-color contamination."""

    rgba = image.convert("RGBA")
    pixels = list(rgba.get_flattened_data())
    output: list[tuple[int, int, int, int]] = []
    removed = 0
    visible = 0
    residual = 0

    for red, green, blue, source_alpha in pixels:
        if source_alpha <= 3:
            output.append((0, 0, 0, 0))
            continue

        distance = math.sqrt(
            (red - key[0]) ** 2 + (green - key[1]) ** 2 + (blue - key[2]) ** 2
        )
        # Keep the matte broad enough to absorb antialiased key-color spill.
        # The five families deliberately avoid their assigned key color, so a
        # wide transition preserves fine sparks while removing green/magenta
        # halos that become obvious against the dark dungeon floor.
        matte = smoothstep(10.0, 245.0, distance)
        alpha = clamp_byte(source_alpha * matte)
        if alpha <= 3:
            removed += 1
            output.append((0, 0, 0, 0))
            continue

        # Reverse the flat key contribution on antialiased and translucent edges.
        if matte < 0.985:
            safe = max(0.08, matte)
            red = clamp_byte((red - (1.0 - matte) * key[0]) / safe)
            green = clamp_byte((green - (1.0 - matte) * key[1]) / safe)
            blue = clamp_byte((blue - (1.0 - matte) * key[2]) / safe)

        if key == GREEN and green > max(red, blue) + 22:
            residual += 1
        elif key == MAGENTA and min(red, blue) > green + 40 and matte < 0.75:
            residual += 1

        visible += 1
        output.append((red, green, blue, alpha))

    rgba.putdata(output)
    alpha = rgba.getchannel("A").point(lambda value: 0 if value <= 3 else value)
    rgba.putalpha(alpha)
    source_visible = max(1, sum(1 for *_, alpha_value in pixels if alpha_value > 3))
    return rgba, removed / source_visible, residual / max(1, visible)


def meaningful_bbox(image: Image.Image, threshold: int = 12) -> tuple[int, int, int, int] | None:
    alpha = image.getchannel("A")
    solid = alpha.point(lambda value: 255 if value >= threshold else 0)
    return solid.getbbox() or alpha.getbbox()


def normalize_effect(image: Image.Image, content_size: int = CONTENT_SIZE) -> Image.Image:
    rgba = image.convert("RGBA")
    bbox = meaningful_bbox(rgba)
    if not bbox:
        raise ValueError("effect has no visible pixels")
    content = rgba.crop(bbox)
    scale = min(content_size / content.width, content_size / content.height)
    size = (
        max(1, round(content.width * scale)),
        max(1, round(content.height * scale)),
    )
    content = content.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    offset = ((CANVAS_SIZE - size[0]) // 2, (CANVAS_SIZE - size[1]) // 2)
    canvas.alpha_composite(content, offset)
    return canvas


def save_pair(image: Image.Image, png_path: Path) -> None:
    png_path.parent.mkdir(parents=True, exist_ok=True)
    rgba = image.convert("RGBA")
    rgba.save(png_path, "PNG", compress_level=6)
    rgba.save(png_path.with_suffix(".webp"), "WEBP", lossless=True, quality=100, method=4)


def install_peak(target: EffectTarget) -> Image.Image:
    source_path = SOURCE_DIR / f"{target.name}_chromakey.png"
    if not source_path.is_file():
        raise FileNotFoundError(f"missing Higgsfield peak source: {source_path}")
    clean, removed_ratio, residual_ratio = remove_chroma(Image.open(source_path), target.key)
    peak = normalize_effect(clean, PEAK_CONTENT_SIZES.get(target.name, CONTENT_SIZE))
    output_dir = BASIC_DIR if target.basic else SKILL_DIR
    save_pair(peak, output_dir / f"{target.name}.png")
    print(
        f"peak {target.name}: removed={removed_ratio:.1%}, "
        f"residual={residual_ratio:.2%}, alpha={peak.getchannel('A').getbbox()}"
    )
    return peak


def build_icon(peak: Image.Image, target: EffectTarget) -> Image.Image:
    accent = FAMILY_COLORS[target.family]
    icon = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (4, 8, 16, 255))
    draw = ImageDraw.Draw(icon)
    draw.rounded_rectangle((3, 3, 124, 124), radius=18, fill=(7, 13, 25, 255), outline=(*accent, 230), width=3)
    draw.rounded_rectangle((9, 9, 118, 118), radius=14, outline=(*accent, 82), width=2)

    bbox = meaningful_bbox(peak, threshold=16)
    if not bbox:
        raise ValueError(f"cannot create icon for empty effect: {target.name}")
    content = peak.crop(bbox)
    if target.kind == "thrust":
        scale = min(88 / content.width, 24 / content.height)
        size = (max(1, round(content.width * scale)), max(1, round(content.height * scale)))
        blade = content.resize(size, Image.Resampling.LANCZOS)
        upper = blade.rotate(10, resample=Image.Resampling.BICUBIC, expand=True)
        lower = blade.rotate(-10, resample=Image.Resampling.BICUBIC, expand=True)
        crossed = Image.new("RGBA", (100, 58), (0, 0, 0, 0))
        crossed.alpha_composite(upper, ((crossed.width - upper.width) // 2, 4))
        crossed.alpha_composite(lower, ((crossed.width - lower.width) // 2, crossed.height - lower.height - 4))
        content = crossed
        size = content.size
    else:
        scale = min(96 / content.width, 96 / content.height)
        size = (max(1, round(content.width * scale)), max(1, round(content.height * scale)))
        content = content.resize(size, Image.Resampling.LANCZOS)
    offset = ((ICON_SIZE - size[0]) // 2, (ICON_SIZE - size[1]) // 2)

    glow_alpha = content.getchannel("A").filter(ImageFilter.GaussianBlur(6))
    glow_alpha = glow_alpha.point(lambda value: round(value * 0.58))
    glow = Image.new("RGBA", content.size, (*accent, 0))
    glow.putalpha(glow_alpha)
    icon.alpha_composite(glow, offset)
    icon.alpha_composite(content, offset)
    return icon


def transformed_on_canvas(image: Image.Image, scale: float, dx: int = 0, dy: int = 0) -> Image.Image:
    bbox = meaningful_bbox(image, threshold=8)
    if not bbox:
        return Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    content = image.crop(bbox)
    size = (
        max(1, round(content.width * scale)),
        max(1, round(content.height * scale)),
    )
    content = content.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    offset = (
        (CANVAS_SIZE - size[0]) // 2 + dx,
        (CANVAS_SIZE - size[1]) // 2 + dy,
    )
    canvas.alpha_composite(content, offset)
    return canvas


def stage_reveal_mask(frame: Image.Image, kind: str, amount: float) -> Image.Image:
    mask = Image.new("L", frame.size, 0)
    bbox = meaningful_bbox(frame, threshold=8) or (0, 0, frame.width, frame.height)
    left, top, right, bottom = bbox
    draw = ImageDraw.Draw(mask)
    feather = max(8, round(min(right - left, bottom - top) * 0.07))

    if amount >= 0.999:
        draw.rectangle((left - feather, top - feather, right + feather, bottom + feather), fill=255)
    elif kind == "projectile":
        reveal_left = right - round((right - left) * amount)
        draw.rectangle((reveal_left, top - feather, right + feather, bottom + feather), fill=255)
    elif kind in {"slash", "thrust"}:
        reveal_right = left + round((right - left) * amount)
        draw.polygon(
            (
                (left - feather, top - feather),
                (reveal_right, top - feather),
                (min(right + feather, reveal_right + feather * 2), bottom + feather),
                (left - feather, bottom + feather),
            ),
            fill=255,
        )
    else:
        cx = (left + right) / 2
        cy = (top + bottom) / 2
        half_w = max(6, (right - left) * amount / 2)
        half_h = max(6, (bottom - top) * amount / 2)
        draw.ellipse((cx - half_w, cy - half_h, cx + half_w, cy + half_h), fill=255)
    return mask.filter(ImageFilter.GaussianBlur(feather))


def translated_copy(image: Image.Image, dx: int, dy: int, opacity: float) -> Image.Image:
    copy = image.copy()
    copy.putalpha(copy.getchannel("A").point(lambda value: clamp_byte(value * opacity)))
    canvas = Image.new("RGBA", image.size, (0, 0, 0, 0))
    canvas.alpha_composite(copy, (dx, dy))
    return canvas


def render_staged_frame(peak: Image.Image, target: EffectTarget, frame_index: int) -> Image.Image:
    scale, opacity, reveal, dx, dy = STAGE_PROFILES[target.kind][frame_index]
    frame = transformed_on_canvas(peak, scale, dx, dy)
    alpha = ImageChops.multiply(frame.getchannel("A"), stage_reveal_mask(frame, target.kind, reveal))

    if frame_index == 0:
        core = alpha.filter(ImageFilter.MinFilter(7))
        alpha = ImageChops.lighter(core, alpha.point(lambda value: clamp_byte(value * 0.24)))
    elif frame_index == 4:
        edge = ImageChops.subtract(alpha, alpha.filter(ImageFilter.MinFilter(7)))
        alpha = ImageChops.lighter(alpha.point(lambda value: clamp_byte(value * 0.46)), edge)
    elif frame_index == 5:
        edge = ImageChops.subtract(alpha, alpha.filter(ImageFilter.MinFilter(11)))
        alpha = ImageChops.lighter(alpha.point(lambda value: clamp_byte(value * 0.10)), edge.point(lambda value: clamp_byte(value * 0.72)))

    alpha = alpha.point(lambda value: clamp_byte(value * opacity))
    frame.putalpha(alpha)

    output = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    if target.kind in {"slash", "thrust", "projectile"} and frame_index in {1, 2, 3, 4}:
        trail = translated_copy(frame, -max(4, 14 - frame_index * 2), 2, 0.18 if frame_index < 4 else 0.10)
        trail.putalpha(trail.getchannel("A").filter(ImageFilter.GaussianBlur(4)))
        output.alpha_composite(trail)

    accent = FAMILY_COLORS[target.family]
    glow_alpha = alpha.filter(ImageFilter.GaussianBlur(9 if frame_index < 4 else 6))
    glow_alpha = glow_alpha.point(lambda value: clamp_byte(value * (0.30 if frame_index < 4 else 0.16)))
    glow = Image.new("RGBA", frame.size, (*accent, 0))
    glow.putalpha(glow_alpha)
    output.alpha_composite(glow)
    output.alpha_composite(frame)
    return output


def split_autosprite_sheet(target: EffectTarget) -> list[Image.Image]:
    sheet_path = SOURCE_DIR / f"{target.name}_autosprite.png"
    if not sheet_path.is_file():
        raise FileNotFoundError(f"missing Higgsfield AutoSprite sheet: {sheet_path}")
    sheet = Image.open(sheet_path).convert("RGBA")
    if sheet.width % CANVAS_SIZE or sheet.height % CANVAS_SIZE:
        raise ValueError(f"unexpected AutoSprite sheet dimensions for {target.name}: {sheet.size}")
    columns = sheet.width // CANVAS_SIZE
    rows = sheet.height // CANVAS_SIZE
    if columns * rows < FRAME_COUNT:
        raise ValueError(f"AutoSprite sheet has fewer than {FRAME_COUNT} cells: {target.name} / {sheet.size}")

    frames = []
    for index in range(FRAME_COUNT):
        left = (index % columns) * CANVAS_SIZE
        top = (index // columns) * CANVAS_SIZE
        frames.append(sheet.crop((left, top, left + CANVAS_SIZE, top + CANVAS_SIZE)))

    union = None
    for frame in frames:
        bbox = meaningful_bbox(frame, threshold=8)
        if not bbox:
            raise ValueError(f"empty AutoSprite frame: {target.name}")
        if union is None:
            union = list(bbox)
        else:
            union[0] = min(union[0], bbox[0])
            union[1] = min(union[1], bbox[1])
            union[2] = max(union[2], bbox[2])
            union[3] = max(union[3], bbox[3])

    assert union is not None
    union_width = union[2] - union[0]
    union_height = union[3] - union[1]
    scale = min(CONTENT_SIZE / union_width, CONTENT_SIZE / union_height)
    normalized: list[Image.Image] = []
    for frame in frames:
        content = frame.crop(tuple(union))
        size = (max(1, round(union_width * scale)), max(1, round(union_height * scale)))
        content = content.resize(size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
        canvas.alpha_composite(content, ((CANVAS_SIZE - size[0]) // 2, (CANVAS_SIZE - size[1]) // 2))
        normalized.append(canvas)
    return normalized


def install_sequence(target: EffectTarget, peak: Image.Image) -> None:
    output_dir = BASIC_DIR if target.basic else SKILL_DIR
    frames_dir = output_dir / "frames"
    sheet_path = SOURCE_DIR / f"{target.name}_autosprite.png"
    if sheet_path.is_file():
        frames = split_autosprite_sheet(target)
        source_label = "AutoSprite"
    else:
        frames = [render_staged_frame(peak, target, index) for index in range(FRAME_COUNT)]
        source_label = "effect-specific staged"
    signatures: list[bytes] = []
    for index, frame in enumerate(frames):
        alpha = frame.getchannel("A")
        if not alpha.getbbox():
            raise ValueError(f"empty normalized frame: {target.name}_{index}")
        signatures.append(alpha.resize((32, 32), Image.Resampling.BILINEAR).tobytes())
        save_pair(frame, frames_dir / f"{target.name}_{index}.png")
    if len(set(signatures)) < 4:
        raise ValueError(f"AutoSprite animation has fewer than four distinct stages: {target.name}")
    print(f"sequence {target.name}: {len(frames)} {source_label} frames")


def main() -> int:
    if not SOURCE_DIR.is_dir():
        print(f"missing source directory: {SOURCE_DIR}", file=sys.stderr)
        return 1

    failures: list[str] = []
    peaks: dict[str, Image.Image] = {}
    for target in TARGETS:
        try:
            peaks[target.name] = install_peak(target)
        except Exception as error:  # release script reports the complete missing set
            failures.append(f"{target.name} peak: {error}")

    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1

    for target in TARGETS:
        try:
            icon = build_icon(peaks[target.name], target)
            save_pair(icon, ICON_DIR / f"{target.icon}.png")
            install_sequence(target, peaks[target.name])
        except Exception as error:
            failures.append(f"{target.name} derived assets: {error}")

    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1

    print(
        f"installed {len(TARGETS)} source peaks, {len(TARGETS)} unified icons, "
        f"and {len(TARGETS) * FRAME_COUNT} effect-specific staged frames"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
