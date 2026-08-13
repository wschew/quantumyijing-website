import { getDB } from './_db.js';
export async function onRequestGet({ env }) {
  const db=getDB(env);
  if(!db) return Response.json({error:'Database binding unavailable.'},{status:503});
  const row=await db.prepare(`SELECT programme_enabled,default_commission_rate,referral_days,affiliate_membership_months,customer_attribution_months,payout_frequency FROM affiliate_settings WHERE id=1`).first();
  if(!row) return Response.json({error:'Affiliate settings not configured.'},{status:503});
  return Response.json(row,{headers:{'cache-control':'no-store'}});
}
