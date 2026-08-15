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

      bodyEn =
        'Your Quantum YiJing® Affiliate account has been restored and portal access is available again.';

      bodyZh =
        '您的 Quantum YiJing® 联盟账户已恢复，现在可以重新使用联盟平台。';

    }else{

      subject =
        'Your Quantum YiJing® Affiliate Account Is Approved';

      headline =
        'Affiliate Account Approved';

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

    bodyEn =
      'Your Quantum YiJing® Affiliate account has been archived and portal access has been disabled.';

    bodyZh =
      '您的 Quantum YiJing® 联盟账户已归档，联盟平台访问权限已关闭。';
  }


  const reasonHtml = reason
    ? `
      <p>
        <strong>Reason / 原因:</strong><br>
        ${esc(reason)}
      </p>
    `
    : '';


  const html = `
    <div
      style="
        font-family:Arial,sans-serif;
        line-height:1.6;
        color:#172033;
        max-width:680px;
        margin:auto;
      "
    >

      <h2 style="color:#0b56a5">
        ${esc(headline)}
      </h2>

      <p>
        Dear ${esc(
          affiliate.display_name ||
          affiliate.full_name ||
          'Affiliate'
        )},
      </p>

      <p>${esc(bodyEn)}</p>

      <p>${esc(bodyZh)}</p>

      ${reasonHtml}

      <p>
        <strong>Affiliate Code:</strong>
        ${esc(affiliate.affiliate_code || '')}
      </p>

      <hr
        style="
          border:0;
          border-top:1px solid #dfe6ef;
        "
      >

      <p style="color:#667085">
        Quantum YiJing® Affiliate Programme
      </p>

    </div>
  `;


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