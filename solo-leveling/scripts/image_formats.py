from __future__ import annotations

from pathlib import Path

from PIL import Image


def save_png_and_webp(img: Image.Image, png_path: Path) -> None:
    png_path.parent.mkdir(parents=True, exist_ok=True)
    frame = img.convert("RGBA")
    frame.save(png_path)
    frame.save(png_path.with_suffix(".webp"), "WEBP", lossless=True, quality=100, method=6)
