import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const directory=mkdtempSync(path.join(tmpdir(),'loop-recognition-labels-'));
try {
  for(const name of ['kaggle-classifier','recognition-labels','vision']) {
    const code=ts.transpileModule(readFileSync(`lib/${name}.ts`,'utf8'),{
      compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},
    }).outputText.replace(/"\.\/(kaggle-classifier|recognition-labels)"/g,'"./$1.mjs"');
    writeFileSync(path.join(directory,name+'.mjs'),code);
  }
  const {recognitionFromEmbedding,baselinePrediction,nearestPrediction,VISION_MODEL}=await import(pathToFileURL(path.join(directory,'vision.mjs')));
  const head=JSON.parse(readFileSync('public/models/kaggle-waste-v2/head.json','utf8'));
  const items=JSON.parse(readFileSync('lib/content.json','utf8')).items;
  const embedding=Array(1280).fill(0);embedding[0]=1;
  // Feed controlled linear heads through the real inference and recognition
  // code. Even a very confident content-specific class must stay a broad label.
  const force=(linear,id,accepted=true)=>({
    ...linear,weights:linear.classes.map(()=>Array(1280).fill(0)),
    bias:linear.classes.map(value=>value===id?20:0),temperature:1,
    centers:linear.classes.map(()=>embedding),minCosines:linear.classes.map(()=>0),
    threshold:accepted ? .5 : 1,margin:0,
  });
  const predict=(fine,coarse=head.coarseMapping[fine],fineAccepted=true,coarseAccepted=true)=>recognitionFromEmbedding(embedding,{
    ...head,fine:force(head.fine,fine,fineAccepted),coarse:force(head.coarse,coarse,coarseAccepted),
  },items);
  const noContentClaims=result=>assert.doesNotMatch(JSON.stringify(result),/농약|세제|손소독제|유해물질|의약품|주사기/);
  for(const fine of head.fine.classes) {
    const result=predict(fine);
    assert.equal(result.status,'item');
    assert.equal(result.needsConfirmation,true);
    noContentClaims(result);
    assert.equal(new Set(result.alternatives.map(a=>a.label)).size,result.alternatives.length);
  }
  for(const [fine,label] of [
    ['pesticide','용기류'],['detergent-bottle','플라스틱병'],['aerosol','금속 용기'],
    ['drink-can','금속 캔'],['food-can','금속 캔'],['glass-bottle','유리병'],['carton','종이팩'],
  ]) assert.equal(predict(fine).label,label);
  for(const fine of ['pesticide','aerosol','medicine']) {
    assert.equal(predict(fine).itemId,null,'contents do not automatically select a quiz item');
  }
  for(const fine of ['pesticide','medicine']) assert.equal(predict(fine).material,undefined);
  assert.equal(predict('detergent-bottle').material,'plastic');
  assert.match(predict('pesticide').detail,/제품 표시/);

  const material=predict('pesticide','hazardous',false,true);
  assert.equal(material.status,'material');assert.equal(material.label,'용기류');
  assert.equal(material.material,undefined);noContentClaims(material);
  const review=predict('pesticide','hazardous',false,false);
  assert.equal(review.status,'review');noContentClaims(review);
  const disagreement=predict('pesticide','plastic');
  assert.equal(disagreement.status,'review');assert.equal(disagreement.material,undefined);noContentClaims(disagreement);

  const baseline=baselinePrediction([{className:'hand sanitizer, pesticide container',probability:.99}],items);
  assert.equal(baseline.itemId,null);assert.equal(baseline.label,'품목 확인 필요');
  assert.equal(baselinePrediction([{className:'water bottle',probability:.99}],items).label,'플라스틱병');
  const renamedItems=items.map(item=>item.id==='plastic-container'?{...item,name:'농약 용기'}:item);
  const samples=['plastic-container','cardboard'].flatMap((itemId,index)=>Array.from({length:3},()=>({
    itemId,split:'train',model:VISION_MODEL,embedding:embedding.map(v=>index?-v:v),
  })));
  const custom=nearestPrediction(embedding,samples,renamedItems);
  assert.equal(custom.itemId,'plastic-container');assert.equal(custom.label,'플라스틱 용기');noContentClaims(custom);
  console.log('Recognition labels passed: all 39 fine classes, broad container labels, accepted/material/review/conflicting results, deduplicated alternatives, no inferred contents or hazardous-material routing, and broad baseline/custom results.');
} finally { rmSync(directory,{recursive:true,force:true}); }
