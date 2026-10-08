// Read-only evidence checks. Payment policy matches the verified renewal engine.
export async function validateRenewalOrder(db,order,customerId){
  const owner=await db.prepare(`
    SELECT o.enquiry_id,cel.customer_id,c.status
    FROM orders o
    LEFT JOIN customer_enquiry_links cel ON cel.enquiry_id=o.enquiry_id
    LEFT JOIN customers c ON c.id=cel.customer_id
    WHERE o.id=? LIMIT 1
  `).bind(order.id).first();
  if(!owner?.enquiry_id) return {eligible:false,reason:"Renewal order is not linked to a CRM enquiry."};
  if(!owner.customer_id) return {eligible:false,reason:"Renewal order enquiry is not linked to a canonical customer."};
  if(owner.status!=="Active") return {eligible:false,reason:"Renewal order canonical customer is not Active."};
  if(Number(owner.customer_id)!==Number(customerId)) return {eligible:false,reason:"Renewal order customer does not match subscription customer."};
  if(order.payment_status!=="Paid") return {eligible:false,reason:"Renewal order is not Paid."};
  const row=await db.prepare(`
    SELECT COALESCE(SUM(CASE
      WHEN status IN ('Paid','External') AND verification_status='Verified'
      THEN COALESCE(NULLIF(gross_amount,0),amount,0) ELSE 0 END),0) AS verified_paid
    FROM payments WHERE order_id=?
  `).bind(order.id).first();
  const paid=Number(row?.verified_paid || 0);
  // Deliberately retain the engine's tolerance and zero-total policy.
  if(paid + 0.005 < Number(order.total || 0)) return {eligible:false,reason:"Renewal order is not fully verified paid."};
  return {eligible:true,reason:"",verifiedPaid:paid};
}

// Compare business values, not second-resolution updated_at timestamps. This
// SELECT predicate runs inside the ledger insertion's transaction, before writes.
export function renewalSnapshotGuard(subscription,membership,plan){
  const fields={
    s:['id','customer_id','plan_id','membership_id','status','current_period_start',
      'current_period_end','next_renewal_at','grace_ends_at','auto_renew',
      'cancel_at_period_end','cancelled_at','paused_at','expired_at'],
    m:['id','customer_id','product_id','status','starts_at','ends_at','source_order_id',
      'expired_at','paused_at','cancelled_at'],
    p:['id','product_id','status','renewal_mode','billing_interval_unit',
      'billing_interval_count','membership_duration_unit','membership_duration_count','grace_period_days']
  };
  const rows={s:subscription,m:membership,p:plan};
  const predicates=[];
  const params=[];
  for(const [alias,columns] of Object.entries(fields)){
    for(const column of columns){
      if(rows[alias][column]===undefined) throw new Error(`Renewal snapshot missing ${alias}.${column}`);
      predicates.push(`${alias}.${column} IS ?`);
      params.push(rows[alias][column]);
    }
  }
  return {sql:`EXISTS(SELECT 1 FROM subscriptions s
    JOIN memberships m ON m.id=s.membership_id
    JOIN subscription_plans p ON p.id=s.plan_id
    JOIN customers c ON c.id=s.customer_id
    WHERE c.status='Active' AND ${predicates.join(' AND ')})`,params};
}

export const RENEWAL_MAX_ATTEMPTS=3;
export function isRenewalSnapshotConflict(error){
  // Only this deliberate assertion is retryable. Other constraints, SQL errors
  // and uncertain network failures must not be mistaken for stale snapshots.
  for(let depth=0;error && depth<5;depth++,error=error.cause){
    if(/NOT NULL constraint failed: subscription_renewal_executions\.previous_membership_end\b/.test(String(error.message || ''))) return true;
  }
  return false;
}
