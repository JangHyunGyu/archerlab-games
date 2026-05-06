from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "assets"


def convert_png_to_webp(png_path: Path) -> bool:
    webp_path = png_path.with_suffix(".webp")
    if webp_path.exists() and webp_path.stat().st_mtime >= png_path.stat().st_mtime:
        return False

    with Image.open(png_path) as img:
        frame = img.convert("RGBA")
        frame.save(webp_path, "WEBP", lossless=True, quality=100, method=6)
    return True


def main() -> None:
    png_files = sorted(ASSET_ROOT.rglob("*.png"))
    converted = 0
    for png_path in png_files:
        if convert_png_to_webp(png_path):
            converted += 1

    print(f"webp assets ready: {converted} converted, {len(png_files)} png fallbacks checked")


if __name__ == "__main__":
    main()
