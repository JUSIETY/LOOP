import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import ts from 'typescript';
import assert from 'node:assert/strict';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const root=process.env.LOOP_LARGE_TRAINING_DIR||'/tmp/loop-large-training';
for(const name of ['kaggle-classifier','recognition-labels','vision']){
  let code=ts.transpileModule(fs.readFileSync(path.join(project,`lib/${name}.ts`),'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}
  }).outputText;
  code=code.replace('"./kaggle-classifier"','"./kaggle-classifier.mjs"');
  code=code.replace('"./recognition-labels"','"./recognition-labels.mjs"');
  fs.writeFileSync(path.join(root,name+'.mjs'),code);
}
const {predictLinear,predictWaste}=await import(pathToFileURL(path.join(root,'kaggle-classifier.mjs')));
const {recognitionFromEmbedding}=await import(pathToFileURL(path.join(root,'vision.mjs')));
const head=JSON.parse(fs.readFileSync(path.join(project,'public/models/kaggle-waste-v2/head.json')));
const report=JSON.parse(fs.readFileSync(path.join(project,'public/models/kaggle-waste-v2/report.json')));
const fixture=JSON.parse(fs.readFileSync(path.join(root,'large-parity.json')));
for(const kind of ['fine','coarse']){
  const actual=predictLinear(fixture[kind].embedding,head[kind]);
  const error=Math.max(...actual.scores.map((s,i)=>Math.abs(s-fixture[kind].scores[i])));
  assert.ok(error<2e-6,kind+' Python/TypeScript score mismatch: '+error);
  console.log(kind,'Python → serving-code maximum score error:',error);
}
assert.equal(report.sources.length,3);
assert.ok(head.fine.classes.includes('carton'));
assert.ok(head.fine.classes.includes('drink-can'));
const rows=JSON.parse(fs.readFileSync(path.join(root,'large-split.json')));
const groups=new Map();
for(const row of rows){
  if(groups.has(row.group))assert.equal(groups.get(row.group),row.split,'Similar-image group crosses splits');
  else groups.set(row.group,row.split);
}
assert.equal(new Set(rows.map(r=>r.sha256)).size,rows.length);
const items=JSON.parse(fs.readFileSync(path.join(project,'lib/content.json'))).items;
const expected={can:['drink-can'],box:['cardboard'],glass:['glass-object','glass-bottle','glass-container'],carton:['carton'],pet:['plastic-bottle']};
const smoke=JSON.parse(fs.readFileSync(path.join(root,'smoke-features.json'))).map(({name,embedding})=>{
  const prediction=recognitionFromEmbedding(embedding,head,items),raw=predictWaste(embedding,head);
  assert.ok(prediction.label&&prediction.detail);
  if(prediction.itemId)assert.equal(prediction.status,'item','Do not preselect an item on an uncertain material result');
  return {name,topClass:raw.fine.className,expected:expected[name],matchesExpected:expected[name].includes(raw.fine.className),
    score:raw.fine.score,coarseClass:raw.coarse.className,status:prediction.status,itemId:prediction.itemId,detail:prediction.detail};
});
fs.writeFileSync(path.join(root,'smoke-results.json'),JSON.stringify(smoke,null,2));
console.log('Independent user screenshot photo regions (not training inputs):',JSON.stringify(smoke,null,2));
console.log('Globally disjoint groups:',groups.size,'unique images:',rows.length);
