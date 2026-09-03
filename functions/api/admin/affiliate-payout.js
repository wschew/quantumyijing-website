function dbOf(env){return env.ENQUIRIES_DB||env.DB||null}
function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function mail(key,p){if(!key)return;const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(p)});if(!r.ok)console.error('payout email',r.status,await r.text())}
export async function onRequestPost({request,env}){
 if(!ok(request,env))return Response.json({error:'Unauthorized'},{status:401});
 const db=dbOf(env);if(!db)return Response.json({error:'Database unavailable'},{status:503});
 const b=await request.json(),id=Number(b.payout_id),date=String(b.payment_date||'').trim(),ref=String(b.payment_reference||'').trim();
 if(!Number.isInteger(id)||!date)return Response.json({error:'Payout ID and payment date required'},{status:400});
const p=await db.prepare(`
  SELECT
    p.*,
    a.full_name,
    a.email,
    a.affiliate_code,
    a.is_test_account
  FROM affiliate_payouts p
  JOIN affiliates a ON a.id=p.affiliate_id
  WHERE p.id=?
`).bind(id).first();
 if(!p)return Response.json({error:'Payout not found'},{status:404});
 if(Number(p.is_test_account)===1){
  return Response.json({
    error:'QA/test affiliate payouts cannot be marked as paid.'
  },{status:400});
}
 await db.prepare("UPDATE affiliate_payouts SET status='Paid',payment_date=?,payment_reference=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(date,ref,id).run();
 await db.prepare("UPDATE affiliate_commissions SET status='Paid',paid_at=?,updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT commission_id FROM affiliate_payout_items WHERE payout_id=?)").bind(date,id).run();
 await mail(env.RESEND_API_KEY,{from:'Quantum YiJing International Academy <info@quantumyijing.com>',to:[p.email],subject:'Quantum YiJing® Affiliate Commission Paid / 联盟佣金已支付',html:`<h2>Affiliate Commission Payment Completed</h2><p>Dear ${esc(p.full_name)},</p><p><b>Affiliate Code:</b> ${esc(p.affiliate_code)}</p><p><b>Period:</b> ${esc(p.payout_period)}</p><p><b>Commission Paid:</b> ${esc(p.currency)} ${Number(p.total_commission||0).toFixed(2)}</p><p><b>Payment Date:</b> ${esc(date)}</p><p><b>Payment Reference:</b> ${esc(ref||'-')}</p><hr><h2>联盟佣金已支付</h2><p><b>联盟代码：</b> ${esc(p.affiliate_code)}</p><p><b>付款日期：</b> ${esc(date)}</p><p><b>付款参考编号：</b> ${esc(ref||'-')}</p>`});
 return Response.json({ok:true});
}
