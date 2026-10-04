"""Pack reviewed image_gen art using the original pose bounds as registration.

Run from any directory. Source masters and original pose atlases stay intact.
Every pose registers to its own original silhouette, never to standing height.
"""
from pathlib import Path
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'design/source-assets/continuity-20261004'
IMAGES = ROOT / 'assets/images'

def bounds(image):
    box = image.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    if not box:
        raise ValueError('Empty source pose')
    return box

def register(source, target):
    src_box, dst_box = bounds(source), bounds(target)
    # Trim only surrounding transparent padding; retain generated soft alpha.
    source = source.crop(src_box)
    scale = (dst_box[3] - dst_box[1]) / source.height
    source = source.resize((round(source.width * scale), dst_box[3]-dst_box[1]), Image.Resampling.LANCZOS)
    dx = round((dst_box[0]+dst_box[2]-source.width)/2)
    dy = dst_box[3]-source.height
    if dx < 6 or dy < 6 or dx+source.width > target.width-6 or dy+source.height > target.height-6:
        raise ValueError('Repair clips; review art rather than shrink anatomy')
    cell = Image.new('RGBA', target.size)
    cell.alpha_composite(source, (dx,dy))
    return cell, {'original_bounds': dst_box, 'packed_bounds': bounds(cell), 'uniform_scale': scale}

def save(image, name):
    image.save(IMAGES / (name+'.png'), optimize=True)
    image.save(IMAGES / (name+'.webp'), lossless=True, exact=True, method=6)

def main():
    measures = {}
    rocket = Image.open(SOURCE/'rocket-before.png').convert('RGBA')
    cellw = rocket.width // 9
    cell, measure = register(Image.open(SOURCE/'rocket-master.png').convert('RGBA'),rocket.crop((0,0,cellw,rocket.height)))
    rocket.paste(cell,(0,0))
    measures['rocket'] = measure
    save(rocket,'character-d-attack-2')
    # Generated images use 3:1 canvases. Reviewed empty gaps separate all four
    # complete poses; rigid quarter cuts would cut supporting hands/hair.
    for name, cuts in [('brute',[0,535,1060,1632,2172]),
                       ('screamer',[0,535,1040,1613,2172])]:
        atlas = Image.open(SOURCE/(name+'-before.png')).convert('RGBA')
        master = Image.open(SOURCE/(name+'-master.png')).convert('RGBA')
        if master.size != (2172,724):
            raise ValueError('Source master dimensions changed')
        measures[name] = []
        for frame in range(4):
            source = master.crop((cuts[frame],0,cuts[frame+1],master.height))
            target = atlas.crop((frame*512,0,(frame+1)*512,512))
            cell, measure = register(source,target)
            atlas.paste(cell,(frame*512,0))
            measures[name].append(measure)
        save(atlas,'zombie-death-'+name+'-sheet')
    volatile = Image.open(SOURCE/'volatile-before.png').convert('RGBA')
    # Runtime already samples 313px cells. Remove only its unused two trailing
    # rows/columns: every one of the 16 runtime crops stays pixel-identical.
    volatile = volatile.crop((0,0,1252,1252))
    save(volatile,'zombie-walk-volatile')
    (SOURCE/'registration.json').write_text(json.dumps(measures,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(measures))

if __name__ == '__main__':
    main()
