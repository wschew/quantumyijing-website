import {requireAffiliate} from '../auth/_auth.js';

export async function onRequestGet({request,env}){
  const auth=await requireAffiliate(request,env);
  if(auth.error) return auth.error;

  const {db,affiliate:a}=auth;
  const origin=new URL(request.url).origin;

  const products=await db.prepare(`
    SELECT id,sku,slug,product_type,name_en,name_zh,status
    FROM products
    WHERE status='Active' AND affiliate_enabled=1
    ORDER BY product_type,name_en
  `).all();

  const links=(products.results||[]).map(p=>({
    id:p.id,
    sku:p.sku,
    product_type:p.product_type,
    name_en:p.name_en,
    name_zh:p.name_zh,
    url:`${origin}/lp/${encodeURIComponent(p.slug)}.html?aff=${encodeURIComponent(a.affiliate_code)}`
  }));

  return Response.json({
    affiliate_code:a.affiliate_code,
    general_url:`${origin}/?aff=${encodeURIComponent(a.affiliate_code)}`,
    products:links
  },{
    headers:{'cache-control':'no-store'}
  });
}
