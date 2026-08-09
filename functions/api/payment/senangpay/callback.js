import {parseGatewayParams,applyGatewayResult} from './_shared.js';

export async function onRequest(context){
  if(context.request.method!=='POST'){
    return new Response('Method Not Allowed',{status:405,headers:{'content-type':'text/plain; charset=utf-8'}});
  }
  try{
    const params=await parseGatewayParams(context.request);
    const result=await applyGatewayResult(context,params,'Callback');
    if(!result.ok){
      console.warn('SenangPay callback rejected',result);
      return new Response('INVALID',{status:result.status||400,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
    }
    // senangPay requires a plain OK response for successful callbacks.
    return new Response('OK',{status:200,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
  }catch(err){
    console.error('SenangPay callback error',err);
    return new Response('ERROR',{status:500,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
  }
}
