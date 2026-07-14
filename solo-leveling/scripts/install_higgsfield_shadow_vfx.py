from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

from build_character_motion_v2 import remove_green_chroma
from image_formats import save_png_and_webp


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "effects" / "source"
OUTPUT_DIR = ROOT / "assets" / "effects" / "character_skills"
CANVAS_SIZE = 512
CONTENT_SIZE = 472

ASSETS = {
    "higgsfield_shadow_dagger_projectile_chromakey.png": "shadow_dagger",
    "higgsfield_shadow_dual_crescent_chromakey.png": "shadow_slash",
    "higgsfield_shadow_authority_sigil_chromakey.png": "rulers_authority",
    "higgsfield_shadow_dragon_fear_chromakey.png": "dragon_fear",
}


def grade_shadow_palette(image: Image.Image) -> Image.Image:
    """Turn chroma-reflected cyan edge light into the shadow violet palette."""

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


def normalize_asset(source: Image.Image) -> tuple[Image.Image, float, float]:
    clean, removed_ratio, residual_ratio = remove_green_chroma(source)
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


def main() -> int:
    failures: list[str] = []
    for source_name, output_name in ASSETS.items():
        source_path = SOURCE_DIR / source_name
        if not source_path.is_file():
            failures.append(f"missing source: {source_path}")
            continue

        output, removed_ratio, residual_ratio = normalize_asset(Image.open(source_path))
        output_path = OUTPUT_DIR / f"{output_name}.png"
        save_png_and_webp(output, output_path)
        alpha_bbox = output.getchannel("A").getbbox()
        print(
            f"installed {output_name}: 512x512, alpha={alpha_bbox}, "
            f"chroma_removed={removed_ratio:.1%}, green_residue={residual_ratio:.2%}"
        )

    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
