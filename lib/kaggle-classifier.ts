export type WasteHead={version:number;model:string;classes:string[];weights:number[][];bias:number[];centers:number[][];threshold:number;margin:number;minCosine:number};
export const materialNames:Record<string,string>={cardboard:'골판지',glass:'유리',metal:'금속',paper:'종이',plastic:'플라스틱',trash:'기타 폐기물'};
let headPromise:Promise<WasteHead>|null=null;
export async function loadWasteHead():Promise<WasteHead>{
 if(!headPromise)headPromise=fetch('/models/kaggle-waste/head.json').then(async r=>{if(!r.ok)throw Error('폐기물 분류기 다운로드 실패');const h:WasteHead=await r.json();if(h.version!==1||h.model!=='mobilenet-v2-alpha1.0-1280'||h.classes.length!==6||h.weights.length!==6||h.bias.length!==6||h.centers.length!==6||h.weights.some(r=>r.length!==1280||r.some(v=>!Number.isFinite(v)))||h.centers.some(r=>r.length!==1280||r.some(v=>!Number.isFinite(v))))throw Error('폐기물 분류기 형식 오류');return h;}).catch(e=>{headPromise=null;throw e});
 return headPromise;
}
export function predictMaterial(embedding:number[],head:WasteHead){
 if(embedding.length!==1280||embedding.some(v=>!Number.isFinite(v)))throw Error('이미지 특징 형식 오류');
 const logits=head.weights.map((r,i)=>r.reduce((s,w,j)=>s+w*embedding[j],head.bias[i]));const max=Math.max(...logits);const exps=logits.map(v=>Math.exp(v-max));const sum=exps.reduce((a,b)=>a+b,0);const scores=exps.map(v=>v/sum);
 const ranked=scores.map((score,i)=>({material:head.classes[i],score,index:i})).sort((a,b)=>b.score-a.score);
 const winner=ranked[0];const cosine=head.centers[winner.index].reduce((s,v,i)=>s+v*embedding[i],0);
 return {material:winner.material,score:winner.score,scores,ranked,cosine,accepted:winner.score>=head.threshold&&winner.score-ranked[1].score>=head.margin&&cosine>=head.minCosine};
}
