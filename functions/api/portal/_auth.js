export function dbOf(env){
  return (
    env.ENQUIRIES_DB ||
    env.DB ||
    env.D1 ||
    null
  );
}


export function clean(value,max=1000){
  return String(value ?? "")
    .trim()
    .slice(0,max);
}


export function normalizeEmail(value){
  return clean(value,320)
    .toLowerCase();
}


export function validEmail(value){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    normalizeEmail(value)
  );
}


export function randomToken(bytes=32){

  const data=
    new Uint8Array(bytes);

  crypto.getRandomValues(data);

  return [...data]
    .map(
      n=>
        n.toString(16)
          .padStart(2,"0")
    )
    .join("");
}


export async function sha256(value){

  const bytes=
    new TextEncoder()
      .encode(
        String(value ?? "")
      );

  const digest=
    await crypto.subtle.digest(
      "SHA-256",
      bytes
    );

  return [...new Uint8Array(digest)]
    .map(
      n=>
        n.toString(16)
          .padStart(2,"0")
    )
    .join("");
}


export function readCookie(request,name){

  const raw=
    request.headers.get("cookie") || "";

  for(const part of raw.split(";")){

    const i=
      part.indexOf("=");

    if(i<0) continue;

    const key=
      part.slice(0,i).trim();

    if(key!==name) continue;

    try{
      return decodeURIComponent(
        part.slice(i+1).trim()
      );
    }
    catch{
      return part.slice(i+1).trim();
    }
  }

  return "";
}


export function sessionCookie(
  token,
  maxAge=604800
){
  return [
    `QY_PORTAL_SESSION=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}


export function clearSessionCookie(){
  return [
    "QY_PORTAL_SESSION=",
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}


export function noStoreHeaders(extra={}){
  return {
    "content-type":
      "application/json; charset=utf-8",

    "cache-control":
      "no-store, max-age=0",

    "pragma":
      "no-cache",

    ...extra
  };
}


export function json(
  body,
  status=200,
  headers={}
){
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers:
        noStoreHeaders(headers)
    }
  );
}


export function esc(value){

  return String(value ?? "")
    .replace(
      /[&<>"']/g,
      char=>({
        "&":"&amp;",
        "<":"&lt;",
        ">":"&gt;",
        '"':"&quot;",
        "'":"&#39;"
      }[char])
    );
}


export async function sendEmail(
  key,
  payload
){

  if(!key){
    return {
      ok:false,
      skipped:true,
      status:0
    };
  }

  const response=
    await fetch(
      "https://api.resend.com/emails",
      {
        method:"POST",

        headers:{
          Authorization:
            `Bearer ${key}`,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(payload)
      }
    );

  if(!response.ok){

    console.error(
      "academy portal email",
      response.status,
      await response.text()
    );

    return {
      ok:false,
      skipped:false,
      status:response.status
    };
  }

  return {
    ok:true,
    skipped:false,
    status:response.status
  };
}


export async function authenticatedCustomer(
  request,
  env
){

  const db=
    dbOf(env);

  if(!db){
    return {
      db:null,
      session:null,
      customer:null
    };
  }

  const token=
    readCookie(
      request,
      "QY_PORTAL_SESSION"
    );

  if(!token){
    return {
      db,
      session:null,
      customer:null
    };
  }

  const tokenHash=
    await sha256(token);

  const session=
    await db.prepare(`
      SELECT
        s.id AS session_id,
        s.customer_id,
        s.expires_at,
        s.last_seen_at,

        c.customer_reference,
        c.display_name,
        c.email,
        c.phone,
        c.country,
        c.language,
        c.status

      FROM academy_portal_sessions s

      JOIN customers c
        ON c.id=s.customer_id

      WHERE
        s.token_hash=?
        AND COALESCE(s.revoked_at,'')=''
        AND datetime(s.expires_at)>datetime('now')
        AND c.status='Active'

      LIMIT 1
    `)
      .bind(tokenHash)
      .first();

  if(!session){
    return {
      db,
      session:null,
      customer:null
    };
  }

  await db.prepare(`
    UPDATE academy_portal_sessions
    SET last_seen_at=CURRENT_TIMESTAMP
    WHERE id=?
  `)
    .bind(session.session_id)
    .run();

  return {
    db,
    session:{
      id:Number(session.session_id),
      customer_id:
        Number(session.customer_id),
      expires_at:
        session.expires_at
    },

    customer:{
      id:Number(session.customer_id),

      customer_reference:
        session.customer_reference,

      display_name:
        session.display_name,

      email:
        session.email,

      phone:
        session.phone,

      country:
        session.country,

      language:
        session.language,

      status:
        session.status
    }
  };
}