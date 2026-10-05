import {
  dbOf,
  clean,
  normalizeEmail,
  validEmail,
  randomToken,
  sha256,
  sendEmail,
  esc,
  json
} from "./_auth.js";


export async function onRequestPost({
  request,
  env
}){

  const db=
    dbOf(env);

  if(!db){
    return json({
      error:"Database unavailable."
    },503);
  }

  /*
   * Always return a generic successful response.
   * Never reveal whether a customer account exists.
   */
  const generic=()=>json({
    ok:true,
    message:
      "If this email is eligible for Academy Portal access, a secure sign-in link will be sent."
  });


  try{

    const body=
      await request.json();

    const email=
      normalizeEmail(body.email);

    if(!validEmail(email)){
      return generic();
    }


    const identity=
      await db.prepare(`
        SELECT
          ci.customer_id,

          c.customer_reference,
          c.display_name,
          c.email,
          c.language,
          c.status

        FROM customer_identifiers ci

        JOIN customers c
          ON c.id=ci.customer_id

        WHERE
          ci.identifier_type='email'
          AND ci.normalized_value=?
          AND c.status='Active'

        LIMIT 1
      `)
        .bind(email)
        .first();


    if(!identity){
      return generic();
    }


    /*
     * Basic account-level rate limit:
     * maximum five generated links per 15 minutes.
     *
     * Still return the same generic public response.
     */
    const recent=
      await db.prepare(`
        SELECT COUNT(*) AS n
        FROM academy_portal_magic_links
        WHERE
          customer_id=?
          AND datetime(created_at) >
              datetime('now','-15 minutes')
      `)
        .bind(identity.customer_id)
        .first();

    if(Number(recent?.n || 0)>=5){
      return generic();
    }


    await db.prepare(`
      UPDATE academy_portal_magic_links
      SET used_at=CURRENT_TIMESTAMP
      WHERE
        customer_id=?
        AND COALESCE(used_at,'')=''
    `)
      .bind(identity.customer_id)
      .run();


    const token=
      randomToken(32);

    const tokenHash=
      await sha256(token);

    const expires=
      new Date(
        Date.now() +
        15*60*1000
      ).toISOString();


    let ipHash="";

    const ip=
      clean(
        request.headers.get("CF-Connecting-IP") || "",
        100
      );

    if(ip){
      ipHash=
        await sha256(ip);
    }


    await db.prepare(`
      INSERT INTO academy_portal_magic_links(
        customer_id,
        email,
        token_hash,
        expires_at,
        requested_ip_hash,
        user_agent
      )
      VALUES(?,?,?,?,?,?)
    `)
      .bind(
        identity.customer_id,
        email,
        tokenHash,
        expires,
        ipHash,
        clean(
          request.headers.get("user-agent") || "",
          500
        )
      )
      .run();


    await db.prepare(`
      INSERT INTO academy_portal_events(
        customer_id,
        event_type,
        source,
        details
      )
      VALUES(
        ?,
        'magic_link_requested',
        'Academy Portal',
        ?
      )
    `)
      .bind(
        identity.customer_id,
        `Email: ${email}`
      )
      .run();


    const origin=
      new URL(request.url).origin;

    const link=
      `${origin}/portal.html?token=${encodeURIComponent(token)}`;


    const result=
      await sendEmail(
        env.RESEND_API_KEY,
        {
          from:
            "Quantum YiJing International Academy <info@quantumyijing.com>",

          to:[
            identity.email || email
          ],

          subject:
            "Quantum YiJing® Academy Portal Sign-In / 学院登录链接",

          html:
            `<div style="font-family:Arial,sans-serif;line-height:1.65;color:#172033">
              <h2 style="color:#0b56a5">Academy Portal Sign-In</h2>

              <p>Dear ${esc(identity.display_name || "Student")},</p>

              <p>Use the secure link below to sign in to your Quantum YiJing® Academy Portal.</p>

              <p>
                <a href="${esc(link)}"
                   style="display:inline-block;padding:12px 20px;background:#0b56a5;color:#fff;text-decoration:none;border-radius:8px">
                   Sign in to Academy Portal
                </a>
              </p>

              <p>This one-time link expires in 15 minutes.</p>

              <p>If you did not request this link, you can ignore this email.</p>

              <hr style="border:0;border-top:1px solid #d8e2ee;margin:24px 0">

              <h2 style="color:#0b56a5">学院登录链接</h2>

              <p>${esc(identity.display_name || "同学")} 您好：</p>

              <p>请点击以上安全链接登录 Quantum YiJing® 国际学院学员平台。</p>

              <p>此一次性登录链接将在 15 分钟后失效。</p>

              <p>若并非您本人提出登录请求，可忽略此邮件。</p>
            </div>`
        }
      );


    if(!result.ok){
      console.error(
        "academy portal magic link email unavailable",
        {
          customer_id:
            identity.customer_id,

          skipped:
            !!result.skipped,

          status:
            result.status || 0
        }
      );
    }


    return generic();

  }
  catch(error){

    console.error(
      "academy portal request-link",
      error
    );

    /*
     * Preserve account enumeration protection.
     */
    return generic();
  }
}