"""Repair and verify character G's nine-direction sprite sheets.

The source sheets contain five cells whose whole render faces the opposite
horizontal hemisphere.  Mirroring those cells is deliberately preferable to
regenerating them: it preserves the approved character identity, animation,
scale, alpha coverage, and planted baseline pixel-for-pixel.

Direction order: 10, 10:30, 11, 11:30, 12, 12:30, 1, 1:30, 2 o'clock.
"""

from __future__ import annotations

import argparse
from math import atan2, degrees
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
IMAGE_DIR = ROOT / "assets" / "images"
POSE_COUNT = 9
POSE_LABELS = ("10", "10:30", "11", "11:30", "12", "12:30", "1", "1:30", "2")
FLIP_CELLS = frozenset((2, 3, 5, 6, 7))
SHEET_STEMS = (
    "character-g",
    "character-g-attack-0",
    "character-g-attack-1",
    "character-g-attack-2",
    "character-g-attack-3",
)


def split_strip(image: Image.Image) -> list[Image.Image]:
    image = image.convert("RGBA")
    if image.width % POSE_COUNT:
        raise ValueError(f"strip width {image.width} is not divisible by {POSE_COUNT}")
    cell_width = image.width // POSE_COUNT
    return [
        image.crop((index * cell_width, 0, (index + 1) * cell_width, image.height))
        for index in range(POSE_COUNT)
    ]


def join_strip(cells: list[Image.Image]) -> Image.Image:
    if len(cells) != POSE_COUNT:
        raise ValueError(f"expected {POSE_COUNT} cells, got {len(cells)}")
    cell_size = cells[0].size
    if any(cell.size != cell_size for cell in cells):
        raise ValueError("sprite cells do not share one size")
    result = Image.new("RGBA", (cell_size[0] * POSE_COUNT, cell_size[1]), (0, 0, 0, 0))
    for index, cell in enumerate(cells):
        result.alpha_composite(cell.convert("RGBA"), (index * cell_size[0], 0))
    return result


def electric_weapon_angle(cell: Image.Image) -> float:
    """Return the electric weapon's unsigned screen-space axis in degrees.

    G's cannon has a distinctive blue/purple material.  In the upper 55% of
    the visible sprite, those pixels form the barrel's dominant PCA axis.
    Values below 90 point left, 90 is vertical, and values above 90 point
    right.  The broad material mask is intentional: it remains stable across
    the neutral, charged, discharge, and settled animation frames.
    """

    cell = cell.convert("RGBA")
    bbox = cell.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("empty character G sprite cell")
    _, top, _, bottom = bbox
    weapon_bottom = top + round((bottom - top) * 0.55)
    points: list[tuple[int, int]] = []
    pixels = cell.load()
    for y in range(top, weapon_bottom):
        for x in range(cell.width):
            red, green, blue, alpha = pixels[x, y]
            if (
                alpha > 40
                and blue > 60
                and blue * 100 > red * 102
                and blue > green
            ):
                points.append((x, y))
    if len(points) < 250:
        raise ValueError(f"electric weapon material mask is too small: {len(points)} pixels")

    mean_x = sum(x for x, _ in points) / len(points)
    mean_y = sum(y for _, y in points) / len(points)
    covariance_xx = sum((x - mean_x) ** 2 for x, _ in points) / len(points)
    covariance_yy = sum((y - mean_y) ** 2 for _, y in points) / len(points)
    covariance_xy = sum((x - mean_x) * (y - mean_y) for x, y in points) / len(points)
    angle = degrees(0.5 * atan2(2 * covariance_xy, covariance_xx - covariance_yy))
    return angle + 180 if angle < 0 else angle


def direction_angles(image: Image.Image) -> list[float]:
    return [electric_weapon_angle(cell) for cell in split_strip(image)]


def validate_direction_progression(stem: str, angles: list[float]) -> None:
    if len(angles) != POSE_COUNT:
        raise ValueError(f"{stem}: invalid angle count")
    if not all(angle < 88 for angle in angles[:4]):
        raise ValueError(f"{stem}: left-side cells do not point left: {angles[:4]}")
    if not 84 <= angles[4] <= 97:
        raise ValueError(f"{stem}: 12 o'clock cell is not centred: {angles[4]:.1f}")
    if not all(angle > 95 for angle in angles[5:]):
        raise ValueError(f"{stem}: right-side cells do not point right: {angles[5:]}")
    if any(right < left - 2 for left, right in zip(angles, angles[1:])):
        raise ValueError(f"{stem}: weapon angles regress across directions: {angles}")
    if any(right - left > 22 for left, right in zip(angles, angles[1:])):
        raise ValueError(f"{stem}: weapon angle progression has an abrupt jump: {angles}")
    if angles[-1] - angles[0] < 48:
        raise ValueError(f"{stem}: directional range is too narrow: {angles}")


def validate_source_mismatch(stem: str, angles: list[float]) -> None:
    """Refuse to mirror an unknown or already-partly-edited source sheet."""

    if not all(angles[index] > 90 for index in (2, 3)):
        raise ValueError(f"{stem}: expected cells 2/3 to be the known right-facing mismatch: {angles}")
    if not all(angles[index] < 90 for index in (5, 6, 7)):
        raise ValueError(f"{stem}: expected cells 5/6/7 to be the known left-facing mismatch: {angles}")
    if not (angles[0] < 90 and angles[1] < 90 and 80 <= angles[4] <= 100 and angles[8] > 90):
        raise ValueError(f"{stem}: untouched direction anchors are unexpected: {angles}")


def validate_lossless_geometry(
    stem: str,
    source_cells: list[Image.Image],
    repaired_cells: list[Image.Image],
) -> None:
    for index, (source, repaired) in enumerate(zip(source_cells, repaired_cells)):
        if source.size != repaired.size:
            raise ValueError(f"{stem} cell {index}: dimensions changed")
        source_alpha = source.getchannel("A")
        repaired_alpha = repaired.getchannel("A")
        if source_alpha.histogram() != repaired_alpha.histogram():
            raise ValueError(f"{stem} cell {index}: alpha coverage changed")
        source_bbox = source_alpha.getbbox()
        repaired_bbox = repaired_alpha.getbbox()
        if source_bbox is None or repaired_bbox is None:
            raise ValueError(f"{stem} cell {index}: empty alpha bounds")
        if index in FLIP_CELLS:
            expected = (
                source.width - source_bbox[2],
                source_bbox[1],
                source.width - source_bbox[0],
                source_bbox[3],
            )
            if repaired_bbox != expected:
                raise ValueError(
                    f"{stem} cell {index}: mirrored margins/baseline changed "
                    f"({repaired_bbox} != {expected})"
                )
        elif repaired.tobytes() != source.tobytes():
            raise ValueError(f"{stem} cell {index}: untouched pixels changed")


def save_png_webp(image: Image.Image, png_path: Path) -> None:
    image.save(png_path, format="PNG", optimize=True)
    image.save(png_path.with_suffix(".webp"), format="WEBP", quality=92, method=6)


def validate_png_webp_pair(stem: str) -> None:
    png = Image.open(IMAGE_DIR / f"{stem}.png").convert("RGBA")
    webp = Image.open(IMAGE_DIR / f"{stem}.webp").convert("RGBA")
    if png.size != webp.size:
        raise ValueError(f"{stem}: PNG/WebP dimensions differ")
    if png.getchannel("A").tobytes() != webp.getchannel("A").tobytes():
        raise ValueError(f"{stem}: PNG/WebP alpha channels differ")


def verify_outputs() -> None:
    for stem in SHEET_STEMS:
        image = Image.open(IMAGE_DIR / f"{stem}.png").convert("RGBA")
        angles = direction_angles(image)
        validate_direction_progression(stem, angles)
        validate_png_webp_pair(stem)
        print(f"{stem}: " + " ".join(f"{label}={angle:.1f}" for label, angle in zip(POSE_LABELS, angles)))

    settled = Image.open(IMAGE_DIR / "character-g-attack-2.png").convert("RGBA")
    recovery = Image.open(IMAGE_DIR / "character-g-attack-3.png").convert("RGBA")
    if settled.tobytes() != recovery.tobytes():
        raise ValueError("character G's recovery frame no longer matches its settled frame")


def repair_outputs() -> None:
    sources: dict[str, tuple[list[Image.Image], bool]] = {}
    needs_any_repair = False
    for stem in SHEET_STEMS:
        source = Image.open(IMAGE_DIR / f"{stem}.png").convert("RGBA")
        angles = direction_angles(source)
        try:
            validate_direction_progression(stem, angles)
            needs_repair = False
        except ValueError:
            validate_source_mismatch(stem, angles)
            needs_repair = True
            needs_any_repair = True
        sources[stem] = (split_strip(source), needs_repair)

    if not needs_any_repair:
        verify_outputs()
        print("character G direction sheets already repaired; no files rewritten")
        return

    repaired: dict[str, Image.Image] = {}
    for stem, (source_cells, needs_repair) in sources.items():
        if not needs_repair:
            continue
        repaired_cells = [
            cell.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if index in FLIP_CELLS else cell.copy()
            for index, cell in enumerate(source_cells)
        ]
        validate_lossless_geometry(stem, source_cells, repaired_cells)
        strip = join_strip(repaired_cells)
        validate_direction_progression(stem, direction_angles(strip))
        repaired[stem] = strip

    for stem, strip in repaired.items():
        save_png_webp(strip, IMAGE_DIR / f"{stem}.png")
    verify_outputs()
    print("repaired character G's base and four attack direction sheets")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="mirror the known mismatched cells")
    args = parser.parse_args()
    if args.apply:
        repair_outputs()
    else:
        verify_outputs()
        print("verified character G direction sheets")


if __name__ == "__main__":
    main()
