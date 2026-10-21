import os
import json,pathlib,hashlib,random
from PIL import Image,ImageOps
root=pathlib.Path(os.environ['LOOP_TRAINING_DIR']); rows=json.loads((root/'images.json').read_text());parents=list(range(len(rows)));hashes=[]
for r in rows:
 with Image.open(r['path']) as im:
  im=ImageOps.exif_transpose(im).convert('L').resize((9,8));p=list(im.getdata());h=0
  for y in range(8):
   for x in range(8):h=(h<<1)|(p[y*9+x]>p[y*9+x+1])
  hashes.append(h)
def find(a):
 while parents[a]!=a:parents[a]=parents[parents[a]];a=parents[a]
 return a
for i in range(len(rows)):
 for j in range(i):
  if (hashes[i]^hashes[j]).bit_count()<=4:parents[find(i)]=find(j)
groups={}
for i,r in enumerate(rows):groups.setdefault(find(i),[]).append(r)
random.seed(20261021)
for cls in sorted(set(r['class'] for r in rows)):
 gs=[g for g in groups.values() if g[0]['class']==cls];random.shuffle(gs)
 a=int(len(gs)*.7);b=int(len(gs)*.85)
 for i,g in enumerate(gs):
  split='train' if i<a else 'validation' if i<b else 'test'
  for r in g:r['split']=split;r['group']=hashlib.sha256('|'.join(sorted(x['sha256'] for x in g)).encode()).hexdigest()[:16]
(root/'split.json').write_text(json.dumps(rows))
from collections import Counter
print('groups',len(groups),'splits',Counter(r['split'] for r in rows))
