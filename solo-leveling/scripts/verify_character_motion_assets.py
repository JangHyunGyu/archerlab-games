from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
FRAME_SIZE = (112, 144)
WALK_FRAMES = 8
ATTACK_FRAMES = 6

MOTION_SETS = [
    ("player", ROOT / "assets" / "player" / "motion", "player_"),
    ("light_swordswoman", ROOT / "assets" / "player" / "characters" / "light_swordswoman" / "motion", ""),
    ("white_tiger_brawler", ROOT / "assets" / "player" / "characters" / "white_tiger_brawler" / "motion", ""),
    ("flame_mage", ROOT / "assets" / "player" / "characters" / "flame_mage" / "motion", ""),
    ("sanctuary_healer", ROOT / "assets" / "player" / "characters" / "sanctuary_healer" / "motion", ""),
]


def expected_names(prefix: str) -> list[str]:
    names = [f"{prefix}idle_{i}" for i in range(4)]
    for direction in ("down", "right", "up", "left"):
        names.extend(f"{prefix}walk_{direction}_{i}" for i in range(WALK_FRAMES))
    names.extend(f"{prefix}attack_{i}" for i in range(ATTACK_FRAMES))
    for direction in ("down", "right", "up", "left"):
        names.extend(f"{prefix}attack_{direction}_{i}" for i in range(ATTACK_FRAMES))
    names.extend(f"{prefix}hit_{i}" for i in range(2))
    return names


def alpha_bbox(path: Path) -> tuple[int, int, int, int]:
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        if rgba.size != FRAME_SIZE:
            raise AssertionError(f"{path} has size {rgba.size}, expected {FRAME_SIZE}")
        bbox = rgba.getchannel("A").getbbox()
        if not bbox:
            raise AssertionError(f"{path} is fully transparent")
        return bbox


def bbox_center(path: Path) -> tuple[float, float]:
    x1, y1, x2, y2 = alpha_bbox(path)
    return ((x1 + x2) / 2, (y1 + y2) / 2)


def motion_centroid(base_path: Path, frame_path: Path) -> tuple[float, float]:
    with Image.open(base_path) as base_image, Image.open(frame_path) as frame_image:
        base = base_image.convert("RGBA")
        frame = frame_image.convert("RGBA")
        if base.size != FRAME_SIZE or frame.size != FRAME_SIZE:
            raise AssertionError(f"{frame_path} has incompatible frame size")

        total = 0.0
        weighted_x = 0.0
        weighted_y = 0.0
        for y in range(FRAME_SIZE[1]):
            for x in range(FRAME_SIZE[0]):
                br, bg, bb, ba = base.getpixel((x, y))
                fr, fg, fb, fa = frame.getpixel((x, y))
                diff = abs(fr - br) + abs(fg - bg) + abs(fb - bb) + abs(fa - ba) * 0.4
                if diff <= 32 or fa <= 10:
                    continue
                weight = diff * (fa / 255)
                total += weight
                weighted_x += x * weight
                weighted_y += y * weight

        if total <= 0:
            raise AssertionError(f"{frame_path} has no measurable attack motion")
        return weighted_x / total, weighted_y / total


def verify_motion_set(label: str, motion_dir: Path, prefix: str) -> None:
    if not motion_dir.exists():
        raise AssertionError(f"missing motion directory: {motion_dir}")

    names = expected_names(prefix)
    for name in names:
        png = motion_dir / f"{name}.png"
        webp = motion_dir / f"{name}.webp"
        if not png.exists():
            raise AssertionError(f"missing {png}")
        if not webp.exists():
            raise AssertionError(f"missing {webp}")
        alpha_bbox(png)

    png_count = len(list(motion_dir.glob("*.png")))
    webp_count = len(list(motion_dir.glob("*.webp")))
    if png_count != len(names) or webp_count != len(names):
        raise AssertionError(
            f"{label} has png={png_count}, webp={webp_count}, expected {len(names)} each"
        )

    idle = motion_dir / f"{prefix}idle_0.png"
    left_x, _ = motion_centroid(idle, motion_dir / f"{prefix}attack_left_3.png")
    right_x, _ = motion_centroid(idle, motion_dir / f"{prefix}attack_right_3.png")
    if right_x - left_x < 5:
        raise AssertionError(f"{label} left/right attack direction is not visually separated")

    _, up_y = motion_centroid(idle, motion_dir / f"{prefix}attack_up_3.png")
    _, down_y = motion_centroid(idle, motion_dir / f"{prefix}attack_down_3.png")
    if down_y - up_y < 4:
        raise AssertionError(f"{label} up/down attack direction is not visually separated")


def main() -> None:
    for label, motion_dir, prefix in MOTION_SETS:
        verify_motion_set(label, motion_dir, prefix)
        print(f"verified {label}: 68 png + 68 webp, directional attacks present")


if __name__ == "__main__":
    main()
