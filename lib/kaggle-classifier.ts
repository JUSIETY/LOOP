export type LinearWasteHead = {
  classes: string[]; weights: number[][]; bias: number[]; centers: number[][];
  minCosines: number[]; threshold: number; margin: number; temperature: number;
};
export type WasteHead = {
  version: 2; model: string; fine: LinearWasteHead; coarse: LinearWasteHead;
  names: Record<string,string>; coarseMapping: Record<string,string>;
};
export const materialNames: Record<string,string> = {
  cardboard:'골판지',glass:'유리',metal:'금속',paper:'종이',plastic:'플라스틱',trash:'기타 폐기물',
  food:'음식물·식품 잔재',vegetation:'식물성 잔재',ceramic:'도자기',vinyl:'비닐·플라스틱 봉지',
  carton:'종이팩·멸균팩',textile:'의류',shoe:'신발',medical:'위생·의료용품',electronics:'전자제품',
  battery:'건전지·배터리',hazardous:'유해물질 용기',other:'기타 물품',foam:'스티로폼',
};
let headPromise: Promise<WasteHead> | null = null;
function validLinear(head: LinearWasteHead) {
  if (!head || !Array.isArray(head.classes) || head.classes.length<2 || head.classes.length>100) return false;
  const n=head.classes.length;
  return head.weights?.length===n && head.bias?.length===n && head.centers?.length===n && head.minCosines?.length===n &&
    head.weights.every(r=>r.length===1280&&r.every(Number.isFinite)) &&
    head.centers.every(r=>r.length===1280&&r.every(Number.isFinite)) &&
    [...head.bias,...head.minCosines,head.threshold,head.margin,head.temperature].every(Number.isFinite) &&
    head.temperature>0 && head.threshold>=0 && head.threshold<=1;
}
export async function loadWasteHead(): Promise<WasteHead> {
  if (!headPromise) headPromise=fetch('/models/kaggle-waste-v2/head.json').then(async response=>{
    if (!response.ok) throw Error('폐기물 분류기 다운로드 실패');
    const head: WasteHead=await response.json();
    if(head.version!==2 || head.model!=='mobilenet-v2-alpha1.0-1280' || !validLinear(head.fine) || !validLinear(head.coarse) || !head.names || !head.coarseMapping) throw Error('폐기물 분류기 형식 오류');
    return head;
  }).catch(error=>{headPromise=null;throw error;});
  return headPromise;
}
export function predictLinear(embedding: number[],head: LinearWasteHead) {
  if(embedding.length!==1280 || embedding.some(v=>!Number.isFinite(v))) throw Error('이미지 특징 형식 오류');
  const logits=head.weights.map((r,i)=>r.reduce((sum,w,j)=>sum+w*embedding[j],head.bias[i])/head.temperature);
  const max=Math.max(...logits),exps=logits.map(v=>Math.exp(v-max)),sum=exps.reduce((a,b)=>a+b,0);
  const scores=exps.map(v=>v/sum);
  const ranked=scores.map((score,index)=>({className:head.classes[index],score,index})).sort((a,b)=>b.score-a.score);
  const winner=ranked[0],cosine=head.centers[winner.index].reduce((s,v,i)=>s+v*embedding[i],0);
  const reason=winner.score<head.threshold?'score':winner.score-ranked[1].score<head.margin?'margin':cosine<head.minCosines[winner.index]?'similarity':null;
  return {className:winner.className,score:winner.score,scores,ranked,cosine,accepted:reason===null,reason};
}
export function predictWaste(embedding: number[],head: WasteHead) {
  const fine=predictLinear(embedding,head.fine),coarse=predictLinear(embedding,head.coarse);
  const disagreement=fine.accepted && coarse.accepted && head.coarseMapping[fine.className]!==coarse.className;
  return {fine,coarse,disagreement};
}
