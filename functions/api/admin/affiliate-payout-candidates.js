function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
export async function onRequestGet({request,env}){
 if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
 const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});
 const u=new URL(request.url), affiliateId=Number(u.searchParams.get('affiliate_id')||0), period=String(u.searchParams.get('period')||'').slice(0,7);
 if(!affiliateId||!/^\d{4}-\d{2}$/.test(period)) return Response.json({error:'affiliate_id and period are required.'},{status:400});
 const a=await db.prepare(`SELECT id,affiliate_code,full_name,email,bank_name,bank_account_name,bank_account_number FROM affiliates WHERE id=?`).bind(affiliateId).first();
 if(!a) return Response.json({error:'Affiliate not found.'},{status:404});
 const rows=await db.prepare(`SELECT ac.id,ac.order_id,ac.product_id,ac.order_reference,ac.customer_name,ac.product_name,ac.gross_sale,ac.currency,ac.commission_rate,ac.commission_amount,ac.status,ac.created_at
 FROM affiliate_commissions ac LEFT JOIN affiliate_payout_items api ON api.commission_id=ac.id
 WHERE ac.affiliate_id=? AND substr(ac.created_at,1,7)=? AND ac.status IN ('Approved','Payable') AND api.id IS NULL ORDER BY ac.created_at,ac.id`).bind(affiliateId,period).all();
 const items=rows.results||[], total_sales=items.reduce((s,x)=>s+Number(x.gross_sale||0),0), total_commission=items.reduce((s,x)=>s+Number(x.commission_amount||0),0);
 return Response.json({affiliate:{id:a.id,affiliate_code:a.affiliate_code,full_name:a.full_name,email:a.email,bank_name:a.bank_name||'',bank_account_name:a.bank_account_name||a.full_name||'',bank_account_last4:String(a.bank_account_number||'').slice(-4)},period,items,summary:{eligible_sales_count:items.length,total_sales,total_commission,currency:items[0]?.currency||'MYR'}},{headers:{'cache-control':'no-store'}});
}
