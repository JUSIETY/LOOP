// Frozen MobileNet V2 embeddings, with exactly the browser's normalization and
// alignCorners=true resize. Batch execution changes throughput, not the model.
require('node:util').isNullOrUndefined ??= value => value == null;
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.env.LOOP_LARGE_TRAINING_DIR || '/tmp/loop-expanded-training';
const runtime = process.env.LOOP_TF_RUNTIME || '/workspace/scratch/loop-training/runtime/node_modules';
const tf = require(path.join(runtime, '@tensorflow/tfjs-node'));
const mobilenet = require(path.join(runtime, '@tensorflow-models/mobilenet'));
const project = path.resolve(__dirname, '../..');
const batchSize = Number(process.env.LOOP_EMBEDDING_BATCH || 24);
(async () => {
  const source = process.argv[2];
  if (source && !['household','tricascade','trashbox','drinking','garbage','warp','plastic'].includes(source)) throw new Error('Unknown source');
  const catalog = path.join(root, source ? `catalog-${source}.json` : 'large-split.json');
  while (!fs.existsSync(catalog)) await new Promise(resolve => setTimeout(resolve,5000));
  const manifest = fs.readFileSync(catalog);
  const parsed = JSON.parse(manifest);
  const rows = source ? parsed.rows : parsed;
  // An explicitly marked external owner can finish a source while preparation runs.
  // Never append to the same feature file from two processes.
  const externalMarker=path.join(root,`${source || 'large'}.external-active`);
  const externalOutput=path.join(root,`${source || 'large'}-embeddings.f32`);
  if(fs.existsSync(externalMarker)){
    console.log('Waiting for explicitly marked external extraction:',source);
    while(!fs.existsSync(externalOutput)||fs.statSync(externalOutput).size<rows.length*1280*4)
      await new Promise(resolve=>setTimeout(resolve,5000));
    fs.unlinkSync(externalMarker);
  }
  const fingerprint = crypto.createHash('sha256').update(manifest).digest('hex');
  const output = path.join(root, `${source || 'large'}-embeddings.f32`);
  const marker = path.join(root, `${source || 'large'}-embedding-manifest.sha256`);
  if (fs.existsSync(output) && fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') !== fingerprint) {
    throw new Error('Image catalog changed; do not resume mismatched embeddings');
  }
  fs.writeFileSync(marker, fingerprint);
  let start = fs.existsSync(output) ? Math.floor(fs.statSync(output).size / (1280 * 4)) : 0;
  fs.closeSync(fs.openSync(output, 'a'));
  fs.truncateSync(output, start * 1280 * 4);
  const fd = fs.openSync(output, 'a');
  const model = await mobilenet.load({ version: 2, alpha: 1,
    modelUrl: 'file://' + path.join(project, 'public/models/mobilenet/model.json'), inputRange: [0,1] });
  const reuse=new Map(),cacheFiles=new Map();
  if(source) for(const other of ['household','tricascade','trashbox','drinking','garbage','warp','plastic']){
    if(other===source) continue;
    const otherCatalog=path.join(root,`catalog-${other}.json`),otherFeatures=path.join(root,`${other}-embeddings.f32`);
    if(!fs.existsSync(otherCatalog)||!fs.existsSync(otherFeatures))continue;
    cacheFiles.set(other,{fd:fs.openSync(otherFeatures,'r'),path:otherFeatures});
    JSON.parse(fs.readFileSync(otherCatalog)).rows.forEach((row,index)=>reuse.set(row.sha256,{other,index}));
  }
  const begun = Date.now();
  let reused=0;
  for (let i = start; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const missing=[],outputData=new Float32Array(batch.length*1280);
    batch.forEach((row,index)=>{
      const cached=reuse.get(row.sha256),file=cached&&cacheFiles.get(cached.other);
      if(cached&&file&&fs.statSync(file.path).size>=(cached.index+1)*1280*4){
        const bytes=Buffer.allocUnsafe(1280*4);fs.readSync(file.fd,bytes,0,bytes.length,cached.index*1280*4);
        outputData.set(new Float32Array(bytes.buffer,bytes.byteOffset,1280),index*1280);reused++;
      }else missing.push({row,index});
    });
    const tensors = missing.map(({row}) => tf.tidy(() => {
      const pixels = tf.node.decodeImage(fs.readFileSync(row.path), 3);
      return tf.image.resizeBilinear(pixels.toFloat().div(255), [224,224], true);
    }));
    if(tensors.length){
    const normalized = tf.tidy(() => {
      const input = tf.stack(tensors);
      const pooled = model.model.execute(input, 'module_apply_default/MobilenetV2/Logits/AvgPool');
      const features = pooled.reshape([missing.length,1280]);
      return features.div(features.square().sum(1,true).sqrt().maximum(1e-12));
    });
    const data = await normalized.data();
    if (data.length !== missing.length*1280 || Array.from(data).some(v => !Number.isFinite(v))) throw new Error('Invalid embedding batch');
    missing.forEach(({index},j)=>outputData.set(data.subarray(j*1280,(j+1)*1280),index*1280));
    normalized.dispose(); tensors.forEach(t => t.dispose());
    }
    fs.writeSync(fd,Buffer.from(outputData.buffer));
    if ((i-start) % (batchSize*20) === 0 || i+batch.length===rows.length) {
      console.log(`${i+batch.length}/${rows.length} image features; ${((Date.now()-begun)/1000).toFixed(1)}s; tensors=${tf.memory().numTensors}; reused=${reused}`);
    }
  }
  fs.closeSync(fd);
  console.log('Large-dataset feature extraction complete');
})().catch(error => { console.error(error); process.exitCode = 1; });
