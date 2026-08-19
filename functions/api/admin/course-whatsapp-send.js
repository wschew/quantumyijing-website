
function bearer(req){
  const h=req.headers.get('authorization')||'';
  return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():'';
}
function authorized(req,env){
  return !!env.ADMIN_TOKEN && bearer(req)===env.ADMIN_TOKEN;
}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
function clean(v,max=500){return String(v??'').trim().slice(0,max)}
function json(data,status=200){
  return Response.json(data,{status,headers:{'cache-control':'no-store'}});
}

const RESEND_ENDPOINT='https://api.resend.com/emails';
const FROM='Quantum YiJing International Academy <info@quantumyijing.com>';
const REPLY='info@quantumyijing.com';

function esc(v){
  return String(v??'')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
async function sendEmail(apiKey,payload){
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
function mailHtml(row,product,groupUrl){
  const name=esc(row.customer_name||'Customer');
  const course=esc(product.name_en||product.sku||'Course');
  const courseZh=esc(product.name_zh||product.name_en||product.sku||'课程');
  const url=esc(groupUrl);
  const logo='https://quantumyijing.com/images/quantum-yijing-3d-logo.png';
  return `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,'Noto Sans SC','Microsoft YaHei',sans-serif;color:#17243a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff;border:1px solid #dce7f4;border-radius:20px;overflow:hidden">
    <tr><td style="padding:22px 28px;background:#edf5ff;border-bottom:4px solid #d3a62c">
      <table role="presentation"><tr><td width="82"><img src="${logo}" width="68" height="68" alt="Quantum YiJing®" style="display:block"></td>
      <td><div style="font-size:22px;font-weight:800;color:#082b63">Quantum YiJing</div><div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#45688f">INTERNATIONAL ACADEMY</div></td></tr></table>
    </td></tr>
    <tr><td style="padding:34px">
      <div style="font-size:12px;font-weight:800;letter-spacing:1.5px;color:#1768c4">COURSE WHATSAPP GROUP</div>
      <h1 style="font-size:27px;color:#0b2f66;margin:10px 0 20px">Welcome to ${course}</h1>
      <p style="font-size:15px;line-height:1.75">Dear ${name},</p>
      <p style="font-size:15px;line-height:1.75">Thank you for registering for <strong>${course}</strong>. Your registration and payment have been confirmed.</p>
      <p style="font-size:15px;line-height:1.75">Please use the button below to join the official WhatsApp group for this course. Important course announcements, Zoom information and class-related updates will be communicated through this group.</p>
      <p style="text-align:center;margin:28px 0"><a href="${url}" style="display:inline-block;background:#1267c4;color:#fff;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:10px">Join WhatsApp Group</a></p>
      <p style="font-size:13px;color:#60758d;line-height:1.6">If the button does not open, copy this link into your browser:<br><span style="word-break:break-all">${url}</span></p>

      <div style="border-top:1px solid #dce7f4;margin-top:28px;padding-top:26px">
        <div style="font-size:12px;font-weight:800;letter-spacing:1.4px;color:#1768c4">课程 WHATSAPP 群组</div>
        <h2 style="font-size:23px;color:#0b2f66;margin:10px 0 18px">欢迎加入 ${courseZh}</h2>
        <p style="font-size:15px;line-height:1.85">尊敬的 ${name}：</p>
        <p style="font-size:15px;line-height:1.85">感谢您报名<strong>${courseZh}</strong>。您的报名及付款已确认。</p>
        <p style="font-size:15px;line-height:1.85">请点击以上按钮加入本课程的官方 WhatsApp 群组。课程通知、Zoom 上课资料及相关更新将通过此群组发布。</p>
      </div>
      <p style="margin-top:28px;font-size:15px;line-height:1.75">Warm regards,<br><strong>Master Chew Wai Soon</strong><br><span style="color:#526a85">Founder &amp; Chief Instructor</span></p>
    </td></tr>
  </table></td></tr></table></body></html>`;
}

export async function onRequestPost({request,env}){
  if(!authorized(request,env)) return json({error:'Unauthorized'},401);
  const db=dbOf(env); if(!db) return json({error:'Database unavailable'},503);

  let body={};
  try{body=await request.json()}catch{return json({error:'Invalid request body'},400)}

  const productId=Number(body.product_id||0);
  const resend=body.resend===true;
  const ids=Array.isArray(body.order_ids)
    ? [...new Set(body.order_ids.map(Number).filter(Boolean))].slice(0,100)
    : [];

  if(!productId) return json({error:'product_id is required'},400);
  if(!ids.length) return json({error:'Select at least one paid registrant'},400);

  const product=await db.prepare(`
    SELECT id,sku,name_en,name_zh FROM products WHERE id=? LIMIT 1
  `).bind(productId).first();
  if(!product) return json({error:'Course not found'},404);

  const group=await db.prepare(`
    SELECT group_name,invite_url,is_active
    FROM course_whatsapp_groups WHERE product_id=? LIMIT 1
  `).bind(productId).first();

  if(!group || Number(group.is_active)!==1 || !group.invite_url)
    return json({error:'No active WhatsApp group has been saved for this course.'},400);

  const groupUrl=clean(group.invite_url,1000);
  if(!/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]+(?:[?#].*)?$/i.test(groupUrl))
    return json({error:'The saved WhatsApp group invitation link is invalid.'},400);

  const placeholders=ids.map(()=>'?').join(',');
  const rows=await db.prepare(`
    SELECT DISTINCT
      o.id AS order_id,o.order_reference,o.customer_name,o.customer_email,
      COALESCE(cwi.email_status,'Pending') AS invite_status
    FROM orders o
    JOIN order_items oi ON oi.order_id=o.id
    LEFT JOIN course_whatsapp_invitations cwi
      ON cwi.order_id=o.id AND cwi.product_id=?
    WHERE oi.product_id=?
      AND o.payment_status='Paid'
      AND o.id IN (${placeholders})
      AND COALESCE(o.customer_email,'')<>''
  `).bind(productId,productId,...ids).all();

  const recipients=rows.results||[];
  const results=[];

  for(const row of recipients){
    if(row.invite_status==='Sent' && !resend){
      results.push({order_id:row.order_id,email:row.customer_email,status:'Skipped',reason:'Already sent'});
      continue;
    }

    try{
      await sendEmail(env.RESEND_API_KEY,{
        from:FROM,
        to:[row.customer_email],
        reply_to:REPLY,
        subject:`Welcome to ${product.name_en || product.sku} — Join ${group.group_name || 'the WhatsApp Group'}`,
        html:mailHtml(row,product,groupUrl),
        text:`Dear ${row.customer_name || 'Customer'},

Thank you for registering for ${product.name_en || product.sku}. Your registration and payment have been confirmed.

Please join the official course WhatsApp group:
${groupUrl}

Important course announcements, Zoom information and class-related updates will be communicated through this group.

Warm regards,
Master Chew Wai Soon
Quantum YiJing International Academy`
      });

      await db.prepare(`
        INSERT INTO course_whatsapp_invitations(
          product_id,order_id,customer_name,customer_email,whatsapp_group_url,
          email_status,sent_at,last_error,created_at,updated_at
        ) VALUES(?,?,?,?,?,'Sent',?,'',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(product_id,order_id) DO UPDATE SET
          customer_name=excluded.customer_name,
          customer_email=excluded.customer_email,
          whatsapp_group_url=excluded.whatsapp_group_url,
          email_status='Sent',
          sent_at=excluded.sent_at,
          last_error='',
          updated_at=CURRENT_TIMESTAMP
      `).bind(
        productId,row.order_id,row.customer_name||'',row.customer_email||'',
        groupUrl,new Date().toISOString()
      ).run();

      results.push({order_id:row.order_id,email:row.customer_email,status:'Sent'});
    }catch(e){
      const err=clean(e?.message||'Email failed',1000);
      try{
        await db.prepare(`
          INSERT INTO course_whatsapp_invitations(
            product_id,order_id,customer_name,customer_email,whatsapp_group_url,
            email_status,sent_at,last_error,created_at,updated_at
          ) VALUES(?,?,?,?,?,'Failed','',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
          ON CONFLICT(product_id,order_id) DO UPDATE SET
            customer_name=excluded.customer_name,
            customer_email=excluded.customer_email,
            whatsapp_group_url=excluded.whatsapp_group_url,
            email_status='Failed',
            last_error=excluded.last_error,
            updated_at=CURRENT_TIMESTAMP
        `).bind(productId,row.order_id,row.customer_name||'',row.customer_email||'',groupUrl,err).run();
      }catch{}
      results.push({order_id:row.order_id,email:row.customer_email,status:'Failed',reason:err});
    }
  }

  return json({
    ok:true,
    requested:ids.length,
    matched:recipients.length,
    sent:results.filter(x=>x.status==='Sent').length,
    skipped:results.filter(x=>x.status==='Skipped').length,
    failed:results.filter(x=>x.status==='Failed').length,
    results
  });
}
