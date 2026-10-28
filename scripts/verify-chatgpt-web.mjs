import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile('lib/chatgpt-vision.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {needsChatGptWebReview,parseChatGptWebReply,resizedDimensions,chatGptWebPrompt}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const items=[{id:'pet-bottle',name:'투명 페트병'},{id:'drink-can',name:'음료 캔'}];
const base={itemId:null,source:'kaggle',confidence:.9,label:'용도 확인이 필요한 물품',detail:'확인 필요',status:'item',needsConfirmation:true};
assert.equal(needsChatGptWebReview(base),true);
assert.equal(needsChatGptWebReview({...base,label:'용도 확인이 필요한 물품 형태로 보여요'}),true);
assert.equal(needsChatGptWebReview({...base,label:'금속 캔'}),false);
assert.equal(needsChatGptWebReview({...base,label:'기타',status:'review'}),true);
assert.equal(needsChatGptWebReview({...base,label:'기타',uncertain:true}),true);
assert.equal(needsChatGptWebReview({...base,source:'chatgpt-web',status:'review'}),false);
const answer={label:'플라스틱병',itemId:'pet-bottle',material:'plastic',detail:'무색 음료 PET인지 표시를 확인하세요.'};
const parsed=parseChatGptWebReply('```json\n'+JSON.stringify(answer)+'\n```',items);
assert.equal(parsed.source,'chatgpt-web');assert.equal(parsed.needsConfirmation,true);assert.equal(parsed.itemId,'pet-bottle');assert.equal(parsed.confidence,0);
assert.equal(parseChatGptWebReply(JSON.stringify({...answer,itemId:null,material:'unknown'}),items).material,undefined);
for(const invalid of [
 {...answer,itemId:'not-a-booth-item'}, {...answer,itemId:1}, {...answer,material:'made-up'}, {...answer,label:'x'.repeat(101)}, {...answer,detail:'x'.repeat(601)}, {...answer,category:'trash'}, {...answer,score:100}, {...answer,candidates:[{itemId:'pet-bottle',score:1.1}]}, {...answer,candidates:[{itemId:'unknown',score:.5}]}, {...answer,candidates:[{itemId:'pet-bottle',score:.5,category:'trash'}]}, [],null,
])assert.throws(()=>parseChatGptWebReply(JSON.stringify(invalid),items));
assert.throws(()=>parseChatGptWebReply('not json',items));assert.throws(()=>parseChatGptWebReply('x'.repeat(10001),items));
assert.deepEqual(resizedDimensions(4000,3000),{width:1024,height:768});
assert.deepEqual(resizedDimensions(300,400),{width:300,height:400});assert.throws(()=>resizedDimensions(0,300));
assert.ok(chatGptWebPrompt(items).includes('pet-bottle=투명 페트병'));
assert.ok(!source.includes('/api/vision/'),'the free web flow must not call a paid API');
console.log('ChatGPT web passed: review triggers, no repeat handoff, fenced JSON, item/material whitelist, size/type limits, unknown fields and score rejection, and photo resize.');
