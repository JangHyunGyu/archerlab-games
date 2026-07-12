"""Rebuild defender action strips from the existing approved character art.

The source attack renders were generated independently and changed body scale
between frames.  This script keeps every pose bottom-centred, normalises the
hair-to-feet body height against the matching base pose, and gives weapons
enough transparent room so no frame can be cropped in the game.
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


@dataclass(frozen=True)
class ActionSpec:
    character: str
    action: str
    base_name: str
    source_names: tuple[str, str, str, str]
    expected_source_widths: tuple[int, int, int, int]
    output_width: int
    output_height: int
    hair: str
    alias_frame_zero: bool = False


SPECS = (
    ActionSpec(
        character="a",
        action="attack",
        base_name="character-a.png",
        # The approved base pose is the anticipation frame. Runtime aliases it
        # as attack frame zero, so only the three distinct follow-up strips
        # remain as source files.
        source_names=(
            "character-a.png",
            "character-a-attack-1.png",
            "character-a-attack-2.png",
            "character-a-attack-3.png",
        ),
        expected_source_widths=(4608, 4608, 4608, 4608),
        output_width=512,
        output_height=800,
        hair="pink",
        alias_frame_zero=True,
    ),
    ActionSpec(
        character="f",
        action="throw",
        base_name="character-f.png",
        source_names=tuple(f"character-f-throw-{frame}.png" for frame in range(4)),
        expected_source_widths=(4608, 4608, 4608, 4608),
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
    left, top, right, bottom_exclusive = bbox
    bottom = bottom_exclusive - 1
    sample_top = max(top, bottom - max(18, round((bottom - top + 1) * 0.14)))
    alpha_pixels = alpha.load()
    feet_x = [
        x
        for y in range(sample_top, bottom + 1)
        for x in range(left, right)
        if alpha_pixels[x, y] > 32
    ]
    if not feet_x:
        raise ValueError("Could not locate sprite footing")
    return (left, top, right, bottom_exclusive), sum(feet_x) / len(feet_x)


def split_strip(image: Image.Image) -> list[Image.Image]:
    cell_width = image.width // POSE_COUNT
    if cell_width * POSE_COUNT != image.width:
        raise ValueError(f"Sprite strip width {image.width} is not divisible by {POSE_COUNT}")
    return [
        image.crop((pose * cell_width, 0, (pose + 1) * cell_width, image.height))
        for pose in range(POSE_COUNT)
    ]


def normalise_cell(
    source: Image.Image,
    target_body_height: int,
    target_bottom: int,
    output_size: tuple[int, int],
    hair: str,
) -> Image.Image:
    output_width, output_height = output_size
    hair_top = largest_hair_component_top(source, hair)
    bbox, feet_center = alpha_geometry(source)
    left, top, right, bottom_exclusive = bbox
    bottom = bottom_exclusive - 1
    body_height = bottom - hair_top + 1
    scale = target_body_height / body_height

    margin = 14
    bbox_width = right - left
    bbox_height = bottom_exclusive - top
    scale = min(
        scale,
        (output_width - margin * 2) / bbox_width,
        (target_bottom - margin) / max(1, bottom - top),
    )

    resized = source.resize(
        (max(1, round(source.width * scale)), max(1, round(source.height * scale))),
        Image.Resampling.LANCZOS,
    )
    x = round(output_width / 2 - feet_center * scale)
    y = round(target_bottom - bottom * scale)

    scaled_left = x + round(left * scale)
    scaled_right = x + round(right * scale)
    if scaled_left < margin:
        x += margin - scaled_left
    elif scaled_right > output_width - margin:
        x -= scaled_right - (output_width - margin)

    result = Image.new("RGBA", (output_width, output_height), (0, 0, 0, 0))
    result.alpha_composite(resized, (x, y))
    return result


def save_strip(cells: list[Image.Image], png_path: Path) -> None:
    cell_width, cell_height = cells[0].size
    strip = Image.new("RGBA", (cell_width * POSE_COUNT, cell_height), (0, 0, 0, 0))
    for pose, cell in enumerate(cells):
        strip.alpha_composite(cell, (pose * cell_width, 0))
    strip.save(png_path, optimize=True)
    strip.save(png_path.with_suffix(".webp"), format="WEBP", quality=92, method=6)


def rebuild(spec: ActionSpec) -> None:
    base = Image.open(IMAGE_DIR / spec.base_name).convert("RGBA")
    base_cells = split_strip(base)
    sources = [Image.open(IMAGE_DIR / name).convert("RGBA") for name in spec.source_names]
    actual_widths = tuple(image.width for image in sources)
    if actual_widths != spec.expected_source_widths:
        raise ValueError(
            f"Refusing to rebuild character {spec.character}: expected source widths "
            f"{spec.expected_source_widths}, got {actual_widths}. The tool is intentionally one-shot."
        )
    source_frames = [split_strip(image) for image in sources]
    base_offset = (spec.output_height - base.height) / 2

    output_frames: list[list[Image.Image]] = [[] for _ in range(4)]
    for pose, base_cell in enumerate(base_cells):
        base_hair_top = largest_hair_component_top(base_cell, spec.hair)
        base_bbox, _ = alpha_geometry(base_cell)
        base_bottom = base_bbox[3] - 1
        target_body_height = base_bottom - base_hair_top + 1
        target_bottom = round(base_bottom + base_offset)
        for frame in range(4):
            output_frames[frame].append(
                normalise_cell(
                    source_frames[frame][pose],
                    target_body_height,
                    target_bottom,
                    (spec.output_width, spec.output_height),
                    spec.hair,
                )
            )

    for frame, cells in enumerate(output_frames):
        if frame == 0 and spec.alias_frame_zero:
            continue
        save_strip(cells, IMAGE_DIR / f"character-{spec.character}-{spec.action}-{frame}.png")


def verify(spec: ActionSpec) -> None:
    expected_size = (spec.output_width * POSE_COUNT, spec.output_height)
    base_cells = split_strip(Image.open(IMAGE_DIR / spec.base_name).convert("RGBA"))
    target_body_heights = []
    for base_cell in base_cells:
        base_bbox, _ = alpha_geometry(base_cell)
        target_body_heights.append(
            base_bbox[3] - largest_hair_component_top(base_cell, spec.hair)
        )
    for frame in range(4):
        path = (
            IMAGE_DIR / spec.base_name
            if frame == 0 and spec.alias_frame_zero
            else IMAGE_DIR / f"character-{spec.character}-{spec.action}-{frame}.png"
        )
        image = Image.open(path).convert("RGBA")
        if image.size != expected_size:
            raise ValueError(f"Unexpected size for {path.name}: {image.size}")
        for pose, cell in enumerate(split_strip(image)):
            bbox = cell.getchannel("A").getbbox()
            if bbox is None:
                raise ValueError(f"Empty {path.name} pose {pose}")
            left, top, right, bottom = bbox
            if min(left, top, spec.output_width - right, spec.output_height - bottom) < 8:
                raise ValueError(f"Unsafe crop margin in {path.name} pose {pose}: {bbox}")
            body_height = bottom - 1 - largest_hair_component_top(cell, spec.hair) + 1
            ratio = body_height / target_body_heights[pose]
            if not 0.97 <= ratio <= 1.03:
                raise ValueError(
                    f"Body scale drift in {path.name} pose {pose}: {ratio:.3f}"
                )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="validate the rebuilt strips without rewriting them",
    )
    args = parser.parse_args()
    for spec in SPECS:
        if not args.verify_only:
            rebuild(spec)
        verify(spec)
        print(
            f"{'verified' if args.verify_only else 'rebuilt'} "
            f"character-{spec.character}-{spec.action}: "
            f"4 x {spec.output_width * POSE_COUNT}x{spec.output_height} PNG/WebP strips"
        )


if __name__ == "__main__":
    main()
