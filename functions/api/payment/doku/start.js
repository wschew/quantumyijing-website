import {clean,config,signature,requestTarget,logEvent,esc} from './_shared.js';
const bad=(m,s=400)=>new Response(`<!doctype html><meta charset="utf-8"><title>Payment</title><body style="font-family:Arial;padding:40px"><h2>Unable to start payment</h2><p>${esc(m)}</p><p><a href="/products.html">Return to Products</a></p></body>`,{status:s,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
export async function onRequestPost(context){
 let body={};try{const t=context.request.headers.get('content-type')||'';body=t.includes('application/json')?await context.request.json():Object.fromEntries((await context.request.formData()).entries())}catch{return bad('Invalid payment request.')}
 const ref=clean(body.order_reference||body.orderReference,64);if(!/^[A-Za-z0-9-]{4,64}$/.test(ref))return bad('Invalid order reference.');
 let cfg;try{cfg=config(context.env)}catch(e){return bad(e.message,503)}
 const db=context.env.ENQUIRIES_DB;const o=await db.prepare(`SELECT o.id,o.order_reference,o.customer_name,o.customer_email,o.customer_phone,o.currency,o.total,o.payment_status,o.payment_provider,p.sku,p.name_en,p.senangpay_enabled FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN products p ON p.id=oi.product_id WHERE o.order_reference=? LIMIT 1`).bind(ref).first();
 if(!o)return bad('Order not found.',404);if(o.payment_status==='Paid')return bad('This order has already been paid.');if(String(o.payment_provider||'')!=='DOKU')return bad('This order is not assigned to DOKU checkout.');if(Number(o.senangpay_enabled)!==1)return bad('Online payment is not enabled for this product.');
 if(String(o.currency||'MYR').toUpperCase()!=='MYR')return bad('DOKU checkout is currently limited to MYR orders on this website.');
 const amount=Number(o.total||0);if(!(amount>0))return bad('Order amount is invalid.');
 const origin=new URL(context.request.url).origin;const payload={order:{amount,invoice_number:ref,currency:'MYR',callback_url_result:`${origin}/api/payment/doku/return?order=${encodeURIComponent(ref)}`,auto_redirect:false},payment:{payment_due_date:60},customer:{name:clean(o.customer_name,255),email:clean(o.customer_email,128),phone:clean(o.customer_phone,32)}};
 const raw=JSON.stringify(payload),requestId=crypto.randomUUID(),timestamp=new Date().toISOString(),target=requestTarget(cfg.endpoint),sig=await signature(cfg.secret,cfg.clientId,requestId,timestamp,target,raw);
 const r=await fetch(cfg.endpoint,{method:'POST',headers:{'content-type':'application/json','Client-Id':cfg.clientId,'Request-Id':requestId,'Request-Timestamp':timestamp,'Signature':sig},body:raw});let d={};try{d=await r.json()}catch{}
 const payUrl=d?.response?.payment?.url||d?.payment?.url||'';await logEvent(db,{eventType:'Start',orderRef:ref,status:String(r.status),message:payUrl?'Checkout created':'Checkout creation failed',verified:r.ok,payload:{httpStatus:r.status,response:d}});
 if(!r.ok||!payUrl)return bad('DOKU did not create a checkout session. Please contact the Academy or try again later.',502);
 return Response.redirect(payUrl,303);
}
export function onRequest(c){return c.request.method==='POST'?onRequestPost(c):bad('Method not allowed.',405)}
