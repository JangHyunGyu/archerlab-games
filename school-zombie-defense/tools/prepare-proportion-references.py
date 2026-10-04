"""Prepare pose references for imagegen; retain approved source atlases."""
from pathlib import Path
from PIL import Image
import shutil, json

root=Path(__file__).resolve().parents[1]
dest=root/'design/source-assets/proportions-20261004'
dest.mkdir(parents=True,exist_ok=True)
items={}
for kind in ['runner','teacher','athlete','janitor','guard','charger','crawler','spider']:
 walk=root/f'assets/images/zombie-walk-{kind}.png'
 death=root/f'assets/images/zombie-death-{kind}-sheet.png'
 shutil.copy2(walk,dest/f'{kind}-walk-before.png');shutil.copy2(death,dest/f'{kind}-death-before.png')
 w=Image.open(walk).convert('RGBA');d=Image.open(death).convert('RGBA')
 count=(d.width//512)*(d.height//512)
 out=Image.new('RGBA',(2048,512*(1+(count+3)//4)))
 for i in range(4):
  cell=w.crop((i*w.width//4,0,(i+1)*w.width//4,w.height//4)).resize((512,512),Image.Resampling.LANCZOS)
  out.paste(cell,(i*512,0))
 for i in range(count):out.paste(d.crop(((i%(d.width//512))*512,(i//(d.width//512))*512,(i%(d.width//512)+1)*512,(i//(d.width//512)+1)*512)),((i%4)*512,(1+i//4)*512))
 path=dest/f'{kind}-reference.png';out.save(path)
 items[kind]={'death_frames':count,'reference':str(path),'source_walk_size':list(w.size)}
(dest/'references.json').write_text(json.dumps(items,indent=2),encoding='utf8')
print(json.dumps(items))
