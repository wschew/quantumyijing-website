import {clean,esc} from './_shared.js';

export async function onRequestGet(context){
  const ref=clean(new URL(context.request.url).searchParams.get('order'),100);
  const row=ref?await context.env.ENQUIRIES_DB.prepare(`SELECT
    order_reference,payment_status,currency,total
    FROM orders WHERE order_reference=? LIMIT 1`).bind(ref).first():null;
  const paid=row?.payment_status==='Paid';

  return new Response(`<!doctype html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Payment status | Quantum YiJing®</title></head>
  <body style="font-family:Arial;background:#f4f7fb;color:#102f58">
  <main style="max-width:760px;margin:70px auto;padding:20px">
  <section style="background:white;padding:34px;border-radius:24px">
  <h1>${paid?'Payment received':'Payment status pending'}</h1>
  <h2>${paid?'付款已确认':'付款状态待确认'}</h2>
  <p>Order / 订单: <strong>${esc(ref||'—')}</strong></p>
  <p>${paid
    ?'Your payment has been verified.'
    :'The Academy does not mark an order paid from a browser redirect alone. Payment is confirmed by a verified DOKU notification or server-to-server status check.'}</p>
  ${ref&&!paid?`<p><a href="/api/payment/doku/status?order=${encodeURIComponent(ref)}">Check DOKU payment status / 查询付款状态</a></p>`:''}
  <p><a href="/products.html">Return to Academy / 返回学院</a></p>
  </section></main></body></html>`,{
    headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}
  });
}
export function onRequest(c){
  return c.request.method==='GET'
    ? onRequestGet(c)
    : new Response('Method Not Allowed',{status:405});
}
