import {dbOf,hashPassword,randomToken,sha256} from './_auth.js';
export async function onRequestPost({request,env}){
  const db=dbOf(env); if(!db)return Response.json({error:'Database unavailable'},{status:503});
  let b;try{b=await request.json()}catch{return Response.json({error:'Invalid request'},{status:400})}
  const email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');
  const row=await db.prepare(`SELECT c.id,c.status,c.portal_enabled,cc.password_salt,cc.password_hash,cc.password_iterations FROM coaches c JOIN coach_credentials cc ON cc.coach_id=c.id WHERE lower(c.email)=?`).bind(email).first();
  if(!row||row.status!=='Approved'||!Number(row.portal_enabled))return Response.json({error:'Invalid login or portal access is not enabled.'},{status:401});
  const got=await hashPassword(password,row.password_salt,Number(row.password_iterations||100000));
  if(got!==row.password_hash)return Response.json({error:'Invalid login or portal access is not enabled.'},{status:401});
  const token=randomToken(32),th=await sha256(token),created=new Date(),expires=new Date(created.getTime()+30*24*3600*1000);
  await db.prepare(`INSERT INTO coach_sessions(coach_id,token_hash,created_at,expires_at,revoked_at) VALUES(?,?,?,?, '')`).bind(row.id,th,created.toISOString(),expires.toISOString()).run();
  return Response.json({ok:true,token,expires_at:expires.toISOString()},{headers:{'cache-control':'no-store'}});
}
