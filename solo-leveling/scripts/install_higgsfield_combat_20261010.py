"""Install reviewed six-stage Higgsfield sheets without per-frame scale drift.

Run after build_character_motion_v2.py for the matching character sources.
All cells share one scale and pivot. Authored growth and dissipation survive
extraction; generated frames are not synthesized from a static peak.
"""
from pathlib import Path
from PIL import Image
import install_higgsfield_character_vfx_20260716 as vfx

SOURCE = vfx.ROOT / 'assets/effects/source/higgsfield_20261010'
NAMES = ('shadow_slash', 'rulers_authority', 'dragon_fear',
         'tiger_quake', 'tiger_guard', 'flame_arc')


def extract(name: str) -> list[Image.Image]:
    sheet = Image.open(SOURCE / f'{name}_sheet.png').convert('RGBA')
    # The provider rounds output dimensions to multiples of 16 (2048x1360).
    if abs((sheet.width / 3) / (sheet.height / 2) - 1) > .01:
        raise ValueError(f'{name}: expected a 3 by 2 grid of square cells')
    frames = []
    for index in range(6):
        col, row = index % 3, index // 3
        cell = sheet.crop((round(col * sheet.width / 3), round(row * sheet.height / 2),
                           round((col + 1) * sheet.width / 3), round((row + 1) * sheet.height / 2)))
        # The provider adds a slight gradient to the requested flat key.
        # Remove strongly green background first; distance from pure #00ff00
        # alone leaves a faint rectangular plate on additive blend sprites.
        cell.putdata([(0, 0, 0, 0) if g > max(r, b) + 60 and g > max(r, b) * 1.55
                      else (r, g, b, a) for r, g, b, a in cell.get_flattened_data()])
        cell, _, _ = vfx.remove_chroma(cell, vfx.GREEN)
        # White-blue dust picks up green bounce in the generated matte.
        # These six palettes contain no green: despill that channel without
        # erasing pale smoke or changing the recovered alpha.
        cell.putdata([(r, min(g, max(r, b) + 4), b, a)
                      for r, g, b, a in cell.get_flattened_data()])
        residue = sum(a > 3 and g > max(r, b) + 22
                      for r, g, b, a in cell.get_flattened_data())
        removed = sum(a == 0 for r, g, b, a in cell.get_flattened_data()) / (cell.width * cell.height)
        if residue or removed < .1:
            raise ValueError(f'{name}/{index}: chroma removal failed')
        # Padding is fixed for the entire sequence, including the tiny first
        # and last stages. Do not crop to each cell's non-transparent bounds.
        cell = cell.resize((472, 472), Image.Resampling.LANCZOS)
        frame = Image.new('RGBA', (512, 512))
        frame.alpha_composite(cell, (20, 20))
        if name == 'flame_arc':
            # Preserve the production source-axis contract: runtime +135 deg.
            frame = frame.rotate(135, Image.Resampling.BICUBIC)
        if not frame.getchannel('A').getbbox():
            raise ValueError(f'{name}/{index}: empty cell')
        frames.append(frame)
    if len({frame.tobytes() for frame in frames}) != 6:
        raise ValueError(f'{name}: duplicate authored cells')
    return frames


def main() -> None:
    for name in NAMES:
        target = next(target for target in vfx.TARGETS if target.name == name)
        frames = extract(name)
        for index, frame in enumerate(frames):
            vfx.save_pair(frame, vfx.SKILL_DIR / 'frames' / f'{name}_{index}.png')
        vfx.save_pair(frames[3], vfx.SKILL_DIR / f'{name}.png')
        vfx.save_pair(vfx.build_icon(frames[3], target), vfx.ICON_DIR / f'{target.icon}.png')
        print(f'{name}: 6 authored frames, peak and icon')
    peaks = {target.name: Image.open((vfx.BASIC_DIR if target.basic else vfx.SKILL_DIR)
                                    / f'{target.name}.png').convert('RGBA') for target in vfx.TARGETS}
    vfx.write_visible_metrics(peaks)
    text = vfx.METRICS_JS.read_text(encoding='utf-8').replace(
        'scripts/install_higgsfield_character_vfx_20260716.py.',
        'scripts/install_higgsfield_combat_20261010.py (with retained 20260716 assets).')
    vfx.METRICS_JS.write_text(text, encoding='utf-8', newline='\n')


if __name__ == '__main__':
    main()
