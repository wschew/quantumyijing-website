const ALLOWED = new Set(['MYR','USD','SGD','CNY','GBP','AUD','EUR','JPY','HKD','THB']);

function json(data,status=200,cache='public, max-age=3600'){
  return new Response(JSON.stringify(data),{
    status,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':cache}
  });
}

export async function onRequestGet(context){
  const url=new URL(context.request.url);
  const to=String(url.searchParams.get('to')||'MYR').toUpperCase();
  const amount=Number(url.searchParams.get('amount')||0);
  if(!ALLOWED.has(to)) return json({error:'Unsupported display currency.'},400,'no-store');
  if(!Number.isFinite(amount)||amount<0) return json({error:'Invalid amount.'},400,'no-store');

  if(to==='MYR'){
    return json({ok:true,base:'MYR',quote:'MYR',rate:1,amount,converted:amount,date:new Date().toISOString().slice(0,10)});
  }

  try{
    const r=await fetch(`https://api.frankfurter.dev/v2/rate/MYR/${to}`,{headers:{'accept':'application/json'}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok || !Number.isFinite(Number(d.rate))) throw new Error(d.message||'FX provider unavailable');
    const rate=Number(d.rate);
    return json({ok:true,base:'MYR',quote:to,rate,amount,converted:Number((amount*rate).toFixed(2)),date:d.date||''});
  }catch(err){
    return json({error:'Live currency conversion is temporarily unavailable.'},502,'no-store');
  }
}
