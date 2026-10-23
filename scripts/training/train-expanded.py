"""Fit new item and material heads using held-out grouped evaluation.

MobileNet remains frozen. Only validation chooses regularization, temperature,
and abstention thresholds. No screenshot supplied by the user is a training input.
"""
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import warnings

import numpy as np
from scipy.optimize import minimize_scalar
from scipy.special import softmax
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, log_loss

ROOT = Path(os.environ.get('LOOP_LARGE_TRAINING_DIR', '/tmp/loop-expanded-training'))
PROJECT = Path(__file__).resolve().parents[2]
OUT = PROJECT / 'public/models/kaggle-waste-v3'

def merge_features(rows):
    output=ROOT/'large-embeddings.f32'
    indices={}; arrays={}
    for source in ['tricascade','household','trashbox','drinking','garbage','warp','plastic']:
        catalog=json.loads((ROOT/('catalog-'+source+'.json')).read_text())['rows']
        path=ROOT/(source+'-embeddings.f32')
        if path.stat().st_size!=len(catalog)*1280*4:raise ValueError(source+' feature extraction incomplete')
        arrays[source]=np.memmap(path,dtype=np.float32,mode='r',shape=(len(catalog),1280))
        for i,row in enumerate(catalog):indices.setdefault(row['sha256'],(source,i))
    x=np.memmap(output,dtype=np.float32,mode='w+',shape=(len(rows),1280))
    for i,row in enumerate(rows):
        source,index=indices[row['sha256']];x[i]=arrays[source][index]
    x.flush()
    if not np.isfinite(x).all():raise ValueError('Non-finite image features')
    norms=np.linalg.norm(x,axis=1)
    if np.max(np.abs(norms-1))>.001:raise ValueError('Feature normalization mismatch')
    return x

def train_head(x, rows, kind):
    chosen=np.array([bool(r.get(kind)) for r in rows]);xx=np.asarray(x[chosen]);rr=[r for r in rows if r.get(kind)]
    y=np.array([r[kind] for r in rr]);split=np.array([r['split'] for r in rr])
    tr=split=='train';va=split=='validation';te=split=='test'
    if set(y[tr])!=set(y):raise ValueError('A class has no training examples')
    scores=[];best=None
    for c in [1,10,100]:
        m=LogisticRegression(C=c,class_weight='balanced',max_iter=700,tol=2e-4,random_state=20261022)
        m.fit(xx[tr],y[tr])
        accuracy=float(accuracy_score(y[va],m.predict(xx[va])))
        scores.append(dict(C=c,validationAccuracy=accuracy))
        print(kind,'C',c,'validation accuracy',round(accuracy,4),flush=True)
        if best is None or accuracy>best[0]:best=(accuracy,c,m)
    val_accuracy,c,m=best
    classes=m.classes_;centers=np.array([xx[tr&(y==name)].mean(0) for name in classes])
    centers/=np.maximum(np.linalg.norm(centers,axis=1,keepdims=True),1e-12)
    logits=xx[va]@m.coef_.T+m.intercept_
    encoded=np.searchsorted(classes,y[va])
    fit=minimize_scalar(lambda t:log_loss(encoded,softmax(logits/t,axis=1),labels=np.arange(len(classes))),bounds=(.5,4),method='bounded')
    temperature=float(fit.x)
    pv=softmax(logits/temperature,axis=1);iv=pv.argmax(1);predv=classes[iv]
    cosv=(xx[va]*centers[iv]).sum(1);correct=predv==y[va]
    fallback=float(np.quantile(cosv[correct],.02))
    minima=[]
    for i in range(len(classes)):
        values=cosv[(iv==i)&correct]
        minima.append(float(np.quantile(values,.02)) if len(values)>=5 else fallback)
    eligible=cosv>=np.array(minima)[iv]
    selected=None
    for threshold in [.45,.55,.65,.75,.85,.9,.95]:
        for margin in [.05,.1,.15,.2]:
            accept=(pv.max(1)>=threshold)&(np.sort(pv,axis=1)[:,-1]-np.sort(pv,axis=1)[:,-2]>=margin)&eligible
            n=int(accept.sum());accuracy=float(correct[accept].mean()) if n else 0
            if n>=max(30,int(va.sum()*.1)) and accuracy>=.90:
                candidate=(n,accuracy,threshold,margin)
                if selected is None or candidate[:2]>selected[:2]:selected=candidate
    threshold,margin=(selected[2],selected[3]) if selected else (.9,.15)
    head=dict(classes=classes.tolist(),weights=m.coef_.round(8).tolist(),bias=m.intercept_.round(8).tolist(),
              centers=centers.round(8).tolist(),minCosines=minima,threshold=threshold,margin=margin,temperature=temperature)
    # Evaluate the exported, rounded coefficients using exactly the serving math.
    test_logits=xx[te]@np.array(head['weights']).T+np.array(head['bias'])
    p=softmax(test_logits/temperature,axis=1);idx=p.argmax(1);pred=classes[idx]
    cosine=(xx[te]*np.array(head['centers'])[idx]).sum(1)
    accept=(p.max(1)>=threshold)&(np.sort(p,axis=1)[:,-1]-np.sort(p,axis=1)[:,-2]>=margin)&(cosine>=np.array(minima)[idx])
    report=dict(classCounts=dict(Counter(y)),classes=classes.tolist(),splitCounts={v:int((split==v).sum()) for v in ['train','validation','test']},
                testCount=int(te.sum()),testCorrect=int((pred==y[te]).sum()),testAccuracy=float((pred==y[te]).mean()),
                acceptedCount=int(accept.sum()),acceptedCorrect=int((pred[accept]==y[te][accept]).sum()),
                acceptedAccuracy=float((pred[accept]==y[te][accept]).mean()) if accept.any() else None,coverage=float(accept.mean()),
                validationAccuracy=val_accuracy,validationSearch=scores,C=c,temperature=temperature,
                threshold=threshold,margin=margin,minCosines=minima,
                perClass=classification_report(y[te],pred,output_dict=True,zero_division=0),
                confusionMatrix=confusion_matrix(y[te],pred,labels=classes).tolist())
    fixture=dict(embedding=xx[te][0].tolist(),scores=p[0].tolist())
    print(kind,json.dumps({k:report[k] for k in ['testAccuracy','testCount','acceptedCount','acceptedAccuracy','coverage']}),flush=True)
    return head,report,fixture

def main():
    rows=json.loads((ROOT/'large-split.json').read_text());prep=json.loads((ROOT/'preparation.json').read_text())
    # WaRP detergent-box does not establish bottle shape or packaging material.
    # Exclude this ambiguous source class rather than train a false bottle label.
    ambiguous={r['sha256'] for r in json.loads((ROOT/'catalog-warp.json').read_text())['rows'] if '/detergent-box/' in r['original']}
    rejected=[r for r in rows if set(r['allHashes'])&ambiguous]
    if rejected:
        rejected_hashes={r['sha256'] for r in rejected}
        rows=[r for r in rows if r['sha256'] not in rejected_hashes]
        prep['uniqueImages']=len(rows);prep['splitCounts']=dict(Counter(r['split'] for r in rows))
        prep['groups']=len({r['group'] for r in rows})
        prep['sources']['warp']['excluded']['ambiguous_detergent_box']=len(ambiguous)
        prep['sources']['warp']['selectedBeforeDedup']-=len(ambiguous)
        (ROOT/'large-split.json').write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')))
        (ROOT/'preparation.json').write_text(json.dumps(prep,ensure_ascii=False,indent=2))
    groups={}
    for row in rows:groups.setdefault(row['group'],set()).add(row['split'])
    if any(len(s)>1 for s in groups.values()):raise ValueError('A duplicate group leaks across splits')
    x=merge_features(rows)
    heads={};reports={};fixtures={}
    for kind in ['fine','coarse']:heads[kind],reports[kind],fixtures[kind]=train_head(x,rows,kind)
    head=dict(version=3,model='mobilenet-v2-alpha1.0-1280',fine=heads['fine'],coarse=heads['coarse'],
              names=prep['names'],coarseMapping=prep['coarseMapping'])
    sources=[]
    for source in ['trashbox','tricascade','household','drinking','garbage','warp','plastic']:
        m=json.loads((ROOT/(source+'-manifest.json')).read_text());m.pop('folders',None)
        m.update(prep['sources'][source])
        m['uniqueImageMembership']=sum(source in r['sources'] for r in rows)
        sources.append(m)
    report=dict(version=3,trainedAt='2026-10-23',sources=sources,uniqueImages=len(rows),splitCounts=prep['splitCounts'],
                deduplication={k:prep[k] for k in ['duplicatesRemoved','labelConflictsRemoved','groups']},
                method='Frozen MobileNet V2 1280-D normalized features + two class-balanced multinomial logistic-regression heads',
                fine=reports['fine'],coarse=reports['coarse'],names=prep['names'],
                limitations=[
                    'Seven inspected public Kaggle sources; not every dataset on Kaggle.',
                    'Dataset labels describe objects/materials, not Korean disposal rules, contamination, transparency, or local collection acceptance.',
                    'TriCascade first/second hierarchy stages excluded; only the 35264 third-stage entries are eligible.',
                    'Trashbox non-food negative label excluded because it does not identify an object; food capped at 6000 to reduce imbalance.',
                    'Exact file and normalized-pixel duplicates removed globally; dHash <=4 and known WaRP/Roboflow parent images stay in one split. Previous v2 test and validation hashes stay held out.',
                    'Plastic source uses single-class images only; mixed annotations are excluded. Kaggle says MIT, included Roboflow data.yaml says CC BY 4.0; attribution to original project is retained.',
                    'Garbage Dataset resized copies, Drinking YOLO copies, WaRP detection/segmentation copies and ambiguous detergent-box labels excluded.',
                    'No object identity IDs: grouping cannot guarantee all related images or source artifacts are independent.',
                    'Internal grouped Kaggle evaluation is not Korean field accuracy. User screenshots are excluded from training and threshold selection.',
                    'Frozen backbone, not end-to-end fine-tuning. Confidence is a dataset-calibrated model score, not guaranteed correctness.',
                    'Household source metadata says MIT; its description also specifies educational/research/noncommercial use. Used for this educational school booth.',
                ])
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'head.json').write_text(json.dumps(head,ensure_ascii=False,separators=(',',':')))
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    manifest=[{k:r[k] for k in ['sha256','split','group','fine','coarse','sources']} for r in rows]
    (OUT/'split-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')))
    (ROOT/'large-parity.json').write_text(json.dumps(fixtures))
    print('Trained artifacts written',OUT,flush=True)

if __name__=='__main__':main()
