import { getDB } from './_db.js';
const FROM='Quantum YiJing International Academy <info@quantumyijing.com>';
const ADMIN='info@quantumyijing.com';
function c(v,m=200){return String(v??'').trim().slice(0,m)}
function e(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}
function esc(v){return String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]))}
async function mail(key,p){if(!key)return;const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(p)});if(!r.ok)console.error('affiliate mail',r.status,await r.text())}
export async function onRequestPost({request,env}){
 const db=getDB(env); if(!db)return Response.json({error:'Affiliate database unavailable.'},{status:503});
 try{
  const b=await request.json(),full=c(b.full_name,120),display=c(b.display_name,120),email=c(b.email,160).toLowerCase(),phone=c(b.phone,60),country=c(b.country,100),type=c(b.account_type,20),bank=c(b.bank_name,120),holder=c(b.bank_account_name,160),acct=c(b.bank_account_number,80),lang=c(b.language,5)==='zh'?'zh':'en';
  if(!full||!e(email)||!phone||!country||!bank||!holder||!acct)return Response.json({error:'Please complete all required fields.'},{status:400});
  if(!['Individual','Company'].includes(type))return Response.json({error:'Invalid account type.'},{status:400});
  if(b.privacy_consent!==true||b.terms_accepted!==true)return Response.json({error:'Privacy consent and Affiliate Programme terms must be accepted.'},{status:400});
  const ex=await db.prepare("SELECT id,status FROM affiliates WHERE lower(email)=lower(?) AND status IN ('Pending','Approved') ORDER BY id DESC LIMIT 1").bind(email).first();
  if(ex)return Response.json({error:ex.status==='Approved'?'An approved affiliate account already exists for this email.':'An affiliate application for this email is already pending review.'},{status:409});
  const ref='AFFAPP-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomUUID().slice(0,8).toUpperCase(),pending='PENDING-'+crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase(),now=new Date().toISOString();
  const r=await db.prepare("INSERT INTO affiliates (affiliate_code,full_name,display_name,email,phone,country,account_type,bank_name,bank_account_name,bank_account_number,status,privacy_consent,terms_accepted,terms_accepted_at,joined_at,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'Pending',1,1,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").bind(pending,full,display,email,phone,country,type,bank,holder,acct,now,now,`Application reference: ${ref}; Language: ${lang}`).run();
  const origin=new URL(request.url).origin;
  await mail(env.RESEND_API_KEY,{from:FROM,to:[ADMIN],subject:`Action Required: New Affiliate Application — ${full}`,html:`<h2>New Affiliate Application — Pending Approval</h2><p><b>Reference:</b> ${esc(ref)}</p><p><b>Name:</b> ${esc(full)}</p><p><b>Email:</b> ${esc(email)}</p><p><b>Phone:</b> ${esc(phone)}</p><p><b>Country:</b> ${esc(country)}</p><p><b>Account Type:</b> ${esc(type)}</p><p><a href="${origin}/admin-affiliates.html">Open QY Affiliate Admin</a></p>`});
  await mail(env.RESEND_API_KEY,{from:FROM,to:[email],subject:'Quantum YiJing® Affiliate Application Received / 联盟申请已收到',html:`<h2>Affiliate Application Received</h2><p>Dear ${esc(full)},</p><p>Thank you for applying to join the Quantum YiJing® Affiliate Programme.</p><p><b>Application Reference:</b> ${esc(ref)}</p><p>Your application is pending review. We will email you again after review.</p><hr><h2>联盟申请已收到</h2><p>${esc(full)} 您好：</p><p>感谢您申请加入 Quantum YiJing® 量子易经联盟计划。</p><p><b>申请参考编号：</b> ${esc(ref)}</p><p>您的申请正在审核中。审核完成后，我们将再次以电邮通知您。</p>`});
  return Response.json({ok:true,application_reference:ref,affiliate_record_id:r.meta?.last_row_id??null},{status:201});
 }catch(err){console.error('affiliate apply failed',err);return Response.json({error:'Server error while saving affiliate application.'},{status:500})}
}
