import {json,clean} from './_shared.js';

export async function onRequestGet(context){
  const url=new URL(context.request.url);
  const orderRef=clean(url.searchParams.get('order'),100);
  if(!orderRef) return json({error:'Order reference required.'},400);
  const row=await context.env.ENQUIRIES_DB.prepare(`
    SELECT o.order_reference,o.currency,o.total,o.payment_status,o.payment_provider,o.external_order_id,
      py.provider_transaction_id,py.status payment_record_status,py.verification_status,py.gateway_message,py.gateway_hash_verified
    FROM orders o
    LEFT JOIN payments py ON py.id=(SELECT MAX(p2.id) FROM payments p2 WHERE p2.order_id=o.id)
    WHERE o.order_reference=? LIMIT 1
  `).bind(orderRef).first();
  if(!row) return json({error:'Order not found.'},404);
  return json({ok:true,order:{
    orderReference:row.order_reference,currency:row.currency,total:Number(row.total||0),
    paymentStatus:row.payment_status,paymentProvider:row.payment_provider,
    transactionId:row.provider_transaction_id||row.external_order_id||'',
    verificationStatus:row.verification_status||'',
    gatewayMessage:row.gateway_message||'',
    hashVerified:Number(row.gateway_hash_verified||0)===1
  }});
}

export function onRequest(context){
  if(context.request.method==='GET') return onRequestGet(context);
  return json({error:'Method not allowed.'},405);
}
