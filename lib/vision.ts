"use client";

import {loadWasteHead,predictWaste,materialNames,type WasteHead} from "./kaggle-classifier";
import type { MobileNet } from "@tensorflow-models/mobilenet";

export type VisionItem = { id: string; name: string; emoji?: string };
export type ImageInput = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageData;
export type BaselineClass = { className: string; probability: number };
export type VisionSample = {
  id: string;
  hash: string;
  itemId: string;
  split: "train" | "test";
  model: string;
  embedding: number[];
  baseline: BaselineClass[];
  createdAt: string;
  filename: string;
};
export type Recognition = {
  itemId: string | null;
  confidence: number;
  source: "custom" | "baseline" | "kaggle";
  material?: string;
  uncertain?: boolean;
  status?: "item" | "material" | "review";
  alternatives?: {label: string; score: number}[];
  label: string;
  needsConfirmation: boolean;
  detail: string;
  candidates?: {itemId: string; score: number}[];
};
export type EvaluationResult = {
  testCount: number;
  trainCount: number;
  baselineAccuracy: number;
  customAccuracy: number;
  baselineUnknown: number;
  customUnknown: number;
  classes: { itemId: string; count: number; baselineCorrect: number; customCorrect: number }[];
  confusion: { actual: string; predicted: string | null; count: number }[];
  evaluatedAt: string;
};

export const VISION_MODEL = "mobilenet-v2-alpha1.0-1280";
const EMBEDDING_SIZE = 1280;
const MAX_SAMPLES = 1000;
let modelPromise: Promise<MobileNet> | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

function friendlyStorageError() {
  return new Error("이 브라우저에서 이미지 학습 데이터를 저장할 수 없어요. 일반 브라우저에서 사이트를 열거나 저장 공간을 확인해 주세요.");
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(friendlyStorageError());
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("loop-vision-dataset", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("samples", { keyPath: "id" });
        store.createIndex("hash", "hash", { unique: true });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(friendlyStorageError());
      request.onblocked = () => reject(new Error("다른 LOOP 탭을 닫고 다시 시도해 주세요."));
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

function notifyDataset() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("loop-vision-change"));
}

export async function listSamples(): Promise<VisionSample[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("samples", "readonly").objectStore("samples").getAll();
    request.onsuccess = () => resolve((request.result as VisionSample[]).filter(sample => sample.model === VISION_MODEL));
    request.onerror = () => reject(friendlyStorageError());
  });
}

export async function deleteSample(id: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("samples", "readwrite");
    transaction.objectStore("samples").delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(friendlyStorageError());
  });
  notifyDataset();
}

export async function clearSamples(): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("samples", "readwrite");
    transaction.objectStore("samples").clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(friendlyStorageError());
  });
  notifyDataset();
}

/** Bundled same-origin weights load on demand. Images never leave this browser. */
export async function loadVision(onStatus?: (message: string) => void): Promise<MobileNet> {
  if (typeof window === "undefined") throw new Error("AI 인식은 브라우저에서 실행해 주세요.");
  if (!modelPromise) {
    modelPromise = (async () => {
      onStatus?.("AI 엔진을 준비하고 있어요…");
      const tf = await import("@tensorflow/tfjs");
      try {
        const accelerated = await tf.setBackend("webgl");
        if (!accelerated) await tf.setBackend("cpu");
      } catch {
        await tf.setBackend("cpu");
      }
      await tf.ready();
      onStatus?.("앱에 포함된 MobileNet 모델을 불러오는 중이에요…");
      const mobilenet = await import("@tensorflow-models/mobilenet");
      const model = await mobilenet.load({ version: 2, alpha: 1.0, modelUrl: "/models/mobilenet/model.json", inputRange: [0, 1] });
      onStatus?.("AI 모델 준비 완료");
      return model;
    })();
    modelPromise.catch(() => { modelPromise = null; });
  }
  try {
    return await modelPromise;
  } catch (cause) {
    throw new Error("AI 모델을 불러오지 못했어요. 사이트 연결을 확인한 뒤 다시 시도해 주세요. 품목 직접 선택으로 챌린지는 계속할 수 있어요.", {cause});
  }
}

async function extractImage(image: ImageInput, onStatus?: (message: string) => void) {
  const model = await loadVision(onStatus);
  const tensor = model.infer(image, true);
  let embedding: number[];
  try {
    embedding = Array.from(await tensor.data());
  } finally {
    tensor.dispose();
  }
  const norm = Math.sqrt(embedding.reduce((total, value) => total + value * value, 0));
  if (!norm || embedding.length !== EMBEDDING_SIZE) throw new Error("이미지 특징을 읽지 못했어요. 다른 사진으로 다시 시도해 주세요.");
  embedding = embedding.map(value => value / norm);
  const baseline = await model.classify(image, 5);
  return { embedding, baseline };
}

// ImageNet recognizes objects, not Korean disposal rules. Never infer dirt,
// transparency, food-use or carton lining from an object label.
const keywordMap: { imageNet: RegExp; id: string }[] = [
  {imageNet: /water bottle|pop bottle|soda bottle/, id: "pet-bottle"},
  {imageNet: /beer bottle|wine bottle/, id: "glass-bottle"},
  {imageNet: /tin can/, id: "drink-can"},
  {imageNet: /carton|cardboard/, id: "cardboard"},
  {imageNet: /paper towel|toilet tissue|toilet paper/, id: "used-tissue"},
  {imageNet: /plastic bag/, id: "snack-wrapper"},
];
export function baselinePrediction(predictions: BaselineClass[], items: VisionItem[]): Recognition {
  const scores = new Map<string, number>();
  for (const p of predictions) {
    if (!Number.isFinite(p.probability) || p.probability < 0 || p.probability > 1) continue;
    const mapping = keywordMap.find(m => m.imageNet.test(p.className.toLowerCase()) && items.some(i => i.id === m.id));
    if (mapping) scores.set(mapping.id, (scores.get(mapping.id) || 0) + p.probability);
  }
  const ranked = [...scores].sort((a,b) => b[1]-a[1]);
  const best = ranked[0];
  const accepted = !!best && best[1] >= 0.45 && best[1]-(ranked[1]?.[1] || 0) >= 0.15;
  return {itemId: accepted ? best[0] : null, confidence: Math.min(1,best?.[1] || 0), source:"baseline",
    label: predictions[0]?.className || "인식 결과 없음", needsConfirmation:true,
    candidates:ranked.slice(0,3).map(([itemId,score])=>({itemId,score})),
    detail:"물체 모양만 추정한 후보예요. 투명도·용도·재질·오염 상태 확인 전에는 배출 방법을 확정하지 않아요."};
}

export function nearestPrediction(embedding: number[], train: VisionSample[], items: VisionItem[]): Recognition {
  const allowed = new Set(items.map(i=>i.id));
  const groups = new Map<string,number[]>();
  for (const s of train) {
    if(s.split!=="train" || s.model!==VISION_MODEL || !allowed.has(s.itemId) || s.embedding.length!==embedding.length) continue;
    const score=s.embedding.reduce((sum,v,i)=>sum+v*embedding[i],0);
    if(Number.isFinite(score)) groups.set(s.itemId,[...(groups.get(s.itemId)||[]),score]);
  }
  // Equal per-class support prevents a heavily sampled class from winning by count.
  const ranked=[...groups].filter(([,scores])=>scores.length>=3).map(([itemId,scores])=>{
    scores.sort((a,b)=>b-a);
    return {itemId,score:scores.slice(0,3).reduce((a,b)=>a+b,0)/3};
  }).sort((a,b)=>b.score-a.score);
  const best=ranked[0];
  const accepted=ranked.length>=2 && best.score>=0.72 && best.score-ranked[1].score>=0.08;
  return {itemId:accepted?best.itemId:null,confidence:Math.max(0,Math.min(1,best?.score||0)),source:"custom",
    label:best?items.find(i=>i.id===best.itemId)?.name||best.itemId:"학습 표본 부족",
    needsConfirmation:true,candidates:ranked.slice(0,3),
    detail:accepted?"품목별 가까운 사진 3장의 평균 유사도예요. 정답 확률이 아니며 재질·오염 상태 확인이 필요해요.":"품목당 3장·2종 이상과 충분한 유사도 차이가 필요해요. 모르는 물건은 강제로 분류하지 않아요."};
}

export function recognitionFromEmbedding(embedding:number[],head:WasteHead,items:VisionItem[]):Recognition {
    const {fine,coarse,disagreement}=predictWaste(embedding,head);
    const fineIds:Record<string,string[]>={
      "drink-can":["drink-can"],cardboard:["cardboard"],"glass-bottle":["glass-bottle"],
      "plastic-container":["plastic-container"],"plastic-bottle":["pet-bottle","plastic-container"],
      "detergent-bottle":["plastic-container"],carton:["milk-carton"],"plastic-bag":["snack-wrapper"],
      "paper-cup":["dirty-paper-cup"],"glass-container":["glass-bottle"],"glass-object":["glass-bottle"],
    };
    const coarseIds:Record<string,string[]>={
      cardboard:["cardboard"],glass:["glass-bottle"],metal:["drink-can"],
      plastic:["pet-bottle","plastic-container"],carton:["milk-carton"],vinyl:["snack-wrapper"],
      paper:["cardboard","milk-carton","dirty-paper-cup"],
    };
    const knownFine=fine.accepted&&!disagreement;
    const materialOnly=!knownFine&&coarse.accepted&&!disagreement;
    const status:Recognition["status"]=knownFine?"item":materialOnly?"material":"review";
    const label=knownFine?head.names[fine.className]||fine.className:materialOnly?materialNames[coarse.className]||coarse.className:head.names[fine.className]||fine.className;
    const candidates:{itemId:string;score:number}[]=[];
    const add=(ids:string[],score:number)=>{for(const itemId of ids)if(items.some(i=>i.id===itemId)&&!candidates.some(c=>c.itemId===itemId))candidates.push({itemId,score});};
    if(knownFine) add(fineIds[fine.className]||[],fine.score);
    else if(materialOnly) add(coarseIds[coarse.className]||[],coarse.score);
    else for(const c of fine.ranked.slice(0,3))add(fineIds[c.className]||[],c.score);
    // Only direct, compatible object labels preselect a booth item. A generic
    // plastic bottle does not establish transparent beverage PET; a carton label
    // does not distinguish sterilized milk cartons from aseptic cartons.
    const direct:Record<string,string>={"drink-can":"drink-can",cardboard:"cardboard","glass-bottle":"glass-bottle","plastic-container":"plastic-container"};
    const itemId=knownFine&&items.some(i=>i.id===direct[fine.className])?direct[fine.className]:null;
    let detail:string;
    if(knownFine){
      detail=`${label} 품목을 인식했어요. 실제 재질 표시와 내용물·오염 상태를 확인해 주세요.`;
      if(fine.className==="plastic-bottle")detail="플라스틱병을 인식했어요. 무색·투명한 생수·음료 PET병인지 확인하고 아래에서 골라 주세요.";
      if(fine.className==="carton")detail="종이팩을 인식했어요. 살균 우유팩인지 멸균팩인지 실제 표시를 확인해 주세요. 아래 살균 우유팩은 해당하는 경우에만 선택하세요.";
      if(fine.className==="paper-cup")detail="종이컵을 인식했어요. 오염 상태는 사진만으로 확정하지 않아요. 아래 심하게 오염된 종이컵은 실제 상태가 맞을 때만 고르세요.";
      if(fine.className==="glass-object"||fine.className==="glass-container")detail="유리 물품을 인식했어요. 음료 유리병인지 확인하고, 해당하는 경우에만 아래 품목을 선택하세요.";
      if(!itemId&&!candidates.length)detail+= " 이 품목은 현재 챌린지의 준비 품목에 없어요. 한국 분리배출 도우미에서 확인해 주세요.";
    }else if(materialOnly){
      detail=`${label} 범주까지 추정했어요. 세부 품목을 확정하지 못했으니 실제 물건을 선택해 주세요.`;
    }else if(disagreement){
      detail=`품목 모양은 ${head.names[fine.className]} 후보지만 재질은 ${materialNames[coarse.className]}로 추정해요. 두 판단이 달라 확인이 필요해요.`;
    }else{
      const reason=fine.reason==="similarity"?"학습한 사진들과 형태 차이가 커요":fine.reason==="margin"?"다른 후보와 점수 차이가 작아요":"품목을 정할 만큼 점수가 높지 않아요";
      detail=`${head.names[fine.className]} 후보를 찾았지만 ${reason}. 물건 하나를 크게 다시 찍거나 실제 품목을 직접 선택해 주세요.`;
    }
    return {itemId,confidence:materialOnly?coarse.score:fine.score,source:"kaggle",needsConfirmation:true,
      status,uncertain:status==="review",material:knownFine?head.coarseMapping[fine.className]:materialOnly?coarse.className:undefined,
      label,candidates:candidates.slice(0,4),alternatives:fine.ranked.slice(0,3).map(r=>({label:head.names[r.className]||r.className,score:r.score})),detail};
}

export async function recognizeImage(image: ImageInput, items: VisionItem[], onStatus?: (message: string) => void): Promise<Recognition> {
  const features = await extractImage(image,onStatus);
  const samples = await listSamples().catch(()=>[]);
  const baseline=baselinePrediction(features.baseline,items);
  const custom=nearestPrediction(features.embedding,samples,items);
  if(custom.itemId) return custom;
  try {
    onStatus?.("세부 품목과 재질을 확인하고 있어요…");
    const head=await loadWasteHead();
    // The held-out evaluation uses this same full-frame feature. An unevaluated
    // center crop no longer overrides a correct full-frame result.
    return recognitionFromEmbedding(features.embedding,head,items);
  }catch{
    return {...baseline,detail:baseline.detail+" 폐기물 전용 분류기를 불러오지 못해 기본 모델을 사용했어요."};
  }
}

async function saveSample(sample: VisionSample) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("samples", "readwrite");
    transaction.objectStore("samples").add(sample);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error?.name === "ConstraintError" ? new Error("이미 등록된 동일 이미지예요. 학습·평가에 중복으로 넣을 수 없어요.") : friendlyStorageError());
    transaction.onerror = () => { /* onabort reports the final error */ };
  });
}

async function hashFile(file: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("이미지 중복 검사는 HTTPS 또는 localhost 환경에서 사용할 수 있어요.");
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}

async function decodeFile(file: File): Promise<{ image: HTMLImageElement; release: () => void }> {
  if (!file.type.startsWith("image/")) throw new Error("JPG, PNG 등 이미지 파일을 선택해 주세요.");
  if (file.size > 20 * 1024 * 1024) throw new Error("이미지는 파일당 20MB 이하로 준비해 주세요.");
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 25_000_000) throw new Error("이미지 크기가 너무 커요. 2,500만 픽셀 이하로 줄여 주세요.");
    return { image, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error instanceof Error && error.message.includes("픽셀") ? error : new Error("사진을 열지 못했어요. JPG 또는 PNG 파일로 다시 시도해 주세요.");
  }
}

export async function addSample(file: File, itemId: string, split: "train" | "test", onStatus?: (message: string) => void): Promise<VisionSample> {
  const samples = await listSamples();
  if (samples.length >= MAX_SAMPLES) throw new Error("이 기기에는 최대 1,000장까지 저장할 수 있어요. 데이터 내보내기 후 일부를 삭제해 주세요.");
  const hash = await hashFile(file);
  if (samples.some(sample => sample.hash === hash)) throw new Error("이미 등록된 동일 이미지예요. 학습·평가에 중복으로 넣을 수 없어요.");
  const { image, release } = await decodeFile(file);
  try {
    const features = await extractImage(image, onStatus);
    const sample: VisionSample = { id: crypto.randomUUID(), hash, itemId, split, model: VISION_MODEL, ...features, createdAt: new Date().toISOString(), filename: file.name.slice(0, 160) };
    await saveSample(sample);
    notifyDataset();
    return sample;
  } finally {
    release();
  }
}

export async function exportSamples(): Promise<string> {
  return JSON.stringify({ version: 1, model: VISION_MODEL, exportedAt: new Date().toISOString(), samples: await listSamples() }, null, 2);
}

export async function importSamples(text: string, allowedItemIds: string[]): Promise<{ added: number; duplicates: number }> {
  if (text.length > 60_000_000) throw new Error("데이터 파일은 60MB 이하로 준비해 주세요.");
  let payload: { version?: number; model?: string; samples?: unknown[] };
  try { payload = JSON.parse(text); } catch { throw new Error("올바른 LOOP 데이터 JSON 파일이 아니에요."); }
  if (payload.version !== 1 || payload.model !== VISION_MODEL || !Array.isArray(payload.samples) || payload.samples.length > MAX_SAMPLES) throw new Error("이 버전과 호환되는 LOOP 이미지 특징 데이터가 아니에요.");
  const samples = await listSamples();
  const known = new Set(samples.map(sample => sample.hash));
  const candidates: VisionSample[] = [];
  let duplicates = 0;
  for (const value of payload.samples) {
    const sample = value as VisionSample;
    if (!sample || typeof sample.hash !== "string" || !/^[0-9a-f]{64}$/.test(sample.hash) || !allowedItemIds.includes(sample.itemId) || !["train", "test"].includes(sample.split) || sample.model !== VISION_MODEL || !Array.isArray(sample.embedding) || sample.embedding.length !== EMBEDDING_SIZE || sample.embedding.some(value => typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1) || !Array.isArray(sample.baseline) || sample.baseline.length > 5 || sample.baseline.some(value => !value || typeof value.className !== "string" || value.className.length > 300 || typeof value.probability !== "number" || !Number.isFinite(value.probability) || value.probability < 0 || value.probability > 1)) throw new Error("데이터에 잘못된 품목·이미지 특징이 있어 가져오기를 중단했어요.");
    const norm = Math.sqrt(sample.embedding.reduce((sum, value) => sum + value * value, 0));
    if (Math.abs(norm - 1) > 0.01) throw new Error("정규화되지 않은 이미지 특징이 포함되어 있어요.");
    if (known.has(sample.hash)) { duplicates++; continue; }
    known.add(sample.hash);
    candidates.push({ id: crypto.randomUUID(), hash: sample.hash, itemId: sample.itemId, split: sample.split, model: VISION_MODEL, embedding: sample.embedding, baseline: sample.baseline.map(({ className, probability }) => ({ className, probability })), createdAt: typeof sample.createdAt === "string" && !Number.isNaN(Date.parse(sample.createdAt)) ? sample.createdAt : new Date().toISOString(), filename: typeof sample.filename === "string" ? sample.filename.slice(0, 160) : "가져온 이미지" });
  }
  if (samples.length + candidates.length > MAX_SAMPLES) throw new Error("기존 데이터를 포함해 최대 1,000장까지 가져올 수 있어요.");
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("samples", "readwrite");
    const store = transaction.objectStore("samples");
    for (const sample of candidates) store.add(sample);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(new Error("데이터를 저장하지 못했어요. 다른 탭에서 같은 이미지를 추가했는지 확인해 주세요."));
  });
  notifyDataset();
  return { added: candidates.length, duplicates };
}

/** Evaluates both methods on exactly the same held-out images; never trains on them. */
export async function evaluateSamples(items: VisionItem[]): Promise<EvaluationResult> {
  const samples = await listSamples();
  const allowed = new Set(items.map(item => item.id));
  const train = samples.filter(sample => sample.split === "train" && allowed.has(sample.itemId));
  const trainHashes = new Set(train.map(sample => sample.hash));
  const test = samples.filter(sample => sample.split === "test" && allowed.has(sample.itemId) && !trainHashes.has(sample.hash));
  if (!train.length || !test.length) throw new Error("학습 이미지와 별도의 평가 이미지를 각각 1장 이상 추가해 주세요.");
  let baselineCorrect = 0, customCorrect = 0, baselineUnknown = 0, customUnknown = 0;
  const classes = new Map<string, EvaluationResult["classes"][number]>();
  const confusion = new Map<string, EvaluationResult["confusion"][number]>();
  for (const sample of test) {
    const baseline = baselinePrediction(sample.baseline, items);
    const custom = nearestPrediction(sample.embedding, train, items);
    const row = classes.get(sample.itemId) || { itemId: sample.itemId, count: 0, baselineCorrect: 0, customCorrect: 0 };
    row.count++;
    if (baseline.itemId === sample.itemId) { baselineCorrect++; row.baselineCorrect++; }
    if (custom.itemId === sample.itemId) { customCorrect++; row.customCorrect++; }
    if (!baseline.itemId) baselineUnknown++;
    if (!custom.itemId) customUnknown++;
    classes.set(sample.itemId, row);
    const key = `${sample.itemId}\u0000${custom.itemId ?? "unknown"}`;
    const pair = confusion.get(key) || { actual: sample.itemId, predicted: custom.itemId, count: 0 };
    pair.count++;
    confusion.set(key, pair);
  }
  return { testCount: test.length, trainCount: train.length, baselineAccuracy: baselineCorrect / test.length, customAccuracy: customCorrect / test.length, baselineUnknown, customUnknown, classes: [...classes.values()], confusion: [...confusion.values()].sort((a, b) => b.count - a.count), evaluatedAt: new Date().toISOString() };
}
