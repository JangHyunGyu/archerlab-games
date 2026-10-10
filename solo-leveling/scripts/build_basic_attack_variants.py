"""Extract reviewed Higgsfield key poses into additional 112x144 attack tracks.

One scale per strip, calibrated against the existing ready pose; never fit each
pose independently. Existing walk, skill and hit frames are not rewritten.
"""
import json
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
import build_character_motion_v2 as motion

ROOT = motion.ROOT
SOURCE = ROOT / 'assets/player/motion_v2_sources/basic_combos'
VARIANTS = {
    'shadow_monarch': ('cut', 'reverse'),
    'light_swordswoman': ('rise',),
    'white_tiger_brawler': ('backhand',),
    'flame_mage': ('lift',),
    'sanctuary_healer': ('blessing',),
}

def main():
    previews = ROOT / 'docs/basic-combo-review-20261010'
    previews.mkdir(parents=True, exist_ok=True)
    for char, variants in VARIANTS.items():
        profile = motion.CHARACTER_PROFILES[char]
        target = ROOT / profile.output_relative
        for variant in variants:
            frames = {}
            for direction in ('right', 'down', 'up'):
                track = f'{variant}_{direction}'
                poses = motion.split_strip(SOURCE / char / f'{track}.png', track)
                images = [pose.image.crop(motion.alpha_bbox(pose.image)) for pose in poses]
                if char == 'flame_mage' and direction == 'down':
                    # The reference job predates its accepted hand correction.
                    # Mirror poses individually, never reverse temporal order.
                    images = [ImageOps.mirror(im) for im in images]
                ready = Image.open(target / f'{profile.filename_prefix}attack_{direction}_0.png').convert('RGBA')
                bbox = motion.alpha_bbox(ready)
                scale = (bbox[3] - bbox[1]) / images[0].height
                fit = min(motion.MAX_BODY_W / max(im.width for im in images),
                          motion.MAX_BODY_H / max(im.height for im in images))
                if fit < scale * .94:
                    raise ValueError(f'{char}/{track}: new weapon reach would shrink anatomy: {fit/scale:.3f}')
                scale = min(scale, fit)
                rendered = [motion.place_body(im, scale=scale) for im in images]
                recovery = Image.open(target / f'{profile.filename_prefix}attack_{direction}_5.png').convert('RGBA')
                for i, pose in enumerate(motion.ATTACK_POSE_MAP):
                    frames[f'attack_{variant}_{direction}_{i}'] = recovery if pose is None else rendered[pose]
                print(f'{char}/{track}: shared scale {scale:.4f}, ready height {bbox[3]-bbox[1]}')
            for i in range(6):
                frames[f'attack_{variant}_left_{i}'] = ImageOps.mirror(frames[f'attack_{variant}_right_{i}'])
            for name, im in frames.items():
                motion.validate_frame_image(name, im)
                im.save(target / f'{profile.filename_prefix}{name}.png')
                im.save(target / f'{profile.filename_prefix}{name}.webp', lossless=True, method=6, exact=True)
            sheet = Image.new('RGB', (784, 656), (19, 27, 40))
            draw = ImageDraw.Draw(sheet)
            for row, direction in enumerate(('right', 'left', 'down', 'up')):
                draw.text((5,row*164+4), f'{char} / {variant} / {direction}', fill='white')
                # First column is the previous track's ready pose for anatomy comparison.
                old = Image.open(target / f'{profile.filename_prefix}attack_{direction}_0.png').convert('RGBA')
                sheet.paste(old, (0,row*164+20), old)
                for i in range(6):
                    im=frames[f'attack_{variant}_{direction}_{i}']
                    sheet.paste(im, ((i+1)*112,row*164+20), im)
            sheet.save(previews / f'{char}-{variant}.png')

if __name__ == '__main__':
    main()
