import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import ts from 'typescript';

const base=process.env.VITE_PAGES_BASE||'/loop-ai-recycling/';
const html=await readFile('docs/index.html','utf8');
for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){
  assert.ok(match[1].startsWith(base),`Asset outside Pages base: ${match[1]}`);
  assert.ok((await stat('docs/'+match[1].slice(base.length))).isFile());
}
await stat('docs/.nojekyll');
const model=JSON.parse(await readFile('docs/models/mobilenet/model.json','utf8'));
let shards=0;
for(const group of model.weightsManifest)for(const file of group.paths){
  assert.ok((await stat('docs/models/mobilenet/'+file)).size>0);shards++;
}
assert.equal(shards,4);
for(const version of ['v2','v3']){
  const head=JSON.parse(await readFile(`docs/models/kaggle-waste-${version}/head.json`,'utf8'));
  assert.equal(head.model,'mobilenet-v2-alpha1.0-1280');
  assert.ok(head.fine.classes.length>0&&head.coarse.classes.length>0);
}
JSON.parse(await readFile('docs/models/kaggle-waste-v3/report.json','utf8'));

// An update reload must retain the project subpath, room, view, and anchor.
const recoverySource=await readFile('lib/client-update-recovery.ts','utf8');
const code=ts.transpileModule(recoverySource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {createUpdateRecovery}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const storage=new Map();let destination;
const recover=createUpdateRecovery({
  storage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
  now:()=>1000000,url:()=>`https://jusiety.github.io${base}?room=ABC123&view=stats#scanner`,
  savePhoto:async()=>{},replace:url=>{destination=new URL(url)},
});
assert.equal(await recover(null),true);
assert.equal(destination.pathname,base);
assert.equal(destination.searchParams.get('room'),'ABC123');
assert.equal(destination.searchParams.get('view'),'stats');
assert.equal(destination.searchParams.get('_loop_update'),'1000000');
assert.equal(destination.hash,'#scanner');
assert.equal(await recover(null),false);
console.log('Pages passed: project asset paths, MobileNet shards, both classifier heads, evaluation report, and update reload URL.');
