"""Pack reviewed recovery art without altering the preserved source masters."""

from pathlib import Path
import argparse
import importlib.util
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("defender_packing", Path(__file__).with_name("finalize-defender-action-directions.py"))
packing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packing)
HEAD_WINDOWS = [(350, 340, 650, 600), (390, 340, 675, 600), (445, 330, 730, 620),
                (490, 330, 760, 640), (460, 340, 715, 670)]


def register_cell(source, target, source_index, mirrored):
    # The flame is red too; explicit scalp windows avoid treating it as hair.
    source = packing.keep_character_component(source)
    head_window = HEAD_WINDOWS[source_index]
    head_alpha = source.crop(head_window).getchannel("A").point(lambda a: 255 if a > 32 else 0)
    head_top = head_window[1] + head_alpha.getbbox()[1]
    if mirrored:
        source = source.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    source_box, _ = packing.alpha_geometry(source)
    target_box, target_foot_x = packing.alpha_geometry(target)
    scale = (target_box[3] - target_box[1]) / (source_box[3] - head_top)
    resized = source.resize((round(source.width * scale), round(source.height * scale)), Image.Resampling.LANCZOS)
    resized_box, foot_x = packing.alpha_geometry(resized)
    dx, dy = round(target_foot_x - foot_x), target_box[3] - resized_box[3]
    if min(dx + resized_box[0], dy + resized_box[1], target.width - dx - resized_box[2], target.height - dy - resized_box[3]) < 6:
        raise ValueError("Recovery sprite would clip; review the source instead of shrinking its anatomy")
    cell = Image.new("RGBA", target.size)
    cell.alpha_composite(resized, (dx, dy))
    return cell, round(head_top * scale + dy - target_box[1], 3)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=ROOT / "design/source-assets/firebomb-recovery-v1")
    parser.add_argument("--output", type=Path, default=ROOT / "assets/images/character-f-throw-4.png")
    args = parser.parse_args()
    targets = packing.split_strip(Image.open(ROOT / "assets/images/character-f-throw-3.png").convert("RGBA"))
    cells = []
    measurements = []
    for direction in range(9):
        source_index = direction if direction <= 4 else 8 - direction
        source_path = args.source_dir / f"firebomb-recovery-c{source_index}-master.png"
        source = Image.open(source_path).convert("RGBA")
        cell, head_delta = register_cell(source, targets[direction], source_index, direction > 4)
        cells.append(cell)
        box, foot_x = packing.alpha_geometry(cell)
        target_box, target_foot_x = packing.alpha_geometry(targets[direction])
        measurements.append({"direction": direction, "source": source_path.name, "native_size": list(source.size),
                             "foot_delta": [round(foot_x - target_foot_x, 3), box[3] - target_box[3]],
                             "head_top_delta": head_delta})
    strip = Image.new("RGBA", (512 * 9, 640))
    for direction, cell in enumerate(cells):
        strip.alpha_composite(cell, (direction * 512, 0))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    strip.save(args.output, optimize=True)
    strip.save(args.output.with_suffix(".webp"), lossless=True, exact=True, method=6)
    report = (args.source_dir / "registration.json") if args.output.parent == ROOT / "assets/images" else args.output.with_suffix(".measurements.json")
    report.write_text(json.dumps(measurements, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "dimensions": list(strip.size), "measurements": measurements}))


if __name__ == "__main__":
    main()
