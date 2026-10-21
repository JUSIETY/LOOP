import { ApiError, answerInput, body, database, failure, getRoom, json } from '@/lib/game';
import type {Config,RoomContext} from '@/lib/types';
type AnswerRow={item_id:string;choice:string;correct:number;category:string;reason:string};
export async function POST(request:Request,context:RoomContext){try{
 const room=await getRoom((await context.params).room);const input=answerInput(await body(request));const db=database();
 const session=await db.prepare('SELECT config FROM sessions WHERE id = ? AND room_id = ?').bind(input.sessionId,room.id).first<{config:string}>();if(!session)throw new ApiError(404,'참가 정보를 찾지 못했어요. 새로 시작해 주세요.');
 const config=JSON.parse(session.config) as Config;const item=config.items.find(i=>i.id===input.itemId);if(!item)throw new ApiError(400,'이 행사에서 준비한 품목을 선택해 주세요.');
 const prior=await db.prepare('SELECT item_id, choice, correct, category, reason FROM answers WHERE session_id = ? AND round = ?').bind(input.sessionId,input.round).first<AnswerRow>();
 if(prior && (prior.item_id!==input.itemId||prior.choice!==input.choice))throw new ApiError(409,'이미 채점한 문제예요. 다음 문제로 진행해 주세요.');
 if(!prior){
  const count=await db.prepare('SELECT COUNT(*) AS n FROM answers WHERE session_id = ?').bind(input.sessionId).first<{n:number}>();if(count?.n!==input.round)throw new ApiError(409,'문제 순서가 맞지 않아요. 현재 문제부터 진행해 주세요.');
  const duplicate=await db.prepare('SELECT id FROM answers WHERE session_id = ? AND item_id = ?').bind(input.sessionId,item.id).first();if(duplicate)throw new ApiError(409,'이미 도전한 품목이에요. 다른 품목을 골라 주세요.');
  await db.prepare(`INSERT OR IGNORE INTO answers (id,room_id,session_id,round,item_id,item_name,choice,category,correct,reason,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM answers WHERE session_id = ?) = ?`).bind(crypto.randomUUID(),room.id,input.sessionId,input.round,item.id,item.name,input.choice,item.category,input.choice===item.category?1:0,item.reason,new Date().toISOString(),input.sessionId,input.round).run();
 }
 const recorded=await db.prepare('SELECT item_id, choice, correct, category, reason FROM answers WHERE session_id = ? AND round = ?').bind(input.sessionId,input.round).first<AnswerRow>();if(!recorded||recorded.item_id!==input.itemId||recorded.choice!==input.choice)throw new ApiError(409,'다른 응답이 먼저 기록됐어요. 진행 상태를 확인해 주세요.');
 const total=await db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(correct),0) AS correct FROM answers WHERE session_id = ?').bind(input.sessionId).first<{n:number;correct:number}>();
 return json({correct:recorded.correct===1,score:recorded.correct*20,totalScore:(total?.correct??0)*20,reason:recorded.reason,category:recorded.category,answered:total?.n??0,complete:total?.n===5});
}catch(e){return failure(e);}}
