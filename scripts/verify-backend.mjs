import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
// Exercises real route handlers and migration SQL against an in-memory SQLite D1 adapter.
// Node >=23.7 supports the built-in TypeScript transform and SQLite used here.
const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');raw.exec(readFileSync('drizzle/0000_wet_retro_girl.sql','utf8'));
globalThis.__loopTestDB={prepare(sql){return{bind(...args){const statement=raw.prepare(sql);return{async first(){return statement.get(...args)??null},async all(){return{results:statement.all(...args)}},async run(){const r=statement.run(...args);return{meta:{changes:Number(r.changes)}}}}}}}};
const url=source=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source,{mode:'transform'})).toString('base64');
let game=readFileSync('lib/game.ts','utf8').replace("import { env } from 'cloudflare:workers';",'const env = {DB:globalThis.__loopTestDB};').replace("import { CATEGORY_IDS, type Config } from './types';", "const CATEGORY_IDS=['pet','plastic','paper','carton','can','glass','vinyl','general'];");
const gameUrl=url(game);
async function route(path){return import(url(readFileSync(path,'utf8').replaceAll("from '@/lib/game'",'from '+JSON.stringify(gameUrl))));}
const create=await route('app/api/rooms/route.ts'),roomApi=await route('app/api/rooms/[room]/route.ts'),sessions=await route('app/api/rooms/[room]/sessions/route.ts'),answers=await route('app/api/rooms/[room]/answers/route.ts'),stats=await route('app/api/rooms/[room]/stats/route.ts');
const content=JSON.parse(readFileSync('lib/content.json','utf8'));
const config={title:'API 검증 행사',region:'테스트 학교',sourceUrl:content.sources[0].url,verified:false,items:content.items.map(i=>({id:i.id,name:i.name,emoji:i.emoji,category:i.category,reason:i.method+' '+i.reason,tip:i.hint}))};
const req=(method,body,token)=>new Request('https://loop.test/api',{method,headers:{Origin:'https://loop.test','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
let response=await create.POST(req('POST',{config}));assert.equal(response.status,201);const created=await response.json();const context={params:Promise.resolve({room:created.room})};
response=await sessions.POST(req('POST',{name:'새싹'}),context);assert.equal(response.status,201);const first=await response.json();assert.equal(first.configVersion,1);
const postAnswer=(round,itemId,choice,sessionId=first.sessionId)=>answers.POST(req('POST',{round,itemId,choice,sessionId,score:99999}),context);
response=await postAnswer(0,config.items[0].id,config.items[0].category);let result=await response.json();assert.equal(result.totalScore,20);assert.equal(result.answered,1);
response=await postAnswer(0,config.items[0].id,config.items[0].category);result=await response.json();assert.equal(result.totalScore,20);assert.equal(result.answered,1);
assert.equal((await postAnswer(0,config.items[0].id,'general')).status,409);
assert.equal((await postAnswer(1,config.items[0].id,config.items[0].category)).status,409);
assert.equal((await postAnswer(2,config.items[2].id,config.items[2].category)).status,409);
response=await roomApi.PUT(req('PUT',{config},'wrong'),context);assert.equal(response.status,403);
const modified=structuredClone(config);modified.region='업데이트 테스트 학교';modified.items[0].category='general';modified.items[1].category='general';modified.items[1].reason='업데이트된 기준';
response=await roomApi.PUT(req('PUT',{config:modified},created.adminToken),context);assert.equal(response.status,200);assert.equal((await response.json()).configVersion,2);
for(let round=1;round<5;round++){response=await postAnswer(round,config.items[round].id,config.items[round].category);assert.equal(response.status,200);result=await response.json();assert.equal(result.correct,true);}
assert.equal(result.totalScore,100);assert.equal(result.complete,true);
response=await sessions.POST(req('POST',{name:'잎새'}),context);const second=await response.json();assert.equal(second.configVersion,2);
response=await postAnswer(0,config.items[0].id,config.items[0].category,second.sessionId);assert.equal((await response.json()).correct,false);
const publicStats=await (await stats.GET(req('GET'),context)).json();assert.equal(publicStats.participants,2);assert.equal(publicStats.completed,1);assert.equal(publicStats.answers,6);assert.equal(publicStats.correct,5);assert.equal(publicStats.accuracy,83);assert.equal(publicStats.confused.length,1);assert.equal('records' in publicStats,false);assert.equal('id' in publicStats.ranking[0],false);
assert.deepEqual(publicStats.versions,[{version:1,region:'테스트 학교',answers:5,correct:5,accuracy:100},{version:2,region:'업데이트 테스트 학교',answers:1,correct:0,accuracy:0}]);
const adminWithoutRecords=await (await stats.GET(req('GET',null,created.adminToken),context)).json();assert.equal('records' in adminWithoutRecords,false);
const exportRequest=new Request('https://loop.test/api?records=1',{headers:{Authorization:'Bearer '+created.adminToken}});
const privateStats=await (await stats.GET(exportRequest,context)).json();assert.equal(privateStats.records.length,6);assert.deepEqual([...new Set(privateStats.records.map(r=>r.configVersion))].sort(),[1,2]);assert.equal(privateStats.records.find(r=>r.configVersion===2).region,'업데이트 테스트 학교');
console.log('Backend route integration passed: room/session creation; server score tampering protection; idempotent retry; conflicting rounds/repeated item/out-of-order rejection; admin authorization; immutable session rules across version updates; 5-round completion; aggregate correctness; zero-error item exclusion; admin-only versioned CSV records; before/after version aggregates.');
