import {
  dbOf,
  readCookie,
  sha256,
  clearSessionCookie,
  json
} from "./_auth.js";


export async function onRequestPost({
  request,
  env
}){

  const db=
    dbOf(env);

  const token=
    readCookie(
      request,
      "QY_PORTAL_SESSION"
    );


  if(db && token){

    const hash=
      await sha256(token);

    const session=
      await db.prepare(`
        SELECT id,customer_id
        FROM academy_portal_sessions
        WHERE
          token_hash=?
          AND COALESCE(revoked_at,'')=''
        LIMIT 1
      `)
        .bind(hash)
        .first();


    if(session){

      await db.prepare(`
        UPDATE academy_portal_sessions
        SET revoked_at=CURRENT_TIMESTAMP
        WHERE id=?
      `)
        .bind(session.id)
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
          'logout',
          'Academy Portal',
          'Portal session revoked by logout.'
        )
      `)
        .bind(session.customer_id)
        .run();
    }
  }


  return json(
    {
      ok:true
    },
    200,
    {
      "set-cookie":
        clearSessionCookie()
    }
  );
}