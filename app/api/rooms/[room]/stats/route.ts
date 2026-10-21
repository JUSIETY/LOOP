import { database, failure, getRoom, isAdmin, json } from '@/lib/game';
import type {RoomContext} from '@/lib/types';
export async function GET(request:Request,context:RoomContext){try{
 const room=await getRoom((await context.params).room);const db=database();
 const [totals,participants,rank,items,choices,versionRows]=await Promise.all([
 db.prepare('SELECT COUNT(*) AS answers, COALESCE(SUM(correct),0) AS correct FROM answers WHERE room_id = ?').bind(room.id).first<{answers:number;correct:number}>(),
 db.prepare('SELECT COUNT(*) AS participants FROM sessions WHERE room_id = ?').bind(room.id).first<{participants:number}>(),
 db.prepare(`SELECT s.id, s.name, COALESCE(SUM(a.correct),0)*20 AS score, COUNT(a.id) AS answered, MAX(a.created_at) AS finishedAt FROM sessions s LEFT JOIN answers a ON a.session_id = s.id WHERE s.room_id = ? GROUP BY s.id ORDER BY score DESC, answered DESC, finishedAt ASC LIMIT 100`).bind(room.id).all(),
 db.prepare('SELECT item_id AS itemId, MAX(item_name) AS name, COUNT(*) AS total, SUM(1-correct) AS wrong FROM answers WHERE room_id = ? GROUP BY item_id ORDER BY wrong DESC, total DESC').bind(room.id).all<{itemId:string;name:string;total:number;wrong:number}>(),
 db.prepare('SELECT item_id, choice, COUNT(*) AS n FROM answers WHERE room_id = ? AND correct = 0 GROUP BY item_id, choice ORDER BY n DESC, choice ASC').bind(room.id).all<{item_id:string;choice:string;n:number}>(),
 db.prepare(`SELECT s.config_version AS version, MAX(json_extract(s.config, '$.region')) AS region, COUNT(a.id) AS answers, COALESCE(SUM(a.correct),0) AS correct FROM sessions s LEFT JOIN answers a ON a.session_id = s.id WHERE s.room_id = ? GROUP BY s.config_version ORDER BY s.config_version ASC`).bind(room.id).all<{version:number;region:string;answers:number;correct:number}>(),
 ]);
 const completedRow=await db.prepare('SELECT COUNT(*) AS n FROM (SELECT session_id FROM answers WHERE room_id = ? GROUP BY session_id HAVING COUNT(*) = 5)').bind(room.id).first<{n:number}>();
 const confused=items.results.filter(i=>i.wrong>0).map(i=>({...i,rate:i.total?Math.round(i.wrong/i.total*100):0,topWrongChoice:choices.results.find(c=>c.item_id===i.itemId)?.choice??null}));
 const admin=await isAdmin(request,room.admin_hash);const includeRecords=admin && new URL(request.url).searchParams.get('records')==='1';let records:unknown[]|undefined;
 if(includeRecords){records=(await db.prepare(`SELECT s.name, s.config_version AS configVersion, json_extract(s.config, '$.title') AS configTitle, json_extract(s.config, '$.region') AS region, a.item_id AS itemId, a.item_name AS itemName, a.choice, a.category, a.correct, a.created_at AS at, a.round FROM answers a JOIN sessions s ON s.id = a.session_id WHERE a.room_id = ? ORDER BY a.created_at DESC LIMIT 10000`).bind(room.id).all()).results;}
 const answers=totals?.answers??0,correct=totals?.correct??0;
 const versions=versionRows.results.map(v=>({...v,accuracy:v.answers?Math.round(v.correct/v.answers*100):0}));
 return json({participants:participants?.participants??0,completed:completedRow?.n??0,answers,correct,accuracy:answers?Math.round(correct/answers*100):0,ranking:rank.results.map(({id,...r})=>r),confused,versions,records,recordsLimit:includeRecords?10000:undefined,updatedAt:new Date().toISOString()});
}catch(e){return failure(e);}}
