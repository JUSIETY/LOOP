import os,json,pathlib,urllib.request,zipfile,hashlib
root=pathlib.Path(os.environ['LOOP_TRAINING_DIR']);root.mkdir(parents=True,exist_ok=True)
url='https://www.kaggle.com/api/v1/datasets/download/asdasdasasdas/garbage-classification?datasetVersionNumber=2'
with urllib.request.urlopen(url,timeout=60) as r,(root/'garbage.zip').open('wb') as f:
 while chunk:=r.read(1024*1024):f.write(chunk)
seen=set();rows=[]
with zipfile.ZipFile(root/'garbage.zip') as z:
 for n in z.namelist():
  if not n.lower().endswith('.jpg'):continue
  raw=z.read(n);h=hashlib.sha256(raw).hexdigest()
  if h in seen:continue
  cls=n.split('/')[-2]
  if cls not in ['cardboard','glass','metal','paper','plastic','trash']:continue
  p=root/'images'/cls/pathlib.PurePosixPath(n).name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw);seen.add(h)
  rows.append({'path':str(p),'class':cls,'sha256':h})
(root/'images.json').write_text(json.dumps(rows));print(len(rows),'unique photos')
