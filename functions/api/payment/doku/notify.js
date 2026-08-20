import {
  clean,
  config,
  digest,
  hmac,
  logEvent,
  safeEqual,
  moneyEqual,
  markPaid,
  markTerminal
} from './_shared.js';

const RESEND_ENDPOINT='https://api.resend.com/emails';
const ACADEMY_NAME='Quantum YiJing International Academy';
const FROM_ADDRESS=`${ACADEMY_NAME} <info@quantumyijing.com>`;
const INTERNAL_ADDRESS='info@quantumyijing.com';
const LOGO_URL='https://quantumyijing.com/images/quantum-yijing-3d-logo.png';

const esc=v=>String(v??'')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#039;');

async function resend(apiKey,payload){
  if(!apiKey) throw new Error('RESEND_API_KEY is not configured.');
  const r=await fetch(RESEND_ENDPOINT,{
    method:'POST',
    headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},
    body:JSON.stringify(payload)
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(`Resend ${r.status}: ${JSON.stringify(d)}`);
  return d;
}

async function loadOrder(db,orderRef){
  return db.prepare(`
    SELECT
      o.id,o.order_reference,o.customer_name,o.customer_email,o.customer_phone,
      o.total,o.currency,o.payment_status,o.payment_provider,
      CASE WHEN g.order_id IS NOT NULL THEN 1 ELSE 0 END AS is_generic,
      COALESCE(g.payment_purpose,'') AS payment_purpose,
      COALESCE(g.customer_note,'') AS customer_note,
      COALESCE(
        GROUP_CONCAT(CASE WHEN p.name_en IS NOT NULL AND p.name_en<>'' THEN p.name_en ELSE NULL END,' + '),
        ''
      ) AS product_name
    FROM orders o
    LEFT JOIN generic_payment_requests g ON g.order_id=o.id
    LEFT JOIN order_items oi ON oi.order_id=o.id
    LEFT JOIN products p ON p.id=oi.product_id
    WHERE o.order_reference=?
    GROUP BY o.id
    LIMIT 1
  `).bind(orderRef).first();
}

function header(subtitle){
  return `<tr><td style="padding:22px 28px;background:#edf5ff;border-bottom:4px solid #d3a62c">
    <table role="presentation" cellspacing="0" cellpadding="0"><tr>
      <td width="82"><img src="${LOGO_URL}" width="68" height="68" alt="Quantum YiJing®" style="display:block"></td>
      <td><div style="font-size:21px;font-weight:800;color:#082b63">Quantum YiJing</div>
      <div style="margin-top:4px;font-size:11px;font-weight:700;letter-spacing:2px;color:#45688f">${esc(subtitle)}</div></td>
    </tr></table>
  </td></tr>`;
}

function genericCustomerHtml(o){
  const name=esc(o.customer_name||'Customer'),purpose=esc(o.payment_purpose||'General Payment');
  const ref=esc(o.order_reference),currency=esc(o.currency||'MYR'),amount=Number(o.total||0).toFixed(2);
  return `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,'Noto Sans SC','Microsoft YaHei',sans-serif;color:#17243a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff;border:1px solid #dce7f4;border-radius:20px;overflow:hidden">
      ${header('PAYMENT RECEIPT')}
      <tr><td style="padding:34px">
        <div style="font-size:12px;font-weight:800;letter-spacing:1.6px;color:#1768c4">PAYMENT CONFIRMED</div>
        <h1 style="margin:10px 0 20px;font-size:27px;color:#0b2f66">We have received your payment</h1>
        <p style="font-size:15px;line-height:1.75">Dear ${name},</p>
        <p style="font-size:15px;line-height:1.75">Thank you. Quantum YiJing has successfully verified your payment.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#f7faff;border:1px solid #dce8f6;border-radius:12px">
          <tr><td style="padding:13px 16px;color:#58708d;width:170px">Payment Purpose</td><td style="padding:13px 16px;font-weight:700;color:#173b63">${purpose}</td></tr>
          <tr><td style="padding:13px 16px;color:#58708d;border-top:1px solid #e3edf8">Order Reference</td><td style="padding:13px 16px;font-weight:700;color:#173b63;border-top:1px solid #e3edf8">${ref}</td></tr>
          <tr><td style="padding:13px 16px;color:#58708d;border-top:1px solid #e3edf8">Amount Paid</td><td style="padding:13px 16px;font-weight:700;color:#173b63;border-top:1px solid #e3edf8">${currency} ${amount}</td></tr>
          <tr><td style="padding:13px 16px;color:#58708d;border-top:1px solid #e3edf8">Payment Method</td><td style="padding:13px 16px;font-weight:700;color:#173b63;border-top:1px solid #e3edf8">DOKU</td></tr>
          <tr><td style="padding:13px 16px;color:#58708d;border-top:1px solid #e3edf8">Payment Status</td><td style="padding:13px 16px;font-weight:800;color:#11814a;border-top:1px solid #e3edf8">PAID / VERIFIED</td></tr>
        </table>
        <p style="font-size:15px;line-height:1.75">Please keep this email for your records. DOKU may separately send its own provider invoice or payment notice.</p>
        <div style="border-top:1px solid #dce7f4;margin-top:28px;padding-top:26px">
          <div style="font-size:12px;font-weight:800;letter-spacing:1.4px;color:#1768c4">付款确认</div>
          <h2 style="margin:10px 0 18px;font-size:23px;color:#0b2f66">我们已收到您的付款</h2>
          <p style="font-size:15px;line-height:1.85">尊敬的 ${name}：</p>
          <p style="font-size:15px;line-height:1.85">感谢您。量子易经已成功核实并收到您的付款。</p>
        </div>
        <p style="margin-top:28px;font-size:15px;line-height:1.75">Warm regards,<br><strong>Master Chew Wai Soon</strong><br><span style="color:#526a85">Founder &amp; Chief Instructor</span></p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function courseCustomerHtml(o){
  const name=esc(o.customer_name||'Customer'),product=esc(o.product_name||'Quantum YiJing Purchase');
  const ref=esc(o.order_reference),currency=esc(o.currency||'MYR'),amount=Number(o.total||0).toFixed(2);
  return `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,'Noto Sans SC','Microsoft YaHei',sans-serif;color:#17243a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff;border:1px solid #dce7f4;border-radius:20px;overflow:hidden">
      ${header('INTERNATIONAL ACADEMY')}
      <tr><td style="padding:34px">
        <div style="font-size:12px;font-weight:800;letter-spacing:1.6px;color:#1768c4">PAYMENT &amp; REGISTRATION CONFIRMED</div>
        <h1 style="margin:10px 0 20px;font-size:27px;color:#0b2f66">Your registration is confirmed</h1>
        <p style="font-size:15px;line-height:1.75">Dear ${name},</p>
        <p style="font-size:15px;line-height:1.75">Thank you. Quantum YiJing has successfully verified your payment and your registration is now confirmed.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#f7faff;border:1px solid #dce8f6;border-radius:12px">
          <tr><td style="padding:13px 16px;color:#58708d;width:170px">Product / Course</td><td style="padding:13px 16px;font-weight:700;color:#173b63">${product}</td></tr>
          <tr><td style="padding:13px 16px;color:#58708d;border-top:1px solid #e3edf8">Order Reference</td><td style="padding:13px 16px;font-weight:700;color:#173b63;border-top:1px solid #e3edf8">${ref}</td></tr>
          <tr><td style="padding:13px 16px;color:#58708d;border-top:1px solid #e3edf8">Amount Paid</td><td style="padding:13px 16px;font-weight:700;color:#173b63;border-top:1px solid #e3edf8">${currency} ${amount}</td></tr>
          <tr><td style="padding:13px 16px;color:#58708d;border-top:1px solid #e3edf8">Payment Method</td><td style="padding:13px 16px;font-weight:700;color:#173b63;border-top:1px solid #e3edf8">DOKU</td></tr>
          <tr><td style="padding:13px 16px;color:#58708d;border-top:1px solid #e3edf8">Payment Status</td><td style="padding:13px 16px;font-weight:800;color:#11814a;border-top:1px solid #e3edf8">PAID</td></tr>
        </table>
        <p style="font-size:15px;line-height:1.75">DOKU may separately send its payment invoice/receipt. This email confirms your registration and purchase with Quantum YiJing.</p>
        <p style="font-size:15px;line-height:1.75"><strong>A separate follow-up email will be sent to you with the WhatsApp group joining details for this course. Please look out for this email.</strong></p>
        <p style="margin-top:28px;font-size:15px;line-height:1.75">Warm regards,<br><strong>Master Chew Wai Soon</strong><br><span style="color:#526a85">Founder &amp; Chief Instructor</span></p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function internalHtml(o,{checkoutId,state,channel}){
  const descriptor=esc(Number(o.is_generic)===1?(o.payment_purpose||'General Payment'):(o.product_name||'Quantum YiJing Purchase'));
  const type=Number(o.is_generic)===1?'Generic Payment':'Product / Course';
  const name=esc(o.customer_name||''),email=esc(o.customer_email||''),phone=esc(o.customer_phone||'');
  const ref=esc(o.order_reference||''),tx=esc(checkoutId||''),currency=esc(o.currency||'MYR'),amount=Number(o.total||0).toFixed(2);
  return `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,'Noto Sans SC','Microsoft YaHei',sans-serif;color:#17243a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff;border:1px solid #dce7f4;border-radius:20px;overflow:hidden">
      ${header('PAYMENT NOTIFICATION')}
      <tr><td style="padding:34px">
        <h1 style="margin:0 0 20px;font-size:25px;color:#0b2f66">Payment Received</h1>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7faff;border:1px solid #dce8f6;border-radius:12px">
          <tr><td style="padding:12px 16px;color:#58708d;width:180px">Payment Type</td><td style="padding:12px 16px;font-weight:700">${esc(type)}</td></tr>
          <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Purpose / Product</td><td style="padding:12px 16px;font-weight:700;border-top:1px solid #e3edf8">${descriptor}</td></tr>
          <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Customer</td><td style="padding:12px 16px;font-weight:700;border-top:1px solid #e3edf8">${name}</td></tr>
          <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Email</td><td style="padding:12px 16px;border-top:1px solid #e3edf8">${email}</td></tr>
          <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Phone</td><td style="padding:12px 16px;border-top:1px solid #e3edf8">${phone}</td></tr>
          <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Order Reference</td><td style="padding:12px 16px;font-weight:700;border-top:1px solid #e3edf8">${ref}</td></tr>
          <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Amount</td><td style="padding:12px 16px;font-weight:700;border-top:1px solid #e3edf8">${currency} ${amount}</td></tr>
          <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Provider</td><td style="padding:12px 16px;border-top:1px solid #e3edf8">DOKU</td></tr>
          <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Transaction ID</td><td style="padding:12px 16px;border-top:1px solid #e3edf8">${tx}</td></tr>
          <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Channel</td><td style="padding:12px 16px;border-top:1px solid #e3edf8">${esc(channel||'')}</td></tr>
          <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Gateway State</td><td style="padding:12px 16px;border-top:1px solid #e3edf8">${esc(state||'')}</td></tr>
          <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Status</td><td style="padding:12px 16px;font-weight:800;color:#11814a;border-top:1px solid #e3edf8">PAID / VERIFIED</td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

async function noticeRow(db,orderId,type){
  return db.prepare(`SELECT id,status,recipient,provider_message_id,last_error,sent_at
    FROM payment_email_notifications WHERE order_id=? AND notification_type=? LIMIT 1`)
    .bind(orderId,type).first();
}

async function markNotice(db,orderId,type,status,recipient,messageId='',error=''){
  const sentAt=status==='Sent'?new Date().toISOString():'';
  await db.prepare(`INSERT INTO payment_email_notifications(
      order_id,notification_type,status,recipient,provider_message_id,last_error,sent_at,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(order_id,notification_type) DO UPDATE SET
      status=excluded.status,recipient=excluded.recipient,provider_message_id=excluded.provider_message_id,
      last_error=excluded.last_error,
      sent_at=CASE WHEN excluded.status='Sent' THEN excluded.sent_at ELSE payment_email_notifications.sent_at END,
      updated_at=CURRENT_TIMESTAMP`)
    .bind(orderId,type,status,recipient,messageId,error,sentAt).run();
}

async function sendCustomerReceipt(env,db,o){
  if(!o.customer_email)return;
  const existing=await noticeRow(db,o.id,'CustomerReceipt');
  if(existing?.status==='Sent')return;
  try{
    const isGeneric=Number(o.is_generic)===1;
    const subject=isGeneric
      ? `Payment Received — ${o.payment_purpose||o.order_reference}`
      : `Payment & Registration Confirmed — ${o.product_name||o.order_reference}`;
    const html=isGeneric?genericCustomerHtml(o):courseCustomerHtml(o);
    const text=isGeneric
      ? `Dear ${o.customer_name||'Customer'},

Thank you. Quantum YiJing has successfully verified your payment.

Payment Purpose: ${o.payment_purpose||'General Payment'}
Order Reference: ${o.order_reference}
Amount Paid: ${o.currency||'MYR'} ${Number(o.total||0).toFixed(2)}
Payment Method: DOKU
Payment Status: PAID / VERIFIED

Please keep this email for your records.

Warm regards,
Master Chew Wai Soon
Quantum YiJing International Academy`
      : `Dear ${o.customer_name||'Customer'},

Thank you. Quantum YiJing has successfully verified your payment and your registration is now confirmed.

Product / Course: ${o.product_name||'Quantum YiJing Purchase'}
Order Reference: ${o.order_reference}
Amount Paid: ${o.currency||'MYR'} ${Number(o.total||0).toFixed(2)}
Payment Method: DOKU
Payment Status: PAID

A separate follow-up email will be sent to you with the WhatsApp group joining details for this course.

Warm regards,
Master Chew Wai Soon
Quantum YiJing International Academy`;
    const r=await resend(env.RESEND_API_KEY,{
      from:FROM_ADDRESS,to:[o.customer_email],reply_to:INTERNAL_ADDRESS,subject,html,text
    });
    await markNotice(db,o.id,'CustomerReceipt','Sent',o.customer_email,r?.id||'','');
  }catch(e){
    await markNotice(db,o.id,'CustomerReceipt','Failed',o.customer_email||'','',clean(e?.message||'Email failed',1000));
    console.error('Customer payment receipt failed',e);
  }
}

async function sendInternalNotice(env,db,o,meta){
  const existing=await noticeRow(db,o.id,'InternalPaymentNotice');
  if(existing?.status==='Sent')return;
  try{
    const descriptor=Number(o.is_generic)===1?(o.payment_purpose||'General Payment'):(o.product_name||'Order');
    const r=await resend(env.RESEND_API_KEY,{
      from:FROM_ADDRESS,to:[INTERNAL_ADDRESS],reply_to:o.customer_email||INTERNAL_ADDRESS,
      subject:`Payment Received — ${descriptor} — ${o.order_reference}`,
      html:internalHtml(o,meta),
      text:`Payment Received

Payment Type: ${Number(o.is_generic)===1?'Generic Payment':'Product / Course'}
Purpose / Product: ${descriptor}
Customer: ${o.customer_name||''}
Email: ${o.customer_email||''}
Phone: ${o.customer_phone||''}
Order Reference: ${o.order_reference}
Amount: ${o.currency||'MYR'} ${Number(o.total||0).toFixed(2)}
Provider: DOKU
Transaction ID: ${meta.checkoutId||''}
Channel: ${meta.channel||''}
Gateway State: ${meta.state||''}
Status: PAID / VERIFIED`
    });
    await markNotice(db,o.id,'InternalPaymentNotice','Sent',INTERNAL_ADDRESS,r?.id||'','');
  }catch(e){
    await markNotice(db,o.id,'InternalPaymentNotice','Failed',INTERNAL_ADDRESS,'',clean(e?.message||'Email failed',1000));
    console.error('Internal payment notification failed',e);
  }
}


async function isGenericOrder(db,orderId){
  return !!(await db.prepare(`SELECT order_id FROM generic_payment_requests WHERE order_id=? LIMIT 1`).bind(orderId).first());
}
async function markGenericGatewayPaid(db,{orderRef,checkoutId,statusMessage,mode}){
  const o=await db.prepare(`SELECT id,total,currency FROM orders WHERE order_reference=? LIMIT 1`).bind(orderRef).first();
  if(!o)return {ok:false};
  const now=new Date().toISOString();
  let py=await db.prepare(`SELECT id FROM payments WHERE order_id=? AND provider='DOKU' ORDER BY id DESC LIMIT 1`).bind(o.id).first();
  if(py){
    await db.prepare(`UPDATE payments SET provider_transaction_id=?,amount=?,currency=?,status='Paid',raw_reference=?,paid_at=?,payment_method='DOKU',gross_amount=?,verification_status='Unverified',verified_at='',customer_receipt_issuer='Quantum YiJing',gateway_mode=?,gateway_message=?,gateway_hash_verified=1 WHERE id=?`)
      .bind(checkoutId,Number(o.total||0),o.currency||'MYR',`DOKU:${checkoutId||orderRef}`,now,Number(o.total||0),mode,statusMessage,py.id).run();
  }
  await db.prepare(`UPDATE orders SET payment_provider='DOKU',payment_status='Paid',external_order_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(checkoutId||'',o.id).run();
  await db.prepare(`INSERT INTO generic_payment_reviews(order_id,gateway_notice_status,admin_verification_status,created_at,updated_at) VALUES(?,'Pending','Pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(order_id) DO UPDATE SET updated_at=CURRENT_TIMESTAMP`).bind(o.id).run();
  return {ok:true,orderId:o.id};
}
async function sendGenericVerificationNotice(env,db,o,meta){
  const row=await db.prepare(`SELECT gateway_notice_status FROM generic_payment_reviews WHERE order_id=? LIMIT 1`).bind(o.id).first();
  if(row?.gateway_notice_status==='Sent')return;
  try{
    await resend(env.RESEND_API_KEY,{from:FROM_ADDRESS,to:[INTERNAL_ADDRESS],reply_to:o.customer_email||INTERNAL_ADDRESS,
      subject:`Generic Payment Notice — Verification Required — ${o.order_reference}`,
      html:`<!doctype html><html><body style="font-family:Arial;background:#f4f7fb"><div style="max-width:680px;margin:30px auto;background:#fff;border:1px solid #dce7f4;border-radius:18px;overflow:hidden">${header('GENERIC PAYMENT NOTICE')}<div style="padding:32px"><h2 style="color:#0b2f66">Payment received — verification required</h2><p>DOKU has reported a successful payment. Please review the payment record and click <strong>Verify & Confirm</strong> in QY Admin before a QY receipt is issued.</p><p style="text-align:center;margin:26px 0"><a href="${esc(meta.reviewUrl||'')}" style="display:inline-block;background:#1468c5;color:#fff;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:10px">Review &amp; Verify Payment</a></p><p><strong>Purpose:</strong> ${esc(o.payment_purpose||'General Payment')}<br><strong>Customer:</strong> ${esc(o.customer_name||'')}<br><strong>Order:</strong> ${esc(o.order_reference)}<br><strong>Amount:</strong> ${esc(o.currency||'MYR')} ${Number(o.total||0).toFixed(2)}<br><strong>DOKU Transaction:</strong> ${esc(meta.checkoutId||'')}<br><strong>Status:</strong> SUCCESS / ${esc(meta.state||'')}<br><strong>QY Verification:</strong> PENDING ADMIN REVIEW</p></div></div></body></html>`,
      text:`Generic Payment Notice — Verification Required\n\nPurpose: ${o.payment_purpose||'General Payment'}\nCustomer: ${o.customer_name||''}\nOrder: ${o.order_reference}\nAmount: ${o.currency||'MYR'} ${Number(o.total||0).toFixed(2)}\nDOKU Transaction: ${meta.checkoutId||''}\nStatus: SUCCESS / ${meta.state||''}\nQY Verification: PENDING ADMIN REVIEW

Review this payment:
${meta.reviewUrl||''}`});
    await db.prepare(`UPDATE generic_payment_reviews SET gateway_notice_status='Sent',gateway_notice_sent_at=?,gateway_notice_error='',updated_at=CURRENT_TIMESTAMP WHERE order_id=?`).bind(new Date().toISOString(),o.id).run();
  }catch(e){
    await db.prepare(`UPDATE generic_payment_reviews SET gateway_notice_status='Failed',gateway_notice_error=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=?`).bind(clean(e?.message||'Email failed',1000),o.id).run();
  }
}

export async function onRequestPost(context){
  const raw=await context.request.text();
  let p={};try{p=JSON.parse(raw)}catch{return new Response(null,{status:400})}
  let cfg;try{cfg=config(context.env)}catch{return new Response(null,{status:503})}

  const h=context.request.headers;
  const client=h.get('Client-Id')||h.get('client-id')||'';
  const ts=h.get('Request-Timestamp')||h.get('request-timestamp')||'';
  const received=h.get('Signature')||h.get('signature')||'';
  const target=new URL(context.request.url).pathname;

  const calculatedDigest=await digest(raw);
  const canonical=[client,ts,target,calculatedDigest].join('\n');
  const expected=`HMACSHA256=${await hmac(cfg.secret,canonical)}`;
  const signatureVerified=client===cfg.clientId&&safeEqual(received,expected);

  const ref=clean(p?.order?.invoice_number||p?.invoice_number,100);
  const checkoutId=clean(p?.id||p?.transaction?.id||p?.transaction?.original_request_id||p?.payment?.transaction_id,120);
  const paymentStatus=clean(p?.payment?.status||p?.transaction?.status||p?.status,40).toUpperCase();
  const state=clean(p?.payment?.state||p?.transaction?.state,40).toUpperCase();
  const channel=clean(p?.payment?.channel||p?.channel?.id||p?.service?.id,80);
  const remoteAmount=Number(p?.payment?.amount??p?.order?.amount);
  const remoteCurrency=clean(p?.payment?.currency||p?.order?.currency,12).toUpperCase();

  const db=context.env.ENQUIRIES_DB;
  const local=ref?await db.prepare(`SELECT id,total,currency,payment_status,payment_provider,external_order_id
    FROM orders WHERE order_reference=? LIMIT 1`).bind(ref).first():null;

  const orderFound=!!local;
  const amountVerified=orderFound&&moneyEqual(local.total,remoteAmount);
  const currencyVerified=orderFound&&String(local.currency||'MYR').toUpperCase()===remoteCurrency;
  const integrityVerified=signatureVerified&&orderFound&&amountVerified&&currencyVerified;

  await logEvent(db,{
    eventType:'Notification',orderRef:ref,transactionId:checkoutId,status:paymentStatus,
    message:[paymentStatus,state,channel,signatureVerified?'signature-ok':'signature-failed',
      amountVerified?'amount-ok':'amount-mismatch',currencyVerified?'currency-ok':'currency-mismatch']
      .filter(Boolean).join(' / '),
    signature:received,verified:integrityVerified,mode:cfg.mode,payload:p
  });

  if(!signatureVerified)return new Response(null,{status:401});
  if(!ref||!orderFound)return new Response(null,{status:404});
  if(!amountVerified||!currencyVerified)return new Response(null,{status:409});

  if(paymentStatus==='SUCCESS'){
    const generic=await isGenericOrder(db,local.id);
    if(generic){
      await markGenericGatewayPaid(db,{orderRef:ref,checkoutId,statusMessage:`SUCCESS${state?` / ${state}`:''}${channel?` / ${channel}`:''}`,mode:cfg.mode});
      const o=await loadOrder(db,ref);
      if(o){
        const reviewUrl=`${new URL(context.request.url).origin}/admin-payment-records.html?order=${encodeURIComponent(ref)}`;
        await sendGenericVerificationNotice(context.env,db,o,{checkoutId,state,channel,reviewUrl});
      }
    }else{
      await markPaid(db,{orderRef:ref,checkoutId,statusMessage:`SUCCESS${state?` / ${state}`:''}${channel?` / ${channel}`:''}`,mode:cfg.mode});
      const o=await loadOrder(db,ref);
      if(o){await sendCustomerReceipt(context.env,db,o);await sendInternalNotice(context.env,db,o,{checkoutId,state,channel});}
    }
  }else if(paymentStatus==='FAILED'){
    await markTerminal(db,{
      orderRef:ref,checkoutId,status:'Failed',
      statusMessage:`FAILED${state?` / ${state}`:''}${channel?` / ${channel}`:''}`,
      mode:cfg.mode
    });
  }else if(paymentStatus==='EXPIRED'){
    await markTerminal(db,{
      orderRef:ref,checkoutId,status:'Expired',
      statusMessage:`EXPIRED${state?` / ${state}`:''}${channel?` / ${channel}`:''}`,
      mode:cfg.mode
    });
  }

  return new Response(null,{status:200});
}

export function onRequest(c){
  return c.request.method==='POST'?onRequestPost(c):new Response(null,{status:405});
}
