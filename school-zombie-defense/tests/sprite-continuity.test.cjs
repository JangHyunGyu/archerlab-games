'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const check = spawnSync('python', ['-c', String.raw`
from pathlib import Path
from PIL import Image
import json
root = Path(${JSON.stringify(root.split(path.sep).join('/'))})
images = root/'assets/images'
source = root/'design/source-assets/continuity-20261004'
for path in images.glob('zombie-walk-*.png'):
    im = Image.open(path)
    assert im.width % 4 == 0 and im.height % 4 == 0, path.name
rocket = Image.open(images/'character-d-attack-2.png').convert('RGBA')
original = Image.open(source/'rocket-before.png').convert('RGBA')
w = rocket.width//9
assert rocket.size == original.size
assert rocket.crop((w,0,rocket.width,rocket.height)).tobytes() == original.crop((w,0,original.width,original.height)).tobytes(), 'Other eight rocket directions must be unchanged'
volatile = Image.open(images/'zombie-walk-volatile.png').convert('RGBA')
original = Image.open(source/'volatile-before.png').convert('RGBA')
for row in range(4):
    for col in range(4):
        box = (col*313,row*313,(col+1)*313,(row+1)*313)
        assert volatile.crop(box).tobytes() == original.crop(box).tobytes(), 'Every runtime volatile crop must stay pixel-identical'
for character in ['brute','screamer']:
    atlas = Image.open(images/('zombie-death-'+character+'-sheet.png')).convert('RGBA')
    original = Image.open(source/(character+'-before.png')).convert('RGBA')
    assert atlas.size == original.size == (2048,512)
    for frame in range(4):
        box = (frame*512,0,(frame+1)*512,512)
        def bounds(im):
            return im.crop(box).getchannel('A').point(lambda a:255 if a>8 else 0).getbbox()
        new, old = bounds(atlas),bounds(original)
        assert abs(new[1]-old[1]) <= 2 and abs(new[3]-old[3]) <= 1, 'Preserve each collapse pose height and placement'
        assert min(new[0],new[1],512-new[2],512-new[3]) >= 6, 'No clipping'
for name in ['character-d-attack-2','zombie-death-brute-sheet','zombie-death-screamer-sheet','zombie-walk-volatile']:
    png = Image.open(images/(name+'.png')).convert('RGBA')
    webp = Image.open(images/(name+'.webp')).convert('RGBA')
    assert png.size == webp.size and png.getchannel('A').tobytes() == webp.getchannel('A').tobytes(), name
proportions = root/'design/source-assets/proportions-20261004'
for kind in ['runner','teacher','athlete','janitor','guard','charger','crawler','spider']:
    for action in ['walk','death']:
        name = f'zombie-walk-{kind}' if action == 'walk' else f'zombie-death-{kind}-sheet'
        atlas = Image.open(images/(name+'.png')).convert('RGBA')
        old = Image.open(proportions/f'{kind}-{action}-before.png').convert('RGBA')
        webp = Image.open(images/(name+'.webp')).convert('RGBA')
        assert atlas.size == old.size == webp.size
        assert atlas.getchannel('A').tobytes() == webp.getchannel('A').tobytes(), name
        for y in range(0,atlas.height,512):
            for x in range(0,atlas.width,512):
                box=(x,y,x+512,y+512)
                a=atlas.crop(box).getchannel('A').point(lambda p:255 if p>8 else 0)
                b=old.crop(box).getchannel('A').point(lambda p:255 if p>8 else 0)
                aa,bb=a.getbbox(),b.getbbox()
                assert abs(aa[1]-bb[1])<=2 and abs(aa[3]-bb[3])<=1, (name,x,y,'pose placement')
                area=lambda im:sum(p>0 for p in im.getdata())
                assert 0.7<=area(a)/area(b)<=1.35, (name,x,y,'pose coverage')
print('Sprite continuity: all 17 walk grids, rocket/volatile unchanged, 8 original collapse poses, 180 proportional zombie frames, PNG/WebP alpha pass')
`], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stderr || check.stdout);
process.stdout.write(check.stdout);
