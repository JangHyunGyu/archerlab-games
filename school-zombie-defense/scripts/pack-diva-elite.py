"""Import image_gen artwork; key the matte, uniformly resize, and pack cells.

No poses are drawn or synthesized here. Walk poses share one scale per atlas;
all eight collapse poses share one scale, reviewed against the walking anatomy.
Requires Pillow and ImageMagick. Run from any directory.
"""
from pathlib import Path
import statistics
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "design/source-assets/diva-elite-v1"
IMAGES = ROOT / "assets/images"
CELL = 512


def read_keyed(name):
    path = SOURCES / name
    with Image.open(path) as source:
        size = source.size
    raw = bytearray(subprocess.check_output([
        "magick", str(path), "-alpha", "on", "-fuzz", "25%",
        "-transparent", "#ff00ff", "-depth", "8", "RGBA:-"
    ]))
    # Remove matte spill only along the magenta antialiased silhouette edges.
    for i in range(0, len(raw), 4):
        excess = min(raw[i], raw[i + 2]) - raw[i + 1]
        if excess > 50 and raw[i + 1] < 100:
            raw[i] -= excess
            raw[i + 2] -= excess
            raw[i + 3] = round(raw[i + 3] * max(0, 1 - excess / 255))
    return Image.frombytes("RGBA", size, bytes(raw))


def source_frames(name, columns, rows):
    image = read_keyed(name)
    # Generated rows need not split exactly at half the canvas. Locate the
    # actual empty gutters so a boot or the following row's hair is not cut.
    alpha = image.getchannel("A")
    occupied = [sum(a > 8 for a in alpha.crop((0, y, image.width, y + 1)).tobytes()) > 8
                for y in range(image.height)]
    bands = []
    start = last = None
    for y, visible in enumerate(occupied + [False] * 5):
        if visible:
            if start is None:
                start = y
            last = y
        elif start is not None and y - last > 4:
            bands.append((max(0, start - 2), min(image.height, last + 3)))
            start = last = None
    assert len(bands) == rows, f"{name}: unexpected occupied rows {bands}"
    frames = []
    for row in range(rows):
        for col in range(columns):
            frame = image.crop((round(col * image.width / columns),
                                bands[row][0],
                                round((col + 1) * image.width / columns),
                                bands[row][1]))
            box = frame.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
            assert box, f"{name}: empty frame {len(frames)}"
            # Keep antialiasing outside the measured visible silhouette.
            box = (max(0, box[0] - 2), max(0, box[1] - 2),
                   min(frame.width, box[2] + 2), min(frame.height, box[3] + 2))
            frames.append(frame.crop(box))
    return frames


def pack(frames, name, scale, bottom):
    atlas = Image.new("RGBA", (CELL * 4, CELL * (len(frames) // 4)))
    for i, frame in enumerate(frames):
        size = tuple(round(side * scale) for side in frame.size)
        assert max(size) <= CELL - 8, f"{name}/{i}: increase atlas padding, never shrink an individual pose"
        resized = frame.resize(size, Image.Resampling.LANCZOS)
        x = (CELL - size[0]) // 2
        y = round(bottom - size[1])
        assert x >= 4 and y >= 4 and y + size[1] <= CELL - 4, f"{name}/{i}: clipped cell"
        atlas.alpha_composite(resized, (i % 4 * CELL + x, i // 4 * CELL + y))
    atlas.save(IMAGES / f"{name}.png", optimize=True)
    atlas.save(IMAGES / f"{name}.webp", quality=88, method=6, exact=True)
    print(name, atlas.size, "uniform scale", round(scale, 6))


for kind, height, bottom in [("elite", 431, 479), ("diva", 476, 488)]:
    frames = source_frames(f"{kind}-walk.png", 2, 2)
    scale = height / statistics.median(frame.height for frame in frames)
    pack(frames * 4, f"zombie-walk-{kind}", scale, bottom)

# The 1.25 runtime cell-size factor makes this a uniform 0.90 anatomical
# scale relative to the generated collapse source. Padding accommodates the
# lying silhouette without normalizing any pose to the standing height.
pack(source_frames("diva-death.png", 4, 2), "zombie-death-diva-sheet", 0.72, 480)
