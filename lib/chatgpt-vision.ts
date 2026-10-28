import type { Recognition, VisionItem } from './vision';

export function needsChatGptWebReview(result: Recognition): boolean {
  return result.source !== 'chatgpt-web' && (
    result.label.includes('용도 확인이 필요한 물품') ||
    result.status === 'review' || result.uncertain === true
  );
}

export function resizedDimensions(width: number, height: number, max = 1024) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw Error('사진 크기를 읽지 못했어요. 다시 촬영해 주세요.');
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function chatGptPhotoCanvas(source: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const size = resizedDimensions('naturalWidth' in source ? source.naturalWidth : source.width, 'naturalHeight' in source ? source.naturalHeight : source.height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width; canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw Error('사진을 준비하지 못했어요. 다시 촬영해 주세요.');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, size.width, size.height);
  context.drawImage(source, 0, 0, size.width, size.height);
  return canvas;
}

export const chatGptMaterials = ['paper','cardboard','carton','plastic','vinyl','glass','metal','ceramic','foam','textile','food','vegetation','battery','electronics','medical','hazardous','other','unknown'] as const;
export function chatGptWebPrompt(items: VisionItem[]): string {
  return `첨부한 폐품 사진의 보이는 물건 종류를 한국어로 분류해 줘. 용도·내용물·숨은 재질·오염 상태는 추측하지 말고, 모르면 확인 필요라고 해. 배출 정답이나 점수는 판단하지 마. 다음 JSON만 출력해 줘: {"label":"보이는 물건 이름(100자 이내)","itemId":null,"material":"unknown","detail":"판단 이유와 직접 확인할 점(600자 이내)"}. itemId는 실제 사진과 일치하는 아래 후보의 id 또는 null만 사용해. material은 ${chatGptMaterials.join(', ')} 중 하나. 후보: ${items.map(item=>`${item.id}=${item.name}`).join('; ')}.`;
}

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function onlyKeys(value: Record<string, unknown>, allowed: string[]) { return Object.keys(value).every(key=>allowed.includes(key)); }
export function parseChatGptWebReply(text: string, items: VisionItem[]): Recognition {
  if (!text.trim() || text.length > 10000) throw Error('ChatGPT의 JSON 답변을 10,000자 이내로 붙여넣어 주세요.');
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let result: unknown;
  try { result = JSON.parse(cleaned); } catch { throw Error('답변의 JSON 부분만 붙여넣어 주세요. 중괄호 { }와 따옴표를 확인해 주세요.'); }
  if (!object(result) || !onlyKeys(result,['label','itemId','material','detail','candidates']) || typeof result.label !== 'string' || !result.label.trim() || result.label.length > 100 || typeof result.detail !== 'string' || !result.detail.trim() || result.detail.length > 600) throw Error('label(품목 이름)과 detail(확인할 점)이 있는 올바른 JSON 답변이 필요해요.');
  const known = new Set(items.map(item => item.id));
  if (result.itemId !== null && (typeof result.itemId !== 'string' || !known.has(result.itemId))) throw Error('itemId는 안내된 품목 id 또는 null이어야 해요. ChatGPT에 질문을 다시 보내 주세요.');
  if (typeof result.material !== 'string' || !chatGptMaterials.includes(result.material as typeof chatGptMaterials[number])) throw Error('material은 질문에 안내된 재질 이름 중 하나여야 해요.');
  const candidates: {itemId:string;score:number}[] = [];
  if (result.candidates !== undefined) {
    if (!Array.isArray(result.candidates) || result.candidates.length > 4) throw Error('품목 후보는 최대 4개까지 입력할 수 있어요.');
    for (const candidate of result.candidates) {
      if (!object(candidate) || !onlyKeys(candidate,['itemId','score']) || typeof candidate.itemId !== 'string' || !known.has(candidate.itemId) || typeof candidate.score !== 'number' || !Number.isFinite(candidate.score) || candidate.score < 0 || candidate.score > 1) throw Error('품목 후보의 id와 점수(0~1)를 확인해 주세요.');
      if (!candidates.some(c=>c.itemId===candidate.itemId)) candidates.push({itemId:candidate.itemId,score:candidate.score});
    }
  }
  const itemId=result.itemId as string|null;
  return {itemId,source:'chatgpt-web',confidence:0,label:result.label.trim(),detail:result.detail.trim(),material:result.material==='unknown'?undefined:result.material,status:itemId?'item':'review',uncertain:true,needsConfirmation:true,candidates};
}
