"""Register reviewed imagegen cells to their original poses; preserve cell size.

Registration scales each generated pose uniformly to its own reference height.
Prone frames keep their original height, never the standing height.
"""
from pathlib import Path
from PIL import Image
import json

root=Path(__file__).resolve().parents[1]
source=root/'design/source-assets/proportions-20261004'
items=json.loads((source/'references.json').read_text(encoding='utf8'))
records={}
def bounds(im):return im.getchannel('A').point(lambda p:255 if p>8 else 0).getbbox()
def row_cuts(im,rows):
 # Generated atlases preserve order but may have unequal vertical spacing.
 # Split at the largest real alpha gaps, rather than cutting through feet.
 alpha=im.getchannel('A'); occupied=[alpha.crop((0,y,im.width,y+1)).point(lambda p:255 if p>8 else 0).getbbox() is not None for y in range(im.height)]
 gaps=[];start=None
 for y,filled in enumerate(occupied):
  if not filled and start is None:start=y
  if filled and start is not None:
   if start>0:gaps.append((y-start,(start+y)//2))
   start=None
 cuts=[0]+sorted(mid for _,mid in sorted(gaps,reverse=True)[:rows-1])+[im.height]
 if len(cuts)!=rows+1:raise ValueError('unable to separate generated rows')
 return cuts
def register(cell,old):
 a=bounds(cell);b=bounds(old)
 if not a or not b:raise ValueError('empty pose')
 scale=(b[3]-b[1])/(a[3]-a[1]);crop=cell.crop(a)
 width=round(crop.width*scale);height=round(crop.height*scale)
 x=round((b[0]+b[2]-width)/2);y=b[3]-height
 if x<3 or x+width>old.width-3:raise ValueError(f'pose would clip: {a} -> {b}')
 out=Image.new('RGBA',old.size);out.paste(crop.resize((width,height),Image.Resampling.LANCZOS),(x,y))
 area=lambda im:sum(im.getchannel('A').point(lambda p:1 if p>8 else 0).getdata())
 ratio=area(out)/area(old)
 if not 0.7<=ratio<=1.35:raise ValueError(f'pose coverage changed unexpectedly: {ratio:.3f}')
 return out,{'original':b,'generated':a,'packed':bounds(out),'scale':scale}
for kind,item in items.items():
 master=source/f'{kind}-master.png'
 if not master.exists():continue
 gen=Image.open(master).convert('RGBA');rows=1+(item['death_frames']+3)//4
 cuts=row_cuts(gen,rows)
 walk=Image.open(source/f'{kind}-walk-before.png').convert('RGBA');death=Image.open(source/f'{kind}-death-before.png').convert('RGBA')
 cells=[];meta=[]
 for i in range(4+item['death_frames']):
  col=i%4;row=i//4;cell=gen.crop((round(col*gen.width/4),cuts[row],round((col+1)*gen.width/4),cuts[row+1]))
  if i<4:
   old=walk.crop((i*walk.width//4,0,(i+1)*walk.width//4,walk.height//4))
  else:
   j=i-4;cols=death.width//512;old=death.crop(((j%cols)*512,(j//cols)*512,(j%cols+1)*512,(j//cols+1)*512))
  packed,record=register(cell,old);cells.append(packed);meta.append(record)
 out_walk=Image.new('RGBA',walk.size)
 for variant in range(4):
  for frame in range(4):out_walk.paste(cells[frame],(frame*walk.width//4,variant*walk.height//4))
 out_death=Image.new('RGBA',death.size)
 for i,cell in enumerate(cells[4:]):out_death.paste(cell,((i%(death.width//512))*512,(i//(death.width//512))*512))
 for name,im in [(f'zombie-walk-{kind}',out_walk),(f'zombie-death-{kind}-sheet',out_death)]:
  path=root/f'assets/images/{name}.png';im.save(path);im.save(path.with_suffix('.webp'),quality=90,method=6,exact=True)
 records[kind]=meta
(source/'registration.json').write_text(json.dumps(records,indent=2),encoding='utf8')
print(json.dumps({'packed':list(records)}))
