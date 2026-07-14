"""Normalise the A/F defender sheets without redrawing their approved art.

The game fits every sliced texture to the same display height.  A therefore
needs one common hair-to-feet height across its 800 px base/action canvases,
while F's 640 px throw canvases need 1.25 times the pixel body height and foot
gap of its untouched 512 px base canvas.  This tool applies those rules,
preserves each original pose, and validates the complete output set before it
writes any production asset.
"""

from __future__ import annotations

import argparse
from collections import deque
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
IMAGE_DIR = ROOT / "assets" / "images"
POSE_COUNT = 9
SAFE_MARGIN = 8
A_COMMON_BODY_HEIGHT = 542
MAX_SCALE_RATIO = 1.03
MIRRORED_LEFT_THROW_POSES = range(4)


@dataclass(frozen=True)
class ActionSpec:
    character: str
    action: str
    base_name: str
    source_names: tuple[str, str, str, str]
    output_width: int
    output_height: int
    hair: str
    normalise_base: bool = False


SPECS = (
    ActionSpec(
        character="a",
        action="attack",
        base_name="character-a.png",
        source_names=(
            "character-a.png",
            "character-a-attack-1.png",
            "character-a-attack-2.png",
            "character-a-attack-3.png",
        ),
        output_width=512,
        output_height=800,
        hair="pink",
        normalise_base=True,
    ),
    ActionSpec(
        character="f",
        action="throw",
        base_name="character-f.png",
        source_names=tuple(f"character-f-throw-{frame}.png" for frame in range(4)),
        output_width=512,
        output_height=640,
        hair="red",
    ),
)


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
    mask = bytearray(width * height)
    for y in range(height):
        row = y * width
        for x in range(width):
            if is_hair_pixel(pixels[x, y], kind):
                mask[row + x] = 1

    best_size = 0
    best_top = None
    for index, active in enumerate(mask):
        if not active:
            continue
        mask[index] = 0
        queue = deque([index])
        size = 0
        top = height
        while queue:
            current = queue.popleft()
            y, x = divmod(current, width)
            size += 1
            top = min(top, y)
            for neighbour in (current - 1, current + 1, current - width, current + width):
                if neighbour < 0 or neighbour >= len(mask) or not mask[neighbour]:
                    continue
                neighbour_y, neighbour_x = divmod(neighbour, width)
                if abs(neighbour_x - x) + abs(neighbour_y - y) != 1:
                    continue
                mask[neighbour] = 0
                queue.append(neighbour)
        if size > best_size:
            best_size = size
            best_top = top

    if best_top is None or best_size < 80:
        raise ValueError(f"Could not locate the {kind} hair reference")
    return best_top


def alpha_geometry(image: Image.Image) -> tuple[tuple[int, int, int, int], float]:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("Empty sprite cell")
    left, top, right, bottom = bbox
    foot_top = max(top, bottom - max(18, round((bottom - top) * 0.14)))
    alpha_pixels = alpha.load()
    feet_x = [
        x
        for y in range(foot_top, bottom)
        for x in range(left, right)
        if alpha_pixels[x, y] > 32
    ]
    if not feet_x:
        raise ValueError("Could not locate sprite footing")
    return bbox, sum(feet_x) / len(feet_x)


def body_height(image: Image.Image, hair: str) -> int:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Empty sprite cell")
    return bbox[3] - largest_hair_component_top(image, hair)


def split_strip(image: Image.Image) -> list[Image.Image]:
    if image.width % POSE_COUNT:
        raise ValueError(f"Sprite strip width {image.width} is not divisible by {POSE_COUNT}")
    cell_width = image.width // POSE_COUNT
    return [
        image.crop((pose * cell_width, 0, (pose + 1) * cell_width, image.height))
        for pose in range(POSE_COUNT)
    ]


def resized_for_body_height(source: Image.Image, target_body_height: int, hair: str) -> Image.Image:
    source_body_height = body_height(source, hair)
    scale = target_body_height / source_body_height
    resized = source
    for _ in range(4):
        resized = source.resize(
            (max(1, round(source.width * scale)), max(1, round(source.height * scale))),
            Image.Resampling.LANCZOS,
        )
        actual_body_height = body_height(resized, hair)
        if abs(actual_body_height - target_body_height) <= 1:
            break
        scale *= target_body_height / actual_body_height
    return resized


def normalise_cell(
    source: Image.Image,
    *,
    target_body_height: int,
    target_bottom: int,
    output_size: tuple[int, int],
    hair: str,
) -> Image.Image:
    """Scale around the body, plant the feet, and retain the complete pose."""
    output_width, output_height = output_size
    resized = resized_for_body_height(source, target_body_height, hair)
    bbox, feet_center = alpha_geometry(resized)
    left, top, right, bottom = bbox

    if right - left > output_width - SAFE_MARGIN * 2:
        raise ValueError(
            f"Pose cannot retain target body height {target_body_height} within width: {bbox}"
        )

    x = round(output_width / 2 - feet_center)
    y = target_bottom - bottom
    placed_left = x + left
    placed_right = x + right
    if placed_left < SAFE_MARGIN:
        x += SAFE_MARGIN - placed_left
    if x + right > output_width - SAFE_MARGIN:
        x -= x + right - (output_width - SAFE_MARGIN)

    placed_bbox = (x + left, y + top, x + right, y + bottom)
    margins = (
        placed_bbox[0],
        placed_bbox[1],
        output_width - placed_bbox[2],
        output_height - placed_bbox[3],
    )
    if min(margins) < SAFE_MARGIN:
        raise ValueError(f"Normalised cell violates {SAFE_MARGIN}px safe margins: {placed_bbox}")

    result = Image.new("RGBA", output_size, (0, 0, 0, 0))
    result.alpha_composite(resized, (x, y))
    result_bbox = result.getchannel("A").getbbox()
    if result_bbox is None or result_bbox[3] != target_bottom:
        raise ValueError(f"Normalised footing is unstable: {result_bbox}, expected bottom {target_bottom}")
    return result


def alpha_component_sizes(image: Image.Image, threshold: int = 32) -> list[int]:
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.load()
    active = bytearray(width * height)
    for y in range(height):
        offset = y * width
        for x in range(width):
            if pixels[x, y] > threshold:
                active[offset + x] = 1

    sizes: list[int] = []
    for start, value in enumerate(active):
        if not value:
            continue
        active[start] = 0
        queue = deque([start])
        size = 0
        while queue:
            current = queue.popleft()
            size += 1
            y, x = divmod(current, width)
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
        sizes.append(size)
    return sorted(sizes, reverse=True)


def join_strip(cells: list[Image.Image]) -> Image.Image:
    cell_width, cell_height = cells[0].size
    if len(cells) != POSE_COUNT or any(cell.size != (cell_width, cell_height) for cell in cells):
        raise ValueError("Invalid sprite cells")
    strip = Image.new("RGBA", (cell_width * POSE_COUNT, cell_height), (0, 0, 0, 0))
    for pose, cell in enumerate(cells):
        strip.alpha_composite(cell, (pose * cell_width, 0))
    return strip


def output_paths(spec: ActionSpec) -> tuple[Path, Path, Path, Path]:
    return tuple(IMAGE_DIR / name for name in spec.source_names)


def build_a(spec: ActionSpec) -> dict[Path, Image.Image]:
    outputs: dict[Path, Image.Image] = {}
    for path in output_paths(spec):
        source = Image.open(path).convert("RGBA")
        if source.size != (spec.output_width * POSE_COUNT, spec.output_height):
            raise ValueError(f"Unexpected source size for {path.name}: {source.size}")
        cells = [
            normalise_cell(
                cell,
                target_body_height=A_COMMON_BODY_HEIGHT,
                target_bottom=770,
                output_size=(spec.output_width, spec.output_height),
                hair=spec.hair,
            )
            for cell in split_strip(source)
        ]
        outputs[path] = join_strip(cells)
    return outputs


def build_f(spec: ActionSpec) -> dict[Path, Image.Image]:
    base = Image.open(IMAGE_DIR / spec.base_name).convert("RGBA")
    if base.size != (spec.output_width * POSE_COUNT, 512):
        raise ValueError(f"Unexpected F base size: {base.size}")
    base_cells = split_strip(base)
    canvas_ratio = spec.output_height / base.height
    target_body_heights = [round(body_height(cell, spec.hair) * canvas_ratio) for cell in base_cells]
    target_bottoms = []
    for cell in base_cells:
        bbox = cell.getchannel("A").getbbox()
        if bbox is None:
            raise ValueError("Empty F base cell")
        base_gap = base.height - bbox[3]
        target_gap = round(base_gap * canvas_ratio)
        target_bottoms.append(spec.output_height - target_gap)

    outputs: dict[Path, Image.Image] = {}
    for path in output_paths(spec):
        source = Image.open(path).convert("RGBA")
        if source.size != (spec.output_width * POSE_COUNT, spec.output_height):
            raise ValueError(f"Unexpected source size for {path.name}: {source.size}")
        source_cells = split_strip(source)
        # The approved right-side throws carry the correct release arm, while
        # the generated left-side cells still throw across the body.  Build
        # the four left directions from their exact opposite counterparts so
        # the animation, hand, and projectile all stay in one hemisphere.
        for pose in MIRRORED_LEFT_THROW_POSES:
            opposite = POSE_COUNT - 1 - pose
            source_cells[pose] = source_cells[opposite].transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        cells = [
            normalise_cell(
                cell,
                target_body_height=target_body_heights[pose],
                target_bottom=target_bottoms[pose],
                output_size=(spec.output_width, spec.output_height),
                hair=spec.hair,
            )
            for pose, cell in enumerate(source_cells)
        ]
        outputs[path] = join_strip(cells)
    return outputs


def verify_safe_cell(cell: Image.Image, name: str, pose: int) -> tuple[int, int]:
    bbox = cell.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError(f"Empty {name} pose {pose}")
    margins = (bbox[0], bbox[1], cell.width - bbox[2], cell.height - bbox[3])
    if min(margins) < SAFE_MARGIN:
        raise ValueError(f"Unsafe crop margin in {name} pose {pose}: {bbox}")
    return bbox[3], min(margins)


def verify_a_assets(assets: dict[Path, Image.Image]) -> None:
    heights: list[int] = []
    bottoms: list[int] = []
    for path, image in assets.items():
        if image.size != (512 * POSE_COUNT, 800):
            raise ValueError(f"Unexpected A size for {path.name}: {image.size}")
        for pose, cell in enumerate(split_strip(image)):
            bottom, _ = verify_safe_cell(cell, path.name, pose)
            heights.append(body_height(cell, "pink"))
            bottoms.append(bottom)
    if max(heights) / min(heights) > MAX_SCALE_RATIO:
        raise ValueError(f"A body scale spread exceeds 3%: {min(heights)}..{max(heights)}")
    if max(bottoms) - min(bottoms) > 1:
        raise ValueError(f"A footing drift exceeds 1px: {min(bottoms)}..{max(bottoms)}")


def verify_f_assets(assets: dict[Path, Image.Image]) -> None:
    base = Image.open(IMAGE_DIR / "character-f.png").convert("RGBA")
    base_cells = split_strip(base)
    screen_heights: list[float] = []
    for path, image in assets.items():
        if image.size != (512 * POSE_COUNT, 640):
            raise ValueError(f"Unexpected F size for {path.name}: {image.size}")
        for pose, cell in enumerate(split_strip(image)):
            bottom, _ = verify_safe_cell(cell, path.name, pose)
            action_screen_height = body_height(cell, "red") / image.height
            base_bbox = base_cells[pose].getchannel("A").getbbox()
            if base_bbox is None:
                raise ValueError(f"Empty F base pose {pose}")
            base_screen_height = body_height(base_cells[pose], "red") / base.height
            ratio = action_screen_height / base_screen_height
            if not 0.97 <= ratio <= 1.03:
                raise ValueError(f"F screen scale drift in {path.name} pose {pose}: {ratio:.3f}")
            action_foot_gap = (image.height - bottom) / image.height
            base_foot_gap = (base.height - base_bbox[3]) / base.height
            if abs(action_foot_gap - base_foot_gap) > 1 / base.height:
                raise ValueError(f"F screen foot-gap drift in {path.name} pose {pose}")
            component_sizes = alpha_component_sizes(cell)
            if not component_sizes or component_sizes[0] < 8_000:
                raise ValueError(f"F defender missing in {path.name} pose {pose}")
            if any(size >= 128 for size in component_sizes[1:]):
                raise ValueError(f"Detached F projectile in {path.name} pose {pose}: {component_sizes[:4]}")
            screen_heights.append(action_screen_height)
    if max(screen_heights) / min(screen_heights) > MAX_SCALE_RATIO:
        raise ValueError(
            f"F direction/frame screen scale spread exceeds 3%: "
            f"{min(screen_heights):.4f}..{max(screen_heights):.4f}"
        )


def load_current_assets(spec: ActionSpec) -> dict[Path, Image.Image]:
    return {path: Image.open(path).convert("RGBA") for path in output_paths(spec)}


def save_assets(assets: dict[Path, Image.Image]) -> None:
    for path, image in assets.items():
        image.save(path, optimize=True)
        image.save(path.with_suffix(".webp"), format="WEBP", quality=92, method=6)


def verify_png_webp_pairs(paths: list[Path]) -> None:
    for path in paths:
        png = Image.open(path).convert("RGBA")
        webp = Image.open(path.with_suffix(".webp")).convert("RGBA")
        if png.size != webp.size or png.getchannel("A").tobytes() != webp.getchannel("A").tobytes():
            raise ValueError(f"PNG/WebP dimensions or alpha differ for {path.name}")


def report(assets: dict[Path, Image.Image], hair: str) -> None:
    values: list[int] = []
    bottoms: list[int] = []
    margins: list[int] = []
    for path, image in assets.items():
        frame_values = []
        for pose, cell in enumerate(split_strip(image)):
            bottom, margin = verify_safe_cell(cell, path.name, pose)
            height = body_height(cell, hair)
            frame_values.append(height)
            values.append(height)
            bottoms.append(bottom)
            margins.append(margin)
        print(f"{path.name}: body heights {' '.join(map(str, frame_values))}")
    print(
        f"body range {min(values)}..{max(values)} "
        f"({max(values) / min(values):.4f}x), "
        f"bottom {min(bottoms)}..{max(bottoms)}, safe margin min {min(margins)}px"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="validate current production strips without rewriting them",
    )
    parser.add_argument(
        "--character",
        choices=("all", "a", "f"),
        default="all",
        help="limit rebuild/verification to one defender",
    )
    args = parser.parse_args()

    selected_specs = [
        spec for spec in SPECS
        if args.character == "all" or spec.character == args.character
    ]
    assets_by_character: dict[str, dict[Path, Image.Image]] = {}
    for spec in selected_specs:
        assets = (
            load_current_assets(spec)
            if args.verify_only
            else build_a(spec) if spec.character == "a" else build_f(spec)
        )
        if spec.character == "a":
            verify_a_assets(assets)
        else:
            verify_f_assets(assets)
        assets_by_character[spec.character] = assets

    if not args.verify_only:
        combined_assets = {
            path: image
            for assets in assets_by_character.values()
            for path, image in assets.items()
        }
        # Validate every selected sheet in memory before the first write.
        save_assets(combined_assets)
        verify_png_webp_pairs(list(combined_assets))

    for spec in selected_specs:
        assets = assets_by_character[spec.character]
        if spec.character == "a":
            verify_a_assets(assets)
        else:
            verify_f_assets(assets)
        print(f"character {spec.character.upper()}")
        report(assets, spec.hair)
    selected_label = "A/F" if args.character == "all" else args.character.upper()
    print(
        f"{'verified' if args.verify_only else 'rebuilt and verified'} "
        f"{selected_label} commercial-scale sheets"
    )


if __name__ == "__main__":
    main()
