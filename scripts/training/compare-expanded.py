"""One-time deployment comparison on unchanged v2 held-out photo hashes."""
import json,os
from pathlib import Path
import numpy as np
from scipy.special import softmax
root=Path(os.environ.get('LOOP_LARGE_TRAINING_DIR','/tmp/loop-expanded-training'))
project=Path(__file__).resolve().parents[2]
rows=json.loads((root/'large-split.json').read_text())
x=np.memmap(root/'large-embeddings.f32',dtype=np.float32,mode='r',shape=(len(rows),1280))
oldrows={r['sha256']:r for r in json.loads((project/'public/models/kaggle-waste-v2/split-manifest.json').read_text()) if r['split']=='test'}
heads={name:json.loads((project/f'public/models/kaggle-waste-{name}/head.json').read_text()) for name in ['v2','v3']}
result={'comparison':'unchanged previous v2 test images and labels','metrics':{}}
for kind in ['fine','coarse']:
 indices=[i for i,r in enumerate(rows) if r['sha256'] in oldrows and oldrows[r['sha256']][kind] and r['split']=='test']
 y=np.array([oldrows[rows[i]['sha256']][kind] for i in indices]);xx=np.asarray(x[indices]);out={}
 for name,model in heads.items():
  h=model[kind];classes=np.array(h['classes']);p=softmax((xx@np.array(h['weights']).T+np.array(h['bias']))/h['temperature'],axis=1);idx=p.argmax(1);pred=classes[idx]
  cosine=(xx*np.array(h['centers'])[idx]).sum(1)
  acc=(p.max(1)>=h['threshold'])&(np.sort(p,axis=1)[:,-1]-np.sort(p,axis=1)[:,-2]>=h['margin'])&(cosine>=np.array(h['minCosines'])[idx])
  out[name]={'count':len(y),'accuracy':float((pred==y).mean()),'acceptedAccuracy':float((pred[acc]==y[acc]).mean()) if acc.any() else None,'coverage':float(acc.mean())}
 result['metrics'][kind]=out
reportpath=project/'public/models/kaggle-waste-v3/report.json';report=json.loads(reportpath.read_text());report['previousModelComparison']=result;reportpath.write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(result,indent=2))
