function dbOf(env){
  return env.ENQUIRIES_DB || env.DB || null;
}

function bearer(req){
  const h = req.headers.get('authorization') || '';
  return h.toLowerCase().startsWith('bearer ')
    ? h.slice(7).trim()
    : '';
}

function authorised(req,env){
  return !!env.ADMIN_TOKEN && bearer(req) === env.ADMIN_TOKEN;
}

const allowed = [
  'Pending',
  'Approved',
  'Rejected',
  'Suspended',
  'Archived'
];

function esc(v){
  return String(v ?? '').replace(/[&<>"']/g,c=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c]));
}


async function sendStatusEmail(
  env,
  affiliate,
  previousStatus,
  newStatus,
  reason
){

  if(!env.RESEND_API_KEY || !affiliate?.email){
    return {
      sent:false,
      skipped:true
    };
  }


  let subject =
    'Quantum YiJing® Affiliate Account Update';

  let headline =
    'Affiliate Account Update';

  let headlineZh =
    '联盟账户更新';

  let bodyEn =
    `Your Quantum YiJing® Affiliate account status has been updated to ${newStatus}.`;

  let bodyZh =
    `您的 Quantum YiJing® 联盟账户状态已更新为 ${newStatus}。`;


  /*
   * APPROVED / RESTORED
   */
  if(
    newStatus === 'Approved' &&
    previousStatus !== 'Approved'
  ){

    if(
      previousStatus === 'Suspended' ||
      previousStatus === 'Archived'
    ){

      subject =
        'Your Quantum YiJing® Affiliate Account Has Been Restored';

      headline =
        'Affiliate Account Restored';

      headlineZh =
        '联盟账户已恢复';  

      bodyEn =
        'Your Quantum YiJing® Affiliate account has been restored and portal access is available again.';

      bodyZh =
        '您的 Quantum YiJing® 联盟账户已恢复，现在可以重新使用联盟平台。';

    }else{

      subject =
        'Your Quantum YiJing® Affiliate Account Is Approved';

      headline =
        'Affiliate Account Approved';

      headlineZh =
        '联盟账户已获批准';

      bodyEn =
        'Your Quantum YiJing® Affiliate account has been approved.';

      bodyZh =
        '您的 Quantum YiJing® 联盟账户已获批准。';
    }
  }


  /*
   * SUSPENDED
   */
  else if(newStatus === 'Suspended'){

    subject =
      'Quantum YiJing® Affiliate Account Suspended';

    headline =
      'Affiliate Account Suspended';

    headlineZh =
      '联盟账户已暂停';

    bodyEn =
      'Your Quantum YiJing® Affiliate account has been temporarily suspended and portal access has been disabled.';

    bodyZh =
      '您的 Quantum YiJing® 联盟账户已暂时停用，联盟平台访问权限也已关闭。';
  }


  /*
   * REJECTED
   */
  else if(newStatus === 'Rejected'){

    subject =
      'Quantum YiJing® Affiliate Application Status';

    headline =
      'Affiliate Application Update';

    headlineZh =
      '联盟申请状态更新';
    bodyEn =
      'Your Quantum YiJing® Affiliate application/account has been marked as Rejected.';

    bodyZh =
      '您的 Quantum YiJing® 联盟申请/账户状态已更新为未获批准。';
  }


  /*
   * ARCHIVED
   */
  else if(newStatus === 'Archived'){

    subject =
      'Quantum YiJing® Affiliate Account Archived';

    headline =
      'Affiliate Account Archived';

    headlineZh =
      '联盟账户已归档';

    bodyEn =
      'Your Quantum YiJing® Affiliate account has been archived and portal access has been disabled.';

    bodyZh =
      '您的 Quantum YiJing® 联盟账户已归档，联盟平台访问权限已关闭。';
  }


const reasonEnHtml = reason
  ? `
    <div style="margin:20px 0;padding:14px 16px;background:#fff8e6;border-left:4px solid #d3a62c;border-radius:8px;font-size:14px;line-height:1.7;color:#43566d">
      <strong>Reason:</strong><br>
      ${esc(reason)}
    </div>
  `
  : '';

const reasonZhHtml = reason
  ? `
    <div style="margin:20px 0;padding:14px 16px;background:#fff8e6;border-left:4px solid #d3a62c;border-radius:8px;font-size:14px;line-height:1.7;color:#43566d">
      <strong>原因：</strong><br>
      ${esc(reason)}
    </div>
  `
  : '';

  const logoUrl =
  'https://quantumyijing.com/images/quantum-yijing-3d-logo.png';

const safeName = esc(
  affiliate.display_name ||
  affiliate.full_name ||
  'Affiliate'
);

const safeCode = esc(affiliate.affiliate_code || '');

const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,'Noto Sans SC','Microsoft YaHei',sans-serif;color:#17243a">

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f7fb">
<tr>
<td align="center" style="padding:28px 12px">

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
style="max-width:680px;background:#ffffff;border:1px solid #dce7f4;border-radius:20px;overflow:hidden;box-shadow:0 12px 34px rgba(19,55,96,.10)">

<tr>
<td style="padding:26px 30px;background:#edf5ff;border-bottom:4px solid #d3a62c">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td width="82" valign="middle">
<img src="${logoUrl}" width="68" height="68"
alt="Quantum YiJing International Academy"
style="display:block;width:68px;height:68px;object-fit:contain;border:0">
</td>

<td valign="middle">
<div style="font-size:21px;line-height:1.2;font-weight:800;color:#082b63">
Quantum YiJing
</div>
<div style="margin-top:4px;font-size:11px;line-height:1.4;font-weight:700;letter-spacing:2px;color:#45688f">
INTERNATIONAL ACADEMY
</div>
</td>
</tr>
</table>
</td>
</tr>

<tr>
<td style="padding:34px 34px 18px">

<div style="font-size:12px;font-weight:800;letter-spacing:1.7px;color:#1768c4;text-transform:uppercase">
Affiliate Programme
</div>

<h1 style="margin:10px 0 22px;font-size:27px;line-height:1.28;color:#0b2f66">
${esc(headline)}
</h1>

<p style="margin:0 0 16px;font-size:15px;line-height:1.75">
Dear ${safeName},
</p>

<p style="margin:0 0 16px;font-size:15px;line-height:1.75">
${esc(bodyEn)}
</p>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
style="margin:24px 0;background:#f7faff;border:1px solid #dce8f6;border-radius:12px">

<tr>
<td style="padding:13px 16px;color:#58708d;font-size:13px;width:145px">
Affiliate Code
</td>
<td style="padding:13px 16px;font-size:13px;font-weight:700;color:#173b63">
${safeCode || '—'}
</td>
</tr>

<tr>
<td style="padding:13px 16px;color:#58708d;font-size:13px;border-top:1px solid #e3edf8">
Status
</td>
<td style="padding:13px 16px;font-size:13px;font-weight:700;color:#173b63;border-top:1px solid #e3edf8">
${esc(newStatus)}
</td>
</tr>

</table>

${reasonEnHtml}

<p style="margin:24px 0 0;font-size:15px;line-height:1.75">
Warm regards,<br>
<strong>Master Chew Wai Soon</strong><br>
<span style="color:#526a85">Founder &amp; Chief Instructor</span>
</p>

</td>
</tr>

<tr>
<td style="padding:8px 34px 26px">

<div style="border-top:1px solid #dce7f4;padding-top:26px">

<div style="font-size:12px;font-weight:800;letter-spacing:1.4px;color:#1768c4">
联盟计划
</div>

<h2 style="margin:10px 0 20px;font-size:23px;line-height:1.4;color:#0b2f66">
${esc(headlineZh)}
</h2>

<p style="margin:0 0 16px;font-size:15px;line-height:1.85">
尊敬的 ${safeName}：
</p>

<p style="margin:0 0 16px;font-size:15px;line-height:1.85">
${esc(bodyZh)}
</p>

<p style="margin:18px 0;font-size:15px;line-height:1.85">
<strong>联盟编号：</strong> ${safeCode || '—'}
</p>

${reasonZhHtml}

<p style="margin:24px 0 0;font-size:15px;line-height:1.85">
敬祝安好！<br>
<strong>赵辉顺导师</strong><br>
<span style="color:#526a85">创办人｜首席导师</span>
</p>

</div>
</td>
</tr>

<tr>
<td align="center"
style="padding:22px 26px;background:#f7f9fc;border-top:1px solid #e0e8f2;color:#5d7189;font-size:12px;line-height:1.8">

<a href="https://quantumyijing.com"
style="color:#1768c4;text-decoration:none;font-weight:700">
quantumyijing.com
</a>

&nbsp;&nbsp;•&nbsp;&nbsp;

<a href="mailto:info@quantumyijing.com"
style="color:#1768c4;text-decoration:none;font-weight:700">
info@quantumyijing.com
</a>

<br>

<span style="color:#7a8ca2">
Where Ancient Wisdom Meets Modern Scientific Thinking
</span>

<br>

<span style="color:#9aa8b8">
© ${new Date().getFullYear()} Quantum YiJing International Academy
</span>

</td>
</tr>

</table>
</td>
</tr>
</table>

</body>
</html>`;


  const r = await fetch(
    'https://api.resend.com/emails',
    {
      method:'POST',

      headers:{
        Authorization:`Bearer ${env.RESEND_API_KEY}`,
        'Content-Type':'application/json'
      },

      body:JSON.stringify({

        from:
          env.AFFILIATE_FROM_EMAIL ||
          'Quantum YiJing International Academy <info@quantumyijing.com>',

        to:[affiliate.email],

        subject,

        html
      })
    }
  );


  if(!r.ok){

    const errorText = await r.text();

    console.error(
      'affiliate status email failed',
      r.status,
      errorText
    );

    return {
      sent:false,
      status:r.status,
      error:errorText
    };
  }


  return {
    sent:true
  };
}


export async function onRequestGet({request,env}){

  if(!authorised(request,env)){
    return Response.json(
      {error:'Unauthorized'},
      {status:401}
    );
  }


  const db = dbOf(env);

  if(!db){
    return Response.json(
      {error:'Database unavailable'},
      {status:503}
    );
  }


  const u = new URL(request.url);

  const id = Number(
    u.searchParams.get('affiliate_id') || 0
  );


  if(!id){
    return Response.json(
      {error:'Affiliate ID required.'},
      {status:400}
    );
  }


  const row = await db.prepare(`
    SELECT
      id,
      affiliate_code,
      full_name,
      display_name,
      email,
      status,
      portal_enabled,
      membership_expires_at,
      is_test_account,
      admin_status_reason,
      admin_status_updated_at,
      admin_status_updated_by,
      last_portal_disabled_at,
      last_portal_enabled_at

    FROM affiliates

    WHERE id=?
  `).bind(id).first();


  if(!row){
    return Response.json(
      {error:'Affiliate not found.'},
      {status:404}
    );
  }


  return Response.json(
    {affiliate:row},
    {
      headers:{
        'cache-control':'no-store'
      }
    }
  );
}


export async function onRequestPost({request,env}){

  if(!authorised(request,env)){
    return Response.json(
      {error:'Unauthorized'},
      {status:401}
    );
  }


  const db = dbOf(env);

  if(!db){
    return Response.json(
      {error:'Database unavailable'},
      {status:503}
    );
  }


  try{

    const b = await request.json();

    const id =
      Number(b.affiliate_id || 0);

    const action =
      String(b.action || '').trim();

    const reason =
      String(b.reason || '').trim();


    if(!id){

      return Response.json(
        {error:'Affiliate ID required.'},
        {status:400}
      );
    }


    const affiliate = await db.prepare(`
      SELECT
        id,
        affiliate_code,
        full_name,
        display_name,
        email,
        status,
        portal_enabled,
        is_test_account

      FROM affiliates

      WHERE id=?
    `).bind(id).first();


    if(!affiliate){

      return Response.json(
        {error:'Affiliate not found.'},
        {status:404}
      );
    }


    const now =
      new Date().toISOString();


    /*
     * SAVE ACCOUNT STATUS
     */
    if(action === 'save_status'){

      const status =
        String(b.status || '').trim();


      if(!allowed.includes(status)){

        return Response.json(
          {error:'Invalid affiliate status.'},
          {status:400}
        );
      }


      let portal =
        Number(b.portal_enabled ? 1 : 0);


      if(
        [
          'Suspended',
          'Rejected',
          'Archived'
        ].includes(status)
      ){
        portal = 0;
      }


      await db.prepare(`
        UPDATE affiliates

        SET
          status=?,
          portal_enabled=?,
          admin_status_reason=?,
          admin_status_updated_at=?,
          admin_status_updated_by='Admin',

          last_portal_disabled_at =
            CASE
              WHEN ?=0
              THEN ?
              ELSE last_portal_disabled_at
            END,

          last_portal_enabled_at =
            CASE
              WHEN ?=1
              THEN ?
              ELSE last_portal_enabled_at
            END,

          suspended_at =
            CASE
              WHEN ?='Suspended'
              THEN ?
              ELSE suspended_at
            END,

          rejected_at =
            CASE
              WHEN ?='Rejected'
              THEN ?
              ELSE rejected_at
            END,

          updated_at=CURRENT_TIMESTAMP

        WHERE id=?
      `).bind(

        status,
        portal,
        reason,
        now,

        portal,
        now,

        portal,
        now,

        status,
        now,

        status,
        now,

        id

      ).run();


      /*
       * Disable all current login sessions
       * whenever portal access is disabled.
       */
      if(portal === 0){

        await db.prepare(`
          UPDATE affiliate_sessions

          SET revoked_at=?

          WHERE affiliate_id=?
            AND revoked_at=''
        `).bind(
          now,
          id
        ).run();
      }


      /*
       * Send email ONLY when status actually changes.
       *
       * Test affiliates are intentionally NOT excluded.
       * QY-A0002 must be able to test the entire workflow.
       */
      let emailNotification = {
        sent:false,
        skipped:true
      };


      if(affiliate.status !== status){

        emailNotification =
          await sendStatusEmail(
            env,
            affiliate,
            affiliate.status,
            status,
            reason
          );
      }


      return Response.json({

        ok:true,

        previous_status:
          affiliate.status,

        status,

        portal_enabled:
          portal,

        email_notification:
          emailNotification
      });
    }


    /*
     * MANUAL SESSION REVOCATION
     */
    if(action === 'revoke_sessions'){

      await db.prepare(`
        UPDATE affiliate_sessions

        SET revoked_at=?

        WHERE affiliate_id=?
          AND revoked_at=''
      `).bind(
        now,
        id
      ).run();


      return Response.json({
        ok:true
      });
    }


    return Response.json(
      {error:'Unknown action.'},
      {status:400}
    );


  }catch(e){

    console.error(
      'affiliate control',
      e
    );


    return Response.json(
      {
        error:
          'Unable to update affiliate account.'
      },
      {status:500}
    );
  }
}