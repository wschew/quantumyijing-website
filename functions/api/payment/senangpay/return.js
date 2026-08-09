import {parseGatewayParams,applyGatewayResult,esc} from './_shared.js';

function page(result){
  const ok=result?.verified && result?.gatewayStatus==='Paid';
  const pending=result?.verified && result?.gatewayStatus==='Pending';
  const title=ok?'Payment successful':pending?'Payment pending':'Payment not completed';
  const zh=ok?'付款成功':pending?'付款处理中':'付款未完成';
  const color=ok?'#18864b':pending?'#a36b00':'#b3261e';
  const message=(result?.msg||result?.error||'').replaceAll('_',' ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | Quantum YiJing®</title></head><body style="margin:0;background:#f4f7fb;font-family:Arial,'Noto Sans SC','Microsoft YaHei',sans-serif;color:#102f58"><main style="max-width:760px;margin:70px auto;padding:20px"><section style="background:#fff;border:1px solid #d9e6f3;border-radius:24px;padding:34px;box-shadow:0 18px 50px rgba(12,50,96,.1)"><div style="font-size:12px;font-weight:800;letter-spacing:2px;color:#1768c4">QUANTUM YIJING® PAYMENT</div><h1 style="color:${color};margin:14px 0">${esc(title)}</h1><h2 style="margin:0 0 22px">${esc(zh)}</h2><p>${esc(message||title)}</p>${result?.orderId?`<p><strong>Order / 订单：</strong>${esc(result.orderId)}</p>`:''}${result?.transactionId?`<p><strong>senangPay Transaction：</strong>${esc(result.transactionId)}</p>`:''}${result?.total!=null?`<p><strong>Amount / 金额：</strong>${esc(result.currency||'MYR')} ${Number(result.total||0).toFixed(2)}</p>`:''}<p style="margin-top:28px"><a href="/products.html" style="display:inline-block;background:#1768c4;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Return to Academy / 返回学院</a></p><p style="margin-top:24px;color:#62758d;font-size:13px">Your payment status is recorded from a verified senangPay response. If your bank shows a charge but this page does not show success, please contact the Academy with your order reference.</p></section></main></body></html>`;
}

export async function onRequest(context){
  if(context.request.method!=='GET') return new Response('Method Not Allowed',{status:405});
  try{
    const params=await parseGatewayParams(context.request);
    const result=await applyGatewayResult(context,params,'Return');
    return new Response(page(result),{
      status:200,
      headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
    });
  }catch(err){
    console.error('SenangPay return error',err);
    return new Response(page({verified:false,error:'Unable to verify payment response.'}),{
      status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}
    });
  }
}
