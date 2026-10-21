"use client";

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
  source: "custom" | "baseline";
  label: string;
  needsConfirmation: boolean;
  detail: string;
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
  } catch {
    throw new Error("AI 모델을 불러오지 못했어요. 사이트 연결을 확인한 뒤 다시 시도해 주세요. 품목 직접 선택으로 챌린지는 계속할 수 있어요.");
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

// ImageNet labels do not cover every waste class. Unmapped labels remain unknown.
const keywordMap: { imageNet: RegExp; item: RegExp }[] = [
  { imageNet: /water bottle|pop bottle|soda bottle/, item: /pet|페트|생수병|플라스틱.*병/i },
  { imageNet: /beer bottle|wine bottle|whiskey jug/, item: /glass|유리/i },
  { imageNet: /tin can/, item: /can|캔/i },
  { imageNet: /carton/, item: /milk|carton|우유|종이팩/i },
  { imageNet: /cardboard|crate/, item: /box|cardboard|상자|골판지/i },
  { imageNet: /paper towel|toilet tissue|toilet paper/, item: /tissue|휴지|티슈/i },
  { imageNet: /plastic bag/, item: /bag|snack|wrapper|비닐|과자|봉지/i },
  { imageNet: /paper cup/, item: /cup|종이컵/i },
];

export function baselinePrediction(predictions: BaselineClass[], items: VisionItem[]): Recognition {
  const scores = new Map<string, number>();
  for (const prediction of predictions) {
    for (const mapping of keywordMap) {
      if (!mapping.imageNet.test(prediction.className.toLowerCase())) continue;
      const match = items.find(item => mapping.item.test(`${item.id} ${item.name}`));
      if (match) scores.set(match.id, (scores.get(match.id) || 0) + prediction.probability);
    }
  }
  const best = [...scores].sort((a, b) => b[1] - a[1])[0];
  return {
    itemId: best?.[0] ?? null,
    confidence: Math.min(1, best?.[1] ?? 0),
    source: "baseline",
    label: predictions[0]?.className || "인식 결과 없음",
    needsConfirmation: !best || best[1] < 0.65,
    detail: "범용 ImageNet 분류 결과를 부스 품목에 연결한 후보예요. 재질·오염 상태는 직접 확인해 주세요.",
  };
}

export function nearestPrediction(embedding: number[], train: VisionSample[], items: VisionItem[]): Recognition {
  const allowedIds = new Set(items.map(item => item.id));
  const neighbors = train
    .filter(sample => sample.split === "train" && sample.model === VISION_MODEL && allowedIds.has(sample.itemId) && sample.embedding.length === embedding.length)
    .map(sample => ({ itemId: sample.itemId, score: sample.embedding.reduce((sum, value, i) => sum + value * embedding[i], 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (!neighbors.length) return { itemId: null, confidence: 0, source: "custom", label: "학습 이미지 없음", needsConfirmation: true, detail: "먼저 AI 실험실에서 품목별 학습 이미지를 추가해 주세요." };
  const votes = new Map<string, number>();
  let weightSum = 0;
  for (const neighbor of neighbors) {
    const weight = Math.exp(Math.max(-1, Math.min(1, neighbor.score)) * 8);
    votes.set(neighbor.itemId, (votes.get(neighbor.itemId) || 0) + weight);
    weightSum += weight;
  }
  const winner = [...votes].sort((a, b) => b[1] - a[1])[0];
  const similarity = Math.max(0, Math.min(1, neighbors.find(neighbor => neighbor.itemId === winner[0])!.score));
  const share = winner[1] / weightSum;
  const enoughClasses = new Set(train.map(sample => sample.itemId)).size >= 2;
  const classSampleCount = train.filter(sample => sample.itemId === winner[0]).length;
  return {
    itemId: similarity < 0.35 ? null : winner[0],
    confidence: similarity * share,
    source: "custom",
    label: items.find(item => item.id === winner[0])?.name || winner[0],
    needsConfirmation: similarity < 0.65 || share < 0.7 || !enoughClasses || classSampleCount < 3,
    detail: "직접 수집한 학습 이미지와 특징을 비교한 k-NN 후보예요. 표시값은 유사도×이웃 투표 비율이며 정답 확률이 아니에요.",
  };
}

export async function recognizeImage(image: ImageInput, items: VisionItem[], onStatus?: (message: string) => void): Promise<Recognition> {
  const features = await extractImage(image, onStatus);
  // No persistent storage is necessary for the pretrained baseline to work.
  const samples = await listSamples().catch(() => []);
  const train = samples.filter(sample => sample.split === "train");
  return train.length ? nearestPrediction(features.embedding, train, items) : baselinePrediction(features.baseline, items);
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
