"""Build reviewed crossbow source cells from Higgsfield key poses and videos.

The tool intentionally stops at the reviewed-source boundary.  It writes the
twenty ``a-f{0..3}-c{0..4}.png`` cells, their README, and SHA256SUMS under
``design/source-assets/crossbow-v1``; production sprite sheets are never read
or modified.
"""

from __future__ import annotations

import argparse
from collections import deque
import hashlib
import json
import math
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_ROOT = ROOT / "design" / "source-assets" / "crossbow-v1"
BLUE_KEY = (0, 0, 255)
DIRECTIONS = tuple(f"c{index}" for index in range(5))
ANIMATION_FRAMES = ("f1", "f2", "f3")
DEFAULT_TRANSPARENT_THRESHOLD = 12
DEFAULT_OPAQUE_THRESHOLD = 96
KEY_NEAR_DISTANCE = 32
KEY_DOMINANCE_THRESHOLD = 16
ALPHA_NOISE_FLOOR = 8
MIN_VISIBLE_PIXELS = 1_000
MAX_VISIBLE_FRACTION = 0.85


@dataclass(frozen=True)
class FrameSelection:
    kind: str
    value: int | float

    def ffmpeg_args(self) -> list[str]:
        if self.kind == "frame_index":
            return ["-vf", f"select=eq(n\\,{self.value})", "-fps_mode", "vfr"]
        return ["-ss", f"{self.value:.6f}"]

    def describe(self) -> str:
        if self.kind == "frame_index":
            return f"frame_index={self.value}"
        return f"timestamp={self.value:.6f}s"


@dataclass(frozen=True)
class DirectionSpec:
    direction: str
    keypose: Path
    video: Path
    keypose_label: str
    video_label: str
    selections: dict[str, FrameSelection]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_timestamp(raw: Any, context: str) -> float:
    if isinstance(raw, bool):
        raise ValueError(f"{context} timestamp must be seconds or HH:MM:SS.sss")
    if isinstance(raw, (int, float)):
        seconds = float(raw)
    elif isinstance(raw, str):
        value = raw.strip()
        try:
            if ":" not in value:
                seconds = float(value)
            else:
                parts = value.split(":")
                if len(parts) != 3:
                    raise ValueError
                hours, minutes, seconds_part = parts
                if not hours.isdigit() or not minutes.isdigit():
                    raise ValueError
                seconds = int(hours) * 3600 + int(minutes) * 60 + float(seconds_part)
        except ValueError as error:
            raise ValueError(
                f"{context} has invalid timestamp {raw!r}; use seconds or HH:MM:SS.sss"
            ) from error
    else:
        raise ValueError(f"{context} timestamp must be seconds or HH:MM:SS.sss")
    if not math.isfinite(seconds) or seconds < 0:
        raise ValueError(f"{context} timestamp must be finite and non-negative")
    return seconds


def parse_selection(raw: Any, context: str) -> FrameSelection:
    if not isinstance(raw, dict):
        raise ValueError(f"{context} must be an object")
    selectors = [name for name in ("frame_index", "timestamp") if name in raw]
    if len(selectors) != 1:
        raise ValueError(
            f"{context} must contain exactly one of frame_index or timestamp"
        )
    selector = selectors[0]
    value = raw[selector]
    if selector == "frame_index":
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise ValueError(f"{context} frame_index must be a non-negative integer")
        return FrameSelection(selector, value)
    return FrameSelection(selector, parse_timestamp(value, context))


def ensure_within(path: Path, parent: Path, context: str) -> Path:
    resolved = path.resolve()
    try:
        resolved.relative_to(parent.resolve())
    except ValueError as error:
        raise ValueError(f"{context} must stay inside {parent}") from error
    return resolved


def resolve_input(generated_dir: Path, raw: Any, suffix: str, context: str) -> tuple[Path, str]:
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError(f"{context} must be a non-empty path string")
    relative = Path(raw)
    candidate = relative if relative.is_absolute() else generated_dir / relative
    path = ensure_within(candidate, generated_dir, context)
    if path.suffix.lower() != suffix:
        raise ValueError(f"{context} must be a {suffix} file: {raw}")
    if not path.is_file():
        raise ValueError(f"{context} does not exist: {path}")
    return path, path.relative_to(generated_dir).as_posix()


def load_manifest(manifest_path: Path, generated_dir: Path) -> list[DirectionSpec]:
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(
            f"invalid JSON in {manifest_path}: line {error.lineno}, column {error.colno}"
        ) from error
    if not isinstance(payload, dict) or not isinstance(payload.get("directions"), dict):
        raise ValueError("manifest must contain a directions object")

    directions = payload["directions"]
    missing = sorted(set(DIRECTIONS) - set(directions))
    unexpected = sorted(set(directions) - set(DIRECTIONS))
    if missing or unexpected:
        raise ValueError(
            "manifest directions must be exactly c0..c4; "
            f"missing={missing or 'none'}, unexpected={unexpected or 'none'}"
        )

    specs: list[DirectionSpec] = []
    for direction in DIRECTIONS:
        raw_spec = directions[direction]
        if not isinstance(raw_spec, dict):
            raise ValueError(f"directions.{direction} must be an object")
        keypose, keypose_label = resolve_input(
            generated_dir,
            raw_spec.get("keypose"),
            ".png",
            f"directions.{direction}.keypose",
        )
        video, video_label = resolve_input(
            generated_dir,
            raw_spec.get("video"),
            ".mp4",
            f"directions.{direction}.video",
        )
        raw_frames = raw_spec.get("frames")
        if not isinstance(raw_frames, dict) or set(raw_frames) != set(ANIMATION_FRAMES):
            raise ValueError(
                f"directions.{direction}.frames must contain exactly f1, f2, and f3"
            )
        selections = {
            frame: parse_selection(
                raw_frames[frame], f"directions.{direction}.frames.{frame}"
            )
            for frame in ANIMATION_FRAMES
        }
        specs.append(
            DirectionSpec(
                direction,
                keypose,
                video,
                keypose_label,
                video_label,
                selections,
            )
        )
    return specs


def remove_blue_chroma(
    source: Image.Image,
    *,
    transparent_threshold: int,
    opaque_threshold: int,
) -> Image.Image:
    """Return an RGBA image with a guarded #0000FF edge matte.

    Only pixels that are both near the key-colour range and key-like receive
    transparency or despill. Colours at or above the opaque threshold are
    copied byte-for-byte to protect the defender's navy clothing and cyan VFX.
    """
    rgba = source.convert("RGBA")
    output: list[tuple[int, int, int, int]] = []
    for red, green, blue, alpha in rgba.get_flattened_data():
        distance = max(
            abs(red - BLUE_KEY[0]),
            abs(green - BLUE_KEY[1]),
            abs(blue - BLUE_KEY[2]),
        )
        if distance >= opaque_threshold:
            output.append((red, green, blue, alpha))
            continue

        non_key_strength = max(red, green)
        blue_dominance = blue - non_key_strength
        key_like = (
            distance <= KEY_NEAR_DISTANCE
            or blue_dominance >= KEY_DOMINANCE_THRESHOLD
        )
        if not key_like:
            output.append((red, green, blue, alpha))
            continue

        if distance <= transparent_threshold:
            matte_alpha = 0
        else:
            ratio = (distance - transparent_threshold) / (
                opaque_threshold - transparent_threshold
            )
            ratio = ratio * ratio * (3.0 - 2.0 * ratio)
            distance_alpha = round(255 * ratio)
            if blue_dominance <= 0:
                dominance_alpha = 255
            else:
                denominator = max(1, 255 - non_key_strength)
                dominance_alpha = round(
                    255 * (1.0 - min(1.0, blue_dominance / denominator))
                )
            matte_alpha = min(distance_alpha, dominance_alpha)

        clean_alpha = round(matte_alpha * (alpha / 255.0))
        if 0 < clean_alpha <= ALPHA_NOISE_FLOOR:
            clean_alpha = 0
        if not clean_alpha:
            output.append((0, 0, 0, 0))
            continue

        clean_blue = blue
        if clean_alpha < 252:
            clean_blue = min(blue, max(0, non_key_strength - 1))
        output.append((red, green, clean_blue, clean_alpha))

    result = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    result.putdata(output)
    return result


def keep_largest_alpha_component(
    image: Image.Image,
    *,
    threshold: int = ALPHA_NOISE_FLOOR,
) -> Image.Image:
    """Keep the largest alpha component using deterministic 8-connectivity.

    Component membership uses alpha values strictly greater than the threshold.
    Retained pixels are copied byte-for-byte; every other pixel becomes fully
    transparent, so the character and connected crossbow are never recoloured.
    """
    rgba = image.convert("RGBA")
    width, height = rgba.size
    active = bytearray(
        alpha > threshold for alpha in rgba.getchannel("A").get_flattened_data()
    )
    largest: list[int] = []

    for start, value in enumerate(active):
        if not value:
            continue
        active[start] = 0
        queue = deque([start])
        component: list[int] = []
        while queue:
            current = queue.popleft()
            component.append(current)
            y, x = divmod(current, width)
            for delta_y in (-1, 0, 1):
                for delta_x in (-1, 0, 1):
                    if not delta_x and not delta_y:
                        continue
                    neighbour_x = x + delta_x
                    neighbour_y = y + delta_y
                    if not (0 <= neighbour_x < width and 0 <= neighbour_y < height):
                        continue
                    neighbour = neighbour_y * width + neighbour_x
                    if active[neighbour]:
                        active[neighbour] = 0
                        queue.append(neighbour)
        if len(component) > len(largest):
            largest = component

    source_pixels = list(rgba.get_flattened_data())
    output_pixels = [(0, 0, 0, 0)] * (width * height)
    for index in largest:
        output_pixels[index] = source_pixels[index]
    result = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    result.putdata(output_pixels)
    return result


def validate_alpha_cell(image: Image.Image, label: str) -> None:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError(f"{label} is empty after blue-key removal")
    visible = sum(value > 8 for value in alpha.get_flattened_data())
    total = image.width * image.height
    if visible < MIN_VISIBLE_PIXELS:
        raise ValueError(f"{label} retains only {visible} visible pixels")
    if visible / total > MAX_VISIBLE_FRACTION:
        raise ValueError(
            f"{label} remains {visible / total:.1%} opaque; check that its background is #0000FF"
        )
    corners = (
        alpha.getpixel((0, 0)),
        alpha.getpixel((image.width - 1, 0)),
        alpha.getpixel((0, image.height - 1)),
        alpha.getpixel((image.width - 1, image.height - 1)),
    )
    if any(corners):
        raise ValueError(
            f"{label} has non-transparent corners after blue-key removal: {corners}"
        )
    left, top, right, bottom = bbox
    if left == 0 or top == 0 or right == image.width or bottom == image.height:
        raise ValueError(f"{label} touches an image edge after blue-key removal: {bbox}")


def save_alpha_cell(
    input_path: Path,
    output_path: Path,
    *,
    transparent_threshold: int,
    opaque_threshold: int,
    label: str,
) -> None:
    with Image.open(input_path) as source:
        result = remove_blue_chroma(
            source,
            transparent_threshold=transparent_threshold,
            opaque_threshold=opaque_threshold,
        )
    result = keep_largest_alpha_component(result)
    validate_alpha_cell(result, label)
    result.save(output_path, format="PNG", optimize=True, compress_level=9)


def extract_video_frame(
    ffmpeg: str,
    video: Path,
    selection: FrameSelection,
    output_path: Path,
) -> None:
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(video),
        *selection.ffmpeg_args(),
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-y",
        str(output_path),
    ]
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode or not output_path.is_file() or not output_path.stat().st_size:
        detail = completed.stderr.strip() or "ffmpeg produced no frame"
        raise RuntimeError(
            f"could not extract {selection.describe()} from {video.name}: {detail}"
        )


def render_readme(
    specs: list[DirectionSpec],
    manifest_label: str,
    input_hashes: dict[Path, str],
    *,
    transparent_threshold: int,
    opaque_threshold: int,
) -> str:
    rows = []
    for spec in specs:
        rows.append(
            "| {direction} | `{keypose}`<br>`{keypose_hash}` | "
            "`{video}`<br>`{video_hash}` | {f1} | {f2} | {f3} |".format(
                direction=spec.direction,
                keypose=spec.keypose_label,
                keypose_hash=input_hashes[spec.keypose],
                video=spec.video_label,
                video_hash=input_hashes[spec.video],
                **{
                    frame: spec.selections[frame].describe()
                    for frame in ANIMATION_FRAMES
                },
            )
        )
    command = (
        "python school-zombie-defense/tools/prepare-crossbow-source-cells.py "
        f"--manifest {manifest_label} --transparent-threshold {transparent_threshold} "
        f"--opaque-threshold {opaque_threshold} --force"
    )
    return "\n".join(
        [
            "# Crossbow v1 reviewed source cells",
            "",
            "This directory preserves the 20 reviewed source cells used to build the",
            "crossbow defender's production action sheets. `f0` is the direction's",
            "Higgsfield key pose; `f1` through `f3` are explicit frames selected from",
            "that direction's attack video.",
            "",
            "The source images retain their native resolutions. Every cell has a guarded",
            "soft alpha matte removed from its uniform blue chroma background. Key-like",
            f"edge pixels use max-channel thresholds {transparent_threshold}/{opaque_threshold};",
            "distant navy and cyan pixels remain byte-for-byte opaque. Directions",
            "`c5` through `c8` are deterministic horizontal mirrors created later by",
            "`tools/finalize-defender-action-directions.py`.",
            "",
            "## Rebuild these reviewed cells",
            "",
            "```powershell",
            command,
            "```",
            "",
            "This command modifies only this reviewed-source directory. Build production",
            "PNG/WebP strips separately after visual approval with:",
            "",
            "```powershell",
            "python school-zombie-defense/tools/finalize-defender-action-directions.py --crossbow-only",
            "```",
            "",
            "## Inputs and frame selections",
            "",
            "Paths below are relative to `crossbow-v1/generated`. Full SHA-256 values",
            "pin the exact Higgsfield downloads used for the extraction.",
            "",
            "| Direction | Key pose PNG / SHA-256 | Attack MP4 / SHA-256 | f1 | f2 | f3 |",
            "| --- | --- | --- | --- | --- | --- |",
            *rows,
            "",
            "`SHA256SUMS` records the exact 20 alpha-PNG outputs.",
            "",
        ]
    )


def build_cells(
    specs: list[DirectionSpec],
    source_root: Path,
    manifest_path: Path,
    generated_dir: Path,
    ffmpeg: str,
    *,
    transparent_threshold: int,
    opaque_threshold: int,
    force: bool,
) -> None:
    targets = [
        source_root / f"a-f{frame}-c{direction}.png"
        for frame in range(4)
        for direction in range(5)
    ]
    targets.extend((source_root / "README.md", source_root / "SHA256SUMS"))
    existing = [path.name for path in targets if path.exists()]
    if existing and not force:
        preview = ", ".join(existing[:5])
        suffix = "..." if len(existing) > 5 else ""
        raise ValueError(
            f"refusing to overwrite {preview}{suffix}; review them or rerun with --force"
        )

    source_root.mkdir(parents=True, exist_ok=True)
    input_hashes = {
        path: sha256_file(path)
        for path in sorted(
            {item for spec in specs for item in (spec.keypose, spec.video)},
            key=str,
        )
    }
    with tempfile.TemporaryDirectory(
        prefix=".crossbow-source-build-", dir=source_root
    ) as temporary:
        staging = Path(temporary)
        for spec in specs:
            direction_index = int(spec.direction[1:])
            f0_output = staging / f"a-f0-c{direction_index}.png"
            save_alpha_cell(
                spec.keypose,
                f0_output,
                transparent_threshold=transparent_threshold,
                opaque_threshold=opaque_threshold,
                label=f"{spec.direction} f0 key pose",
            )
            for frame_name in ANIMATION_FRAMES:
                frame_index = int(frame_name[1:])
                raw_frame = staging / f"raw-{spec.direction}-{frame_name}.png"
                extract_video_frame(
                    ffmpeg,
                    spec.video,
                    spec.selections[frame_name],
                    raw_frame,
                )
                save_alpha_cell(
                    raw_frame,
                    staging / f"a-f{frame_index}-c{direction_index}.png",
                    transparent_threshold=transparent_threshold,
                    opaque_threshold=opaque_threshold,
                    label=f"{spec.direction} {frame_name} attack frame",
                )

        cell_names = [
            f"a-f{frame}-c{direction}.png"
            for frame in range(4)
            for direction in range(5)
        ]
        checksums = "\n".join(
            f"{sha256_file(staging / name)}  {name}" for name in cell_names
        ) + "\n"
        (staging / "SHA256SUMS").write_text(checksums, encoding="utf-8", newline="\n")
        manifest_label = manifest_path.relative_to(ROOT.parent).as_posix()
        readme = render_readme(
            specs,
            manifest_label,
            input_hashes,
            transparent_threshold=transparent_threshold,
            opaque_threshold=opaque_threshold,
        )
        (staging / "README.md").write_text(readme, encoding="utf-8", newline="\n")

        for name in (*cell_names, "README.md", "SHA256SUMS"):
            os.replace(staging / name, source_root / name)


def build_parser() -> argparse.ArgumentParser:
    example = """example selections.json:
  {
    "directions": {
      "c0": {
        "keypose": "c0-keypose.png",
        "video": "c0-attack.mp4",
        "frames": {
          "f1": {"frame_index": 8},
          "f2": {"timestamp": "00:00:00.833"},
          "f3": {"frame_index": 24}
        }
      },
      "c1": {"keypose": "...", "video": "...", "frames": {"f1": {"frame_index": 8}, "f2": {"frame_index": 16}, "f3": {"frame_index": 24}}},
      "c2": {"keypose": "...", "video": "...", "frames": {"f1": {"frame_index": 8}, "f2": {"frame_index": 16}, "f3": {"frame_index": 24}}},
      "c3": {"keypose": "...", "video": "...", "frames": {"f1": {"frame_index": 8}, "f2": {"frame_index": 16}, "f3": {"frame_index": 24}}},
      "c4": {"keypose": "...", "video": "...", "frames": {"f1": {"frame_index": 8}, "f2": {"frame_index": 16}, "f3": {"frame_index": 24}}}
    }
  }

All manifest input paths are relative to --generated-dir and must remain
inside it. The command writes only crossbow-v1 source cells and metadata.
"""
    parser = argparse.ArgumentParser(
        description=(
            "Extract 5-direction Higgsfield crossbow key poses/videos into "
            "20 blue-keyed reviewed source cells without touching production sprites."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=example,
    )
    parser.add_argument(
        "--source-root",
        type=Path,
        default=DEFAULT_SOURCE_ROOT,
        help=f"reviewed source output directory (default: {DEFAULT_SOURCE_ROOT})",
    )
    parser.add_argument(
        "--generated-dir",
        type=Path,
        help="Higgsfield download directory (default: SOURCE_ROOT/generated)",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        help="selection JSON (default: GENERATED_DIR/selections.json)",
    )
    parser.add_argument(
        "--ffmpeg",
        default="ffmpeg",
        help="ffmpeg executable name or path (default: ffmpeg)",
    )
    parser.add_argument(
        "--transparent-threshold",
        type=int,
        default=DEFAULT_TRANSPARENT_THRESHOLD,
        help=f"max-channel distance mapped to alpha 0 (default: {DEFAULT_TRANSPARENT_THRESHOLD})",
    )
    parser.add_argument(
        "--opaque-threshold",
        type=int,
        default=DEFAULT_OPAQUE_THRESHOLD,
        help=f"max-channel distance preserved as opaque (default: {DEFAULT_OPAQUE_THRESHOLD})",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="overwrite existing reviewed source cells and metadata",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="validate manifest paths and selections without extracting or writing",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    source_root = args.source_root.resolve()
    generated_dir = (
        args.generated_dir.resolve()
        if args.generated_dir is not None
        else source_root / "generated"
    )
    manifest_path = (
        args.manifest.resolve()
        if args.manifest is not None
        else generated_dir / "selections.json"
    )
    try:
        ensure_within(generated_dir, source_root, "generated directory")
        ensure_within(manifest_path, generated_dir, "manifest")
        if not generated_dir.is_dir():
            raise ValueError(f"generated directory does not exist: {generated_dir}")
        if not manifest_path.is_file():
            raise ValueError(f"manifest does not exist: {manifest_path}")
        if not (
            0
            <= args.transparent_threshold
            < args.opaque_threshold
            <= 255
        ):
            raise ValueError(
                "chroma thresholds must satisfy 0 <= transparent < opaque <= 255"
            )
        specs = load_manifest(manifest_path, generated_dir)
        if args.validate_only:
            print(f"validated {manifest_path}: 5 directions, 15 attack-frame selections")
            return
        ffmpeg = shutil.which(args.ffmpeg)
        if ffmpeg is None:
            raise ValueError(f"ffmpeg executable not found: {args.ffmpeg}")
        build_cells(
            specs,
            source_root,
            manifest_path,
            generated_dir,
            ffmpeg,
            transparent_threshold=args.transparent_threshold,
            opaque_threshold=args.opaque_threshold,
            force=args.force,
        )
    except (OSError, RuntimeError, ValueError) as error:
        parser.error(str(error))
    print(f"wrote 20 crossbow source cells, README.md, and SHA256SUMS to {source_root}")


if __name__ == "__main__":
    main()
