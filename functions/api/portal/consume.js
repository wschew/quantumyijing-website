import {
  dbOf,
  clean,
  randomToken,
  sha256,
  sessionCookie,
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


  try{

    const body=
      await request.json();

    const token=
      clean(
        body.token,
        300
      );

    if(!token){
      return json({
        error:
          "Sign-in link is invalid or expired."
      },400);
    }


    const tokenHash=
      await sha256(token);


    const magic=
      await db.prepare(`
        SELECT
          ml.id,
          ml.customer_id,
          ml.expires_at,

          c.status

        FROM academy_portal_magic_links ml

        JOIN customers c
          ON c.id=ml.customer_id

        WHERE
          ml.token_hash=?
          AND COALESCE(ml.used_at,'')=''
          AND datetime(ml.expires_at)>datetime('now')
          AND c.status='Active'

        LIMIT 1
      `)
        .bind(tokenHash)
        .first();


    if(!magic){
      return json({
        error:
          "Sign-in link is invalid or expired."
      },400);
    }


    const now=
      new Date().toISOString();

    const sessionToken=
      randomToken(32);

    const sessionHash=
      await sha256(sessionToken);

    const sessionExpires=
      new Date(
        Date.now() +
        7*24*60*60*1000
      ).toISOString();


    /*
     * Consume the one-time token and create the session.
     *
     * The INSERT SELECT only succeeds when this exact request
     * changed used_at to the exact value represented by now.
     */
    await db.batch([
      db.prepare(`
        UPDATE academy_portal_magic_links
        SET used_at=?
        WHERE
          id=?
          AND COALESCE(used_at,'')=''
          AND datetime(expires_at)>datetime('now')
      `)
        .bind(
          now,
          magic.id
        ),

      db.prepare(`
        INSERT INTO academy_portal_sessions(
          customer_id,
          token_hash,
          expires_at,
          last_seen_at,
          user_agent
        )
        SELECT
          customer_id,
          ?,
          ?,
          ?,
          ?
        FROM academy_portal_magic_links
        WHERE
          id=?
          AND used_at=?
      `)
        .bind(
          sessionHash,
          sessionExpires,
          now,
          clean(
            request.headers.get("user-agent") || "",
            500
          ),
          magic.id,
          now
        )
    ]);


    const created=
      await db.prepare(`
        SELECT id,customer_id
        FROM academy_portal_sessions
        WHERE token_hash=?
        LIMIT 1
      `)
        .bind(sessionHash)
        .first();


    if(!created){
      return json({
        error:
          "Sign-in link is invalid or already used."
      },409);
    }


    await db.prepare(`
      INSERT INTO academy_portal_events(
        customer_id,
        event_type,
        source,
        details
      )
      VALUES(
        ?,
        'login_success',
        'Academy Portal',
        'Passwordless magic-link login.'
      )
    `)
      .bind(magic.customer_id)
      .run();


    return json(
      {
        ok:true,
        authenticated:true
      },
      200,
      {
        "set-cookie":
          sessionCookie(
            sessionToken,
            7*24*60*60
          )
      }
    );

  }
  catch(error){

    console.error(
      "academy portal consume",
      error
    );

    return json({
      error:
        "Unable to complete secure sign-in."
    },500);
  }
}