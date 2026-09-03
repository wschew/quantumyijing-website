export function dbOf(env){ return env.ENQUIRIES_DB || env.DB || null; }
const enc=new TextEncoder();
function bytesToHex(a){return [...new Uint8Array(a)].map(b=>b.toString(16).padStart(2,'0')).join('')}
export function randomToken(bytes=32){const a=new Uint8Array(bytes);crypto.getRandomValues(a);return bytesToHex(a)}
export async function sha256(v){return bytesToHex(await crypto.subtle.digest('SHA-256',enc.encode(String(v))))}
export async function hashPassword(password,saltHex,iterations=100000){
  const key=await crypto.subtle.importKey('raw',enc.encode(String(password)),'PBKDF2',false,['deriveBits']);
  const salt=new Uint8Array((saltHex.match(/.{1,2}/g)||[]).map(x=>parseInt(x,16)));
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256);
  return bytesToHex(bits);
}
export async function makePassword(password){const salt=randomToken(16),iterations=100000;return {salt,iterations,hash:await hashPassword(password,salt,iterations)}}
export function bearer(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
export async function requireCoach(request,env){
  const db=dbOf(env); if(!db)return {error:Response.json({error:'Database unavailable'},{status:503})};
  const token=bearer(request); if(!token)return {error:Response.json({error:'Unauthorized'},{status:401})};
  const th=await sha256(token),now=new Date().toISOString();
  const row=await db.prepare(`SELECT c.* FROM coach_sessions s JOIN coaches c ON c.id=s.coach_id WHERE s.token_hash=? AND s.revoked_at='' AND s.expires_at>? AND c.status='Approved' AND c.portal_enabled=1`).bind(th,now).first();
  if(!row)return {error:Response.json({error:'Unauthorized'},{status:401})};
  return {db,coach:row,token_hash:th};
}
