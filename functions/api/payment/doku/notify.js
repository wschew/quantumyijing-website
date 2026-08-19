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

const escHtml=v=>String(v??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#039;');

async function sendEmail(apiKey,payload){
  if(!apiKey) throw new Error('RESEND_API_KEY is not configured.');
  const r=await fetch(RESEND_ENDPOINT,{
    method:'POST',
    headers:{
      authorization:`Bearer ${apiKey}`,
      'content-type':'application/json'
    },
    body:JSON.stringify(payload)
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(`Resend ${r.status}: ${JSON.stringify(d)}`);
  return d;
}

async function orderMailData(db,orderRef){
  return db.prepare(`
    SELECT
      o.id,
      o.order_reference,
      o.customer_name,
      o.customer_email,
      o.customer_phone,
      o.total,
      o.currency,
      o.payment_status,
      o.payment_provider,
      COALESCE(
        GROUP_CONCAT(
          CASE
            WHEN p.name_en IS NOT NULL AND p.name_en<>'' THEN p.name_en
            ELSE NULL
          END,
          ' + '
        ),
        MAX(g.payment_purpose),
        'Quantum YiJing Payment'
      ) AS product_name
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id=o.id
    LEFT JOIN products p ON p.id=oi.product_id
    LEFT JOIN generic_payment_requests g ON g.order_id=o.id
    WHERE o.order_reference=?
    GROUP BY o.id
    LIMIT 1
  `).bind(orderRef).first();
}

function customerHtml(o){
  const name=escHtml(o.customer_name||'Customer');
  const product=escHtml(o.product_name||'Quantum YiJing Purchase');
  const ref=escHtml(o.order_reference);
  const currency=escHtml(o.currency||'MYR');
  const amount=Number(o.total||0).toFixed(2);

  return `<!doctype html>
  <html>
  <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,'Noto Sans SC','Microsoft YaHei',sans-serif;color:#17243a">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td align="center" style="padding:28px 12px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#fff;border:1px solid #dce7f4;border-radius:20px;overflow:hidden">
            <tr>
              <td style="padding:24px 30px;background:#edf5ff;border-bottom:4px solid #d3a62c">
                <table role="presentation" cellspacing="0" cellpadding="0"><tr>
                  <td width="82"><img src="https://quantumyijing.com/images/quantum-yijing-3d-logo.png" width="68" height="68" alt="Quantum YiJing®" style="display:block"></td>
                  <td><div style="font-size:21px;font-weight:800;color:#082b63">Quantum YiJing</div>
                  <div style="margin-top:4px;font-size:11px;font-weight:700;letter-spacing:2px;color:#45688f">INTERNATIONAL ACADEMY</div></td>
                </tr></table>
              </td>
            </tr>
            <tr>
              <td style="padding:34px">
                <div style="font-size:12px;font-weight:800;letter-spacing:1.6px;color:#1768c4">PAYMENT &amp; REGISTRATION CONFIRMED</div>
                <h1 style="margin:10px 0 20px;font-size:27px;color:#0b2f66">Your registration is confirmed</h1>
                <p style="font-size:15px;line-height:1.75">Dear ${name},</p>
                <p style="font-size:15px;line-height:1.75">Thank you. Quantum YiJing has successfully verified your payment and your registration is now confirmed.</p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;background:#f7faff;border:1px solid #dce8f6;border-radius:12px">
                  <tr><td style="padding:13px 16px;color:#58708d;width:170px">Product / Course</td><td style="padding:13px 16px;font-weight:700;color:#173b63">${product}</td></tr>
                  <tr><td style="padding:13px 16px;color:#58708d;border-top:1px solid #e3edf8">Order Reference</td><td style="padding:13px 16px;font-weight:700;color:#173b63;border-top:1px solid #e3edf8">${ref}</td></tr>
                  <tr><td style="padding:13px 16px;color:#58708d;border-top:1px solid #e3edf8">Amount Paid</td><td style="padding:13px 16px;font-weight:700;color:#173b63;border-top:1px solid #e3edf8">${currency} ${amount}</td></tr>
                  <tr><td style="padding:13px 16px;color:#58708d;border-top:1px solid #e3edf8">Payment Method</td><td style="padding:13px 16px;font-weight:700;color:#173b63;border-top:1px solid #e3edf8">DOKU</td></tr>
                  <tr><td style="padding:13px 16px;color:#58708d;border-top:1px solid #e3edf8">Payment Status</td><td style="padding:13px 16px;font-weight:800;color:#11814a;border-top:1px solid #e3edf8">PAID</td></tr>
                </table>

                <p style="font-size:15px;line-height:1.75">DOKU may separately send you its payment invoice/receipt. This email confirms your registration and purchase with Quantum YiJing.</p>

                <div style="border-top:1px solid #dce7f4;margin-top:28px;padding-top:26px">
                  <div style="font-size:12px;font-weight:800;letter-spacing:1.4px;color:#1768c4">付款与报名确认</div>
                  <h2 style="margin:10px 0 18px;font-size:23px;color:#0b2f66">您的报名已确认</h2>
                  <p style="font-size:15px;line-height:1.85">尊敬的 ${name}：</p>
                  <p style="font-size:15px;line-height:1.85">感谢您。量子易经已成功核实您的付款，您的报名现已确认。</p>
                </div>

                <p style="margin-top:28px;font-size:15px;line-height:1.75">Warm regards,<br><strong>Master Chew Wai Soon</strong><br><span style="color:#526a85">Founder &amp; Chief Instructor</span></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;
}

function internalHtml(o,{checkoutId,state,channel}){
  const product=escHtml(o.product_name||'Quantum YiJing Purchase');
  const name=escHtml(o.customer_name||'');
  const email=escHtml(o.customer_email||'');
  const phone=escHtml(o.customer_phone||'');
  const ref=escHtml(o.order_reference||'');
  const tx=escHtml(checkoutId||'');
  const currency=escHtml(o.currency||'MYR');
  const amount=Number(o.total||0).toFixed(2);
  const stateSafe=escHtml(state||'');
  const channelSafe=escHtml(channel||'');

  return `<!doctype html>
  <html>
  <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,'Noto Sans SC','Microsoft YaHei',sans-serif;color:#17243a">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr><td align="center" style="padding:28px 12px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#fff;border:1px solid #dce7f4;border-radius:20px;overflow:hidden">
          <tr><td style="padding:24px 30px;background:#edf5ff;border-bottom:4px solid #d3a62c">
            <table role="presentation" cellspacing="0" cellpadding="0"><tr>
              <td width="82"><img src="https://quantumyijing.com/images/quantum-yijing-3d-logo.png" width="68" height="68" alt="Quantum YiJing®" style="display:block"></td>
              <td><div style="font-size:21px;font-weight:800;color:#082b63">Quantum YiJing</div>
              <div style="margin-top:4px;font-size:11px;font-weight:700;letter-spacing:2px;color:#45688f">PAYMENT NOTIFICATION</div></td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:34px">
            <h1 style="margin:0 0 20px;font-size:25px;color:#0b2f66">Payment Received</h1>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f7faff;border:1px solid #dce8f6;border-radius:12px">
              <tr><td style="padding:12px 16px;color:#58708d;width:180px">Product / Course</td><td style="padding:12px 16px;font-weight:700">${product}</td></tr>
              <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Customer</td><td style="padding:12px 16px;font-weight:700;border-top:1px solid #e3edf8">${name}</td></tr>
              <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Email</td><td style="padding:12px 16px;border-top:1px solid #e3edf8">${email}</td></tr>
              <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Phone</td><td style="padding:12px 16px;border-top:1px solid #e3edf8">${phone}</td></tr>
              <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Order Reference</td><td style="padding:12px 16px;font-weight:700;border-top:1px solid #e3edf8">${ref}</td></tr>
              <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Amount</td><td style="padding:12px 16px;font-weight:700;border-top:1px solid #e3edf8">${currency} ${amount}</td></tr>
              <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Provider</td><td style="padding:12px 16px;border-top:1px solid #e3edf8">DOKU</td></tr>
              <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Transaction ID</td><td style="padding:12px 16px;border-top:1px solid #e3edf8">${tx}</td></tr>
              <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Channel</td><td style="padding:12px 16px;border-top:1px solid #e3edf8">${channelSafe}</td></tr>
              <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Gateway State</td><td style="padding:12px 16px;border-top:1px solid #e3edf8">${stateSafe}</td></tr>
              <tr><td style="padding:12px 16px;color:#58708d;border-top:1px solid #e3edf8">Status</td><td style="padding:12px 16px;font-weight:800;color:#11814a;border-top:1px solid #e3edf8">PAID / VERIFIED</td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
  </html>`;
}

async function sendPaymentEmails(env,db,orderRef,meta){
  const o=await orderMailData(db,orderRef);
  if(!o) return;

  const jobs=[];

  if(o.customer_email){
    jobs.push(sendEmail(env.RESEND_API_KEY,{
      from:FROM_ADDRESS,
      to:[o.customer_email],
      reply_to:INTERNAL_ADDRESS,
      subject:`Payment & Registration Confirmed — ${o.product_name || o.order_reference}`,
      html:customerHtml(o),
      text:`Dear ${o.customer_name || 'Customer'},

Thank you. Quantum YiJing has successfully verified your payment and your registration is now confirmed.

Product / Course: ${o.product_name || 'Quantum YiJing Purchase'}
Order Reference: ${o.order_reference}
Amount Paid: ${o.currency || 'MYR'} ${Number(o.total||0).toFixed(2)}
Payment Method: DOKU
Payment Status: PAID

DOKU may separately send you its payment invoice/receipt.

Warm regards,
Master Chew Wai Soon
Quantum YiJing International Academy`
    }));
  }

  jobs.push(sendEmail(env.RESEND_API_KEY,{
    from:FROM_ADDRESS,
    to:[INTERNAL_ADDRESS],
    reply_to:o.customer_email || INTERNAL_ADDRESS,
    subject:`Payment Received — ${o.product_name || 'Order'} — ${o.order_reference}`,
    html:internalHtml(o,meta),
    text:`Payment Received

Product / Course: ${o.product_name || 'Quantum YiJing Purchase'}
Customer: ${o.customer_name || ''}
Email: ${o.customer_email || ''}
Phone: ${o.customer_phone || ''}
Order Reference: ${o.order_reference}
Amount: ${o.currency || 'MYR'} ${Number(o.total||0).toFixed(2)}
Provider: DOKU
Transaction ID: ${meta.checkoutId || ''}
Channel: ${meta.channel || ''}
Gateway State: ${meta.state || ''}
Status: PAID / VERIFIED`
  }));

  const results=await Promise.allSettled(jobs);
  for(const r of results){
    if(r.status==='rejected') console.error('Payment notification email failed',r.reason);
  }
}

export async function onRequestPost(context){
  const raw=await context.request.text();

  let p={};
  try{p=JSON.parse(raw)}
  catch{return new Response(null,{status:400})}

  let cfg;
  try{cfg=config(context.env)}
  catch{return new Response(null,{status:503})}

  const h=context.request.headers;
  const client=h.get('Client-Id')||h.get('client-id')||'';
  const ts=h.get('Request-Timestamp')||h.get('request-timestamp')||'';
  const received=h.get('Signature')||h.get('signature')||'';
  const target=new URL(context.request.url).pathname;

  // Proven DOKU Global Checkout notification signature.
  // Values only; Request-Id is intentionally excluded.
  const calculatedDigest=await digest(raw);
  const canonical=[
    client,
    ts,
    target,
    calculatedDigest
  ].join('\n');

  const expected=`HMACSHA256=${await hmac(cfg.secret,canonical)}`;
  const signatureVerified=
    client===cfg.clientId &&
    safeEqual(received,expected);

  const ref=clean(p?.order?.invoice_number||p?.invoice_number,100);
  const checkoutId=clean(
    p?.id||
    p?.transaction?.id||
    p?.transaction?.original_request_id||
    p?.payment?.transaction_id,
    120
  );

  const paymentStatus=clean(
    p?.payment?.status||
    p?.transaction?.status||
    p?.status,
    40
  ).toUpperCase();

  const state=clean(
    p?.payment?.state||
    p?.transaction?.state,
    40
  ).toUpperCase();

  const channel=clean(
    p?.payment?.channel||
    p?.channel?.id||
    p?.service?.id,
    80
  );

  const remoteAmount=Number(p?.payment?.amount ?? p?.order?.amount);
  const remoteCurrency=clean(
    p?.payment?.currency||
    p?.order?.currency,
    12
  ).toUpperCase();

  const db=context.env.ENQUIRIES_DB;

  const local=ref
    ? await db.prepare(`SELECT
        id,total,currency,payment_status,payment_provider,external_order_id
        FROM orders WHERE order_reference=? LIMIT 1`)
        .bind(ref).first()
    : null;

  const orderFound=!!local;
  const amountVerified=orderFound && moneyEqual(local.total,remoteAmount);
  const currencyVerified=
    orderFound &&
    String(local.currency||'MYR').toUpperCase()===remoteCurrency;

  const integrityVerified=
    signatureVerified &&
    orderFound &&
    amountVerified &&
    currencyVerified;

  await logEvent(db,{
    eventType:'Notification',
    orderRef:ref,
    transactionId:checkoutId,
    status:paymentStatus,
    message:[
      paymentStatus,
      state,
      channel,
      signatureVerified?'signature-ok':'signature-failed',
      amountVerified?'amount-ok':'amount-mismatch',
      currencyVerified?'currency-ok':'currency-mismatch'
    ].filter(Boolean).join(' / '),
    signature:received,
    verified:integrityVerified,
    mode:cfg.mode,
    payload:p
  });

  if(!signatureVerified) return new Response(null,{status:401});
  if(!ref||!orderFound) return new Response(null,{status:404});
  if(!amountVerified||!currencyVerified) return new Response(null,{status:409});

  if(paymentStatus==='SUCCESS'){
    const wasAlreadyPaid=String(local.payment_status||'')==='Paid';

    await markPaid(db,{
      orderRef:ref,
      checkoutId,
      statusMessage:`SUCCESS${state?` / ${state}`:''}${channel?` / ${channel}`:''}`,
      mode:cfg.mode
    });

    // DOKU may retry notifications. Send emails only on the first transition to Paid.
    if(!wasAlreadyPaid){
      await sendPaymentEmails(context.env,db,ref,{
        checkoutId,
        state,
        channel
      });
    }

  }else if(paymentStatus==='FAILED'){
    await markTerminal(db,{
      orderRef:ref,
      checkoutId,
      status:'Failed',
      statusMessage:`FAILED${state?` / ${state}`:''}${channel?` / ${channel}`:''}`,
      mode:cfg.mode
    });

  }else if(paymentStatus==='EXPIRED'){
    await markTerminal(db,{
      orderRef:ref,
      checkoutId,
      status:'Expired',
      statusMessage:`EXPIRED${state?` / ${state}`:''}${channel?` / ${channel}`:''}`,
      mode:cfg.mode
    });
  }

  // Valid DOKU notification acknowledgement.
  return new Response(null,{status:200});
}

export function onRequest(c){
  return c.request.method==='POST'
    ? onRequestPost(c)
    : new Response(null,{status:405});
}
