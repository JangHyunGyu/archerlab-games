"""Extract reviewed Higgsfield key poses into additional 112x144 attack tracks.

One scale per strip, calibrated against the existing ready pose; never fit each
pose independently. Existing walk, skill and hit frames are not rewritten.
"""
import json
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
import build_character_motion_v2 as motion

ROOT = motion.ROOT
NATIVE_SOURCE = ROOT / 'assets/player/motion_v2_sources/native_rgba/basic_combos'
LEGACY_SOURCE = ROOT / 'assets/player/motion_v2_sources/basic_combos'
VARIANTS = {
    'shadow_monarch': ('cut', 'reverse'),
    'light_swordswoman': ('rise',),
    'white_tiger_brawler': ('backhand',),
    'flame_mage': ('lift',),
    'sanctuary_healer': ('blessing',),
}


def resolve_variant_strip(char: str, track: str) -> tuple[Path, bool]:
    native_path = NATIVE_SOURCE / char / f'{track}.png'
    if native_path.is_file():
        return native_path, True
    return LEGACY_SOURCE / char / f'{track}.png', False


def main():
    previews = Path(r'C:\Users\user\.gemini\antigravity\brain\c8ced0e6-6919-4f8e-b341-2e89bfdc4ac2\scratch\basic_combo_previews')
    previews.mkdir(parents=True, exist_ok=True)
    for char, variants in VARIANTS.items():
        profile = motion.CHARACTER_PROFILES[char]
        target = ROOT / profile.output_relative
        for variant in variants:
            frames = {}
            for direction in ('right', 'down', 'up'):
                track = f'{variant}_{direction}'
                strip_path, is_native = resolve_variant_strip(char, track)
                poses = motion.split_strip(strip_path, track)
                images = [pose.image.crop(motion.alpha_bbox(pose.image)) for pose in poses]
                if not is_native and char == 'flame_mage' and direction == 'down':
                    # Legacy chroma reference predates accepted hand correction.
                    images = [ImageOps.mirror(im) for im in images]
                ready = Image.open(target / f'{profile.filename_prefix}attack_{direction}_0.png').convert('RGBA')
                bbox = motion.alpha_bbox(ready)
                scale = (bbox[3] - bbox[1]) / images[0].height
                rendered = [
                    motion.place_body(
                        im,
                        scale=min(scale, motion.MAX_BODY_W / max(1, im.width), motion.MAX_BODY_H / max(1, im.height)),
                    )
                    for im in images
                ]
                recovery = Image.open(target / f'{profile.filename_prefix}attack_{direction}_5.png').convert('RGBA')
                recoil_angle = -1.4 if direction == 'right' else 0.8
                frames[f'attack_{variant}_{direction}_0'] = rendered[0]
                frames[f'attack_{variant}_{direction}_1'] = rendered[1]
                frames[f'attack_{variant}_{direction}_2'] = motion.transform_rendered_body(rendered[2], brightness=1.03)
                frames[f'attack_{variant}_{direction}_3'] = rendered[3]
                frames[f'attack_{variant}_{direction}_4'] = motion.transform_rendered_body(
                    rendered[0], scale_x=0.993, scale_y=0.997, rotate=recoil_angle
                )
                frames[f'attack_{variant}_{direction}_5'] = recovery
                print(f'{char}/{track}: shared scale {scale:.4f}, ready height {bbox[3]-bbox[1]} (native={is_native})')
            for i in range(6):
                frames[f'attack_{variant}_left_{i}'] = ImageOps.mirror(frames[f'attack_{variant}_right_{i}'])
            for name, im in frames.items():
                motion.validate_frame_image(name, im)
                im.save(target / f'{profile.filename_prefix}{name}.png')
                im.save(target / f'{profile.filename_prefix}{name}.webp', lossless=True, method=6, exact=True)
            sheet = Image.new('RGB', (7 * motion.FRAME_W, 656), (19, 27, 40))
            draw = ImageDraw.Draw(sheet)
            for row, direction in enumerate(('right', 'left', 'down', 'up')):
                draw.text((5,row*164+4), f'{char} / {variant} / {direction}', fill='white')
                # First column is the previous track's ready pose for anatomy comparison.
                old = Image.open(target / f'{profile.filename_prefix}attack_{direction}_0.png').convert('RGBA')
                sheet.paste(old, (0,row*164+20), old)
                for i in range(6):
                    im=frames[f'attack_{variant}_{direction}_{i}']
                    sheet.paste(im, ((i + 1) * motion.FRAME_W, row * 164 + 20), im)
            sheet.save(previews / f'{char}-{variant}.png')

if __name__ == '__main__':
    main()
