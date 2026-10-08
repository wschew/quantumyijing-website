// Lifecycle decisions compare business values inside their write transaction.
// updated_at is deliberately excluded: separate changes may share a timestamp.
export function lifecycleSnapshotGuard(row){
  const fields=['id','subscription_reference','customer_id','plan_id','membership_id',
    'status','current_period_start','current_period_end','next_renewal_at','grace_ends_at',
    'auto_renew','cancel_at_period_end','cancelled_at','paused_at','expired_at'];
  for(const field of fields){
    if(row[field]===undefined) throw new Error(`Lifecycle snapshot missing ${field}`);
  }
  return {sql:fields.map(field=>`${field} IS ?`).join(' AND '),
    params:fields.map(field=>row[field])};
}

export function lifecycleUpdateChanged(results){
  const count=Number(results?.[0]?.meta?.changes ?? results?.[0]?.changes);
  if(count!==0 && count!==1) throw new Error('Unexpected lifecycle affected-row result.');
  return count===1;
}
