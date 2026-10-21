// Compatibility for tfjs-node 4.x on Node 24.
require('node:util').isNullOrUndefined ??= value => value == null;
const fs=require('node:fs');
const path=require('node:path');
const root=process.env.LOOP_TRAINING_DIR; if(!root)throw Error('Set LOOP_TRAINING_DIR');
const tf=require(root+'/runtime/node_modules/@tensorflow/tfjs-node');
const mobilenet=require(root+'/runtime/node_modules/@tensorflow-models/mobilenet');
(async()=>{
 const rows=JSON.parse(fs.readFileSync(root+'/split.json'));
 const model=await mobilenet.load({version:2,alpha:1,modelUrl:require('node:url').pathToFileURL(path.resolve(__dirname,'../../public/models/mobilenet/model.json')).href,inputRange:[0,1]});
 const output=fs.openSync(root+'/embeddings.f32','w');
 const t=Date.now();
 for(let i=0;i<rows.length;i++){
  const im=tf.node.decodeImage(fs.readFileSync(rows[i].path),3);
  const e=model.infer(im,true);const values=await e.data();
  const norm=Math.sqrt(values.reduce((s,v)=>s+v*v,0));const a=Float32Array.from(values,v=>v/norm);
  fs.writeSync(output,Buffer.from(a.buffer));e.dispose();im.dispose();
  if(i%100===0)console.log(`${i+1}/${rows.length} embeddings; ${((Date.now()-t)/1000).toFixed(1)}s`);
 }
 fs.closeSync(output);console.log('Embedding extraction complete');
})();
