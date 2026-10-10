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

// Validate stored period boundaries without inferring or repairing historical data.
// Preserve ISO dates and legacy SQLite UTC timestamps; reject ambiguous local times.
export function subscriptionPeriodDateIssues(row){
  function timestamp(value){
    const text=String(value ?? "").trim();
    const match=/^(\d{4})-(\d{2})-(\d{2})(?:(T| )(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})?)?$/.exec(text);
    if(!match) return null;
    const [,year,month,day,separator,hour="00",minute="00",second="00",fraction="",zone]=match;
    if(separator==="T" && !zone) return null;
    const calendar=new Date(`${year}-${month}-${day}T00:00:00Z`);
    if(!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0,10)!==`${year}-${month}-${day}` ||
       Number(hour)>23 || Number(minute)>59 || Number(second)>59 ||
       (zone && zone!=="Z" && (Number(zone.slice(1,3))>23 || Number(zone.slice(4))>59))) return null;
    const result=Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}${fraction?"."+fraction:""}${zone || "Z"}`);
    return Number.isFinite(result)?result:null;
  }
  const start=timestamp(row.current_period_start),end=timestamp(row.current_period_end);
  const issues=[];
  if(start===null) issues.push("Valid current_period_start required.");
  if(end===null) issues.push("Valid current_period_end required.");
  if(start!==null && end!==null && end<=start) issues.push("current_period_end must be later than current_period_start.");
  return issues;
}

export function subscriptionPeriodReview(row){
  if(!["Active","PastDue"].includes(row.status)) return row;
  const issues=subscriptionPeriodDateIssues(row);
  return issues.length?{...row,periodDateIssues:issues}:row;
}
