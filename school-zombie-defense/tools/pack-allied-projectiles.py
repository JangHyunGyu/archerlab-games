"""Import reviewed transparent projectiles without changing their aspect ratio."""

from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "design/source-assets/allied-projectiles-v1"
TARGETS = {
    "pistol": ("pistol.png", (70, 185)),
    "rifle": ("rifle.png", (88, 230)),
    "sniper": ("rifle.png", (48, 230)),
    "shock": ("shock.png", (111, 190)),
}


def pack() -> None:
    for weapon, (filename, size) in TARGETS.items():
        with Image.open(SOURCES / filename) as source:
            source = source.convert("RGBA")
            alpha_min, alpha_max = source.getchannel("A").getextrema()
            assert alpha_min == 0 and alpha_max >= 240, filename
            # Ignore distant alpha=1 encoding specks when measuring the canvas;
            # retain the original alpha inside the padded visible bounds.
            bounds = source.getchannel("A").point(lambda alpha: 255 if alpha >= 8 else 0).getbbox()
            assert bounds, filename
            bounds = (max(0, bounds[0] - 4), max(0, bounds[1] - 4),
                      min(source.width, bounds[2] + 4), min(source.height, bounds[3] + 4))
            sprite = ImageOps.contain(
                source.crop(bounds), (size[0] - 12, size[1] - 12), Image.Resampling.LANCZOS
            )
        target = Image.new("RGBA", size)
        # Preserve the generated alpha, including the shock bolt's soft glow.
        target.alpha_composite(sprite, ((size[0] - sprite.width) // 2, (size[1] - sprite.height) // 2))
        base = ROOT / "assets/images" / f"projectile-{weapon}"
        target.save(base.with_suffix(".png"), optimize=True)
        target.save(base.with_suffix(".webp"), quality=96, method=6, exact=True)
        with Image.open(base.with_suffix(".webp")) as webp:
            assert webp.getchannel("A").tobytes() == target.getchannel("A").tobytes()
        print(f"Packed {weapon}: {size[0]}x{size[1]}")


if __name__ == "__main__":
    pack()
