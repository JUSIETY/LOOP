import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

// Exercise the real recovery controller and Worker with only browser/network
// boundaries replaced. Run with Node >=23.7.
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(
  stripTypeScriptTypes(source, {mode:'transform'}),
).toString('base64');
const {isModuleLoadError, createUpdateRecovery} = await import(moduleUrl(
  readFileSync('lib/client-update-recovery.ts','utf8'),
));
assert.equal(isModuleLoadError(new TypeError('Failed to fetch dynamically imported module: https://loop.test/vision-old.js')),true);
assert.equal(isModuleLoadError(new Error('AI 모델 오류',{cause:new TypeError('Importing a module script failed.')})),true);
assert.equal(isModuleLoadError(new Error('Loading chunk 123 failed.')),true);
assert.equal(isModuleLoadError(new Error('이미지 형식을 읽지 못했어요.')),false);
assert.equal(isModuleLoadError(new TypeError('Failed to fetch')),false);

const stored = new Map(), events = [];
let timestamp = 1_000_000, releaseSave;
const photo = new File(['photo-bytes'],'camera.jpg',{type:'image/jpeg'});
const recover = createUpdateRecovery({
  storage:{getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)},
  now:()=>timestamp,
  url:()=> 'https://loop.test/?room=ABC123&view=stats#scanner',
  savePhoto:async value=>{
    assert.equal(value,photo);
    events.push('save-start');
    await new Promise(resolve=>{releaseSave=resolve;});
    events.push('save-complete');
  },
  replace:value=>events.push(new URL(value)),
});
const pending = recover(photo);
assert.equal(recover(photo),pending,'concurrent failures share one recovery');
assert.deepEqual(events,['save-start'],'navigation waits for the persisted photo');
releaseSave();
assert.equal(await pending,true);
assert.deepEqual(events.slice(0,2),['save-start','save-complete']);
assert.equal(events.length,3);
const destination=events[2];
assert.equal(destination.origin,'https://loop.test');
assert.equal(destination.searchParams.get('room'),'ABC123');
assert.equal(destination.searchParams.get('view'),'stats');
assert.equal(destination.searchParams.get('_loop_update'),String(timestamp));
assert.equal(destination.hash,'#scanner');
assert.equal(await recover(photo),false,'a persistent module error must not reload repeatedly');
assert.equal(events.length,3);
const forced=recover(photo,true);
releaseSave();
assert.equal(await forced,true,'an explicit retry remains available');
timestamp+=120_001;
const later=recover(photo);
releaseSave();
assert.equal(await later,true,'the automatic retry guard expires');

for(const failure of ['read','write','photo']) {
  let navigated=false;
  const blocked=createUpdateRecovery({
    storage:{
      getItem:()=>{if(failure==='read')throw Error('Storage unavailable');return null;},
      setItem:()=>{if(failure==='write')throw Error('Storage full');},
    },
    now:()=>timestamp,url:()=> 'https://loop.test/',
    savePhoto:async()=>{if(failure==='photo')throw Error('Photo persistence failed');},
    replace:()=>{navigated=true;},
  });
  assert.equal(await blocked(photo),false);
  assert.equal(navigated,false,`${failure} failure keeps the current photo on screen`);
}

// The response policy must preserve response data and other headers, while
// leaving JSON and immutable hashed assets alone.
const workerSource=readFileSync('worker/index.ts','utf8')
  .replace('import handler from "vinext/server/fetch-handler";','const handler={fetch:async()=>globalThis.__loopTestResponse};')
  .replace('import { runWithConnectorBinding } from "../lib/connector-context";','const runWithConnectorBinding=(_,callback)=>callback();')
  .replace('import.meta.env.DEV','false');
const {default:worker}=await import(moduleUrl(workerSource));
const request=new Request('https://loop.test/');
globalThis.__loopTestResponse=new Response('<html>updated</html>',{
  status:201,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=3600','Set-Cookie':'test=1; Secure'},
});
const html=await worker.fetch(request,{},{});
assert.equal(html.headers.get('Cache-Control'),'no-store, max-age=0');
assert.equal(html.headers.get('CDN-Cache-Control'),'no-store');
assert.equal(html.headers.get('Set-Cookie'),'test=1; Secure');
assert.equal(html.status,201);
assert.equal(await html.text(),'<html>updated</html>');
for(const type of ['application/javascript','application/json']) {
  const original=new Response('unchanged',{headers:{'Content-Type':type,'Cache-Control':'public, max-age=31536000, immutable'}});
  globalThis.__loopTestResponse=original;
  assert.equal(await worker.fetch(request,{},{}),original);
}
delete globalThis.__loopTestResponse;
console.log('Update recovery passed: nested module errors, photo-before-navigation, URL preservation, concurrent retry, loop guard, explicit retry, safe storage failure, and HTML-only cache policy.');
