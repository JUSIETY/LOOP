import { env } from 'cloudflare:workers';
import { CATEGORY_IDS, type Config } from './types';

export class ApiError extends Error { constructor(public status:number,message:string){super(message);} }
export function database(){if(!env.DB)throw new ApiError(503,'기록 서버를 준비 중입니다. 잠시 후 다시 시도해 주세요.');return env.DB;}
export function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store'}});}
export function failure(error:unknown){if(error instanceof ApiError)return json({error:error.message},error.status);console.error('LOOP request failed',error instanceof Error ? error.message : 'unknown');return json({error:'서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'},500);}
export async function body(request:Request){
 const origin=request.headers.get('origin');
 if(origin && origin!==new URL(request.url).origin)throw new ApiError(403,'같은 사이트에서 요청해 주세요.');
 const data=await request.text();if(data.length>50000)throw new ApiError(413,'입력 데이터가 너무 큽니다.');
 try{const value=JSON.parse(data);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value as Record<string,unknown>;}catch{throw new ApiError(400,'입력 형식을 확인해 주세요.');}
}
function field(value:unknown,label:string,max:number,allowEmpty=false){if(typeof value!=='string'||value.length>max||(!allowEmpty&&!value.trim()))throw new ApiError(400,`${label}을(를) 확인해 주세요.`);return value.trim();}
export function validateConfig(value:unknown):Config{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ApiError(400,'운영 기준을 확인해 주세요.');
 const v=value as Record<string,unknown>;if(!Array.isArray(v.items)||v.items.length<5||v.items.length>30)throw new ApiError(400,'품목은 5개 이상, 30개 이하로 준비해 주세요.');
 const sourceUrl=field(v.sourceUrl,'출처 주소',1000,true);if(sourceUrl){try{const url=new URL(sourceUrl);if(!['https:','http:'].includes(url.protocol))throw new Error();}catch{throw new ApiError(400,'출처는 http 또는 https 주소로 입력해 주세요.');}}
 const seen=new Set<string>();const items=v.items.map(item=>{if(!item||typeof item!=='object')throw new ApiError(400,'품목을 확인해 주세요.');const i=item as Record<string,unknown>;const id=field(i.id,'품목 ID',50);if(!/^[a-zA-Z0-9_-]+$/.test(id)||seen.has(id))throw new ApiError(400,'품목 ID는 중복 없이 영문·숫자로 입력해 주세요.');seen.add(id);if(!CATEGORY_IDS.includes(i.category as never))throw new ApiError(400,'배출 분류를 확인해 주세요.');return{id,name:field(i.name,'품목 이름',80),emoji:field(i.emoji,'품목 아이콘',16),category:i.category as Config['items'][number]['category'],reason:field(i.reason,'정답 이유',600),tip:field(i.tip,'배출 방법',400,true)};});
 return{title:field(v.title,'행사 이름',80),region:field(v.region,'학교·지역',100),sourceUrl,verified:v.verified===true,items};
}
export function roomCode(value:string){if(!/^[A-Z2-9]{6}$/.test(value))throw new ApiError(404,'행사 코드를 찾지 못했어요.');return value;}
export async function hash(value:string){const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(data)).map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function getRoom(code:string){const room=await database().prepare('SELECT id, config, admin_hash, revision FROM rooms WHERE id = ?').bind(roomCode(code)).first<{id:string;config:string;admin_hash:string;revision:number}>();if(!room)throw new ApiError(404,'행사 코드를 찾지 못했어요. 코드를 확인해 주세요.');return room;}
export async function isAdmin(request:Request,adminHash:string){const token=request.headers.get('authorization')?.replace(/^Bearer /,'');return !!token && token.length<200 && await hash(token)===adminHash;}
export async function requireAdmin(request:Request,adminHash:string){if(!await isAdmin(request,adminHash))throw new ApiError(403,'이 행사를 만든 기기에서 운영 설정을 변경해 주세요.');}
export function participantName(value:unknown){if(value===undefined||value==='')return`참가자 ${String(Math.floor(Math.random()*9000)+1000)}`;const name=field(value,'별명',16).replace(/[\u0000-\u001F\u007F]/g,'').trim();if(!name)throw new ApiError(400,'별명을 확인해 주세요.');return name;}
export function answerInput(v:Record<string,unknown>){if(typeof v.sessionId!=='string'||!/^[a-f0-9-]{36}$/.test(v.sessionId))throw new ApiError(400,'참가 정보를 확인해 주세요.');if(typeof v.round!=='number'||!Number.isInteger(v.round)||v.round<0||v.round>4)throw new ApiError(400,'문제 순서를 확인해 주세요.');if(typeof v.itemId!=='string'||v.itemId.length>50||!CATEGORY_IDS.includes(v.choice as never))throw new ApiError(400,'품목과 배출 방법을 확인해 주세요.');return{sessionId:v.sessionId,round:v.round,itemId:v.itemId,choice:v.choice as string};}
