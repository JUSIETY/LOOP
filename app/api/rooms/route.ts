import { body, database, failure, hash, json, validateConfig } from '@/lib/game';
export async function POST(request:Request){try{
 const config=validateConfig((await body(request)).config);const adminToken=crypto.randomUUID()+crypto.randomUUID();const adminHash=await hash(adminToken);const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
 for(let tries=0;tries<5;tries++){const bytes=crypto.getRandomValues(new Uint8Array(6));const room=Array.from(bytes).map(n=>alphabet[n%alphabet.length]).join('');const result=await database().prepare('INSERT OR IGNORE INTO rooms (id, admin_hash, config, created_at) VALUES (?, ?, ?, ?)').bind(room,adminHash,JSON.stringify(config),new Date().toISOString()).run();if(result.meta.changes)return json({room,adminToken,config,configVersion:1},201);}
 return json({error:'행사 코드를 생성하지 못했어요. 다시 시도해 주세요.'},503);
}catch(e){return failure(e);}}
