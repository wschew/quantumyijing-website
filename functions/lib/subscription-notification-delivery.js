// Idempotency-Key support: official resend-node IdempotentRequest interface.
// Retention is not assumed: uncertain acceptance NEVER automatically resends.
const LEASE_MS=2*60*60*1000;
const RETRY_MS=6*60*60*1000;
const MAX_ATTEMPTS=3;
const TIMEOUT_MS=10000;
const changed=result=>Number(result?.meta?.changes || 0)===1;
// Keep reminder period identities unchanged. Event identities do not depend on
// timestamps (which have only second precision). No historical row/key is rewritten.
export const notificationScheduleIdentity=item=>item.source_event_id == null
  ? item.scheduled_for : 'event:'+item.source_event_id;
const identity=item=>[item.subscription_id,item.notification_type,notificationScheduleIdentity(item)];
const eventMatch=`(source_event_id=? OR (source_event_id IS NULL AND scheduled_for=?))`;
export async function existingNotificationLog(db,item){
  if(item.source_event_id == null) return logFor(db,item);
  return db.prepare(`SELECT * FROM subscription_notification_logs
    WHERE subscription_id=? AND notification_type=? AND channel='email' AND ${eventMatch}
    ORDER BY source_event_id IS NULL,id LIMIT 1`).bind(item.subscription_id,item.notification_type,item.source_event_id,item.scheduled_for).first();
}
export async function reconcileExpiredDeliveries(db,{now=new Date().toISOString(),limit=100}={}){
  if(!Number.isSafeInteger(limit) || limit<1 || limit>500) throw Error('Invalid reconciliation limit');
  const expired=(await db.prepare(`SELECT log_id,lease_token,lease_until FROM subscription_notification_delivery
    WHERE state='Sending' AND (lease_until='' OR julianday(lease_until) IS NULL OR julianday(lease_until)<=julianday(?))
    ORDER BY lease_until,log_id LIMIT ?`).bind(now,limit).all()).results || [];
  let reconciled=0;
  for(const row of expired){
    const result=await db.batch([
      db.prepare(`UPDATE subscription_notification_delivery SET state='Reconcile',reason='expired-in-flight-lease',updated_at=?
        WHERE log_id=? AND state='Sending' AND lease_token=? AND lease_until=?`)
        .bind(now,row.log_id,row.lease_token,row.lease_until),
      db.prepare(`UPDATE subscription_notification_logs SET status='Skipped',last_error='expired-in-flight-lease',updated_at=?
        WHERE id=? AND changes()=1`).bind(now,row.log_id)
    ]);
    if(changed(result[0])) reconciled++;
  }
  return reconciled;
}
async function logFor(db,item){
  return db.prepare(`SELECT * FROM subscription_notification_logs
    WHERE subscription_id=? AND notification_type=? AND channel='email' AND scheduled_for=?`).bind(...identity(item)).first();
}
async function finish(db,log,token,state,reason,providerId,now){
  const result=await db.batch([
    db.prepare(`UPDATE subscription_notification_delivery SET state=?,reason=?,provider_message_id=?,updated_at=?
      WHERE log_id=? AND lease_token=? AND state IN ('Claimed','Sending')
      AND (?='Reconcile' OR julianday(lease_until)>julianday(?))`).bind(state,reason,providerId,now,log.id,token,state,now),
    db.prepare(`UPDATE subscription_notification_logs SET status=?,last_error=?,provider_message_id=?,updated_at=?,sent_at=?
      WHERE id=? AND changes()=1`).bind(state==='Sent'?'Sent':state==='Retryable'?'Failed':'Skipped',reason,providerId,now,state==='Sent'?now:'',log.id)
  ]);
  return changed(result[0]);
}
export async function deliverNotification(db,item,payload,apiKey,{now,clock=()=>new Date().toISOString(),fetcher=fetch}={}){
  now=now || clock();
  if(item.source_event_id != null && (!Number.isSafeInteger(item.source_event_id) || item.source_event_id<=0)) throw Error('Invalid notification event identity');
  const historical=await existingNotificationLog(db,item);
  await db.batch([db.prepare(`INSERT OR IGNORE INTO subscription_notification_logs
    (subscription_id,notification_type,channel,recipient,status,source_event_id,scheduled_for,created_at,updated_at)
    SELECT ?,?,'email',?,'Pending',?,?,?,? WHERE NOT EXISTS(
      SELECT 1 FROM subscription_notification_logs WHERE subscription_id=? AND notification_type=? AND channel='email' AND
        (scheduled_for=? OR (? IS NOT NULL AND ${eventMatch})))`).bind(item.subscription_id,item.notification_type,item.recipient,item.source_event_id,notificationScheduleIdentity(item),now,now,
          ...identity(item),item.source_event_id,item.source_event_id,item.scheduled_for),
    db.prepare(`INSERT INTO subscription_notification_delivery(log_id,idempotency_key,payload,state,updated_at)
      SELECT id,'qy-subscription/'||id||'/'||?,?,'Ready',? FROM subscription_notification_logs
      WHERE subscription_id=? AND notification_type=? AND channel='email' AND scheduled_for=? AND changes()=1`)
      .bind(crypto.randomUUID(),JSON.stringify(payload),now,...identity(item))
  ]);
  const log=historical || await existingNotificationLog(db,item);
  if(log.status==='Sent') return 'skipped';
  if(log.status==='Skipped'){const state=await db.prepare('SELECT state FROM subscription_notification_delivery WHERE log_id=?').bind(log.id).first();return state?.state==='Reconcile'?'reconcile':'skipped';}
  let delivery=await db.prepare('SELECT * FROM subscription_notification_delivery WHERE log_id=?').bind(log.id).first();
  if(!delivery){
    // Only a newly inserted log may start a send. A legacy Pending/Failed log
    // could represent accepted mail; quarantine it rather than guessing.
    await db.prepare(`INSERT OR IGNORE INTO subscription_notification_delivery
      (log_id,idempotency_key,payload,state,updated_at,reason) VALUES(?,?,?,?,?,?)`)
      .bind(log.id,'qy-subscription/'+log.id+'/'+crypto.randomUUID(),JSON.stringify(payload),'Reconcile',now,'legacy-unconfirmed-delivery').run();
    delivery=await db.prepare('SELECT * FROM subscription_notification_delivery WHERE log_id=?').bind(log.id).first();
  }
  if(item.source_event_id != null && log.source_event_id == null){
    // A timestamp-only historical row cannot establish which event was sent.
    // Hold it, rather than assign it to a new event and reuse/resend its key.
    await db.batch([
      db.prepare(`UPDATE subscription_notification_delivery SET state='Reconcile',reason='legacy-event-identity-unknown',updated_at=?
        WHERE log_id=? AND state IN ('Ready','Retryable')`).bind(now,log.id),
      db.prepare(`UPDATE subscription_notification_logs SET status='Skipped',last_error='legacy-event-identity-unknown',updated_at=?
        WHERE id=? AND changes()=1`).bind(now,log.id)
    ]);
    return 'reconcile';
  }
  if(['Reconcile','Permanent','Sent'].includes(delivery.state)) return delivery.state==='Reconcile'?'reconcile':'skipped';
  if(delivery.state==='Sending'){
    const fresh=clock();
    if(!Number.isFinite(Date.parse(delivery.lease_until)) || Date.parse(delivery.lease_until)<=Date.parse(fresh)){
      return await finish(db,log,delivery.lease_token,'Reconcile','expired-in-flight-lease','',fresh)?'reconcile':'stale';
    }
    return 'skipped';
  }
  if(delivery.attempt_count>=MAX_ATTEMPTS){
    await db.prepare(`UPDATE subscription_notification_delivery SET state='Permanent',reason='attempt-limit',updated_at=?
      WHERE log_id=? AND state='Retryable'`).bind(now,log.id).run();return 'permanent';
  }
  // Immutable payload is reused on retry. Changing recipient/content requires
  // explicit reconciliation, never a new request under the same key.
  if(delivery.payload!==JSON.stringify(payload)){
    await db.prepare(`UPDATE subscription_notification_delivery SET state='Reconcile',reason='payload-changed',updated_at=?
      WHERE log_id=? AND state IN ('Ready','Retryable')`).bind(now,log.id).run();return 'reconcile';
  }
  const token=crypto.randomUUID(),until=new Date(Date.parse(now)+LEASE_MS).toISOString();
  const claimed=await db.prepare(`UPDATE subscription_notification_delivery SET state='Claimed',lease_token=?,lease_until=?,updated_at=?
    WHERE log_id=? AND attempt_count<3 AND (state='Ready' OR (state='Claimed' AND lease_until<=?) OR
      (state='Retryable' AND updated_at<=?))`).bind(token,until,now,log.id,now,new Date(Date.parse(now)-RETRY_MS).toISOString()).run();
  if(!changed(claimed)) return 'skipped';
  // Re-read eligibility immediately before dispatch. This is not an atomic
  // transaction with the external provider; subsequent changes remain possible.
  const current=await db.prepare(`SELECT s.status,s.current_period_end,s.cancel_at_period_end,c.email,c.status AS customer_status,
    p.status AS plan_status,p.renewal_mode FROM subscriptions s JOIN customers c ON c.id=s.customer_id
    JOIN subscription_plans p ON p.id=s.plan_id WHERE s.id=?`).bind(item.subscription_id).first();
  const eligibilityAt=clock();
  const reminder=item.notification_type.startsWith('RenewalReminder');
  const eligible=current && current.customer_status==='Active' && current.email.trim()===item.recipient &&
    (reminder ? current.status==='Active' && current.plan_status==='Active' && current.renewal_mode==='Manual' &&
      !Number(current.cancel_at_period_end) && current.current_period_end===item.scheduled_for && Date.parse(current.current_period_end)>Date.parse(eligibilityAt) :
      item.notification_type==='PastDueNotice'?current.status==='PastDue':
      item.notification_type==='ExpiredNotice'?current.status==='Expired':
      Number(current.cancel_at_period_end)===1 && ['Active','PastDue','Paused'].includes(current.status));
  if(!eligible){await finish(db,log,token,'Permanent','eligibility-changed','',clock());return 'skipped';}
  const dispatchAt=clock();
  const dispatch=await db.prepare(`UPDATE subscription_notification_delivery SET state='Sending',attempt_count=attempt_count+1,
    first_attempt_at=CASE WHEN first_attempt_at='' THEN ? ELSE first_attempt_at END WHERE log_id=? AND lease_token=? AND state='Claimed' AND julianday(lease_until)>julianday(?)`)
    .bind(dispatchAt,log.id,token,dispatchAt).run();
  if(!changed(dispatch)) return 'stale';
  let response,acceptedId="";
  try{
    response=await fetcher('https://api.resend.com/emails',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${apiKey}`,
      'Content-Type':'application/json','Idempotency-Key':delivery.idempotency_key},body:delivery.payload,signal:AbortSignal.timeout(TIMEOUT_MS)});
    // AbortSignal also covers reading the response body.
    const data=await response.json();
    if(response.ok && typeof data?.id==='string' && data.id){
      acceptedId=data.id;
      if(await finish(db,log,token,'Sent','',acceptedId,clock())) return 'sent';
      return await finish(db,log,token,'Reconcile','expired-or-stale-completion',acceptedId,clock())?'reconcile':'stale';
    }
    // Only explicit 429 rejection automatically retries. 5xx, conflicts,
    // malformed responses and transport errors can have ambiguous acceptance.
    const state=response.status===429?'Retryable':response.status>=400 && response.status<500 && ![408,409].includes(response.status)?'Permanent':'Reconcile';
    const reason='provider-http-'+response.status;
    return await finish(db,log,token,state,reason,'',clock())?state.toLowerCase():'stale';
  }catch{
    // Includes accepted email followed by Sent-update failure. Never downgrade
    // a newer lease or retry an uncertain provider acceptance.
    try{await finish(db,log,token,'Reconcile','ambiguous-provider-or-persistence',acceptedId,clock());}catch{}
    return 'reconcile';
  }
}
