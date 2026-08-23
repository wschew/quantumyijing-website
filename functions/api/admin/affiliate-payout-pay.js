
function tok(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():''}
function ok(req,env){return !!env.ADMIN_TOKEN&&tok(req)===env.ADMIN_TOKEN}
function dbOf(env){return env.ENQUIRIES_DB||env.DB||env.D1||null}
const clean=(v,n=300)=>String(v??'').trim().slice(0,n);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(c,v)=>`${esc(c||'MYR')} ${Number(v||0).toFixed(2)}`;

async function resend(env,{to,subject,html}){
  if(!env.RESEND_API_KEY) return {sent:false,error:'RESEND_API_KEY is not configured.'};
  if(!to) return {sent:false,error:'Recipient email is missing.'};

  const r=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{
      Authorization:`Bearer ${env.RESEND_API_KEY}`,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({
      from:env.AFFILIATE_FROM_EMAIL || 'Quantum YiJing International Academy <info@quantumyijing.com>',
      to:[to],
      subject,
      html
    })
  });

  const text=await r.text();
  let body={};
  try{body=text?JSON.parse(text):{}}catch{body={raw:text}}

  if(!r.ok){
    console.error('Affiliate payout email failed',r.status,text);
    return {sent:false,error:`Resend ${r.status}: ${text.slice(0,900)}`};
  }

  return {sent:true,id:body.id||''};
}

function header(subtitle){
  return `
  <tr>
    <td style="padding:26px 30px;background:#edf5ff;border-bottom:4px solid #d3a62c">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td width="82" valign="middle">
            <img src="https://quantumyijing.com/images/quantum-yijing-3d-logo.png"
              width="68" height="68" alt="Quantum YiJing"
              style="display:block;width:68px;height:68px;object-fit:contain;border:0">
          </td>
          <td valign="middle">
            <div style="font-size:21px;line-height:1.2;font-weight:800;color:#082b63">Quantum YiJing</div>
            <div style="margin-top:4px;font-size:11px;line-height:1.4;font-weight:700;letter-spacing:2px;color:#45688f">
              ${esc(subtitle)}
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function footer(){
  return `
  <tr>
    <td align="center" style="padding:22px 26px;background:#f7f9fc;border-top:1px solid #e0e8f2;color:#5d7189;font-size:12px;line-height:1.8">
      <a href="https://quantumyijing.com" style="color:#1768c4;text-decoration:none;font-weight:700">quantumyijing.com</a>
      &nbsp;&nbsp;•&nbsp;&nbsp;
      <a href="mailto:info@quantumyijing.com" style="color:#1768c4;text-decoration:none;font-weight:700">info@quantumyijing.com</a>
      <br><span style="color:#7a8ca2">Where Ancient Wisdom Meets Modern Scientific Thinking</span>
      <br><span style="color:#9aa8b8">© ${new Date().getFullYear()} Quantum YiJing International Academy</span>
    </td>
  </tr>`;
}

function breakdownRows(items){
  return items.map((x,i)=>`
    <tr>
      <td style="padding:11px 10px;border-top:1px solid #e2eaf4;font-size:12px">${i+1}</td>
      <td style="padding:11px 10px;border-top:1px solid #e2eaf4;font-size:12px">${esc(x.order_reference||'—')}</td>
      <td style="padding:11px 10px;border-top:1px solid #e2eaf4;font-size:12px">${esc(x.customer_name||'—')}</td>
      <td style="padding:11px 10px;border-top:1px solid #e2eaf4;font-size:12px">${esc(x.product_name||'—')}</td>
      <td style="padding:11px 10px;border-top:1px solid #e2eaf4;font-size:12px;text-align:right">${money(x.currency,x.gross_sale)}</td>
      <td style="padding:11px 10px;border-top:1px solid #e2eaf4;font-size:12px;text-align:right">${Number(x.commission_rate||0).toFixed(2)}%</td>
      <td style="padding:11px 10px;border-top:1px solid #e2eaf4;font-size:12px;text-align:right;font-weight:700">${money(x.currency,x.net_commission_amount??x.commission_amount)}</td>
    </tr>
  `).join('');
}

function summaryTable(p){
  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
    style="margin:22px 0;background:#f7faff;border:1px solid #dce8f6;border-radius:12px;overflow:hidden">
    <tr><td style="padding:12px 16px;color:#58708d;font-size:13px">Affiliate</td><td style="padding:12px 16px;font-size:13px;font-weight:700">${esc(p.full_name)} (${esc(p.affiliate_code||'—')})</td></tr>
    <tr><td style="padding:12px 16px;color:#58708d;font-size:13px;border-top:1px solid #e3edf8">Payout Period</td><td style="padding:12px 16px;font-size:13px;font-weight:700;border-top:1px solid #e3edf8">${esc(p.payout_period)}</td></tr>
    <tr><td style="padding:12px 16px;color:#58708d;font-size:13px;border-top:1px solid #e3edf8">Payout Reference</td><td style="padding:12px 16px;font-size:13px;font-weight:700;border-top:1px solid #e3edf8">${esc(p.payout_reference)}</td></tr>
    <tr><td style="padding:12px 16px;color:#58708d;font-size:13px;border-top:1px solid #e3edf8">Paid Date</td><td style="padding:12px 16px;font-size:13px;font-weight:700;border-top:1px solid #e3edf8">${esc(p.payment_date)}</td></tr>
    <tr><td style="padding:12px 16px;color:#58708d;font-size:13px;border-top:1px solid #e3edf8">Bank Transaction Reference</td><td style="padding:12px 16px;font-size:13px;font-weight:700;border-top:1px solid #e3edf8">${esc(p.payment_reference)}</td></tr>
    <tr><td style="padding:12px 16px;color:#58708d;font-size:13px;border-top:1px solid #e3edf8">Total Sales</td><td style="padding:12px 16px;font-size:13px;font-weight:700;border-top:1px solid #e3edf8">${money(p.currency,p.total_sales)}</td></tr>
    <tr><td style="padding:12px 16px;color:#58708d;font-size:13px;border-top:1px solid #e3edf8">Gross Commission</td><td style="padding:12px 16px;font-size:14px;font-weight:700;border-top:1px solid #e3edf8">${money(p.currency,p.gross_commission||p.total_commission)}</td></tr>
    <tr><td style="padding:12px 16px;color:#58708d;font-size:13px;border-top:1px solid #e3edf8">Refund / Reversal Adjustments</td><td style="padding:12px 16px;font-size:14px;font-weight:700;color:#b42318;border-top:1px solid #e3edf8">${money(p.currency,p.adjustment_total||0)}</td></tr>
    <tr><td style="padding:12px 16px;color:#58708d;font-size:13px;border-top:1px solid #e3edf8">Net Commission Paid</td><td style="padding:12px 16px;font-size:15px;font-weight:800;color:#168346;border-top:1px solid #e3edf8">${money(p.currency,p.total_commission)}</td></tr>
  </table>`;
}

function commissionTable(items){
  return `
  <div style="margin:24px 0">
    <div style="font-size:14px;font-weight:800;color:#0b2f66;margin-bottom:10px">Commission Breakdown</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
      style="border:1px solid #dce8f6;border-radius:12px;overflow:hidden;border-collapse:separate;border-spacing:0">
      <tr style="background:#edf5ff;color:#173b63">
        <th style="padding:10px;font-size:11px;text-align:left">#</th>
        <th style="padding:10px;font-size:11px;text-align:left">Order</th>
        <th style="padding:10px;font-size:11px;text-align:left">Customer</th>
        <th style="padding:10px;font-size:11px;text-align:left">Product</th>
        <th style="padding:10px;font-size:11px;text-align:right">Sale</th>
        <th style="padding:10px;font-size:11px;text-align:right">Rate</th>
        <th style="padding:10px;font-size:11px;text-align:right">Commission</th>
      </tr>
      ${breakdownRows(items)}
    </table>
  </div>`;
}

function affiliateEmailHtml(p,items){
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,'Noto Sans SC','Microsoft YaHei',sans-serif;color:#17243a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
    style="max-width:760px;background:#fff;border:1px solid #dce7f4;border-radius:20px;overflow:hidden">
    ${header('AFFILIATE COMMISSION PAYOUT')}
    <tr><td style="padding:34px">
      <div style="font-size:12px;font-weight:800;letter-spacing:1.7px;color:#1768c4;text-transform:uppercase">Affiliate Programme</div>
      <h1 style="margin:10px 0 22px;font-size:27px;color:#0b2f66">Monthly Commission Payout Completed</h1>
      <p style="font-size:15px;line-height:1.75">Dear ${esc(p.full_name||'Affiliate')},</p>
      <p style="font-size:15px;line-height:1.75">Your Quantum YiJing® affiliate commission payout for <strong>${esc(p.payout_period)}</strong> has been completed by bank transfer. The payout summary and commission breakdown are shown below for your records.</p>
      ${summaryTable(p)}
      ${commissionTable(items)}
      <p style="font-size:15px;line-height:1.75">Please keep this email as your payout record.</p>

      <div style="border-top:1px solid #dce7f4;margin-top:28px;padding-top:24px">
        <div style="font-size:12px;font-weight:800;letter-spacing:1.4px;color:#1768c4">联盟计划</div>
        <h2 style="margin:10px 0 18px;font-size:22px;color:#0b2f66">每月联盟佣金已完成付款</h2>
        <p style="font-size:15px;line-height:1.85">尊敬的 ${esc(p.full_name||'联盟伙伴')}：</p>
        <p style="font-size:15px;line-height:1.85">您在 <strong>${esc(p.payout_period)}</strong> 的 Quantum YiJing® 联盟佣金已通过银行转账完成。以上列出本月佣金明细、付款日期及银行交易编号，请保存此邮件作为付款记录。</p>
      </div>

      <p style="margin-top:26px;font-size:15px;line-height:1.75">Warm regards,<br><strong>Master Chew Wai Soon</strong><br><span style="color:#526a85">Founder &amp; Chief Instructor</span></p>
    </td></tr>
    ${footer()}
  </table></td></tr></table></body></html>`;
}

function accountingEmailHtml(p,items){
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#17243a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
    style="max-width:760px;background:#fff;border:1px solid #dce7f4;border-radius:20px;overflow:hidden">
    ${header('ACCOUNTING — AFFILIATE PAYOUT RECORD')}
    <tr><td style="padding:34px">
      <h1 style="margin:0 0 18px;font-size:27px;color:#0b2f66">Affiliate Payout Paid</h1>
      <p style="font-size:15px;line-height:1.75">This email is the internal QY accounting record for a completed affiliate bank transfer.</p>
      ${summaryTable(p)}
      ${commissionTable(items)}
      <p style="font-size:13px;color:#65788f;line-height:1.7">Accounting status: <strong>PAID</strong>. Linked affiliate commissions have been marked Paid using the same payout date.</p>
    </td></tr>
    ${footer()}
  </table></td></tr></table></body></html>`;
}

async function logEmail(db,payoutId,type,email,result){
  try{
    await db.prepare(`
      INSERT INTO affiliate_payout_email_log(
        payout_id,recipient_type,recipient_email,status,provider_message_id,error,sent_at
      ) VALUES(?,?,?,?,?,?,?)
    `).bind(
      payoutId,type,email,
      result.sent?'Sent':'Failed',
      result.id||'',
      result.error||'',
      result.sent?new Date().toISOString():''
    ).run();
  }catch(e){
    console.error('Unable to log affiliate payout email',e);
  }
}


async function hasStaleAdjustments(db,p){
  const mismatch=await db.prepare(`
    SELECT COUNT(*) count
    FROM affiliate_payout_items pi
    JOIN affiliate_commissions ac ON ac.id=pi.commission_id
    WHERE pi.payout_id=?
      AND ABS(COALESCE(pi.pre_payout_adjustment,0)-COALESCE((
        SELECT SUM(aa.adjustment_amount)
        FROM affiliate_commission_adjustments aa
        WHERE aa.commission_id=ac.id
          AND aa.recovery_mode='PrePayout'
          AND aa.status!='Cancelled'
      ),0))>0.005
  `).bind(p.id).first();
  if(Number(mismatch?.count||0)>0) return true;
  const unreserved=await db.prepare(`
    SELECT COUNT(*) count
    FROM affiliate_commission_adjustments aa
    WHERE aa.affiliate_id=?
      AND aa.recovery_mode='CarryForward'
      AND aa.status='Open'
      AND NOT EXISTS(
        SELECT 1 FROM affiliate_payout_adjustments pa
        WHERE pa.payout_id=? AND pa.adjustment_id=aa.id
      )
      AND (aa.adjustment_amount-COALESCE((
        SELECT SUM(pa2.applied_amount)
        FROM affiliate_payout_adjustments pa2
        JOIN affiliate_payouts ap2 ON ap2.id=pa2.payout_id
        WHERE pa2.adjustment_id=aa.id
          AND ap2.status IN ('Draft','Approved','Paid')
      ),0))<-0.005
  `).bind(p.affiliate_id,p.id).first();
  return Number(unreserved?.count||0)>0;
}

export async function onRequestPost({request,env}){
  if(!ok(request,env)) return Response.json({error:'Unauthorized'},{status:401});
  const db=dbOf(env); if(!db) return Response.json({error:'Database unavailable'},{status:503});

  const b=await request.json().catch(()=>({}));
  const id=Number(b.payout_id||0);
  const paymentReference=clean(b.payment_reference,160);
  const paymentDate=clean(b.payment_date,32);

  if(!id||!paymentReference||!paymentDate)
    return Response.json({error:'payout_id, payment_reference and payment_date are required.'},{status:400});

  const p=await db.prepare(`
    SELECT ap.*,a.affiliate_code,a.full_name,a.email
    FROM affiliate_payouts ap
    JOIN affiliates a ON a.id=ap.affiliate_id
    WHERE ap.id=? LIMIT 1
  `).bind(id).first();

  if(!p) return Response.json({error:'Payout not found.'},{status:404});
  if(p.status!=='Approved') return Response.json({error:'Only Approved payouts can be marked Paid.'},{status:409});

  const invalid=await db.prepare(`
    SELECT COUNT(*) AS count
    FROM affiliate_payout_items api
    JOIN affiliate_commissions ac ON ac.id=api.commission_id
    LEFT JOIN payments py ON py.id=(
      SELECT p2.id FROM payments p2 WHERE p2.order_id=ac.order_id ORDER BY p2.id DESC LIMIT 1
    )
    LEFT JOIN orders o ON o.id=ac.order_id
    WHERE api.payout_id=?
      AND NOT(
        COALESCE(py.status,'')='Paid'
        AND COALESCE(py.verification_status,'')='Verified'
        AND COALESCE(py.accounting_eligible,0)=1
        AND COALESCE(o.payment_status,'')='Paid'
      )
  `).bind(id).first();

  if(Number(invalid?.count||0)>0)
    return Response.json({
      error:'Payment eligibility changed after approval. Do not pay this batch until the affected sales are reviewed.'
    },{status:409});

  if(await hasStaleAdjustments(db,p))
    return Response.json({
      error:'A refund/reversal adjustment changed after approval. Do not pay this batch. Cancel/Rebuild it first.'
    },{status:409});

  const itemRows=await db.prepare(`
    SELECT
      ac.id,ac.order_reference,ac.customer_name,ac.product_name,
      ac.gross_sale,ac.currency,ac.commission_rate,ac.commission_amount,
      COALESCE(api.original_commission_amount,ac.commission_amount) AS original_commission_amount,
      COALESCE(api.pre_payout_adjustment,0) AS pre_payout_adjustment,
      COALESCE(NULLIF(api.net_commission_amount,0),ac.commission_amount) AS net_commission_amount
    FROM affiliate_payout_items api
    JOIN affiliate_commissions ac ON ac.id=api.commission_id
    WHERE api.payout_id=?
    ORDER BY ac.id
  `).bind(id).all();

  const items=itemRows.results||[];

  await db.prepare('BEGIN').run();
  try{
    await db.prepare(`
      UPDATE affiliate_payouts
      SET status='Paid',payment_reference=?,payment_date=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).bind(paymentReference,paymentDate,id).run();

    await db.prepare(`
      UPDATE affiliate_commissions
      SET status='Paid',paid_at=?,updated_at=CURRENT_TIMESTAMP
      WHERE id IN(
        SELECT commission_id FROM affiliate_payout_items WHERE payout_id=?
      )
    `).bind(paymentDate,id).run();

    const allocated=await db.prepare(`SELECT adjustment_id FROM affiliate_payout_adjustments WHERE payout_id=?`).bind(id).all();
    for(const row of (allocated.results||[])){
      const bal=await db.prepare(`
        SELECT aa.adjustment_amount,COALESCE((
          SELECT SUM(pa.applied_amount)
          FROM affiliate_payout_adjustments pa
          JOIN affiliate_payouts ap2 ON ap2.id=pa.payout_id
          WHERE pa.adjustment_id=aa.id AND ap2.status='Paid'
        ),0) paid_applied
        FROM affiliate_commission_adjustments aa WHERE aa.id=?
      `).bind(row.adjustment_id).first();
      if(bal && Math.abs(Number(bal.adjustment_amount||0)-Number(bal.paid_applied||0))<=0.005){
        await db.prepare(`UPDATE affiliate_commission_adjustments SET status='Applied',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(row.adjustment_id).run();
      }
    }

    await db.prepare('COMMIT').run();
  }catch(e){
    try{await db.prepare('ROLLBACK').run()}catch{}
    console.error(e);
    return Response.json({error:'Unable to record payout payment.'},{status:500});
  }

  const paidPayout={...p,status:'Paid',payment_reference:paymentReference,payment_date:paymentDate};

  const accountingEmail=
    env.AFFILIATE_ACCOUNTING_EMAIL ||
    env.QY_ACCOUNTING_EMAIL ||
    'info@quantumyijing.com';

  const [affiliateResult,accountingResult]=await Promise.all([
    resend(env,{
      to:p.email,
      subject:`Quantum YiJing® Affiliate Payout — ${p.payout_period} — ${money(p.currency,p.total_commission)}`,
      html:affiliateEmailHtml(paidPayout,items)
    }),
    resend(env,{
      to:accountingEmail,
      subject:`[QY Accounting] Affiliate Payout Paid — ${p.full_name} — ${p.payout_period}`,
      html:accountingEmailHtml(paidPayout,items)
    })
  ]);

  await Promise.all([
    logEmail(db,id,'Affiliate',p.email||'',affiliateResult),
    logEmail(db,id,'Accounting',accountingEmail,accountingResult)
  ]);

  return Response.json({
    ok:true,
    status:'Paid',
    affiliate_email_sent:affiliateResult.sent,
    affiliate_email_error:affiliateResult.error||'',
    accounting_email_sent:accountingResult.sent,
    accounting_email_error:accountingResult.error||''
  });
}
