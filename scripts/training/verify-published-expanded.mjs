import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
const load=async path=>import('data:text/javascript;base64,'+Buffer.from(buildSync({entryPoints:[path],bundle:true,platform:'node',format:'esm',packages:'external',write:false}).outputFiles[0].text).toString('base64'));
const {predictWaste}=await load('lib/kaggle-classifier.ts');
const {clampRegion,dragRegion}=await load('lib/photo-region.ts');
const head=JSON.parse(fs.readFileSync('public/models/kaggle-waste-v3/head.json'));
const report=JSON.parse(fs.readFileSync('public/models/kaggle-waste-v3/report.json'));
const rows=JSON.parse(fs.readFileSync('public/models/kaggle-waste-v3/split-manifest.json'));
const old=JSON.parse(fs.readFileSync('public/models/kaggle-waste-v2/split-manifest.json'));
const prior=new Map(old.map(r=>[r.sha256,r.split]));const groups=new Map(),counts={};
assert.equal(new Set(rows.map(r=>r.sha256)).size,rows.length);
for(const r of rows){if(groups.has(r.group))assert.equal(groups.get(r.group),r.split);groups.set(r.group,r.split);counts[r.split]=(counts[r.split]||0)+1;if(prior.get(r.sha256)==='test')assert.equal(r.split,'test');if(prior.get(r.sha256)==='validation')assert.notEqual(r.split,'train')}
assert.equal(rows.length,report.uniqueImages);assert.deepEqual(counts,report.splitCounts);assert.equal(report.sources.length,7);
for(const kind of ['fine','coarse']){const h=head[kind];assert.deepEqual(h.classes,report[kind].classes);for(const a of [...h.weights,...h.centers]){assert.equal(a.length,1280);assert.ok(a.every(Number.isFinite))}assert.equal(h.bias.length,h.classes.length)}
assert.equal(predictWaste(Array(1280).fill(0),head).fine.accepted,false);
assert.deepEqual(clampRegion({x:2,y:-1,width:2,height:2}),{x:.95,y:0,width:1-.95,height:1});
assert.deepEqual(dragRegion({x:.8,y:.8},{x:.2,y:.2}),{x:.2,y:.2,width:.8-.2,height:.8-.2});
for(const x of [-1,0,.2,.95,1,NaN]){const r=clampRegion({x,y:x,width:1,height:1});assert.ok(r.x+r.width<=1.000001&&r.y+r.height<=1.000001)}
console.log('Published model shapes, split counts, retained holdouts, group separation, zero-input abstention and crop bounds verified:',rows.length,'images.');
