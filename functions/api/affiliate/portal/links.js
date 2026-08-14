import {requireAffiliate} from '../auth/_auth.js';

function baseUrl(origin,p){
 const x=String(p.affiliate_public_path||'').trim();
 if(x)return /^https?:\/\//i.test(x)?x:origin+(x.startsWith('/')?x:'/'+x);
 return `${origin}/lp/${encodeURIComponent(p.slug)}.html`;
}
function addAff(url,code){const u=new URL(url);u.searchParams.set('aff',code);return u.toString()}

export async function onRequestGet({request,env}){
 const auth=await requireAffiliate(request,env);if(auth.error)return auth.error;
 const {db,affiliate:a}=auth,origin=new URL(request.url).origin;
 const settings=await db.prepare(`SELECT default_commission_rate FROM affiliate_settings WHERE id=1`).first();
 const aff=await db.prepare(`SELECT commission_override FROM affiliates WHERE id=?`).bind(a.affiliate_id).first();
 const products=await db.prepare(`SELECT id,sku,slug,product_type,name_en,name_zh,status,price,currency,affiliate_enabled,commission_type,commission_value,affiliate_public_path FROM products WHERE status='Active' AND affiliate_enabled=1 ORDER BY product_type,name_en`).all();
 const programme=Number(settings?.default_commission_rate||0);
 const affOverride=(aff?.commission_override===null||aff?.commission_override===undefined)?null:Number(aff.commission_override);

 const links=(products.results||[]).map(p=>{
   let type='percentage',value=programme,source='Programme default';
   if(String(p.commission_type||'')!==''&&p.commission_value!==null&&p.commission_value!==undefined){type=String(p.commission_type);value=Number(p.commission_value||0);source='Product override'}
   if(affOverride!==null&&Number.isFinite(affOverride)){type='percentage';value=affOverride;source='Affiliate override'}
   return {id:p.id,sku:p.sku,product_type:p.product_type,name_en:p.name_en,name_zh:p.name_zh,price:Number(p.price||0),currency:p.currency||'MYR',commission_type:type,commission_value:value,commission_source:source,url:addAff(baseUrl(origin,p),a.affiliate_code)};
 });
 return Response.json({affiliate_code:a.affiliate_code,general_url:addAff(`${origin}/`,a.affiliate_code),products:links},{headers:{'cache-control':'no-store'}});
}
