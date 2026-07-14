from __future__ import annotations

"""Install reviewed Higgsfield character identity and integrated motion sources.

Motion input can be either Higgsfield AutoSprite atlases with 256px cells or a
directory containing all six reviewed four-pose chroma strips. Four evenly
spaced poses from each AutoSprite atlas are converted to the same motion-v2
contract. Each character's weapon or combat focus stays inside the pose;
build_character_motion_v2.py must therefore keep these characters in
embedded_weapon mode. The historical filename remains as a compatibility entry
point, and light_swordswoman remains the default target.
"""

import argparse
from dataclasses import dataclass
from pathlib import Path
import shutil
import tempfile
from typing import Sequence

from PIL import Image, ImageDraw, ImageFilter

from build_character_motion_v2 import (
    normalize_source_resolution,
    split_strip,
    validate_source_pose_consistency,
)
from image_formats import save_png_and_webp


ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class CharacterInstallProfile:
    source_id: str
    asset_key: str
    card_outer: tuple[int, int, int, int]
    card_inner: tuple[int, int, int, int]


CHARACTER_INSTALL_PROFILES = {
    "shadow_monarch": CharacterInstallProfile(
        source_id="shadow_monarch",
        asset_key="original_shadow_monarch",
        card_outer=(154, 92, 255, 255),
        card_inner=(93, 151, 255, 180),
    ),
    "light_swordswoman": CharacterInstallProfile(
        source_id="light_swordswoman",
        asset_key="light_swordswoman",
        card_outer=(255, 216, 106, 255),
        card_inner=(84, 188, 226, 180),
    ),
    "white_tiger_brawler": CharacterInstallProfile(
        source_id="white_tiger_brawler",
        asset_key="white_tiger_brawler",
        card_outer=(191, 234, 255, 255),
        card_inner=(112, 181, 224, 180),
    ),
    "flame_mage": CharacterInstallProfile(
        source_id="flame_mage",
        asset_key="flame_mage",
        card_outer=(255, 122, 52, 255),
        card_inner=(255, 190, 82, 180),
    ),
    "sanctuary_healer": CharacterInstallProfile(
        source_id="sanctuary_healer",
        asset_key="sanctuary_healer",
        card_outer=(102, 242, 176, 255),
        card_inner=(224, 207, 133, 180),
    ),
}

AUTOSPRITE_CELL_SIZE = 256
STRIP_CELL_PADDING = 20
ANCHOR_MAX_SIZE = (512, 720)

TRACK_ARGUMENTS = {
    "walk_down": "walk_down",
    "walk_right": "walk_right",
    "walk_up": "walk_up",
    "attack_down": "attack_down",
    "attack_right": "attack_right",
    "attack_up": "attack_up",
}
DIRECT_STRIP_FILENAMES = {
    track: f"{track}_chroma.png"
    for track in TRACK_ARGUMENTS
}


def load_rgba(path: Path) -> Image.Image:
    if not path.is_file():
        raise FileNotFoundError(path)
    with Image.open(path) as image:
        return image.convert("RGBA")


def visible_bbox(image: Image.Image, label: str) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").point(lambda value: 255 if value > 3 else 0).getbbox()
    if bbox is None:
        raise ValueError(f"{label}: fully transparent image")
    return bbox


def despill_transparent_green(image: Image.Image) -> Image.Image:
    """Neutralize chroma spill left on transparent identity-anchor edges.

    Higgsfield's transparent cutout can retain the original green-screen RGB
    underneath zero alpha and a narrow semi-opaque green fringe.  Restricting
    cleanup to alpha edges and strongly green-dominant pixels preserves the
    healer's cyan crystal, teal clothing, and other intentional interior color.
    """

    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    local_min_alpha = alpha.filter(ImageFilter.MinFilter(7))
    rgba_flattened = getattr(rgba, "get_flattened_data", None)
    edge_flattened = getattr(local_min_alpha, "get_flattened_data", None)
    pixels = list(rgba_flattened() if rgba_flattened is not None else rgba.getdata())
    edge_values = list(edge_flattened() if edge_flattened is not None else local_min_alpha.getdata())
    cleaned: list[tuple[int, int, int, int]] = []

    for (r, g, b, a), nearby_alpha in zip(pixels, edge_values):
        if a <= 3:
            cleaned.append((0, 0, 0, 0))
            continue

        strongest_other = max(r, b)
        dominance = g - strongest_other
        chroma_like = g >= 70 and dominance >= 15 and b <= g * 0.72
        near_transparency = nearby_alpha <= 3 or a < 240
        if chroma_like and near_transparency:
            strength = min(1.0, max(0.0, (dominance - 15) / 85))
            g = round(g * (1.0 - strength) + min(255, strongest_other + 5) * strength)
            a = round(a * (1.0 - 0.65 * strength))
            if a <= 3:
                cleaned.append((0, 0, 0, 0))
                continue
        cleaned.append((r, g, b, a))

    rgba.putdata(cleaned)
    return rgba


def extract_autosprite_frames(path: Path, expected_count: int) -> list[Image.Image]:
    sheet = load_rgba(path)
    if sheet.width % AUTOSPRITE_CELL_SIZE or sheet.height % AUTOSPRITE_CELL_SIZE:
        raise ValueError(
            f"{path}: expected a grid of {AUTOSPRITE_CELL_SIZE}px cells, got {sheet.size}"
        )
    columns = sheet.width // AUTOSPRITE_CELL_SIZE
    rows = sheet.height // AUTOSPRITE_CELL_SIZE
    if columns * rows < expected_count:
        raise ValueError(
            f"{path}: atlas has {columns * rows} cells, expected at least {expected_count}"
        )

    frames: list[Image.Image] = []
    for index in range(expected_count):
        x = (index % columns) * AUTOSPRITE_CELL_SIZE
        y = (index // columns) * AUTOSPRITE_CELL_SIZE
        frame = sheet.crop((x, y, x + AUTOSPRITE_CELL_SIZE, y + AUTOSPRITE_CELL_SIZE))
        bbox = visible_bbox(frame, f"{path}[{index}]")
        left, top, right, bottom = bbox
        if left <= 1 or top <= 1 or right >= frame.width - 1 or bottom >= frame.height - 1:
            raise ValueError(f"{path}[{index}]: subject touches cell border at {bbox}")
        frames.append(frame)
    return frames


def four_evenly_spaced(frames: Sequence[Image.Image]) -> list[Image.Image]:
    if len(frames) < 4:
        raise ValueError("at least four AutoSprite frames are required")
    indices = [round(index * (len(frames) - 1) / 3) for index in range(4)]
    if len(set(indices)) != 4:
        raise ValueError(f"could not choose four unique source poses from {len(frames)} frames")
    return [frames[index] for index in indices]


def make_chroma_strip(frames: Sequence[Image.Image]) -> Image.Image:
    if len(frames) != 4:
        raise ValueError("the motion-v2 source contract requires exactly four poses")
    cell_extent = AUTOSPRITE_CELL_SIZE + STRIP_CELL_PADDING * 2
    strip = Image.new("RGB", (cell_extent * 4, cell_extent), (0, 255, 0))
    for index, frame in enumerate(frames):
        x = index * cell_extent + STRIP_CELL_PADDING
        strip.paste(frame.convert("RGB"), (x, STRIP_CELL_PADDING), frame.getchannel("A"))
    return strip


def validate_direct_strips(character_id: str, directory: Path) -> dict[str, Path]:
    if not directory.is_dir():
        raise NotADirectoryError(directory)

    paths = {
        track: directory / filename
        for track, filename in DIRECT_STRIP_FILENAMES.items()
    }
    missing = [path for path in paths.values() if not path.is_file()]
    if missing:
        listing = "\n  ".join(str(path) for path in missing)
        raise FileNotFoundError(f"missing direct motion strips:\n  {listing}")

    poses = {
        track: split_strip(path, track)
        for track, path in paths.items()
    }
    poses = normalize_source_resolution(poses)
    validate_source_pose_consistency(character_id, poses)
    return paths


def make_source(anchor: Image.Image) -> Image.Image:
    anchor = despill_transparent_green(anchor)
    left, top, right, bottom = visible_bbox(anchor, "identity anchor")
    padding = 12
    crop = anchor.crop((
        max(0, left - padding),
        max(0, top - padding),
        min(anchor.width, right + padding),
        min(anchor.height, bottom + padding),
    ))
    scale = min(
        ANCHOR_MAX_SIZE[0] / crop.width,
        ANCHOR_MAX_SIZE[1] / crop.height,
        1.0,
    )
    size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    return crop.resize(size, Image.Resampling.LANCZOS)


def make_menu_portrait(master: Image.Image) -> Image.Image:
    side = min(master.size)
    left = (master.width - side) // 2
    top = (master.height - side) // 2
    return master.crop((left, top, left + side, top + side)).resize(
        (512, 512),
        Image.Resampling.LANCZOS,
    )


def make_card_portrait(source: Image.Image, profile: CharacterInstallProfile) -> Image.Image:
    canvas = Image.new("RGBA", (256, 256), (5, 10, 22, 255))
    draw = ImageDraw.Draw(canvas)
    draw.ellipse((6, 6, 250, 250), outline=profile.card_outer, width=4)
    draw.ellipse((13, 13, 243, 243), outline=profile.card_inner, width=2)
    draw.ellipse((22, 22, 234, 234), fill=(7, 17, 32, 255))

    bbox = visible_bbox(source, "installed source")
    subject = source.crop(bbox)
    scale = min(212 / subject.width, 224 / subject.height)
    subject = subject.resize(
        (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
        Image.Resampling.LANCZOS,
    )
    x = (256 - subject.width) // 2
    y = 246 - subject.height
    canvas.alpha_composite(subject, (x, y))
    return canvas


def install_file(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.integrated.tmp")
    try:
        shutil.copy2(source, temporary)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--character",
        choices=tuple(CHARACTER_INSTALL_PROFILES),
        default="light_swordswoman",
        help="target character (default: light_swordswoman for backward compatibility)",
    )
    parser.add_argument("--anchor", type=Path, help="reviewed transparent identity anchor")
    parser.add_argument("--menu-portrait", type=Path, help="reviewed square portrait master")
    parser.add_argument(
        "--direct-strip-dir",
        type=Path,
        help=(
            "directory containing the six reviewed four-pose *_chroma.png strips; "
            "cannot be combined with individual AutoSprite atlas arguments"
        ),
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--identity-only",
        action="store_true",
        help="install only source/menu/card identity portraits; do not require or install motion sources",
    )
    mode.add_argument(
        "--motion-only",
        action="store_true",
        help="install only the six integrated motion sources; do not require or rewrite identity portraits",
    )
    parser.add_argument("--walk-down", type=Path, help="AutoSprite walk-down atlas")
    parser.add_argument("--walk-right", type=Path, help="AutoSprite walk-right atlas")
    parser.add_argument("--walk-up", type=Path, help="AutoSprite walk-up atlas")
    parser.add_argument("--attack-down", type=Path, help="AutoSprite attack-down atlas")
    parser.add_argument("--attack-right", type=Path, help="AutoSprite attack-right atlas")
    parser.add_argument("--attack-up", type=Path, help="AutoSprite attack-up atlas")
    args = parser.parse_args(argv)

    autosprite_paths = {
        track: getattr(args, argument_name)
        for track, argument_name in TRACK_ARGUMENTS.items()
    }
    supplied_autosprite = [track for track, path in autosprite_paths.items() if path is not None]

    if args.motion_only:
        if args.anchor is not None or args.menu_portrait is not None:
            parser.error("--motion-only cannot be combined with --anchor or --menu-portrait")
    else:
        missing_identity = []
        if args.anchor is None:
            missing_identity.append("--anchor")
        if args.menu_portrait is None:
            missing_identity.append("--menu-portrait")
        if missing_identity:
            parser.error(f"identity input is required: missing {', '.join(missing_identity)}")

    if args.identity_only:
        if args.direct_strip_dir is not None or supplied_autosprite:
            parser.error(
                "--identity-only cannot be combined with --direct-strip-dir or AutoSprite atlas arguments"
            )
        return args

    if args.direct_strip_dir is not None:
        if supplied_autosprite:
            parser.error(
                "--direct-strip-dir cannot be combined with individual AutoSprite atlas arguments"
            )
        return args

    missing_autosprite = [
        f"--{TRACK_ARGUMENTS[track].replace('_', '-')}"
        for track, path in autosprite_paths.items()
        if path is None
    ]
    if missing_autosprite:
        parser.error(
            "motion input is required: provide --direct-strip-dir or all AutoSprite atlas arguments; "
            f"missing {', '.join(missing_autosprite)}"
        )
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    profile = CHARACTER_INSTALL_PROFILES[args.character]
    character_dir = ROOT / "assets" / "player" / "characters" / profile.asset_key
    source_dir = ROOT / "assets" / "player" / "motion_v2_sources" / profile.source_id

    identity_assets: tuple[Image.Image, Image.Image, Image.Image] | None = None
    if not args.motion_only:
        anchor = load_rgba(args.anchor)
        portrait_master = load_rgba(args.menu_portrait)
        source = make_source(anchor)
        identity_assets = (
            source,
            make_menu_portrait(portrait_master),
            make_card_portrait(source, profile),
        )

    temp_prefix = f"{profile.source_id.replace('_', '-')}-integrated-"
    with tempfile.TemporaryDirectory(prefix=temp_prefix) as temp:
        stage = Path(temp)
        staged_character = stage / "character"
        staged_sources = stage / "sources"
        if identity_assets is not None:
            source, menu_portrait, card_portrait = identity_assets
            save_png_and_webp(source, staged_character / "source.png")
            save_png_and_webp(menu_portrait, staged_character / "menu_portrait.png")
            save_png_and_webp(card_portrait, staged_character / "portrait.png")

        if not args.identity_only:
            if args.direct_strip_dir is not None:
                direct_strips = validate_direct_strips(profile.source_id, args.direct_strip_dir)
                for track, path in direct_strips.items():
                    install_file(path, staged_sources / DIRECT_STRIP_FILENAMES[track])
            else:
                for track, argument_name in TRACK_ARGUMENTS.items():
                    path = getattr(args, argument_name)
                    expected_count = 8 if track.startswith("walk_") else 6
                    frames = extract_autosprite_frames(path, expected_count)
                    strip = make_chroma_strip(four_evenly_spaced(frames))
                    output = staged_sources / DIRECT_STRIP_FILENAMES[track]
                    output.parent.mkdir(parents=True, exist_ok=True)
                    strip.save(output, optimize=True)

        if identity_assets is not None:
            for path in staged_character.iterdir():
                install_file(path, character_dir / path.name)
        if not args.identity_only:
            for path in staged_sources.iterdir():
                install_file(path, source_dir / path.name)

    if identity_assets is not None:
        print(f"installed identity assets: {character_dir}")
    if not args.identity_only:
        print(f"installed six embedded-weapon motion strips: {source_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
