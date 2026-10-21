import os
import numpy as np,json,pathlib,hashlib
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score,confusion_matrix,classification_report
root=pathlib.Path(os.environ['LOOP_TRAINING_DIR']);out=pathlib.Path(__file__).resolve().parents[2]/'public/models/kaggle-waste';out.mkdir(parents=True,exist_ok=True)
rows=json.loads((root/'split.json').read_text());x=np.fromfile(root/'embeddings.f32',dtype=np.float32).reshape(len(rows),1280);y=np.array([r['class'] for r in rows]);split=np.array([r['split'] for r in rows]);tr=split=='train';va=split=='validation';te=split=='test'
best=None;scores=[]
for c in [.1,1,10,100]:
 m=LogisticRegression(C=c,class_weight='balanced',max_iter=1500,random_state=20261021).fit(x[tr],y[tr]);acc=accuracy_score(y[va],m.predict(x[va]));scores.append({'C':c,'validationAccuracy':float(acc)})
 if best is None or acc>best[0]:best=(acc,m,c)
_,m,c=best
centers=np.array([x[tr & (y==cls)].mean(0) for cls in m.classes_]);centers/=np.linalg.norm(centers,axis=1,keepdims=True)
pv=m.predict_proba(x[va]);iv=pv.argmax(1);sv=x[va]@centers.T
cos=float(np.quantile(sv[np.arange(len(sv)),iv][m.classes_[iv]==y[va]],.05))
threshold=.95
for t in np.arange(.5,.96,.05):
 a=(pv.max(1)>=t)&(np.sort(pv,axis=1)[:,-1]-np.sort(pv,axis=1)[:,-2]>=.15)&(sv[np.arange(len(sv)),iv]>=cos)
 if a.sum()>=30 and accuracy_score(y[va][a],m.classes_[iv][a])>=.90:threshold=float(round(t,2));break
p=m.predict_proba(x[te]);idx=p.argmax(1);s=x[te]@centers.T;accept=(p.max(1)>=threshold)&(np.sort(p,axis=1)[:,-1]-np.sort(p,axis=1)[:,-2]>=.15)&(s[np.arange(len(s)),idx]>=cos);pred=m.classes_[idx]
report={'dataset':'Kaggle Garbage Classification / TrashNet','datasetUrl':'https://www.kaggle.com/datasets/asdasdasasdas/garbage-classification','datasetVersion':2,'retrievedAt':'2026-10-21','sourceAuthors':['Gary Thung','Mindy Yang'],'originalSource':'https://github.com/garythung/trashnet','kaggleLicense':'Data files © Original Authors','originalLicense':'MIT','archiveSha256':hashlib.sha256((root/'garbage.zip').read_bytes()).hexdigest(),'rawImageEntries':5054,'uniqueImages':len(rows),'removedExactDuplicates':2530,'perceptualGrouping':'64-bit dHash Hamming distance <=4, connected groups kept in one split','splitSeed':20261021,'splitCounts':{v:int((split==v).sum()) for v in ['train','validation','test']},'classCounts':{v:int((y==v).sum()) for v in m.classes_},'classes':m.classes_.tolist(),'method':'Frozen MobileNet V2 1280-D L2-normalized embedding + class-balanced multinomial logistic regression','C':c,'validationSearch':scores,'validationAccuracy':float(best[0]),'testAccuracy':float(accuracy_score(y[te],pred)),'testCount':int(te.sum()),'acceptedCount':int(accept.sum()),'acceptedAccuracy':float(accuracy_score(y[te][accept],pred[accept])) if accept.any() else None,'coverage':float(accept.mean()),'confusionMatrix':confusion_matrix(y[te],pred,labels=m.classes_).tolist(),'perClass':classification_report(y[te],pred,output_dict=True,zero_division=0),'threshold':threshold,'margin':.15,'minCosine':cos,'limitations':['Material labels are not Korean disposal labels.','Mostly single objects on light backgrounds; not a Korean booth field evaluation.','No object identity IDs available; grouping reduces but cannot eliminate related-image leakage.','No dedicated labels for transparent beverage PET, cartons, vinyl, contamination or batteries.','Threshold chosen on validation only; model score is not calibrated probability.','Out-of-distribution rejection is heuristic, not guaranteed.']}
head={'version':1,'model':'mobilenet-v2-alpha1.0-1280','classes':m.classes_.tolist(),'weights':m.coef_.round(8).tolist(),'bias':m.intercept_.round(8).tolist(),'centers':centers.round(8).tolist(),'threshold':threshold,'margin':.15,'minCosine':cos}
(out/'head.json').write_text(json.dumps(head,separators=(',',':')));(out/'report.json').write_text(json.dumps(report,indent=2));(out/'split-manifest.json').write_text(json.dumps([{k:r[k] for k in ['class','sha256','split','group']} for r in rows],separators=(',',':')))
fixture={'embedding':x[te][0].tolist(),'scores':p[0].tolist()};(root/'parity.json').write_text(json.dumps(fixture))
print(json.dumps({k:report[k] for k in ['splitCounts','C','validationAccuracy','testAccuracy','acceptedCount','acceptedAccuracy','coverage','threshold','minCosine']},indent=2))
