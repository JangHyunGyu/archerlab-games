from __future__ import annotations

"""Build character motion frames from separate body and weapon sources.

Source layout::

    assets/player/motion_v2_sources/<character_id>/
        walk_down_chroma.png
        walk_right_chroma.png
        walk_up_chroma.png
        attack_down_chroma.png
        attack_right_chroma.png
        attack_up_chroma.png

Each body source is a horizontal strip of four poses; generated cell widths
need not be equal.  Weaponed characters use one independently rendered weapon
master plus explicit direction/pose sockets, then bake the two reviewed layers
into the existing 112x144 runtime-frame contract.
"""

import argparse
from collections import deque
from dataclasses import dataclass, field, replace
import hashlib
import math
import os
from pathlib import Path
import shutil
import statistics
import tempfile
from typing import Mapping, Sequence

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_ROOT = ROOT / "assets" / "player" / "motion_v2_sources"
DEFAULT_PREVIEW_ROOT = ROOT.parent.parent / "_codex_tmp" / "solo-leveling-motion-v2"

FRAME_W = 112
FRAME_H = 144
FOOT_Y = 138  # Alpha bbox bottom (exclusive), matching the current motion assets.
MIN_PADDING = 4
MAX_BODY_W = FRAME_W - MIN_PADDING * 2
MAX_BODY_H = FOOT_Y - MIN_PADDING
MAX_SOURCE_CELL_SIZE = 384  # Still ~3x the final body height, but avoids wasting work on chroma pixels.
WALK_POSE_MAP = (0, 0, 1, 1, 2, 2, 3, 3)
ATTACK_POSE_MAP: tuple[int | None, ...] = (0, 1, 2, 2, 3, None)
SOURCE_TRACKS = (
    "walk_down",
    "walk_right",
    "walk_up",
    "attack_down",
    "attack_right",
    "attack_up",
)
DIRECTIONS = ("down", "right", "up", "left")


@dataclass(frozen=True)
class WeaponSocket:
    """Explicit weapon attachment in final 112x144 frame coordinates."""

    x: float
    y: float
    angle_degrees: float = 0.0
    length: float = 32.0
    layer: str = "front"


@dataclass(frozen=True)
class WeaponProfile:
    source_filename: str
    grip_fraction: tuple[float, float]
    brightness: float = 1.0
    length_scale: float = 1.0
    thickness_scale: float = 1.0
    glow_color: tuple[int, int, int] | None = None
    glow_alpha: int = 0
    minimum_visible_pixels: int = 32
    minimum_visible_extent: int = 18


@dataclass(frozen=True)
class CharacterProfile:
    character_id: str
    output_relative: Path
    filename_prefix: str = ""
    socket_profile: str | None = None
    weapon_profile: WeaponProfile | None = None
    socket_overrides: Mapping[str, WeaponSocket] = field(default_factory=dict)
    body_track_adjustments: Mapping[str, tuple[float, int, int]] = field(default_factory=dict)


@dataclass(frozen=True)
class CleanPose:
    track: str
    pose_index: int
    image: Image.Image
    source_cell_size: tuple[int, int]
    source_bbox: tuple[int, int, int, int]
    removed_ratio: float
    residual_green_ratio: float


@dataclass(frozen=True)
class MotionFrame:
    name: str
    image: Image.Image
    source_track: str
    source_pose: int | None
    root_anchor: tuple[int, int] = (FRAME_W // 2, FOOT_Y)
    weapon_socket: WeaponSocket | None = None
    weapon_visible_pixels: int = 0
    weapon_visible_extent: int = 0


CHARACTER_PROFILES: dict[str, CharacterProfile] = {
    "shadow_monarch": CharacterProfile(
        character_id="shadow_monarch",
        output_relative=Path("assets/player/motion"),
        filename_prefix="player_",
        socket_profile="shadow_monarch",
        weapon_profile=WeaponProfile(
            "shadow_dagger_chroma.png",
            (0.225, 0.50),
            brightness=1.55,
            length_scale=1.55,
            thickness_scale=1.30,
            glow_color=(142, 84, 255),
            glow_alpha=105,
            minimum_visible_pixels=52,
            minimum_visible_extent=25,
        ),
        # The right thrust reaches the 112px frame edge before its separately
        # rendered blade can emerge.  A subtle uniform pull-back preserves the
        # pose while reserving a reviewed full-dagger corridor.
        body_track_adjustments={"attack_right": (0.92, -3, 0)},
    ),
    "light_swordswoman": CharacterProfile(
        character_id="light_swordswoman",
        output_relative=Path("assets/player/characters/light_swordswoman/motion"),
        socket_profile="light_swordswoman",
        weapon_profile=WeaponProfile(
            "light_sword_chroma.png",
            (0.140, 0.50),
            brightness=1.08,
            length_scale=1.42,
            thickness_scale=1.34,
            glow_color=(255, 214, 92),
            glow_alpha=92,
            minimum_visible_pixels=64,
            minimum_visible_extent=34,
        ),
    ),
    "white_tiger_brawler": CharacterProfile(
        character_id="white_tiger_brawler",
        output_relative=Path("assets/player/characters/white_tiger_brawler/motion"),
        socket_profile="white_tiger_brawler",
    ),
    "flame_mage": CharacterProfile(
        character_id="flame_mage",
        output_relative=Path("assets/player/characters/flame_mage/motion"),
        socket_profile="flame_mage",
    ),
    "sanctuary_healer": CharacterProfile(
        character_id="sanctuary_healer",
        output_relative=Path("assets/player/characters/sanctuary_healer/motion"),
        socket_profile="sanctuary_healer",
        weapon_profile=WeaponProfile(
            "sanctuary_staff_chroma.png",
            (0.615, 0.50),
            brightness=1.08,
            length_scale=1.28,
            thickness_scale=1.24,
            glow_color=(79, 255, 187),
            glow_alpha=86,
            minimum_visible_pixels=78,
            minimum_visible_extent=46,
        ),
    ),
}


def weapon_sockets(*values: tuple[float, float, float, float, str]) -> tuple[WeaponSocket, ...]:
    """Keep socket tables compact while retaining fully explicit pose data."""

    return tuple(WeaponSocket(x, y, angle, length, layer) for x, y, angle, length, layer in values)


# Every tuple is source pose 0..3.  Left-facing frames are exact mirrors of
# their composited right-facing equivalents, so they intentionally do not have
# a second hand-authored table that could drift out of symmetry.
SOCKET_PROFILES: dict[str, dict[str, tuple[WeaponSocket, ...]]] = {
    "shadow_monarch": {
        "walk_down": weapon_sockets(
            (71, 94, -64, 29, "front"), (72, 93, -62, 29, "front"),
            (71, 97, -68, 29, "front"), (70, 96, -66, 29, "front"),
        ),
        "walk_right": weapon_sockets(
            (69, 91, -52, 29, "front"), (71, 89, -50, 29, "front"),
            (72, 94, -58, 29, "front"), (70, 92, -55, 29, "front"),
        ),
        "walk_up": weapon_sockets(
            (38, 94, -118, 29, "behind"), (39, 92, -116, 29, "behind"),
            (38, 96, -122, 29, "behind"), (39, 94, -120, 29, "behind"),
        ),
        "attack_down": weapon_sockets(
            (42, 44, 160, 28, "front"), (31, 42, 160, 28, "front"),
            (48, 76, -100, 28, "front"), (27, 64, 170, 24, "front"),
        ),
        "attack_right": weapon_sockets(
            (77, 93, -12, 20, "front"), (85, 83, -5, 20, "front"),
            (94, 71, 0, 18, "front"), (75, 88, -10, 20, "front"),
        ),
        "attack_up": weapon_sockets(
            (74, 49, 90, 26, "front"), (91, 72, 110, 25, "front"),
            (94, 33, 150, 25, "front"), (90, 79, 110, 25, "front"),
        ),
    },
    "light_swordswoman": {
        "walk_down": weapon_sockets(
            (39, 93, -100, 43, "front"), (40, 92, -99, 43, "front"),
            (39, 96, -103, 41, "front"), (40, 94, -101, 42, "front"),
        ),
        "walk_right": weapon_sockets(
            (70, 89, -66, 42, "front"), (72, 88, -64, 42, "front"),
            (72, 94, -70, 40, "front"), (71, 91, -68, 41, "front"),
        ),
        "walk_up": weapon_sockets(
            (73, 93, -104, 40, "behind"), (74, 91, -103, 40, "behind"),
            (73, 95, -108, 39, "behind"), (74, 93, -106, 39, "behind"),
        ),
        "attack_down": weapon_sockets(
            (42, 84, -78, 41, "front"), (46, 78, -60, 40, "front"),
            (79, 62, -22, 35, "front"), (71, 89, -70, 39, "front"),
        ),
        "attack_right": weapon_sockets(
            (67, 88, -64, 39, "front"), (72, 78, -34, 38, "front"),
            (80, 72, 24, 34, "front"), (80, 72, 24, 34, "front"),
        ),
        "attack_up": weapon_sockets(
            (64, 84, 48, 37, "behind"), (69, 71, 56, 36, "behind"),
            (76, 51, 64, 34, "behind"), (73, 90, -104, 39, "behind"),
        ),
    },
    "sanctuary_healer": {
        "walk_down": weapon_sockets(
            (72, 94, 90, 68, "front"), (73, 92, 89, 68, "front"),
            (72, 96, 93, 66, "front"), (73, 94, 91, 66, "front"),
        ),
        "walk_right": weapon_sockets(
            (70, 90, 80, 66, "front"), (72, 88, 78, 66, "front"),
            (72, 95, 84, 64, "front"), (71, 92, 82, 64, "front"),
        ),
        "walk_up": weapon_sockets(
            (73, 93, 100, 66, "front"), (74, 91, 99, 66, "front"),
            (73, 96, 104, 64, "front"), (74, 93, 102, 64, "front"),
        ),
        "attack_down": weapon_sockets(
            (53, 72, 110, 67, "front"), (56, 76, 55, 67, "front"),
            (60, 91, 0, 65, "front"), (60, 91, 55, 65, "front"),
        ),
        "attack_right": weapon_sockets(
            (57, 70, 100, 66, "front"), (63, 76, 55, 65, "front"),
            (68, 92, 0, 64, "front"), (68, 92, 45, 64, "front"),
        ),
        "attack_up": weapon_sockets(
            (58, 78, 130, 64, "front"), (62, 73, 85, 64, "front"),
            (66, 88, 35, 62, "front"), (66, 88, 70, 62, "front"),
        ),
    },
}


def expected_frame_names() -> list[str]:
    names = [f"idle_{index}" for index in range(4)]
    for direction in DIRECTIONS:
        names.extend(f"walk_{direction}_{index}" for index in range(8))
    names.extend(f"attack_{index}" for index in range(6))
    for direction in DIRECTIONS:
        names.extend(f"attack_{direction}_{index}" for index in range(6))
    names.extend(f"hit_{index}" for index in range(2))
    assert len(names) == 68
    return names


EXPECTED_FRAME_NAMES = expected_frame_names()


def image_pixels(image: Image.Image):
    """Return Pillow pixels without the Pillow 13 ``getdata`` warning."""

    flattened = getattr(image, "get_flattened_data", None)
    return flattened() if flattened is not None else image.getdata()


def alpha_bbox(image: Image.Image, threshold: int = 3) -> tuple[int, int, int, int]:
    alpha = image.convert("RGBA").getchannel("A")
    if threshold > 0:
        alpha = alpha.point(lambda value: 255 if value > threshold else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("image has no visible pixels")
    return bbox


def clear_low_alpha(image: Image.Image, threshold: int = 3) -> Image.Image:
    rgba = image.convert("RGBA")
    cleaned: list[tuple[int, int, int, int]] = []
    for r, g, b, a in image_pixels(rgba):
        if a <= threshold:
            cleaned.append((0, 0, 0, 0))
        else:
            cleaned.append((r, g, b, a))
    rgba.putdata(cleaned)
    return rgba


def border_pixels(image: Image.Image) -> list[tuple[int, int, int, int]]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    step = max(1, min(width, height) // 160)
    samples: list[tuple[int, int, int, int]] = []
    for x in range(0, width, step):
        samples.append(rgba.getpixel((x, 0)))
        samples.append(rgba.getpixel((x, height - 1)))
    for y in range(step, height - 1, step):
        samples.append(rgba.getpixel((0, y)))
        samples.append(rgba.getpixel((width - 1, y)))
    return samples


def estimate_chroma_key(image: Image.Image) -> tuple[int, int, int]:
    candidates = []
    for r, g, b, a in border_pixels(image):
        if a <= 8:
            continue
        if g >= 70 and g - max(r, b) >= 18:
            candidates.append((r, g, b))
    if len(candidates) < 4:
        raise ValueError("green chroma background is not detectable along the cell border")
    return tuple(round(statistics.median(pixel[channel] for pixel in candidates)) for channel in range(3))


def color_distance(rgb: tuple[int, int, int], key: tuple[int, int, int]) -> float:
    return math.sqrt(sum((value - key_value) ** 2 for value, key_value in zip(rgb, key)))


def remove_green_chroma(image: Image.Image) -> tuple[Image.Image, float, float]:
    """Remove border-connected chroma and despill only near keyed edges.

    A border-connected mask protects intentional green costume details better
    than deleting every green-dominant pixel in the whole pose.  Pixels that
    are extremely close to the sampled key are also removed inside enclosed
    gaps, such as the space between an arm and the torso.
    """

    rgba = image.convert("RGBA")
    width, height = rgba.size
    key = estimate_chroma_key(rgba)
    pixels = list(image_pixels(rgba))
    count = width * height
    candidate = bytearray(count)
    distance_cache = [999.0] * count

    for index, (r, g, b, a) in enumerate(pixels):
        if a <= 3:
            continue
        distance = color_distance((r, g, b), key)
        distance_cache[index] = distance
        dominance = g - max(r, b)
        if g >= 55 and dominance >= 10 and distance <= 118:
            candidate[index] = 1

    removed = bytearray(count)
    queue: deque[int] = deque()

    def enqueue(index: int) -> None:
        if candidate[index] and not removed[index]:
            removed[index] = 1
            queue.append(index)

    for x in range(width):
        enqueue(x)
        enqueue((height - 1) * width + x)
    for y in range(1, height - 1):
        enqueue(y * width)
        enqueue(y * width + width - 1)

    while queue:
        index = queue.popleft()
        x = index % width
        if x > 0:
            enqueue(index - 1)
        if x + 1 < width:
            enqueue(index + 1)
        if index >= width:
            enqueue(index - width)
        if index + width < count:
            enqueue(index + width)

    # Remove exact-key pockets enclosed by the silhouette.
    for index, distance in enumerate(distance_cache):
        if candidate[index] and distance <= 46:
            removed[index] = 1

    removed_mask = Image.frombytes("L", (width, height), bytes(255 if value else 0 for value in removed))
    edge_mask = removed_mask.filter(ImageFilter.MaxFilter(5))
    edge_data = list(image_pixels(edge_mask))
    output: list[tuple[int, int, int, int]] = []
    removed_count = 0
    visible_count = 0
    residual_green_count = 0

    for index, (r, g, b, a) in enumerate(pixels):
        if a <= 3 or removed[index]:
            if a > 3 and removed[index]:
                removed_count += 1
            output.append((0, 0, 0, 0))
            continue

        dominance = g - max(r, b)
        if edge_data[index] and dominance > 4:
            neutral_green = max(r, b) + 5
            strength = min(1.0, max(0.0, (dominance - 4) / 62))
            g = round(g * (1.0 - strength) + min(255, neutral_green) * strength)
            a = round(a * (1.0 - 0.24 * strength))
        elif distance_cache[index] < 170 and dominance > 18:
            # Gentle cleanup of green reflection close to the sampled key.
            strength = (1.0 - distance_cache[index] / 170.0) * 0.45
            g = round(g * (1.0 - strength) + min(255, max(r, b) + 8) * strength)

        if a <= 3:
            output.append((0, 0, 0, 0))
            continue
        output.append((r, g, b, a))
        visible_count += 1
        if g >= 70 and g - max(r, b) >= 18 and color_distance((r, g, b), key) <= 92:
            residual_green_count += 1

    rgba.putdata(output)
    rgba = clear_low_alpha(rgba)
    removed_ratio = removed_count / max(1, sum(1 for *_, a in pixels if a > 3))
    residual_ratio = residual_green_count / max(1, visible_count)
    return rgba, removed_ratio, residual_ratio


def connected_alpha_components(image: Image.Image, threshold: int = 3) -> list[tuple[list[int], tuple[int, int, int, int]]]:
    """Return 4-connected visible components as pixel indices and bboxes."""

    alpha = image.convert("RGBA").getchannel("A")
    width, height = alpha.size
    values = alpha.tobytes()
    seen = bytearray(width * height)
    components: list[tuple[list[int], tuple[int, int, int, int]]] = []
    for start, value in enumerate(values):
        if value <= threshold or seen[start]:
            continue
        queue = [start]
        seen[start] = 1
        pixels: list[int] = []
        min_x = max_x = start % width
        min_y = max_y = start // width
        while queue:
            index = queue.pop()
            pixels.append(index)
            x, y = index % width, index // width
            min_x, max_x = min(min_x, x), max(max_x, x)
            min_y, max_y = min(min_y, y), max(max_y, y)
            neighbours = (
                index - 1 if x > 0 else -1,
                index + 1 if x + 1 < width else -1,
                index - width if y > 0 else -1,
                index + width if y + 1 < height else -1,
            )
            for neighbour in neighbours:
                if neighbour >= 0 and values[neighbour] > threshold and not seen[neighbour]:
                    seen[neighbour] = 1
                    queue.append(neighbour)
        components.append((pixels, (min_x, min_y, max_x + 1, max_y + 1)))
    return sorted(components, key=lambda item: len(item[0]), reverse=True)


def bbox_distance(first: tuple[int, int, int, int], second: tuple[int, int, int, int]) -> float:
    horizontal = max(first[0] - second[2], second[0] - first[2], 0)
    vertical = max(first[1] - second[3], second[1] - first[3], 0)
    return math.hypot(horizontal, vertical)


def split_strip(path: Path, track: str) -> list[CleanPose]:
    """Extract four subjects without assuming equal-width generator cells.

    Chroma is removed from the *whole* strip first.  The four dominant body
    silhouettes are then identified, and disconnected ribbons/tassels are
    assigned to their nearest body before each pose is independently masked
    and cropped.  Thus no mathematical seam can steal pixels from a neighbour.
    """

    with Image.open(path) as source:
        strip = source.convert("RGBA")
    width, height = strip.size
    if width < 128 or height < 32:
        raise ValueError(f"{path}: source strip {strip.size} is too small")
    process_scale = min(
        (MAX_SOURCE_CELL_SIZE * 4) / width,
        MAX_SOURCE_CELL_SIZE / height,
        1.0,
    )
    if process_scale < 1.0:
        strip = strip.resize(
            (max(4, round(width * process_scale)), max(1, round(height * process_scale))),
            Image.Resampling.LANCZOS,
        )

    clean, removed_ratio, residual_ratio = remove_green_chroma(strip)
    components = connected_alpha_components(clean)
    if len(components) < 4:
        raise ValueError(f"{path}: found only {len(components)} visible components; expected four subjects")
    majors = components[:4]
    major_areas = [len(component[0]) for component in majors]
    if max(major_areas) / min(major_areas) > 2.35:
        raise ValueError(f"{path}: four dominant silhouette areas are inconsistent: {major_areas}")
    if len(components) > 4 and len(components[4][0]) >= min(major_areas) * 0.22:
        raise ValueError(
            f"{path}: a fifth large silhouette is present "
            f"(areas={[len(component[0]) for component in components[:5]]})"
        )

    # Stable pose order is left-to-right, regardless of silhouette area.
    ordered_major_indices = sorted(range(4), key=lambda index: majors[index][1][0] + majors[index][1][2])
    group_for_major = {major_index: order for order, major_index in enumerate(ordered_major_indices)}
    grouped: list[list[tuple[list[int], tuple[int, int, int, int]]]] = [[] for _ in range(4)]
    for major_index, major in enumerate(majors):
        grouped[group_for_major[major_index]].append(major)

    # Preserve meaningful detached cloth/hair pieces, but discard isolated
    # one-pixel keying noise.  Nearest-bbox assignment prevents a following
    # pose's ribbon from leaking into the preceding quarter-cell.
    for component in components[4:]:
        pixels, bbox = component
        distances = [bbox_distance(bbox, major[1]) for major in majors]
        nearest_major = min(range(4), key=lambda index: distances[index])
        if len(pixels) >= 5 or distances[nearest_major] <= 3:
            grouped[group_for_major[nearest_major]].append(component)

    clean_pixels = list(image_pixels(clean))
    poses: list[CleanPose] = []
    for pose_index, group in enumerate(grouped):
        mask_data = bytearray(clean.width * clean.height)
        for pixels, _ in group:
            for index in pixels:
                mask_data[index] = 255
        isolated = Image.new("RGBA", clean.size, (0, 0, 0, 0))
        isolated.putdata([
            pixel if mask_value else (0, 0, 0, 0)
            for pixel, mask_value in zip(clean_pixels, mask_data)
        ])
        bbox = alpha_bbox(isolated)
        padding = max(2, round(min(clean.size) * 0.01))
        padded_bbox = (
            max(0, bbox[0] - padding),
            max(0, bbox[1] - padding),
            min(clean.width, bbox[2] + padding),
            min(clean.height, bbox[3] + padding),
        )
        crop = clear_low_alpha(isolated.crop(padded_bbox))
        if crop.width < 12 or crop.height < 18:
            raise ValueError(f"{path}: pose {pose_index} has an implausibly small visible subject {crop.size}")
        poses.append(
            CleanPose(
                track=track,
                pose_index=pose_index,
                image=crop,
                source_cell_size=clean.size,
                source_bbox=bbox,
                removed_ratio=removed_ratio,
                residual_green_ratio=residual_ratio,
            )
        )
    if removed_ratio < 0.02:
        raise ValueError(f"{path}: removed too little chroma ({removed_ratio:.1%})")
    if residual_ratio > 0.08:
        raise ValueError(f"{path}: retains excessive green spill ({residual_ratio:.1%})")
    return poses


def normalize_source_resolution(poses: Mapping[str, Sequence[CleanPose]]) -> dict[str, list[CleanPose]]:
    """Compensate for small per-strip size differences from image generators."""

    all_poses = [pose for track in poses.values() for pose in track]
    reference_width = round(statistics.median(pose.source_cell_size[0] for pose in all_poses))
    reference_height = round(statistics.median(pose.source_cell_size[1] for pose in all_poses))
    normalized: dict[str, list[CleanPose]] = {}
    for track, track_poses in poses.items():
        normalized[track] = []
        for pose in track_poses:
            cell_width, cell_height = pose.source_cell_size
            width = max(1, round(pose.image.width * reference_width / cell_width))
            height = max(1, round(pose.image.height * reference_height / cell_height))
            image = pose.image
            if image.size != (width, height):
                image = clear_low_alpha(image.resize((width, height), Image.Resampling.LANCZOS))
                image = image.crop(alpha_bbox(image))
            normalized[track].append(replace(pose, image=image))
    return normalized


def validate_source_pose_consistency(character_id: str, poses: Mapping[str, Sequence[CleanPose]]) -> None:
    all_poses = [pose for track in poses.values() for pose in track]
    cell_widths = [pose.source_cell_size[0] for pose in all_poses]
    cell_heights = [pose.source_cell_size[1] for pose in all_poses]
    # Image generators can preserve the requested character design while
    # returning equivalent four-cell strips in different aspect ratios.  The
    # normalization above compensates for that resolution difference; reject
    # only truly incompatible source canvases here.
    if max(cell_widths) / min(cell_widths) > 1.35 or max(cell_heights) / min(cell_heights) > 1.35:
        raise ValueError(
            f"{character_id}: source strip resolutions differ by more than 35% "
            f"(cell width {min(cell_widths)}..{max(cell_widths)}, height {min(cell_heights)}..{max(cell_heights)})"
        )

    heights = [pose.image.height for pose in all_poses]
    median_height = statistics.median(heights)
    if min(heights) < median_height * 0.58 or max(heights) > median_height * 1.48:
        raise ValueError(
            f"{character_id}: source body scale is inconsistent "
            f"(height min/median/max={min(heights)}/{median_height:.0f}/{max(heights)})"
        )

    for track, track_poses in poses.items():
        digests = {hashlib.sha256(pose.image.tobytes()).digest() for pose in track_poses}
        if len(digests) < 3:
            raise ValueError(f"{character_id}: {track} has fewer than three distinct poses")


def load_character_poses(source_root: Path, profile: CharacterProfile) -> dict[str, list[CleanPose]]:
    character_dir = source_root / profile.character_id
    poses: dict[str, list[CleanPose]] = {}
    missing = []
    for track in SOURCE_TRACKS:
        source_path = character_dir / f"{track}_chroma.png"
        if not source_path.is_file():
            missing.append(source_path)
            continue
        poses[track] = split_strip(source_path, track)
    if missing:
        listing = "\n  ".join(str(path) for path in missing)
        raise FileNotFoundError(f"{profile.character_id}: missing source strips:\n  {listing}")
    poses = normalize_source_resolution(poses)
    validate_source_pose_consistency(profile.character_id, poses)
    return poses


def common_pose_scale(poses: Mapping[str, Sequence[CleanPose]]) -> float:
    all_poses = [pose for track in poses.values() for pose in track]
    widest = max(pose.image.width for pose in all_poses)
    tallest = max(pose.image.height for pose in all_poses)
    scale = min(MAX_BODY_W / widest, MAX_BODY_H / tallest)
    if scale <= 0:
        raise ValueError("invalid common pose scale")
    return scale


def place_body(crop: Image.Image, *, scale: float | None = None) -> Image.Image:
    crop = clear_low_alpha(crop.crop(alpha_bbox(crop)))
    if scale is None:
        scale = min(MAX_BODY_W / crop.width, MAX_BODY_H / crop.height, 1.0)
    width = max(1, min(MAX_BODY_W, math.floor(crop.width * scale)))
    height = max(1, min(MAX_BODY_H, math.floor(crop.height * scale)))
    resized = crop.resize((width, height), Image.Resampling.LANCZOS)
    resized = clear_low_alpha(resized)
    resized = resized.crop(alpha_bbox(resized))

    # Lanczos can add one faint pixel beyond the intended size after cropping.
    if resized.width > MAX_BODY_W or resized.height > MAX_BODY_H:
        fit = min(MAX_BODY_W / resized.width, MAX_BODY_H / resized.height)
        resized = resized.resize(
            (max(1, math.floor(resized.width * fit)), max(1, math.floor(resized.height * fit))),
            Image.Resampling.LANCZOS,
        )
        resized = clear_low_alpha(resized)
        resized = resized.crop(alpha_bbox(resized))

    canvas = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    x = (FRAME_W - resized.width) // 2
    y = FOOT_Y - resized.height
    if x < MIN_PADDING or y < MIN_PADDING:
        raise ValueError(f"normalized body violates padding: size={resized.size}, offset=({x}, {y})")
    canvas.alpha_composite(resized, (x, y))
    return canvas


def pose_to_frame(pose: CleanPose, scale: float) -> Image.Image:
    return place_body(pose.image, scale=scale)


def load_weapon_master(source_root: Path, profile: CharacterProfile) -> tuple[Image.Image, float, float]:
    if profile.weapon_profile is None:
        raise ValueError(f"{profile.character_id}: no weapon profile")
    path = source_root / "weapons" / profile.weapon_profile.source_filename
    if not path.is_file():
        raise FileNotFoundError(path)
    with Image.open(path) as source:
        weapon = source.convert("RGBA")
    process_scale = min(512 / weapon.width, 256 / weapon.height, 1.0)
    if process_scale < 1.0:
        weapon = weapon.resize(
            (max(1, round(weapon.width * process_scale)), max(1, round(weapon.height * process_scale))),
            Image.Resampling.LANCZOS,
        )
    clean, removed_ratio, residual_ratio = remove_green_chroma(weapon)
    clean = clear_low_alpha(clean.crop(alpha_bbox(clean)))
    if clean.width < 40 or clean.height < 8:
        raise ValueError(f"{path}: cleaned weapon is implausibly small {clean.size}")
    aspect = clean.width / clean.height
    if not 2.5 <= aspect <= 7.5:
        raise ValueError(f"{path}: cleaned weapon aspect ratio {aspect:.2f} is implausible")
    if removed_ratio < 0.45 or residual_ratio > 0.03:
        raise ValueError(
            f"{path}: weapon chroma QC failed "
            f"(removed={removed_ratio:.1%}, residual={residual_ratio:.1%})"
        )
    if profile.weapon_profile.brightness != 1.0:
        alpha = clean.getchannel("A")
        clean = ImageEnhance.Brightness(clean.convert("RGB")).enhance(profile.weapon_profile.brightness).convert("RGBA")
        clean.putalpha(alpha)
    return clean, removed_ratio, residual_ratio


def render_weapon_layer(
    weapon: Image.Image,
    weapon_profile: WeaponProfile,
    socket: WeaponSocket,
) -> Image.Image:
    target_width = max(8, round(socket.length * weapon_profile.length_scale))
    target_height = max(
        3,
        round(weapon.height * target_width / weapon.width * weapon_profile.thickness_scale),
    )
    resized = clear_low_alpha(weapon.resize((target_width, target_height), Image.Resampling.LANCZOS))
    grip_x = weapon_profile.grip_fraction[0] * (target_width - 1)
    grip_y = weapon_profile.grip_fraction[1] * (target_height - 1)
    side = max(target_width, target_height) * 3 + 16
    centre = side // 2
    pivoted = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    pivoted.alpha_composite(resized, (round(centre - grip_x), round(centre - grip_y)))
    rotated = pivoted.rotate(
        socket.angle_degrees,
        resample=Image.Resampling.BICUBIC,
        center=(centre, centre),
    )
    rotated = clear_low_alpha(rotated)
    bbox = alpha_bbox(rotated)
    crop = rotated.crop(bbox)
    pivot_in_crop = (centre - bbox[0], centre - bbox[1])
    left = round(socket.x - pivot_in_crop[0])
    top = round(socket.y - pivot_in_crop[1])
    right, bottom = left + crop.width, top + crop.height
    # Keep the complete identity prop inside the existing 112x144 frame.  The
    # authored socket remains the target; only the smallest translation needed
    # to protect the tip/head from clipping is applied.
    shift_x = max(0, MIN_PADDING - left) + min(0, FRAME_W - MIN_PADDING - right)
    shift_y = max(0, MIN_PADDING - top) + min(0, FOOT_Y - bottom)
    left += shift_x
    right += shift_x
    top += shift_y
    bottom += shift_y
    if left < MIN_PADDING or right > FRAME_W - MIN_PADDING or top < MIN_PADDING or bottom > FOOT_Y:
        raise ValueError(
            f"weapon socket ({socket.x}, {socket.y}, {socket.angle_degrees}, {socket.length}) "
            f"places bbox {(left, top, right, bottom)} outside frame padding"
        )
    layer = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    if weapon_profile.glow_color and weapon_profile.glow_alpha > 0:
        glow_alpha = crop.getchannel("A").filter(ImageFilter.MaxFilter(3))
        glow_alpha = glow_alpha.point(lambda value: round(value * weapon_profile.glow_alpha / 255))
        glow = Image.new("RGBA", crop.size, (*weapon_profile.glow_color, 0))
        glow.putalpha(glow_alpha)
        layer.alpha_composite(glow, (left, top))
    layer.alpha_composite(crop, (left, top))
    return layer


def visible_weapon_metrics(body: Image.Image, composite: Image.Image) -> tuple[int, int]:
    difference = ImageChops.difference(composite.convert("RGBA"), body.convert("RGBA"))
    channels = difference.split()
    mask = channels[0]
    for channel in channels[1:]:
        mask = ImageChops.lighter(mask, channel)
    mask = mask.point(lambda value: 255 if value > 6 else 0)
    bbox = mask.getbbox()
    if not bbox:
        return 0, 0
    visible_pixels = sum(1 for value in image_pixels(mask) if value)
    left, top, right, bottom = bbox
    return visible_pixels, max(right - left, bottom - top)


def socket_for_source(profile: CharacterProfile, track: str, pose_index: int | None) -> WeaponSocket:
    if not profile.socket_profile or profile.socket_profile not in SOCKET_PROFILES:
        raise ValueError(f"{profile.character_id}: missing socket profile")
    source_track = track
    source_pose = pose_index
    if source_pose is None:
        if not source_track.startswith("attack_"):
            raise ValueError(f"{profile.character_id}: cannot resolve neutral socket for {source_track}")
        direction = source_track.removeprefix("attack_")
        source_track = f"walk_{direction}"
        source_pose = 0
    track_sockets = SOCKET_PROFILES[profile.socket_profile].get(source_track)
    if track_sockets is None or len(track_sockets) != 4:
        raise ValueError(f"{profile.character_id}: incomplete socket track {source_track}")
    return track_sockets[source_pose]


def composite_profile_weapon(
    profile: CharacterProfile,
    frames: dict[str, MotionFrame],
    source_root: Path,
) -> tuple[float, float] | None:
    if profile.weapon_profile is None:
        return None
    weapon, removed_ratio, residual_ratio = load_weapon_master(source_root, profile)

    for name in EXPECTED_FRAME_NAMES:
        if (
            name.startswith("walk_left_")
            or name.startswith("attack_left_")
            or (name.startswith("attack_") and name.removeprefix("attack_").isdigit())
        ):
            continue
        frame = frames[name]
        socket = socket_for_source(profile, frame.source_track, frame.source_pose)
        weapon_layer = render_weapon_layer(weapon, profile.weapon_profile, socket)
        body_nearby = frame.image.getchannel("A").filter(ImageFilter.MaxFilter(5))
        if ImageChops.multiply(body_nearby, weapon_layer.getchannel("A")).getbbox() is None:
            raise ValueError(f"{profile.character_id}/{name}: weapon grip is detached from the body")
        if socket.layer == "behind":
            composite = weapon_layer.copy()
            composite.alpha_composite(frame.image)
        elif socket.layer == "front":
            composite = frame.image.copy()
            composite.alpha_composite(weapon_layer)
        else:
            raise ValueError(f"{profile.character_id}/{name}: invalid weapon layer {socket.layer}")
        visible_pixels, visible_extent = visible_weapon_metrics(frame.image, composite)
        if visible_pixels < profile.weapon_profile.minimum_visible_pixels:
            raise ValueError(
                f"{profile.character_id}/{name}: weapon has only {visible_pixels} visible pixels; "
                f"expected at least {profile.weapon_profile.minimum_visible_pixels}"
            )
        if visible_extent < profile.weapon_profile.minimum_visible_extent:
            raise ValueError(
                f"{profile.character_id}/{name}: weapon visible extent is only {visible_extent}px; "
                f"expected at least {profile.weapon_profile.minimum_visible_extent}px"
            )
        frames[name] = replace(
            frame,
            image=composite,
            weapon_socket=socket,
            weapon_visible_pixels=visible_pixels,
            weapon_visible_extent=visible_extent,
        )

    for index in range(8):
        right = frames[f"walk_right_{index}"]
        socket = right.weapon_socket
        assert socket is not None
        frames[f"walk_left_{index}"] = replace(
            frames[f"walk_left_{index}"],
            image=ImageOps.mirror(right.image),
            weapon_socket=replace(
                socket,
                x=FRAME_W - 1 - socket.x,
                angle_degrees=180 - socket.angle_degrees,
            ),
            weapon_visible_pixels=right.weapon_visible_pixels,
            weapon_visible_extent=right.weapon_visible_extent,
        )
    for index in range(6):
        right = frames[f"attack_right_{index}"]
        socket = right.weapon_socket
        assert socket is not None
        frames[f"attack_left_{index}"] = replace(
            frames[f"attack_left_{index}"],
            image=ImageOps.mirror(right.image),
            weapon_socket=replace(
                socket,
                x=FRAME_W - 1 - socket.x,
                angle_degrees=180 - socket.angle_degrees,
            ),
            weapon_visible_pixels=right.weapon_visible_pixels,
            weapon_visible_extent=right.weapon_visible_extent,
        )
        down = frames[f"attack_down_{index}"]
        frames[f"attack_{index}"] = replace(
            frames[f"attack_{index}"],
            image=down.image.copy(),
            weapon_socket=down.weapon_socket,
            weapon_visible_pixels=down.weapon_visible_pixels,
            weapon_visible_extent=down.weapon_visible_extent,
        )
    return removed_ratio, residual_ratio


def transform_rendered_body(
    frame: Image.Image,
    *,
    scale_x: float = 1.0,
    scale_y: float = 1.0,
    rotate: float = 0.0,
    brightness: float = 1.0,
    hit_tint: float = 0.0,
) -> Image.Image:
    crop = frame.crop(alpha_bbox(frame))
    width = max(1, round(crop.width * scale_x))
    height = max(1, round(crop.height * scale_y))
    crop = crop.resize((width, height), Image.Resampling.LANCZOS)
    if rotate:
        crop = crop.rotate(rotate, resample=Image.Resampling.BICUBIC, expand=True)
    crop = clear_low_alpha(crop)
    if brightness != 1.0:
        alpha = crop.getchannel("A")
        crop = ImageEnhance.Brightness(crop.convert("RGB")).enhance(brightness).convert("RGBA")
        crop.putalpha(alpha)
    if hit_tint > 0:
        data = []
        for r, g, b, a in image_pixels(crop):
            data.append(
                (
                    round(r * (1.0 - hit_tint) + 255 * hit_tint),
                    round(g * (1.0 - hit_tint) + 68 * hit_tint),
                    round(b * (1.0 - hit_tint) + 68 * hit_tint),
                    a,
                )
            )
        crop.putdata(data)
    return place_body(crop)


def socket_for_frame(profile: CharacterProfile, frame_name: str) -> WeaponSocket | None:
    """Resolve a rare exact-frame override; track sockets are applied later."""

    return profile.socket_overrides.get(frame_name)


def add_frame(
    frames: dict[str, MotionFrame],
    profile: CharacterProfile,
    name: str,
    image: Image.Image,
    source_track: str,
    source_pose: int | None,
) -> None:
    if name in frames:
        raise ValueError(f"duplicate motion frame {name}")
    frames[name] = MotionFrame(
        name=name,
        image=image,
        source_track=source_track,
        source_pose=source_pose,
        weapon_socket=socket_for_frame(profile, name),
    )


def build_motion_frames(
    profile: CharacterProfile,
    poses: Mapping[str, Sequence[CleanPose]],
    source_root: Path = DEFAULT_SOURCE_ROOT,
) -> dict[str, MotionFrame]:
    scale = common_pose_scale(poses)
    rendered: dict[str, list[Image.Image]] = {
        track: [pose_to_frame(pose, scale) for pose in track_poses]
        for track, track_poses in poses.items()
    }
    for track, (track_scale, offset_x, offset_y) in profile.body_track_adjustments.items():
        if track not in rendered:
            raise ValueError(f"{profile.character_id}: unknown adjusted body track {track}")
        adjusted: list[Image.Image] = []
        for image in rendered[track]:
            scaled = transform_rendered_body(image, scale_x=track_scale, scale_y=track_scale)
            canvas = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
            canvas.alpha_composite(scaled, (offset_x, offset_y))
            adjusted.append(canvas)
        rendered[track] = adjusted
    frames: dict[str, MotionFrame] = {}

    neutral_down = rendered["walk_down"][0]
    idle_variants = (
        (1.000, 1.000),
        (1.006, 0.994),
        (1.000, 0.988),
        (0.994, 0.994),
    )
    for index, (scale_x, scale_y) in enumerate(idle_variants):
        add_frame(
            frames,
            profile,
            f"idle_{index}",
            transform_rendered_body(neutral_down, scale_x=scale_x, scale_y=scale_y),
            "walk_down",
            0,
        )

    for direction in ("down", "right", "up"):
        track = f"walk_{direction}"
        for index, pose_index in enumerate(WALK_POSE_MAP):
            add_frame(frames, profile, f"walk_{direction}_{index}", rendered[track][pose_index], track, pose_index)
    for index in range(8):
        right = frames[f"walk_right_{index}"]
        add_frame(
            frames,
            profile,
            f"walk_left_{index}",
            ImageOps.mirror(right.image),
            right.source_track,
            right.source_pose,
        )

    neutral_by_direction = {
        "down": rendered["walk_down"][0],
        "right": rendered["walk_right"][0],
        "up": rendered["walk_up"][0],
    }
    for direction in ("down", "right", "up"):
        track = f"attack_{direction}"
        for index, pose_index in enumerate(ATTACK_POSE_MAP):
            image = neutral_by_direction[direction] if pose_index is None else rendered[track][pose_index]
            add_frame(frames, profile, f"attack_{direction}_{index}", image, track, pose_index)

    for index in range(6):
        right = frames[f"attack_right_{index}"]
        add_frame(
            frames,
            profile,
            f"attack_left_{index}",
            ImageOps.mirror(right.image),
            right.source_track,
            right.source_pose,
        )

    # The legacy non-directional attack remains the down-facing sequence.
    for index in range(6):
        down = frames[f"attack_down_{index}"]
        add_frame(frames, profile, f"attack_{index}", down.image.copy(), down.source_track, down.source_pose)

    add_frame(
        frames,
        profile,
        "hit_0",
        transform_rendered_body(neutral_down, scale_x=0.98, scale_y=0.98, rotate=4.0, brightness=0.92, hit_tint=0.18),
        "walk_down",
        0,
    )
    add_frame(frames, profile, "hit_1", neutral_down.copy(), "walk_down", 0)

    missing = set(EXPECTED_FRAME_NAMES) - set(frames)
    extra = set(frames) - set(EXPECTED_FRAME_NAMES)
    if missing or extra:
        raise AssertionError(f"frame manifest mismatch: missing={sorted(missing)}, extra={sorted(extra)}")
    weapon_qc = composite_profile_weapon(profile, frames, source_root)
    if weapon_qc is not None:
        removed, residual = weapon_qc
        print(
            f"weapon ok: {profile.character_id} / {profile.weapon_profile.source_filename} / "
            f"chroma removed {removed:.1%} / green residue {residual:.1%}"
        )
    return frames


def output_filename(profile: CharacterProfile, logical_name: str, suffix: str = ".png") -> str:
    return f"{profile.filename_prefix}{logical_name}{suffix}"


def frame_digest(image: Image.Image) -> bytes:
    rgba = image.convert("RGBA")
    return hashlib.sha256(rgba.tobytes()).digest()


def validate_frame_image(label: str, image: Image.Image) -> tuple[int, int, int, int]:
    rgba = image.convert("RGBA")
    if rgba.size != (FRAME_W, FRAME_H):
        raise ValueError(f"{label}: frame size is {rgba.size}, expected {(FRAME_W, FRAME_H)}")
    bbox = alpha_bbox(rgba)
    left, top, right, bottom = bbox
    if left < MIN_PADDING or FRAME_W - right < MIN_PADDING or top < MIN_PADDING:
        raise ValueError(f"{label}: alpha bbox {bbox} violates {MIN_PADDING}px side/top padding")
    if bottom != FOOT_Y:
        raise ValueError(f"{label}: foot anchor is {bottom}, expected {FOOT_Y}")
    return bbox


def validate_motion_frames(profile: CharacterProfile, frames: Mapping[str, MotionFrame]) -> None:
    if set(frames) != set(EXPECTED_FRAME_NAMES):
        raise ValueError(f"{profile.character_id}: expected exactly 68 logical frames")
    for name in EXPECTED_FRAME_NAMES:
        validate_frame_image(f"{profile.character_id}/{name}", frames[name].image)

    # Freshly built frames retain identity-layer metrics.  Loaded installed
    # files do not, so their PNG/WebP and structural checks continue below.
    if profile.weapon_profile and all(frame.source_track != "existing" for frame in frames.values()):
        for name, frame in frames.items():
            if frame.weapon_socket is None:
                raise ValueError(f"{profile.character_id}/{name}: missing weapon socket metadata")
            if frame.weapon_visible_pixels < profile.weapon_profile.minimum_visible_pixels:
                raise ValueError(
                    f"{profile.character_id}/{name}: weapon prominence regressed to "
                    f"{frame.weapon_visible_pixels} visible pixels"
                )
            if frame.weapon_visible_extent < profile.weapon_profile.minimum_visible_extent:
                raise ValueError(
                    f"{profile.character_id}/{name}: weapon prominence regressed to "
                    f"{frame.weapon_visible_extent}px extent"
                )

    for direction in DIRECTIONS:
        walk_unique = {frame_digest(frames[f"walk_{direction}_{index}"].image) for index in range(8)}
        if len(walk_unique) < 4:
            raise ValueError(f"{profile.character_id}: walk_{direction} has fewer than four distinct body poses")
        attack_unique = {frame_digest(frames[f"attack_{direction}_{index}"].image) for index in range(6)}
        if len(attack_unique) < 4:
            raise ValueError(f"{profile.character_id}: attack_{direction} has fewer than four distinct stages")

    for index in range(8):
        mirrored = ImageOps.mirror(frames[f"walk_right_{index}"].image)
        if ImageChops.difference(mirrored, frames[f"walk_left_{index}"].image).getbbox():
            raise ValueError(f"{profile.character_id}: walk_left_{index} is not an exact right-frame mirror")
    for index in range(6):
        mirrored = ImageOps.mirror(frames[f"attack_right_{index}"].image)
        if ImageChops.difference(mirrored, frames[f"attack_left_{index}"].image).getbbox():
            raise ValueError(f"{profile.character_id}: attack_left_{index} is not an exact right-frame mirror")
        if ImageChops.difference(frames[f"attack_{index}"].image, frames[f"attack_down_{index}"].image).getbbox():
            raise ValueError(f"{profile.character_id}: attack_{index} does not match attack_down_{index}")


def write_motion_frames(directory: Path, profile: CharacterProfile, frames: Mapping[str, MotionFrame]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for name in EXPECTED_FRAME_NAMES:
        png_path = directory / output_filename(profile, name)
        frame = frames[name].image.convert("RGBA")
        frame.save(png_path)
        # Method 4 is materially faster for 68 tiny frames than Pillow's
        # maximum-effort method 6 while remaining pixel-lossless.
        frame.save(png_path.with_suffix(".webp"), "WEBP", lossless=True, quality=100, method=4, exact=True)


def load_output_frames(directory: Path, profile: CharacterProfile) -> dict[str, MotionFrame]:
    frames: dict[str, MotionFrame] = {}
    for name in EXPECTED_FRAME_NAMES:
        png_path = directory / output_filename(profile, name)
        if not png_path.is_file():
            raise FileNotFoundError(png_path)
        with Image.open(png_path) as image:
            rgba = image.convert("RGBA")
        frames[name] = MotionFrame(name=name, image=rgba, source_track="existing", source_pose=None)
    return frames


def validate_written_motion(directory: Path, profile: CharacterProfile, *, strict_count: bool) -> dict[str, MotionFrame]:
    frames = load_output_frames(directory, profile)
    validate_motion_frames(profile, frames)
    for name in EXPECTED_FRAME_NAMES:
        png_path = directory / output_filename(profile, name, ".png")
        webp_path = directory / output_filename(profile, name, ".webp")
        if not webp_path.is_file():
            raise FileNotFoundError(webp_path)
        with Image.open(png_path) as png, Image.open(webp_path) as webp:
            png_rgba = png.convert("RGBA")
            webp_rgba = webp.convert("RGBA")
        if png_rgba.size != webp_rgba.size or ImageChops.difference(png_rgba, webp_rgba).getbbox():
            raise ValueError(f"{webp_path}: lossless WebP pixels do not match PNG")

    if strict_count:
        expected_png = {output_filename(profile, name, ".png") for name in EXPECTED_FRAME_NAMES}
        expected_webp = {output_filename(profile, name, ".webp") for name in EXPECTED_FRAME_NAMES}
        actual_png = {path.name for path in directory.glob("*.png")}
        actual_webp = {path.name for path in directory.glob("*.webp")}
        if actual_png != expected_png or actual_webp != expected_webp:
            raise ValueError(
                f"{directory}: unexpected asset set "
                f"(png={len(actual_png)}, webp={len(actual_webp)}, expected 68 each)"
            )
    return frames


def install_staged_motion(stage_dir: Path, target_dir: Path, profile: CharacterProfile) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    for name in EXPECTED_FRAME_NAMES:
        for suffix in (".png", ".webp"):
            filename = output_filename(profile, name, suffix)
            source = stage_dir / filename
            destination = target_dir / filename
            # ``TemporaryDirectory`` follows the system drive (often C:),
            # while the repository can live on D:.  Path.replace cannot move
            # across Windows volumes, so copy into a same-directory temporary
            # file and atomically replace the destination from there.
            with tempfile.NamedTemporaryFile(
                dir=target_dir,
                prefix=f".{filename}.",
                suffix=".motion-v2.tmp",
                delete=False,
            ) as temporary:
                temporary_path = Path(temporary.name)
            try:
                shutil.copy2(source, temporary_path)
                os.replace(temporary_path, destination)
            finally:
                temporary_path.unlink(missing_ok=True)


def checkerboard(size: tuple[int, int], tile: int = 8) -> Image.Image:
    image = Image.new("RGBA", size, (28, 31, 40, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if (x // tile + y // tile) % 2:
                draw.rectangle((x, y, min(size[0], x + tile) - 1, min(size[1], y + tile) - 1), fill=(42, 46, 58, 255))
    return image


def preview_rows() -> list[tuple[str, list[str]]]:
    rows = [("idle", [f"idle_{index}" for index in range(4)])]
    rows.extend((f"walk {direction}", [f"walk_{direction}_{index}" for index in range(8)]) for direction in DIRECTIONS)
    rows.append(("attack", [f"attack_{index}" for index in range(6)]))
    rows.extend((f"attack {direction}", [f"attack_{direction}_{index}" for index in range(6)]) for direction in DIRECTIONS)
    rows.append(("hit", [f"hit_{index}" for index in range(2)]))
    return rows


def write_preview(preview_dir: Path, profile: CharacterProfile, frames: Mapping[str, MotionFrame]) -> Path:
    rows = preview_rows()
    label_width = 104
    header_height = 24
    row_height = FRAME_H + 22
    columns = 8
    sheet = Image.new(
        "RGBA",
        (label_width + columns * FRAME_W, header_height + len(rows) * row_height),
        (14, 16, 23, 255),
    )
    draw = ImageDraw.Draw(sheet)
    render_label = "separate-weapon composite" if profile.weapon_profile else "body motion"
    draw.text((8, 6), f"{profile.character_id} / {render_label} v2", fill=(238, 241, 250, 255))
    for row_index, (row_label, names) in enumerate(rows):
        y = header_height + row_index * row_height
        draw.text((8, y + 8), row_label, fill=(197, 205, 226, 255))
        for column, name in enumerate(names):
            x = label_width + column * FRAME_W
            cell = checkerboard((FRAME_W, FRAME_H))
            cell.alpha_composite(frames[name].image)
            sheet.alpha_composite(cell, (x, y))
            draw.rectangle((x, y, x + FRAME_W - 1, y + FRAME_H - 1), outline=(87, 95, 118, 255))
            draw.text((x + 4, y + FRAME_H + 4), name.rsplit("_", 1)[-1], fill=(178, 185, 205, 255))
    preview_dir.mkdir(parents=True, exist_ok=True)
    path = preview_dir / f"{profile.character_id}_motion_v2_contact.png"
    sheet.convert("RGB").save(path, optimize=True)
    return path


def source_is_complete(source_root: Path, character_id: str) -> bool:
    character_dir = source_root / character_id
    return all((character_dir / f"{track}_chroma.png").is_file() for track in SOURCE_TRACKS)


def selected_profiles(args: argparse.Namespace, source_root: Path) -> list[CharacterProfile]:
    if args.character:
        ids = list(dict.fromkeys(args.character))
    elif args.all or args.validate_only:
        ids = list(CHARACTER_PROFILES)
    else:
        ids = [character_id for character_id in CHARACTER_PROFILES if source_is_complete(source_root, character_id)]
        if not ids:
            raise FileNotFoundError(
                f"no complete motion-v2 character sources found below {source_root}; "
                "use --character after adding all six strips"
            )
    return [CHARACTER_PROFILES[character_id] for character_id in ids]


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--character",
        action="append",
        choices=tuple(CHARACTER_PROFILES),
        help="build or validate one character; repeat to select several (default: complete source folders)",
    )
    parser.add_argument("--all", action="store_true", help="require and build all registered characters")
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE_ROOT)
    parser.add_argument(
        "--output-root",
        type=Path,
        default=ROOT,
        help="repository-compatible output root; useful for a separate review staging tree",
    )
    parser.add_argument("--validate-only", action="store_true", help="validate existing output without writing assets")
    parser.add_argument("--dry-run", action="store_true", help="build and validate temporary output without installing it")
    parser.add_argument("--preview", action="store_true", help="write contact sheets to the default workspace temp folder")
    parser.add_argument("--preview-dir", type=Path, help="write contact sheets to this directory (implies --preview)")
    return parser.parse_args(argv)


def print_source_summary(profile: CharacterProfile, poses: Mapping[str, Sequence[CleanPose]]) -> None:
    all_poses = [pose for track in poses.values() for pose in track]
    removed = statistics.mean(pose.removed_ratio for pose in all_poses)
    residual = max(pose.residual_green_ratio for pose in all_poses)
    scale = common_pose_scale(poses)
    print(
        f"source ok: {profile.character_id} / 24 poses / "
        f"mean chroma removed {removed:.1%} / max green residue {residual:.1%} / scale {scale:.4f}"
    )


def run_build(args: argparse.Namespace, profiles: Sequence[CharacterProfile], source_root: Path, output_root: Path) -> dict[str, dict[str, MotionFrame]]:
    built: dict[str, dict[str, MotionFrame]] = {}
    for profile in profiles:
        poses = load_character_poses(source_root, profile)
        print_source_summary(profile, poses)
        frames = build_motion_frames(profile, poses, source_root)
        validate_motion_frames(profile, frames)
        built[profile.character_id] = frames

    with tempfile.TemporaryDirectory(prefix="solo-leveling-motion-v2-") as temp_name:
        temp_root = Path(temp_name)
        stage_dirs: dict[str, Path] = {}
        for profile in profiles:
            stage_dir = temp_root / profile.character_id / "motion"
            write_motion_frames(stage_dir, profile, built[profile.character_id])
            validate_written_motion(stage_dir, profile, strict_count=True)
            stage_dirs[profile.character_id] = stage_dir
            print(f"staged ok: {profile.character_id} / 68 PNG + 68 lossless WebP")

        if not args.dry_run:
            for profile in profiles:
                target_dir = output_root / profile.output_relative
                install_staged_motion(stage_dirs[profile.character_id], target_dir, profile)
                validate_written_motion(target_dir, profile, strict_count=False)
                print(f"installed: {profile.character_id} -> {target_dir}")
        else:
            print("dry run: validated staged assets; existing motion files were not changed")
    return built


def run_validate_only(profiles: Sequence[CharacterProfile], output_root: Path) -> dict[str, dict[str, MotionFrame]]:
    validated: dict[str, dict[str, MotionFrame]] = {}
    for profile in profiles:
        target_dir = output_root / profile.output_relative
        validated[profile.character_id] = validate_written_motion(target_dir, profile, strict_count=True)
        print(f"validated: {profile.character_id} / 68 PNG + 68 lossless WebP")
    return validated


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    if args.validate_only and args.dry_run:
        raise SystemExit("--validate-only and --dry-run cannot be combined")
    source_root = args.source_root.resolve()
    output_root = args.output_root.resolve()
    profiles = selected_profiles(args, source_root)

    if args.validate_only:
        frame_sets = run_validate_only(profiles, output_root)
    else:
        frame_sets = run_build(args, profiles, source_root, output_root)

    if args.preview or args.preview_dir:
        preview_dir = (args.preview_dir or DEFAULT_PREVIEW_ROOT).resolve()
        for profile in profiles:
            path = write_preview(preview_dir, profile, frame_sets[profile.character_id])
            print(f"preview: {path}")

    action = "validated" if args.validate_only else "built"
    print(f"motion v2 {action}: {len(profiles)} character(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
