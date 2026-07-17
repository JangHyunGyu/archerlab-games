"""Finalize direction-safe defender action sheets.

The AI-generated repair cells are reviewed separately, then passed through
this tool to restore the production sheet sizes, planted baselines, and
matching PNG/WebP pairs.  Deterministic repairs remove the baked firebomb
projectile and return F/G recovery frames to their identity-matched ready
poses.
"""

from __future__ import annotations

import argparse
from collections import deque
from math import atan2, degrees
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
IMAGE_DIR = ROOT / "assets" / "images"
POSE_COUNT = 9


def split_strip(image: Image.Image) -> list[Image.Image]:
    if image.width % POSE_COUNT:
        raise ValueError(f"strip width {image.width} is not divisible by {POSE_COUNT}")
    width = image.width // POSE_COUNT
    return [
        image.crop((index * width, 0, (index + 1) * width, image.height))
        for index in range(POSE_COUNT)
    ]


def save_strip(cells: list[Image.Image], png_path: Path) -> None:
    cell_width, cell_height = cells[0].size
    if len(cells) != POSE_COUNT or any(cell.size != (cell_width, cell_height) for cell in cells):
        raise ValueError(f"invalid cells for {png_path.name}")
    strip = Image.new("RGBA", (cell_width * POSE_COUNT, cell_height), (0, 0, 0, 0))
    for index, cell in enumerate(cells):
        strip.alpha_composite(cell, (index * cell_width, 0))
    strip.save(png_path, optimize=True)
    strip.save(png_path.with_suffix(".webp"), format="WEBP", quality=92, method=6)


def alpha_components(image: Image.Image, threshold: int = 8) -> list[tuple[list[int], tuple[int, int, int, int]]]:
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.load()
    active = bytearray(width * height)
    for y in range(height):
        offset = y * width
        for x in range(width):
            if pixels[x, y] > threshold:
                active[offset + x] = 1

    components: list[tuple[list[int], tuple[int, int, int, int]]] = []
    for start, value in enumerate(active):
        if not value:
            continue
        active[start] = 0
        queue = deque([start])
        indices: list[int] = []
        left = width
        top = height
        right = 0
        bottom = 0
        while queue:
            current = queue.popleft()
            y, x = divmod(current, width)
            indices.append(current)
            left = min(left, x)
            top = min(top, y)
            right = max(right, x + 1)
            bottom = max(bottom, y + 1)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if not dx and not dy:
                        continue
                    nx = x + dx
                    ny = y + dy
                    if not (0 <= nx < width and 0 <= ny < height):
                        continue
                    neighbour = ny * width + nx
                    if active[neighbour]:
                        active[neighbour] = 0
                        queue.append(neighbour)
        components.append((indices, (left, top, right, bottom)))
    return sorted(components, key=lambda item: len(item[0]), reverse=True)


def keep_character_component(image: Image.Image) -> Image.Image:
    components = alpha_components(image)
    if not components:
        raise ValueError("empty sprite cell")
    keep = set(components[0][0])
    source = image.load()
    result = Image.new("RGBA", image.size, (0, 0, 0, 0))
    target = result.load()
    width, height = image.size
    for index in keep:
        y, x = divmod(index, width)
        target[x, y] = source[x, y]

    # Preserve soft antialiasing immediately around the retained silhouette.
    source_alpha = image.getchannel("A").load()
    for y in range(height):
        for x in range(width):
            if target[x, y][3] or not source_alpha[x, y]:
                continue
            if any(
                0 <= x + dx < width
                and 0 <= y + dy < height
                and target[x + dx, y + dy][3]
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1))
            ):
                target[x, y] = source[x, y]
    return result


def alpha_geometry(image: Image.Image) -> tuple[tuple[int, int, int, int], float]:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("empty sprite cell")
    left, top, right, bottom = bbox
    foot_top = max(top, bottom - max(16, round((bottom - top) * 0.14)))
    alpha_pixels = alpha.load()
    foot_x = [
        x
        for y in range(foot_top, bottom)
        for x in range(left, right)
        if alpha_pixels[x, y] > 32
    ]
    if not foot_x:
        raise ValueError("could not locate planted feet")
    return bbox, sum(foot_x) / len(foot_x)


def despill_key_colour(image: Image.Image, key_colour: str) -> Image.Image:
    """Remove high-saturation key remnants without recolouring the subject."""
    result = image.convert("RGBA").copy()
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            red, green, blue, alpha = pixels[x, y]
            if not alpha:
                continue
            if key_colour == "magenta":
                spill = min(red, blue) - green
                if red > 75 and blue > 75 and spill > 24 and abs(red - blue) < 112:
                    if alpha < 245 and spill > 44:
                        pixels[x, y] = (0, 0, 0, 0)
                    else:
                        pixels[x, y] = (
                            min(red, green + 24),
                            green,
                            min(blue, green + 20),
                            alpha,
                        )
            elif key_colour == "blue":
                spill = blue - max(red, green)
                if blue > 75 and spill > 24:
                    if alpha < 245 and spill > 44:
                        pixels[x, y] = (0, 0, 0, 0)
                    else:
                        pixels[x, y] = (red, green, min(blue, max(red, green) + 12), alpha)
    return result


def normalise_generated_cell(
    source: Image.Image,
    target: Image.Image,
    *,
    key_colour: str,
) -> Image.Image:
    """Fit one approved repair cell to an existing cell's scale and footing."""
    source = despill_key_colour(source, key_colour)
    source = keep_character_component(source)
    source_bbox, source_foot_x = alpha_geometry(source)
    target_bbox, target_foot_x = alpha_geometry(target)
    target_width, target_height = target.size
    source_left, source_top, source_right, source_bottom = source_bbox
    target_left, target_top, target_right, target_bottom = target_bbox

    source_height = source_bottom - source_top
    target_subject_height = target_bottom - target_top
    scale = target_subject_height / max(1, source_height)
    margin = 10
    scale = min(
        scale,
        (target_width - 2 * margin) / max(1, source_right - source_left),
        (target_height - 2 * margin) / max(1, source_height),
    )
    resized = source.resize(
        (max(1, round(source.width * scale)), max(1, round(source.height * scale))),
        Image.Resampling.LANCZOS,
    )
    x = round(target_foot_x - source_foot_x * scale)
    y = round(target_bottom - source_bottom * scale)
    result = Image.new("RGBA", target.size, (0, 0, 0, 0))
    result.alpha_composite(resized, (x, y))
    result = despill_key_colour(result, key_colour)
    bbox = result.getchannel("A").getbbox()
    if bbox is None or min(bbox[0], bbox[1], target_width - bbox[2], target_height - bbox[3]) < 6:
        raise ValueError(f"normalised cell violates safe margins: {bbox}")
    return result


def apply_deterministic_repairs() -> None:
    firebomb_release_path = IMAGE_DIR / "character-f-throw-2.png"
    firebomb_release = split_strip(Image.open(firebomb_release_path).convert("RGBA"))
    save_strip([keep_character_component(cell) for cell in firebomb_release], firebomb_release_path)

    firebomb_recovery_path = IMAGE_DIR / "character-f-throw-3.png"
    firebomb_recovery = split_strip(Image.open(firebomb_recovery_path).convert("RGBA"))
    save_strip(firebomb_recovery, firebomb_recovery_path)

    # Frame two is the approved direction-correct settled pose. Reusing it as
    # the final recovery beat avoids the old frame-three hemisphere flips and
    # leaves the runtime to return to the neutral ready sheet immediately after.
    shock_settled = Image.open(IMAGE_DIR / "character-g-attack-2.png").convert("RGBA")
    save_strip(split_strip(shock_settled), IMAGE_DIR / "character-g-attack-3.png")


def apply_generated_repairs(generated_dir: Path) -> None:
    bow_targets = {
        "a-f1-c5.png": (IMAGE_DIR / "character-a-attack-1.png", 5),
        "a-f2-c5.png": (IMAGE_DIR / "character-a-attack-2.png", 5),
    }
    bow_identity = split_strip(Image.open(IMAGE_DIR / "character-a.png").convert("RGBA"))
    for source_name, (sheet_path, index) in bow_targets.items():
        cells = split_strip(Image.open(sheet_path).convert("RGBA"))
        source = Image.open(generated_dir / source_name).convert("RGBA")
        cells[index] = normalise_generated_cell(
            source,
            bow_identity[index],
            key_colour="blue",
        )
        save_strip(cells, sheet_path)

    firebomb_path = IMAGE_DIR / "character-f-throw-3.png"
    firebomb_cells = split_strip(Image.open(firebomb_path).convert("RGBA"))
    firebomb_source = Image.open(generated_dir / "f-f3-c3.png").convert("RGBA")
    firebomb_cells[3] = normalise_generated_cell(
        firebomb_source,
        firebomb_cells[4],
        key_colour="blue",
    )
    save_strip(firebomb_cells, firebomb_path)

    rocket_path = IMAGE_DIR / "character-d-attack-2.png"
    rocket_cells = split_strip(Image.open(rocket_path).convert("RGBA"))
    rocket_targets = split_strip(Image.open(IMAGE_DIR / "character-d-attack-1.png").convert("RGBA"))
    for index in range(POSE_COUNT):
        source = Image.open(generated_dir / f"d-f2-c{index}.png").convert("RGBA")
        rocket_cells[index] = normalise_generated_cell(
            source,
            rocket_targets[index],
            key_colour="magenta",
        )
    save_strip(rocket_cells, rocket_path)


def inspect_firebomb_components() -> None:
    cells = split_strip(Image.open(IMAGE_DIR / "character-f-throw-2.png").convert("RGBA"))
    for index, cell in enumerate(cells):
        summary = [(len(points), bbox) for points, bbox in alpha_components(cell)[:5]]
        print(f"firebomb release cell {index}: {summary}")


def rocket_launcher_angle(cell: Image.Image) -> float:
    points: list[tuple[int, int]] = []
    for y in range(min(cell.height, round(cell.height * 0.47))):
        for x in range(cell.width):
            red, green, blue, alpha = cell.getpixel((x, y))
            if (
                alpha > 40
                and green * 100 > blue * 118
                and red < 150
                and green < 160
                and blue < 100
                and green > 28
                and green - blue > 12
            ):
                points.append((x, y))
    if len(points) < 120:
        raise ValueError(f"launcher mask is too small: {len(points)} pixels")
    mean_x = sum(x for x, _ in points) / len(points)
    mean_y = sum(y for _, y in points) / len(points)
    covariance_xx = sum((x - mean_x) ** 2 for x, _ in points) / len(points)
    covariance_yy = sum((y - mean_y) ** 2 for _, y in points) / len(points)
    covariance_xy = sum((x - mean_x) * (y - mean_y) for x, y in points) / len(points)
    angle = degrees(0.5 * atan2(2 * covariance_xy, covariance_xx - covariance_yy))
    return angle + 180 if angle < 0 else angle


def verify_direction_safe_outputs() -> None:
    modified_stems = (
        "character-a-attack-1",
        "character-a-attack-2",
        "character-d-attack-2",
        "character-f-throw-2",
        "character-f-throw-3",
        "character-g-attack-3",
    )
    for stem in modified_stems:
        png = Image.open(IMAGE_DIR / f"{stem}.png").convert("RGBA")
        webp = Image.open(IMAGE_DIR / f"{stem}.webp").convert("RGBA")
        if png.size != webp.size or png.getchannel("A").tobytes() != webp.getchannel("A").tobytes():
            raise ValueError(f"{stem} PNG/WebP dimensions or alpha channels differ")

    rocket = Image.open(IMAGE_DIR / "character-d-attack-2.png").convert("RGBA")
    rocket_angles = [rocket_launcher_angle(cell) for cell in split_strip(rocket)]
    if any(right - left < 2 for left, right in zip(rocket_angles, rocket_angles[1:])):
        raise ValueError(f"rocket launcher angles are not strictly ordered: {rocket_angles}")
    if not (
        all(angle < 75 for angle in rocket_angles[:4])
        and 75 <= rocket_angles[4] <= 105
        and all(angle > 105 for angle in rocket_angles[5:])
    ):
        raise ValueError(f"rocket launcher hemispheres are invalid: {rocket_angles}")

    magenta_pixels = 0
    for red, green, blue, alpha in rocket.get_flattened_data():
        if (
            alpha > 16
            and red > 75
            and blue > 75
            and min(red, blue) - green > 24
            and abs(red - blue) < 112
        ):
            magenta_pixels += 1
    if magenta_pixels:
        raise ValueError(f"rocket follow-through contains {magenta_pixels} magenta spill pixels")

    firebomb = Image.open(IMAGE_DIR / "character-f-throw-2.png").convert("RGBA")
    for index, cell in enumerate(split_strip(firebomb)):
        component_sizes = [len(points) for points, _ in alpha_components(cell)]
        if not component_sizes or component_sizes[0] < 10_000:
            raise ValueError(f"firebomb release cell {index} is missing its defender")
        if any(size >= 128 for size in component_sizes[1:]):
            raise ValueError(f"firebomb release cell {index} still has a detached projectile")

    shock_settled = Image.open(IMAGE_DIR / "character-g-attack-2.png").convert("RGBA")
    shock_recovery = Image.open(IMAGE_DIR / "character-g-attack-3.png").convert("RGBA")
    if shock_settled.size != shock_recovery.size or shock_settled.tobytes() != shock_recovery.tobytes():
        raise ValueError("shock recovery no longer matches the direction-safe settled frame")
    print("rocket launcher angles:", " ".join(f"{angle:.1f}" for angle in rocket_angles))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--generated-dir", type=Path)
    parser.add_argument("--deterministic-only", action="store_true")
    parser.add_argument("--inspect-firebomb", action="store_true")
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()

    if args.inspect_firebomb:
        inspect_firebomb_components()
        return
    if args.verify_only:
        verify_direction_safe_outputs()
        print("verified defender direction-safe action sheets")
        return
    apply_deterministic_repairs()
    if not args.deterministic_only:
        if args.generated_dir is None:
            parser.error("--generated-dir is required unless --deterministic-only is used")
        apply_generated_repairs(args.generated_dir.resolve())
    verify_direction_safe_outputs()
    print("finalized defender A/D/F/G direction-safe action sheets")


if __name__ == "__main__":
    main()
