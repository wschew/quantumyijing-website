import { getDB } from './_db.js';
function clean(v,m=200){return String(v??'').trim().slice(0,m)}
function emailOk(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}
function ref(){return 'AFFAPP-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomUUID().slice(0,8).toUpperCase()}
function pending(){return 'PENDING-'+crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase()}
export async function onRequestPost({request,env}){
  const db=getDB(env);
  if(!db) return Response.json({error:'Affiliate database is not available in this environment.'},{status:503});
  try{
    const b=await request.json();
    const full=clean(b.full_name,120),display=clean(b.display_name,120),email=clean(b.email,160).toLowerCase(),phone=clean(b.phone,60),country=clean(b.country,100),type=clean(b.account_type,20),bank=clean(b.bank_name,120),holder=clean(b.bank_account_name,160),acct=clean(b.bank_account_number,80),lang=clean(b.language,5)==='zh'?'zh':'en';
    if(!full||!emailOk(email)||!phone||!country||!bank||!holder||!acct) return Response.json({error:lang==='zh'?'请填写所有必填资料。':'Please complete all required fields.'},{status:400});
    if(!['Individual','Company'].includes(type)) return Response.json({error:'Invalid account type.'},{status:400});
    if(b.privacy_consent!==true||b.terms_accepted!==true) return Response.json({error:lang==='zh'?'必须同意隐私及联盟计划条款。':'Privacy consent and Affiliate Programme terms must be accepted.'},{status:400});
    const exists=await db.prepare(`SELECT id,status FROM affiliates WHERE lower(email)=lower(?) AND status IN ('Pending','Approved') ORDER BY id DESC LIMIT 1`).bind(email).first();
    if(exists) return Response.json({error:exists.status==='Approved'?'An approved affiliate account already exists for this email.':'An affiliate application for this email is already pending review.'},{status:409});
    const appref=ref(),now=new Date().toISOString();
    const r=await db.prepare(`INSERT INTO affiliates (affiliate_code,full_name,display_name,email,phone,country,account_type,bank_name,bank_account_name,bank_account_number,status,privacy_consent,terms_accepted,terms_accepted_at,joined_at,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'Pending',1,1,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`)
      .bind(pending(),full,display,email,phone,country,type,bank,holder,acct,now,now,`Application reference: ${appref}; Language: ${lang}`).run();
    return Response.json({ok:true,application_reference:appref,affiliate_record_id:r.meta?.last_row_id??null},{status:201});
  }catch(e){
    console.error('affiliate apply failed',e);
    return Response.json({error:'Server error while saving affiliate application.'},{status:500});
  }
}
