// A link alone is not proof of execution: linked renewals may await verification.
export async function findRenewalCompletion(db,orderId,subscriptionId,membershipId){
  const execution=await db.prepare(`
    SELECT * FROM subscription_renewal_executions WHERE order_id=? LIMIT 1
  `).bind(orderId).first();
  if(execution){
    if(Number(execution.subscription_id)!==Number(subscriptionId) ||
       Number(execution.membership_id)!==Number(membershipId)){
      throw new Error("VALIDATION: Renewal order completion belongs to another subscription or membership.");
    }
    return {completed:true,execution};
  }
  const event=await db.prepare(`
    SELECT e.id FROM subscription_events e
    JOIN subscription_orders so ON so.subscription_id=e.subscription_id
      AND so.order_id=? AND so.order_type='Renewal'
    WHERE e.subscription_id=? AND e.event_type='renewed'
      AND (e.source_reference=? OR
        (e.source_reference=? AND e.source='A6E Manual Renewal Administration'))
    LIMIT 1
  `).bind(orderId,subscriptionId,`RenewalOrder:${orderId}`,`AdminRenewal:${orderId}`).first();
  return {completed:Boolean(event),execution:null};
}
