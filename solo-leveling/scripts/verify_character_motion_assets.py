from __future__ import annotations

"""Release-grade structural and visual sanity checks for character motion.

The verifier deliberately does not rewrite any asset.  It checks both the
four-pose chroma source strips and the installed 112x144 PNG/WebP frame sets,
so a valid file count cannot hide a duplicated direction, a nearly static
attack, lossy WebP output, or a visibly detached large weapon/component.
"""

import argparse
from collections import deque
from dataclasses import dataclass
import hashlib
import math
from pathlib import Path
import statistics
from typing import Sequence

from PIL import Image, ImageChops, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "assets" / "player" / "motion_v2_sources"
FRAME_SIZE = (112, 144)
WALK_FRAMES = 8
ATTACK_FRAMES = 6
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
class MotionSet:
    label: str
    source_id: str
    motion_dir: Path
    prefix: str = ""
    separate_weapon: bool = False


MOTION_SETS = (
    MotionSet("player", "shadow_monarch", ROOT / "assets" / "player" / "motion", "player_", True),
    MotionSet(
        "light_swordswoman",
        "light_swordswoman",
        ROOT / "assets" / "player" / "characters" / "light_swordswoman" / "motion",
        separate_weapon=True,
    ),
    MotionSet(
        "white_tiger_brawler",
        "white_tiger_brawler",
        ROOT / "assets" / "player" / "characters" / "white_tiger_brawler" / "motion",
    ),
    MotionSet(
        "flame_mage",
        "flame_mage",
        ROOT / "assets" / "player" / "characters" / "flame_mage" / "motion",
    ),
    MotionSet(
        "sanctuary_healer",
        "sanctuary_healer",
        ROOT / "assets" / "player" / "characters" / "sanctuary_healer" / "motion",
        separate_weapon=True,
    ),
)

WEAPON_SOURCES = {
    "shadow_monarch": SOURCE_ROOT / "weapons" / "shadow_dagger_chroma.png",
    "light_swordswoman": SOURCE_ROOT / "weapons" / "light_sword_chroma.png",
    "sanctuary_healer": SOURCE_ROOT / "weapons" / "sanctuary_staff_chroma.png",
}


def image_pixels(image: Image.Image):
    flattened = getattr(image, "get_flattened_data", None)
    return flattened() if flattened is not None else image.getdata()


def expected_names(prefix: str) -> list[str]:
    names = [f"{prefix}idle_{index}" for index in range(4)]
    for direction in DIRECTIONS:
        names.extend(f"{prefix}walk_{direction}_{index}" for index in range(WALK_FRAMES))
    names.extend(f"{prefix}attack_{index}" for index in range(ATTACK_FRAMES))
    for direction in DIRECTIONS:
        names.extend(f"{prefix}attack_{direction}_{index}" for index in range(ATTACK_FRAMES))
    names.extend(f"{prefix}hit_{index}" for index in range(2))
    assert len(names) == 68
    return names


def load_rgba(path: Path) -> Image.Image:
    with Image.open(path) as image:
        return image.convert("RGBA")


def alpha_bbox(image: Image.Image, label: str) -> tuple[int, int, int, int]:
    if image.size != FRAME_SIZE:
        raise AssertionError(f"{label} has size {image.size}, expected {FRAME_SIZE}")
    bbox = image.getchannel("A").point(lambda value: 255 if value > 3 else 0).getbbox()
    if not bbox:
        raise AssertionError(f"{label} is fully transparent")
    return bbox


def difference_score(left: Image.Image, right: Image.Image) -> float:
    """Mean normalized absolute RGBA difference in the range 0..1."""

    if left.size != right.size:
        raise AssertionError(f"cannot compare images of different sizes: {left.size} vs {right.size}")
    histogram = ImageChops.difference(left.convert("RGBA"), right.convert("RGBA")).histogram()
    total = sum((bin_index % 256) * count for bin_index, count in enumerate(histogram))
    return total / (255 * 4 * left.width * left.height)


def digest(image: Image.Image) -> bytes:
    return hashlib.sha256(image.convert("RGBA").tobytes()).digest()


def connected_component_areas(image: Image.Image, *, bridge_radius: int = 2) -> list[int]:
    """Return foreground component areas after bridging tiny antialias gaps."""

    alpha = image.convert("RGBA").getchannel("A").point(lambda value: 255 if value > 12 else 0)
    if bridge_radius:
        alpha = alpha.filter(ImageFilter.MaxFilter(bridge_radius * 2 + 1))
    width, height = alpha.size
    pixels = alpha.load()
    seen = bytearray(width * height)
    areas: list[int] = []

    for y in range(height):
        for x in range(width):
            start = y * width + x
            if seen[start] or not pixels[x, y]:
                continue
            seen[start] = 1
            queue: deque[tuple[int, int]] = deque(((x, y),))
            area = 0
            while queue:
                current_x, current_y = queue.popleft()
                area += 1
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    index = next_y * width + next_x
                    if seen[index] or not pixels[next_x, next_y]:
                        continue
                    seen[index] = 1
                    queue.append((next_x, next_y))
            areas.append(area)
    return sorted(areas, reverse=True)


def largest_component_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    """Bounding box of the main subject, ignoring isolated keyed-edge specks."""

    alpha = image.convert("RGBA").getchannel("A").point(lambda value: 255 if value > 12 else 0)
    width, height = alpha.size
    pixels = alpha.load()
    seen = bytearray(width * height)
    largest: tuple[int, tuple[int, int, int, int]] | None = None
    for y in range(height):
        for x in range(width):
            start = y * width + x
            if seen[start] or not pixels[x, y]:
                continue
            seen[start] = 1
            queue: deque[tuple[int, int]] = deque(((x, y),))
            area = 0
            min_x = max_x = x
            min_y = max_y = y
            while queue:
                current_x, current_y = queue.popleft()
                area += 1
                min_x = min(min_x, current_x)
                max_x = max(max_x, current_x)
                min_y = min(min_y, current_y)
                max_y = max(max_y, current_y)
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    index = next_y * width + next_x
                    if seen[index] or not pixels[next_x, next_y]:
                        continue
                    seen[index] = 1
                    queue.append((next_x, next_y))
            bbox = (min_x, min_y, max_x + 1, max_y + 1)
            if largest is None or area > largest[0]:
                largest = (area, bbox)
    return largest[1] if largest else None


def component_images(image: Image.Image, *, bridge_radius: int = 1) -> list[tuple[int, tuple[int, int, int, int], Image.Image]]:
    """Extract alpha components as (area, bbox, isolated image) tuples."""

    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A").point(lambda value: 255 if value > 12 else 0)
    if bridge_radius:
        alpha = alpha.filter(ImageFilter.MaxFilter(bridge_radius * 2 + 1))
    width, height = alpha.size
    pixels = alpha.load()
    seen = bytearray(width * height)
    components: list[tuple[int, tuple[int, int, int, int], Image.Image]] = []
    for y in range(height):
        for x in range(width):
            start = y * width + x
            if seen[start] or not pixels[x, y]:
                continue
            seen[start] = 1
            queue: deque[tuple[int, int]] = deque(((x, y),))
            points: list[tuple[int, int]] = []
            min_x = max_x = x
            min_y = max_y = y
            while queue:
                current_x, current_y = queue.popleft()
                points.append((current_x, current_y))
                min_x = min(min_x, current_x)
                max_x = max(max_x, current_x)
                min_y = min(min_y, current_y)
                max_y = max(max_y, current_y)
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    index = next_y * width + next_x
                    if seen[index] or not pixels[next_x, next_y]:
                        continue
                    seen[index] = 1
                    queue.append((next_x, next_y))
            bbox = (min_x, min_y, max_x + 1, max_y + 1)
            isolated = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
            source_pixels = rgba.load()
            isolated_pixels = isolated.load()
            for point_x, point_y in points:
                # The bridge mask may include transparent expansion pixels;
                # copying them is harmless and keeps only this component.
                isolated_pixels[point_x, point_y] = source_pixels[point_x, point_y]
            components.append((len(points), bbox, isolated))
    return sorted(components, key=lambda item: item[0], reverse=True)


def assert_component_attachment(
    label: str,
    image: Image.Image,
    *,
    maximum_secondary_ratio: float = 0.08,
) -> None:
    areas = connected_component_areas(image)
    if not areas:
        raise AssertionError(f"{label} has no foreground component")
    # A detached sword/staff is normally 10%+ of the body silhouette.  Small
    # particles, hair tips and antialias islands are tolerated.
    if len(areas) > 1 and areas[1] >= 20 and areas[1] / areas[0] > maximum_secondary_ratio:
        raise AssertionError(
            f"{label} has a large detached foreground component "
            f"({areas[1]} px vs main {areas[0]} px); check the weapon grip/socket"
        )


def verify_frame_pair(
    png_path: Path,
    webp_path: Path,
    *,
    maximum_secondary_ratio: float,
) -> Image.Image:
    png = load_rgba(png_path)
    webp = load_rgba(webp_path)
    bbox = alpha_bbox(png, str(png_path))
    if webp.size != FRAME_SIZE:
        raise AssertionError(f"{webp_path} has size {webp.size}, expected {FRAME_SIZE}")
    if ImageChops.difference(png, webp).getbbox():
        raise AssertionError(f"{webp_path} pixels do not exactly match its PNG")

    left, top, right, bottom = bbox
    if left < 2 or FRAME_SIZE[0] - right < 2 or top < 2:
        raise AssertionError(f"{png_path} alpha bbox {bbox} is clipped or lacks safe padding")
    if not 133 <= bottom <= 140:
        raise AssertionError(f"{png_path} alpha bbox {bbox} has an implausible foot/root anchor")
    visible = sum(1 for value in image_pixels(png.getchannel("A")) if value > 12)
    if not 300 <= visible <= 12_500:
        raise AssertionError(f"{png_path} has implausible visible area: {visible} px")
    assert_component_attachment(
        str(png_path),
        png,
        maximum_secondary_ratio=maximum_secondary_ratio,
    )
    return png


def logical(frames: dict[str, Image.Image], motion_set: MotionSet, name: str) -> Image.Image:
    return frames[f"{motion_set.prefix}{name}"]


def verify_sequence_variance(
    label: str,
    frames: Sequence[Image.Image],
    *,
    minimum_unique: int,
    minimum_peak: float,
    minimum_active_steps: int,
) -> tuple[float, float]:
    unique = len({digest(frame) for frame in frames})
    if unique < minimum_unique:
        raise AssertionError(f"{label} has only {unique} distinct frames; expected at least {minimum_unique}")
    recovery = frames[-1]
    peak = max(difference_score(recovery, frame) for frame in frames[:-1])
    if peak < minimum_peak:
        raise AssertionError(f"{label} motion is too subtle/static (peak difference {peak:.3f})")
    steps = [difference_score(frames[index], frames[index + 1]) for index in range(len(frames) - 1)]
    active_steps = sum(score >= 0.008 for score in steps)
    if active_steps < minimum_active_steps:
        raise AssertionError(
            f"{label} has only {active_steps} materially changing frame steps; "
            f"expected at least {minimum_active_steps}"
        )
    return peak, statistics.mean(steps)


def verify_motion_set(motion_set: MotionSet) -> dict[str, float]:
    if not motion_set.motion_dir.exists():
        raise AssertionError(f"missing motion directory: {motion_set.motion_dir}")

    expected = set(expected_names(motion_set.prefix))
    actual_png = {path.stem for path in motion_set.motion_dir.glob("*.png")}
    actual_webp = {path.stem for path in motion_set.motion_dir.glob("*.webp")}
    if actual_png != expected or actual_webp != expected:
        missing_png = sorted(expected - actual_png)
        missing_webp = sorted(expected - actual_webp)
        extra_png = sorted(actual_png - expected)
        extra_webp = sorted(actual_webp - expected)
        raise AssertionError(
            f"{motion_set.label} frame manifest mismatch: "
            f"missing png={missing_png}, missing webp={missing_webp}, "
            f"extra png={extra_png}, extra webp={extra_webp}"
        )

    frames: dict[str, Image.Image] = {}
    for name in sorted(expected):
        frames[name] = verify_frame_pair(
            motion_set.motion_dir / f"{name}.png",
            motion_set.motion_dir / f"{name}.webp",
            maximum_secondary_ratio=0.025 if motion_set.separate_weapon else 0.08,
        )

    peaks: list[float] = []
    step_means: list[float] = []
    for direction in DIRECTIONS:
        walk = [logical(frames, motion_set, f"walk_{direction}_{index}") for index in range(WALK_FRAMES)]
        verify_sequence_variance(
            f"{motion_set.label}/walk_{direction}",
            walk,
            minimum_unique=4,
            minimum_peak=0.012,
            minimum_active_steps=3,
        )
        attack = [logical(frames, motion_set, f"attack_{direction}_{index}") for index in range(ATTACK_FRAMES)]
        peak, step_mean = verify_sequence_variance(
            f"{motion_set.label}/attack_{direction}",
            attack,
            minimum_unique=4,
            minimum_peak=0.045,
            minimum_active_steps=3,
        )
        peaks.append(peak)
        step_means.append(step_mean)

    # The v2 generator contract mirrors complete frames, including the weapon.
    for index in range(WALK_FRAMES):
        right = logical(frames, motion_set, f"walk_right_{index}")
        left = logical(frames, motion_set, f"walk_left_{index}")
        if ImageChops.difference(ImageOps.mirror(right), left).getbbox():
            raise AssertionError(f"{motion_set.label}/walk_left_{index} is not the exact right-frame mirror")
    for index in range(ATTACK_FRAMES):
        right = logical(frames, motion_set, f"attack_right_{index}")
        left = logical(frames, motion_set, f"attack_left_{index}")
        if ImageChops.difference(ImageOps.mirror(right), left).getbbox():
            raise AssertionError(f"{motion_set.label}/attack_left_{index} is not the exact right-frame mirror")
        generic = logical(frames, motion_set, f"attack_{index}")
        down = logical(frames, motion_set, f"attack_down_{index}")
        if ImageChops.difference(generic, down).getbbox():
            raise AssertionError(f"{motion_set.label}/attack_{index} does not match attack_down_{index}")

    down_recovery = logical(frames, motion_set, "attack_down_5")
    up_recovery = logical(frames, motion_set, "attack_up_5")
    right_recovery = logical(frames, motion_set, "attack_right_5")
    left_recovery = logical(frames, motion_set, "attack_left_5")
    down_up = difference_score(down_recovery, up_recovery)
    left_right = difference_score(left_recovery, right_recovery)
    if down_up < 0.018:
        raise AssertionError(
            f"{motion_set.label} down/up facing is not visually separated enough ({down_up:.3f})"
        )
    if left_right < 0.025:
        raise AssertionError(
            f"{motion_set.label} left/right facing is not visually separated enough ({left_right:.3f})"
        )

    impact_down_up = difference_score(
        logical(frames, motion_set, "attack_down_2"),
        logical(frames, motion_set, "attack_up_2"),
    )
    if impact_down_up < 0.030:
        raise AssertionError(
            f"{motion_set.label} down/up attack impact poses are too similar ({impact_down_up:.3f})"
        )

    return {
        "down_up": down_up,
        "left_right": left_right,
        "min_attack_peak": min(peaks),
        "mean_attack_step": statistics.mean(step_means),
    }


def green_pixel(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    return alpha > 8 and green >= 70 and green - max(red, blue) >= 18


def border_pixels(image: Image.Image) -> list[tuple[int, int, int, int]]:
    width, height = image.size
    result: list[tuple[int, int, int, int]] = []
    for x in range(width):
        result.append(image.getpixel((x, 0)))
        result.append(image.getpixel((x, height - 1)))
    for y in range(1, height - 1):
        result.append(image.getpixel((0, y)))
        result.append(image.getpixel((width - 1, y)))
    return result


def color_distance(pixel: tuple[int, int, int, int], key: tuple[int, int, int]) -> float:
    return math.sqrt(sum((pixel[index] - key[index]) ** 2 for index in range(3)))


def quick_chroma_key(image: Image.Image, label: str) -> tuple[Image.Image, float, float]:
    """Fast low-resolution, border-connected source diagnostic."""

    rgba = image.convert("RGBA")
    rgba.thumbnail((192, 192), Image.Resampling.LANCZOS)
    border = [pixel for pixel in border_pixels(rgba) if green_pixel(pixel)]
    all_border = border_pixels(rgba)
    border_ratio = len(border) / max(1, len(all_border))
    if border_ratio < 0.72:
        raise AssertionError(f"{label} has incomplete/nonuniform green chroma border ({border_ratio:.1%})")
    key = tuple(round(statistics.median(pixel[channel] for pixel in border)) for channel in range(3))

    width, height = rgba.size
    pixels = list(image_pixels(rgba))
    candidates = bytearray(width * height)
    for index, pixel in enumerate(pixels):
        red, green, blue, alpha = pixel
        if (
            alpha > 3
            and green - max(red, blue) >= 9
            and color_distance(pixel, key) <= 112
        ):
            candidates[index] = 1

    removed = bytearray(width * height)
    queue: deque[int] = deque()

    def enqueue(index: int) -> None:
        if candidates[index] and not removed[index]:
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
        if x:
            enqueue(index - 1)
        if x + 1 < width:
            enqueue(index + 1)
        if index >= width:
            enqueue(index - width)
        if index + width < width * height:
            enqueue(index + width)

    for index, pixel in enumerate(pixels):
        if candidates[index] and color_distance(pixel, key) <= 44:
            removed[index] = 1

    output: list[tuple[int, int, int, int]] = []
    visible = 0
    residual = 0
    original_visible = sum(1 for *_, alpha in pixels if alpha > 3)
    for index, pixel in enumerate(pixels):
        if removed[index] or pixel[3] <= 3:
            output.append((0, 0, 0, 0))
            continue
        output.append(pixel)
        visible += 1
        red, green, blue, _ = pixel
        if green - max(red, blue) >= 16 and color_distance(pixel, key) <= 86:
            residual += 1
    keyed = rgba.copy()
    keyed.putdata(output)
    removed_ratio = sum(removed) / max(1, original_visible)
    residual_ratio = residual / max(1, visible)
    if removed_ratio < 0.25:
        raise AssertionError(f"{label} removed too little chroma ({removed_ratio:.1%})")
    if residual_ratio > 0.08:
        raise AssertionError(f"{label} retains excessive key-green residue ({residual_ratio:.1%})")
    bbox = largest_component_bbox(keyed)
    if not bbox:
        raise AssertionError(f"{label} has no subject after chroma key")
    left, top, right, bottom = bbox
    if left == 0 or top == 0 or right == keyed.width or bottom == keyed.height:
        raise AssertionError(f"{label} subject touches its source-cell border: {bbox} in {keyed.size}")
    if (right - left) < 8 or (bottom - top) < 28:
        raise AssertionError(f"{label} subject is implausibly small after chroma key: {bbox}")
    return keyed, removed_ratio, residual_ratio


def normalized_subject(image: Image.Image, size: tuple[int, int] = (80, 128)) -> Image.Image:
    bbox = image.getchannel("A").point(lambda value: 255 if value > 8 else 0).getbbox()
    if not bbox:
        raise AssertionError("cannot normalize an empty source subject")
    crop = image.crop(bbox)
    scale = min((size[0] - 4) / crop.width, (size[1] - 4) / crop.height)
    crop = crop.resize(
        (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(crop, ((size[0] - crop.width) // 2, size[1] - crop.height - 2))
    return canvas


def split_source_strip(path: Path, track: str) -> tuple[list[Image.Image], list[float], list[float]]:
    if not path.is_file():
        raise AssertionError(f"missing motion-v2 source strip: {path}")
    strip = load_rgba(path)
    width, height = strip.size
    if width < 256 or height < 128 or width / height < 2.0:
        raise AssertionError(f"{path} is not a plausible four-pose horizontal strip: {strip.size}")
    keyed, removed_ratio, residual_ratio = quick_chroma_key(strip, str(path))
    components = component_images(keyed)
    if not components:
        raise AssertionError(f"{path} contains no keyed pose silhouettes")
    largest_area = components[0][0]
    major = [component for component in components if component[0] >= max(30, largest_area * 0.18)]
    if len(major) != 4:
        areas = [component[0] for component in components[:8]]
        raise AssertionError(f"{path} contains {len(major)} major pose silhouettes, expected 4; areas={areas}")
    major.sort(key=lambda component: (component[1][0] + component[1][2]) / 2)
    centers = [(bbox[0] + bbox[2]) / 2 for _, bbox, _ in major]
    minimum_gap = min(centers[index + 1] - centers[index] for index in range(3))
    if minimum_gap < keyed.width * 0.13:
        raise AssertionError(f"{path} pose silhouettes are crowded/overlapping (minimum center gap {minimum_gap:.1f}px)")
    pose_areas = [area for area, _, _ in major]
    if max(pose_areas) / min(pose_areas) > 1.8:
        raise AssertionError(f"{path} pose silhouette sizes are inconsistent: {pose_areas}")

    poses = [normalized_subject(component) for _, _, component in major]
    removed = [removed_ratio] * 4
    residual = [residual_ratio] * 4

    unique = len({digest(pose) for pose in poses})
    if unique < 4:
        raise AssertionError(f"{path} contains duplicated pose cells ({unique}/4 unique)")
    meaningful_pairs = sum(
        difference_score(poses[left], poses[right]) >= 0.018
        for left in range(4)
        for right in range(left + 1, 4)
    )
    if meaningful_pairs < 4:
        raise AssertionError(f"{path} has insufficient pose variation ({meaningful_pairs}/6 meaningful pairs)")
    return poses, removed, residual


def verify_source_set(motion_set: MotionSet) -> dict[str, float]:
    source_dir = SOURCE_ROOT / motion_set.source_id
    tracks: dict[str, list[Image.Image]] = {}
    removed: list[float] = []
    residual: list[float] = []
    for track in SOURCE_TRACKS:
        poses, track_removed, track_residual = split_source_strip(source_dir / f"{track}_chroma.png", track)
        tracks[track] = poses
        removed.extend(track_removed)
        residual.extend(track_residual)

    # Same pose number across these tracks must still read as front, profile,
    # and back.  This catches mislabeled/reused strips before 68 frames fan out.
    for family in ("walk", "attack"):
        down = tracks[f"{family}_down"][0]
        right = tracks[f"{family}_right"][0]
        up = tracks[f"{family}_up"][0]
        down_up = difference_score(down, up)
        down_right = difference_score(down, right)
        if down_up < 0.045 or down_right < 0.045:
            raise AssertionError(
                f"{motion_set.source_id} {family} source directions are too similar "
                f"(down/up={down_up:.3f}, down/right={down_right:.3f})"
            )

    # Attack must change more than a breathing/walk variation.
    for direction in ("down", "right", "up"):
        walk = tracks[f"walk_{direction}"][0]
        attack_peak = max(difference_score(walk, pose) for pose in tracks[f"attack_{direction}"])
        if attack_peak < 0.055:
            raise AssertionError(
                f"{motion_set.source_id} attack_{direction} is too close to its walk pose ({attack_peak:.3f})"
            )
    return {
        "mean_removed": statistics.mean(removed),
        "max_residual": max(residual),
    }


def elongation(image: Image.Image) -> float:
    """Principal-axis elongation of a keyed weapon silhouette."""

    points = [
        (x, y)
        for y in range(image.height)
        for x in range(image.width)
        if image.getpixel((x, y))[3] > 12
    ]
    if len(points) < 20:
        return 0.0
    mean_x = statistics.mean(point[0] for point in points)
    mean_y = statistics.mean(point[1] for point in points)
    cov_xx = statistics.mean((x - mean_x) ** 2 for x, _ in points)
    cov_yy = statistics.mean((y - mean_y) ** 2 for _, y in points)
    cov_xy = statistics.mean((x - mean_x) * (y - mean_y) for x, y in points)
    trace = cov_xx + cov_yy
    discriminant = math.sqrt(max(0.0, (cov_xx - cov_yy) ** 2 + 4 * cov_xy**2))
    major = (trace + discriminant) / 2
    minor = max(1e-6, (trace - discriminant) / 2)
    return math.sqrt(major / minor)


def verify_weapon_sources() -> dict[str, float]:
    elongations: list[float] = []
    for source_id, path in WEAPON_SOURCES.items():
        if not path.is_file():
            raise AssertionError(f"missing separate weapon source for {source_id}: {path}")
        source = load_rgba(path)
        if source.width < 128 or source.height < 128:
            raise AssertionError(f"{path} is too small for a weapon master: {source.size}")
        keyed, _, _ = quick_chroma_key(source, str(path))
        assert_component_attachment(str(path), keyed)
        value = elongation(keyed)
        if value < 1.65:
            raise AssertionError(f"{path} weapon silhouette is not sufficiently elongated ({value:.2f})")
        elongations.append(value)
    return {"min_elongation": min(elongations)}


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frames-only", action="store_true", help="skip chroma source and weapon-master checks")
    parser.add_argument("--sources-only", action="store_true", help="skip installed PNG/WebP frame checks")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    if args.frames_only and args.sources_only:
        raise SystemExit("--frames-only and --sources-only cannot be combined")

    if not args.frames_only:
        for motion_set in MOTION_SETS:
            metrics = verify_source_set(motion_set)
            print(
                f"source verified {motion_set.source_id}: 6 strips / 24 distinct poses / "
                f"mean chroma {metrics['mean_removed']:.1%} / max residue {metrics['max_residual']:.1%}"
            )
        weapon_metrics = verify_weapon_sources()
        print(f"weapon sources verified: 3 masters / min elongation {weapon_metrics['min_elongation']:.2f}")

    if not args.sources_only:
        for motion_set in MOTION_SETS:
            metrics = verify_motion_set(motion_set)
            print(
                f"frames verified {motion_set.label}: 68 PNG + 68 pixel-identical WebP / "
                f"direction down-up {metrics['down_up']:.3f}, left-right {metrics['left_right']:.3f} / "
                f"min attack peak {metrics['min_attack_peak']:.3f}"
            )
    print("character motion asset QC passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
