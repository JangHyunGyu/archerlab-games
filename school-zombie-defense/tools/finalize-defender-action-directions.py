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
CROSSBOW_SOURCE_DIR = ROOT / "design" / "source-assets" / "crossbow-v1"
POSE_COUNT = 9
CROSSBOW_WEBP_QUALITY = 96
CROSSBOW_LEGACY_CELL_SIZE = (512, 800)
CROSSBOW_CELL_SIZE = (736, 960)
CROSSBOW_CELL_PADDING = (112, 160)
CROSSBOW_MIRROR_DIRECTION_PAIRS = ((3, 5), (2, 6), (1, 7), (0, 8))


def split_strip(image: Image.Image) -> list[Image.Image]:
    if image.width % POSE_COUNT:
        raise ValueError(f"strip width {image.width} is not divisible by {POSE_COUNT}")
    width = image.width // POSE_COUNT
    return [
        image.crop((index * width, 0, (index + 1) * width, image.height))
        for index in range(POSE_COUNT)
    ]


def prepare_crossbow_identity_cells(cells: list[Image.Image]) -> list[Image.Image]:
    """Pad crossbow cells without changing their character-pixel scale or footing."""
    prepared: list[Image.Image] = []
    for index, cell in enumerate(cells):
        if cell.size == CROSSBOW_CELL_SIZE:
            prepared.append(cell.copy())
            continue
        if cell.size != CROSSBOW_LEGACY_CELL_SIZE:
            raise ValueError(
                f"crossbow identity cell {index} has unsupported size {cell.size}; "
                f"expected {CROSSBOW_LEGACY_CELL_SIZE} or {CROSSBOW_CELL_SIZE}"
            )
        expanded = Image.new("RGBA", CROSSBOW_CELL_SIZE, (0, 0, 0, 0))
        expanded.alpha_composite(cell, CROSSBOW_CELL_PADDING)
        prepared.append(expanded)
    return prepared


def save_strip(
    cells: list[Image.Image],
    png_path: Path,
    *,
    webp_quality: int = 92,
) -> None:
    cell_width, cell_height = cells[0].size
    if len(cells) != POSE_COUNT or any(cell.size != (cell_width, cell_height) for cell in cells):
        raise ValueError(f"invalid cells for {png_path.name}")
    strip = Image.new("RGBA", (cell_width * POSE_COUNT, cell_height), (0, 0, 0, 0))
    for index, cell in enumerate(cells):
        strip.alpha_composite(cell, (index * cell_width, 0))
    strip.save(png_path, optimize=True)
    strip.save(
        png_path.with_suffix(".webp"),
        format="WEBP",
        quality=webp_quality,
        method=6,
    )


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


def is_hair_pixel(pixel: tuple[int, int, int, int], kind: str) -> bool:
    red, green, blue, alpha = pixel
    if alpha <= 32:
        return False
    if kind == "pink":
        return red >= 125 and red > green * 1.22 and red > blue * 0.98 and blue >= 58
    return red >= 62 and red > green * 1.35 and red > blue * 1.18 and green < 115


def largest_hair_component_top(image: Image.Image, kind: str) -> int:
    width, height = image.size
    pixels = image.load()
    active = bytearray(width * height)
    for y in range(height):
        offset = y * width
        for x in range(width):
            if is_hair_pixel(pixels[x, y], kind):
                active[offset + x] = 1

    components: list[tuple[int, int, int, int, int]] = []
    for start, value in enumerate(active):
        if not value:
            continue
        active[start] = 0
        queue = deque([start])
        size = 0
        left = width
        top = height
        right = 0
        bottom = 0
        while queue:
            current = queue.popleft()
            y, x = divmod(current, width)
            size += 1
            left = min(left, x)
            top = min(top, y)
            right = max(right, x + 1)
            bottom = max(bottom, y + 1)
            for neighbour in (current - 1, current + 1, current - width, current + width):
                if neighbour < 0 or neighbour >= len(active) or not active[neighbour]:
                    continue
                neighbour_y, neighbour_x = divmod(neighbour, width)
                if abs(neighbour_x - x) + abs(neighbour_y - y) != 1:
                    continue
                active[neighbour] = 0
                queue.append(neighbour)
        if size >= 80:
            components.append((size, top, left, right, bottom))

    if not components:
        raise ValueError(f"could not locate the {kind} hair reference")

    if kind == "pink":
        # The defender's weapon shares the same pink hue as her hair, while the
        # twin tails can contain more thresholded pixels than the crown after
        # resampling. Select the uppermost compact head-sized component.
        minimum_head_height = max(12, round(height * 0.045))
        substantial_size = max(80, round(max(item[0] for item in components) * 0.25))
        head_candidates = []
        for component in components:
            size, top, left, right, bottom = component
            component_width = right - left
            component_height = bottom - top
            density = size / max(1, component_width * component_height)
            if (
                size >= substantial_size
                and component_height >= minimum_head_height
                and component_width >= component_height * 0.36
                and density >= 0.16
            ):
                head_candidates.append(component)
        if head_candidates:
            return min(head_candidates, key=lambda item: (item[1], -item[0]))[1]

    return max(components, key=lambda item: item[0])[1]


def body_height(image: Image.Image, hair: str) -> int:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("empty sprite cell")
    return bbox[3] - largest_hair_component_top(image, hair)


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
    key_colour: str | None,
    hair: str | None = None,
    body_height_target: int | None = None,
    keep_largest_component: bool = True,
) -> Image.Image:
    """Fit one approved repair cell to an existing cell's scale and footing."""
    if key_colour is not None:
        source = despill_key_colour(source, key_colour)
    if keep_largest_component:
        source = keep_character_component(source)
    source_bbox, source_foot_x = alpha_geometry(source)
    target_bbox, target_foot_x = alpha_geometry(target)
    target_width, target_height = target.size
    source_left, source_top, source_right, source_bottom = source_bbox
    target_left, target_top, target_right, target_bottom = target_bbox

    source_height = source_bottom - source_top
    target_subject_height = target_bottom - target_top
    desired_body_height = (
        body_height_target if body_height_target is not None else body_height(target, hair)
    ) if hair is not None else None
    scale = (
        desired_body_height / max(1, body_height(source, hair))
        if hair is not None
        else target_subject_height / max(1, source_height)
    )
    margin = 10
    if hair is not None:
        probe = source.resize(
            (max(1, round(source.width * scale)), max(1, round(source.height * scale))),
            Image.Resampling.LANCZOS,
        )
        probe_body_height = body_height(probe, hair)
        if abs(probe_body_height - desired_body_height) > 2:
            scale *= desired_body_height / max(1, probe_body_height)
    scale = min(
        scale,
        (target_width - 2 * margin) / max(1, source_right - source_left),
        (target_bottom - margin - 2) / max(1, source_height),
    )
    resized = source.resize(
        (max(1, round(source.width * scale)), max(1, round(source.height * scale))),
        Image.Resampling.LANCZOS,
    )
    resized_bbox = resized.getchannel("A").getbbox()
    if resized_bbox is None:
        raise ValueError("normalised source became empty")
    resized_left, resized_top, resized_right, resized_bottom = resized_bbox
    _, resized_foot_x = alpha_geometry(resized)
    x = round(target_foot_x - resized_foot_x)
    y = target_bottom - resized_bottom
    if x + resized_left < margin:
        x += margin - (x + resized_left)
    if x + resized_right > target_width - margin:
        x -= x + resized_right - (target_width - margin)
    result = Image.new("RGBA", target.size, (0, 0, 0, 0))
    result.alpha_composite(resized, (x, y))
    if key_colour is not None:
        result = despill_key_colour(result, key_colour)
    if hair is not None:
        for _ in range(2):
            actual_body_height = body_height(result, hair)
            if actual_body_height <= desired_body_height + 2:
                break
            bbox = result.getchannel("A").getbbox()
            if bbox is None:
                raise ValueError("normalised result became empty")
            sprite = result.crop(bbox)
            correction = desired_body_height / actual_body_height
            sprite = sprite.resize(
                (
                    max(1, round(sprite.width * correction)),
                    max(1, round(sprite.height * correction)),
                ),
                Image.Resampling.LANCZOS,
            )
            sprite_bbox, sprite_foot_x = alpha_geometry(sprite)
            sprite_left, sprite_top, sprite_right, sprite_bottom = sprite_bbox
            x = round(target_foot_x - sprite_foot_x)
            y = target_bottom - sprite_bottom
            if x + sprite_left < margin:
                x += margin - (x + sprite_left)
            if x + sprite_right > target_width - margin:
                x -= x + sprite_right - (target_width - margin)
            result = Image.new("RGBA", target.size, (0, 0, 0, 0))
            result.alpha_composite(sprite, (x, y))
            if key_colour is not None:
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


def verify_generated_crossbow_sheets(
    crossbow_identity: list[Image.Image],
    crossbow_sheets: dict[int, tuple[Path, list[Image.Image]]],
) -> None:
    """Validate every generated crossbow cell before the first production write."""
    expected_frames = set(range(4))
    if set(crossbow_sheets) != expected_frames:
        raise ValueError(
            f"generated crossbow sheets must cover frames 0..3: {sorted(crossbow_sheets)}"
        )
    if len(crossbow_identity) != POSE_COUNT:
        raise ValueError(f"crossbow identity must contain {POSE_COUNT} direction cells")
    reference_body_height = sorted(
        body_height(cell, "pink") for cell in crossbow_identity
    )[POSE_COUNT // 2]

    body_heights: list[int] = []
    bottoms: list[int] = []
    for frame, (sheet_path, cells) in crossbow_sheets.items():
        if len(cells) != POSE_COUNT:
            raise ValueError(
                f"{sheet_path.name} frame {frame} must contain {POSE_COUNT} direction cells"
            )
        for index, (cell, target) in enumerate(zip(cells, crossbow_identity)):
            if cell.size != target.size:
                raise ValueError(
                    f"crossbow frame {frame} direction {index} has size {cell.size}; "
                    f"expected {target.size}"
                )

            bbox, feet_center = alpha_geometry(cell)
            target_bbox, target_feet_center = alpha_geometry(target)
            margins = (
                bbox[0],
                bbox[1],
                cell.width - bbox[2],
                cell.height - bbox[3],
            )
            if min(margins) < 8:
                raise ValueError(
                    f"crossbow frame {frame} direction {index} violates 8px safe margins: {bbox}"
                )

            target_body_height = reference_body_height
            actual_body_height = body_height(cell, "pink")
            body_ratio = actual_body_height / target_body_height
            if not 0.97 <= body_ratio <= 1.03:
                raise ValueError(
                    f"crossbow frame {frame} direction {index} body scale drifted to "
                    f"{body_ratio:.3f} ({actual_body_height}px vs {target_body_height}px)"
                )
            if abs(bbox[3] - target_bbox[3]) > 1:
                raise ValueError(
                    f"crossbow frame {frame} direction {index} footing drifted from "
                    f"{target_bbox[3]}px to {bbox[3]}px"
                )
            if abs(feet_center - target_feet_center) > 2:
                raise ValueError(
                    f"crossbow frame {frame} direction {index} horizontal footing drifted by "
                    f"{abs(feet_center - target_feet_center):.2f}px"
                )

            components = alpha_components(cell)
            if not components or len(components[0][0]) < 8_000:
                raise ValueError(
                    f"crossbow frame {frame} direction {index} is missing its defender silhouette"
                )
            body_heights.append(actual_body_height)
            bottoms.append(bbox[3])

    if max(body_heights) / min(body_heights) > 1.03:
        raise ValueError(
            f"generated crossbow body scale spread exceeds 3%: "
            f"{min(body_heights)}..{max(body_heights)}"
        )
    if max(bottoms) - min(bottoms) > 1:
        raise ValueError(
            f"generated crossbow footing spread exceeds 1px: {min(bottoms)}..{max(bottoms)}"
        )


def apply_generated_crossbow_repairs(generated_dir: Path) -> None:
    crossbow_identity = prepare_crossbow_identity_cells(
        split_strip(Image.open(IMAGE_DIR / "character-a.png").convert("RGBA"))
    )
    for source_index, mirrored_index in CROSSBOW_MIRROR_DIRECTION_PAIRS:
        crossbow_identity[mirrored_index] = crossbow_identity[source_index].transpose(
            Image.Transpose.FLIP_LEFT_RIGHT
        )
    crossbow_sheets = {
        0: (
            IMAGE_DIR / "character-a.png",
            [cell.copy() for cell in crossbow_identity],
        ),
    }
    crossbow_sheets.update({
        frame: (
            IMAGE_DIR / f"character-a-attack-{frame}.png",
            split_strip(
                Image.open(IMAGE_DIR / f"character-a-attack-{frame}.png").convert("RGBA")
            ),
        )
        for frame in range(1, 4)
    })
    reference_body_height = sorted(
        body_height(cell, "pink") for cell in crossbow_identity
    )[POSE_COUNT // 2]
    for frame, (_, cells) in crossbow_sheets.items():
        for index in range(5):
            source = Image.open(generated_dir / f"a-f{frame}-c{index}.png").convert("RGBA")
            cells[index] = normalise_generated_cell(
                source,
                crossbow_identity[index],
                key_colour=None,
                hair="pink",
                body_height_target=reference_body_height,
                keep_largest_component=True,
            )
        for source_index, mirrored_index in CROSSBOW_MIRROR_DIRECTION_PAIRS:
            cells[mirrored_index] = cells[source_index].transpose(
                Image.Transpose.FLIP_LEFT_RIGHT
            )
    verify_generated_crossbow_sheets(crossbow_identity, crossbow_sheets)
    for sheet_path, cells in crossbow_sheets.values():
        save_strip(cells, sheet_path, webp_quality=CROSSBOW_WEBP_QUALITY)


def apply_generated_repairs(generated_dir: Path) -> None:
    apply_generated_crossbow_repairs(generated_dir)

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
        "character-a",
        "character-a-attack-1",
        "character-a-attack-2",
        "character-a-attack-3",
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
    parser.add_argument(
        "--generated-dir",
        type=Path,
        help=(
            "directory containing reviewed generated cells; crossbow-only defaults "
            "to the tracked crossbow-v1 source set"
        ),
    )
    parser.add_argument("--deterministic-only", action="store_true")
    parser.add_argument("--crossbow-only", action="store_true")
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
    if args.crossbow_only:
        generated_dir = (
            args.generated_dir.resolve()
            if args.generated_dir is not None
            else CROSSBOW_SOURCE_DIR
        )
        apply_generated_crossbow_repairs(generated_dir)
        verify_direction_safe_outputs()
        print("finalized defender A crossbow direction-safe attack sheets")
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
