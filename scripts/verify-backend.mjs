import {readFileSync,readdirSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
// Exercises real route handlers and migration SQL against an in-memory SQLite D1 adapter.
// Node >=23.7 supports the built-in TypeScript transform and SQLite used here.
const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');
const migrations=readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort();
raw.exec(readFileSync('drizzle/'+migrations[0],'utf8'));
globalThis.__loopTestDB={prepare(sql){return{bind(...args){const statement=raw.prepare(sql);return{async first(){return statement.get(...args)??null},async all(){return{results:statement.all(...args)}},async run(){const r=statement.run(...args);return{meta:{changes:Number(r.changes)}}}}}}}};
const url=source=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source,{mode:'transform'})).toString('base64');
const content=JSON.parse(readFileSync('lib/content.json','utf8'));
const defaultsUrl=url(readFileSync('lib/defaults.ts','utf8').replace("import content from './content.json';",'const content='+JSON.stringify(content)+';'));
const itemOptionsUrl=url(readFileSync('lib/item-options.ts','utf8').replace("from './defaults'",'from '+JSON.stringify(defaultsUrl)));
const corsUrl=url(readFileSync('lib/api-cors.ts','utf8'));
const {withApiCors,isAllowedRequestOrigin}=await import(corsUrl);
let game=readFileSync('lib/game.ts','utf8').replace("import { env } from 'cloudflare:workers';",'const env = {DB:globalThis.__loopTestDB};').replace("import { CATEGORY_IDS, type Config } from './types';", "const CATEGORY_IDS=['pet','plastic','paper','carton','can','glass','vinyl','general'];").replace("from './api-cors'",'from '+JSON.stringify(corsUrl));
const gameUrl=url(game);
async function route(path){const source=readFileSync(path,'utf8').replaceAll("from '@/lib/game'",'from '+JSON.stringify(gameUrl)).replaceAll("from '../../../../../lib/item-options'",'from '+JSON.stringify(itemOptionsUrl));const handlers=await import(url(source));return Object.fromEntries(Object.entries(handlers).map(([method,handler])=>[method,(request,context)=>withApiCors(request,()=>handler(request,context))]));}
const create=await route('app/api/rooms/route.ts'),roomApi=await route('app/api/rooms/[room]/route.ts'),sessions=await route('app/api/rooms/[room]/sessions/route.ts'),answers=await route('app/api/rooms/[room]/answers/route.ts'),stats=await route('app/api/rooms/[room]/stats/route.ts');
const config={title:'API 검증 행사',region:'테스트 학교',sourceUrl:content.sources[0].url,verified:false,items:content.items.map(i=>({id:i.id,name:i.name,emoji:i.emoji,category:i.category,reason:i.method+' '+i.reason,tip:i.hint}))};
const req=(method,body,token)=>new Request('https://loop.test/api',{method,headers:{Origin:'https://loop.test','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
let response=await create.POST(req('POST',{config}));assert.equal(response.status,201);const created=await response.json();const context={params:Promise.resolve({room:created.room})};
response=await sessions.POST(req('POST',{name:'새싹'}),context);assert.equal(response.status,201);const first=await response.json();assert.equal(first.configVersion,1);
const postAnswer=(round,itemId,choice,sessionId=first.sessionId)=>answers.POST(req('POST',{round,itemId,choice,sessionId,score:99999}),context);
response=await postAnswer(0,config.items[0].id,config.items[0].category);let result=await response.json();assert.equal(result.totalScore,20);assert.equal(result.answered,1);
// Upgrade a populated database: preserve its answer and round protection while
// allowing the same item in later rounds.
const beforeMigration=raw.prepare('SELECT * FROM answers').all();
for(const file of migrations.slice(1))raw.exec(readFileSync('drizzle/'+file,'utf8'));
assert.deepEqual(raw.prepare('SELECT * FROM answers').all(),beforeMigration);
const indexes=raw.prepare("PRAGMA index_list('answers')").all().map(row=>row.name);
assert.equal(indexes.includes('answer_item'),false);assert.equal(indexes.includes('answer_round'),true);
response=await postAnswer(0,config.items[0].id,config.items[0].category);result=await response.json();assert.equal(result.totalScore,20);assert.equal(result.answered,1);
assert.equal((await postAnswer(0,config.items[0].id,'general')).status,409);
assert.equal((await postAnswer(2,config.items[2].id,config.items[2].category)).status,409);
response=await postAnswer(1,config.items[0].id,config.items[0].category);assert.equal(response.status,200);result=await response.json();assert.equal(result.totalScore,40);assert.equal(result.answered,2);
response=await postAnswer(1,config.items[0].id,config.items[0].category);result=await response.json();assert.equal(result.totalScore,40);assert.equal(result.answered,2);
assert.equal((await postAnswer(1,config.items[1].id,config.items[1].category)).status,409);
response=await roomApi.PUT(req('PUT',{config},'wrong'),context);assert.equal(response.status,403);
const modified=structuredClone(config);modified.region='업데이트 테스트 학교';modified.items[0].category='general';modified.items[1].category='general';modified.items[1].reason='업데이트된 기준';
response=await roomApi.PUT(req('PUT',{config:modified},created.adminToken),context);assert.equal(response.status,200);assert.equal((await response.json()).configVersion,2);
for(let round=2;round<5;round++){response=await postAnswer(round,config.items[0].id,config.items[0].category);assert.equal(response.status,200);result=await response.json();assert.equal(result.correct,true);}
assert.equal(result.totalScore,100);assert.equal(result.complete,true);
assert.equal((await postAnswer(5,config.items[0].id,config.items[0].category)).status,400);
response=await postAnswer(4,config.items[0].id,config.items[0].category);result=await response.json();assert.equal(result.totalScore,100);assert.equal(result.answered,5);
assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM answers WHERE session_id = ?').get(first.sessionId).n,5);
response=await sessions.POST(req('POST',{name:'잎새'}),context);const second=await response.json();assert.equal(second.configVersion,2);
response=await postAnswer(0,config.items[0].id,config.items[0].category,second.sessionId);assert.equal((await response.json()).correct,false);
const publicStats=await (await stats.GET(req('GET'),context)).json();assert.equal(publicStats.participants,2);assert.equal(publicStats.completed,1);assert.equal(publicStats.answers,6);assert.equal(publicStats.correct,5);assert.equal(publicStats.accuracy,83);assert.equal(publicStats.confused.length,1);assert.equal('records' in publicStats,false);assert.equal('id' in publicStats.ranking[0],false);
assert.deepEqual(publicStats.versions,[{version:1,region:'테스트 학교',answers:5,correct:5,accuracy:100},{version:2,region:'업데이트 테스트 학교',answers:1,correct:0,accuracy:0}]);
const adminWithoutRecords=await (await stats.GET(req('GET',null,created.adminToken),context)).json();assert.equal('records' in adminWithoutRecords,false);
const exportRequest=new Request('https://loop.test/api?records=1',{headers:{Authorization:'Bearer '+created.adminToken}});
const privateStats=await (await stats.GET(exportRequest,context)).json();assert.equal(privateStats.records.length,6);assert.deepEqual([...new Set(privateStats.records.map(r=>r.configVersion))].sort(),[1,2]);assert.equal(privateStats.records.find(r=>r.configVersion===2).region,'업데이트 테스트 학교');
console.log('Backend route integration passed: populated-database migration without data loss; same-item scoring in all 5 rounds; server score tampering protection; idempotent retry; conflicting/out-of-order rejection; 5-round limit; admin authorization; immutable session rules; aggregate correctness; versioned CSV records.');

const pagesOrigin='https://jusiety.github.io';
const crossRequest=(method,value,origin=pagesOrigin,token)=>new Request('https://loop.test/api/rooms',{method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(value?{body:JSON.stringify(value)}:{})});
const gameApi=await import(gameUrl);
assert.deepEqual(await gameApi.body(crossRequest('POST',{config})),{config});
assert.equal(isAllowedRequestOrigin(req('POST',{config})),true);
assert.equal(isAllowedRequestOrigin(new Request('https://loop.test/api')),true);
for(const origin of ['https://evil.test','https://jusiety.github.io.evil.test','http://jusiety.github.io','https://jusiety.github.io:444','null']){
  const count=raw.prepare('SELECT COUNT(*) AS n FROM rooms').get().n;
  response=await create.POST(crossRequest('POST',{config},origin));
  assert.equal(response.status,403);assert.equal(response.headers.has('Access-Control-Allow-Origin'),false);
  assert.equal(response.headers.get('Vary'),'Origin');
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM rooms').get().n,count);
  await assert.rejects(()=>gameApi.body(crossRequest('POST',{config},origin)),error=>error.status===403);
}
response=await create.POST(crossRequest('POST',{config}));assert.equal(response.status,201);
assert.equal(response.headers.get('Access-Control-Allow-Origin'),pagesOrigin);
assert.equal(response.headers.get('Vary'),'Origin');
assert.equal(response.headers.has('Access-Control-Allow-Credentials'),false);
const crossCreated=await response.json(),crossContext={params:Promise.resolve({room:crossCreated.room})};
assert.equal((await sessions.POST(crossRequest('POST',{name:'Pages 참가자'}),crossContext)).status,201);
response=await roomApi.PUT(crossRequest('PUT',{config},pagesOrigin,'wrong'),crossContext);
assert.equal(response.status,403);assert.equal(response.headers.get('Access-Control-Allow-Origin'),pagesOrigin);
response=await roomApi.PUT(crossRequest('PUT',{config},pagesOrigin,crossCreated.adminToken),crossContext);
assert.equal(response.status,200);
response=await stats.GET(crossRequest('GET'),crossContext);assert.equal(response.status,200);assert.equal((await response.json()).participants,1);
for(const method of ['GET','POST','PUT']){
  let handled=false;
  response=await withApiCors(new Request('https://loop.test/api/rooms',{method:'OPTIONS',headers:{Origin:pagesOrigin,'Access-Control-Request-Method':method,'Access-Control-Request-Headers':'Content-Type, AUTHORIZATION'}}),()=>{handled=true;return new Response('unexpected')});
  assert.equal(handled,false);assert.equal(response.status,204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),pagesOrigin);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'),'GET, POST, PUT');
  assert.equal(response.headers.get('Access-Control-Allow-Headers'),'Content-Type, Authorization');
  assert.equal(response.headers.has('Access-Control-Allow-Credentials'),false);
}
for(const headers of [
  {Origin:'https://evil.test','Access-Control-Request-Method':'POST'},
  {Origin:pagesOrigin,'Access-Control-Request-Method':'DELETE'},
  {Origin:pagesOrigin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'X-Admin-Token'},
  {Origin:pagesOrigin},
]){
  let handled=false;response=await withApiCors(new Request('https://loop.test/api/rooms',{method:'OPTIONS',headers}),()=>{handled=true;return new Response()});
  assert.equal(response.status,403);assert.equal(handled,false);
}
const original=new Response('static',{headers:{Vary:'Accept-Encoding'}});
assert.equal(await withApiCors(new Request('https://loop.test/',{headers:{Origin:'https://evil.test'}}),()=>original),original);
response=await withApiCors(crossRequest('GET'),()=>new Response('cached',{headers:{Vary:'Accept-Encoding, origin'}}));
assert.equal(response.headers.get('Vary'),'Accept-Encoding, origin');assert.equal(await response.text(),'cached');
console.log('Pages CORS integration passed: exact HTTPS origin allowlist; same-origin and no-Origin requests retained; cross-origin room/session creation and authorized updates; administrator token checks retained; safe preflight methods/headers; hostile origin mutations blocked; response errors readable; Vary preserved; no wildcard or credential access; non-API responses unchanged.');
