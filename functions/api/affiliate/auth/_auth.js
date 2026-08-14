const enc = new TextEncoder();

export function dbOf(env){
  return env.ENQUIRIES_DB || env.DB || null;
}

function bytesToHex(bytes){
  return Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function hexToBytes(hex){
  const out=new Uint8Array(hex.length/2);
  for(let i=0;i<out.length;i++) out[i]=parseInt(hex.slice(i*2,i*2+2),16);
  return out;
}

export async function sha256(value){
  const digest=await crypto.subtle.digest('SHA-256',enc.encode(String(value)));
  return bytesToHex(new Uint8Array(digest));
}

export function randomToken(bytes=32){
  const a=new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map(b=>b.toString(16).padStart(2,'0')).join('');
}

export function randomSalt(bytes=16){
  return randomToken(bytes);
}

export async function passwordHash(password,saltHex,iterations=100000){
  const key=await crypto.subtle.importKey(
    'raw', enc.encode(password), {name:'PBKDF2'}, false, ['deriveBits']
  );
  const bits=await crypto.subtle.deriveBits(
    {
      name:'PBKDF2',
      hash:'SHA-256',
      salt:hexToBytes(saltHex),
      iterations:Number(iterations)
    },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function verifyPassword(password,saltHex,iterations,expectedHex){
  const got=await passwordHash(password,saltHex,iterations);
  if(got.length!==expectedHex.length) return false;
  let diff=0;
  for(let i=0;i<got.length;i++) diff|=got.charCodeAt(i)^expectedHex.charCodeAt(i);
  return diff===0;
}

export function cookie(name,value,maxAge){
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookie(name){
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readCookie(request,name){
  const raw=request.headers.get('cookie')||'';
  for(const part of raw.split(';')){
    const i=part.indexOf('=');
    if(i<0) continue;
    if(part.slice(0,i).trim()===name) return part.slice(i+1).trim();
  }
  return '';
}

export async function requireAffiliate(request,env){
  const db=dbOf(env);
  if(!db) return {error:Response.json({error:'Database unavailable'},{status:503})};

  const token=readCookie(request,'QY_AFF_SESSION');
  if(!token) return {error:Response.json({error:'Not authenticated'},{status:401})};

  const tokenHash=await sha256(token);
  const row=await db.prepare(`
    SELECT s.id session_id,s.affiliate_id,s.expires_at,
           a.affiliate_code,a.full_name,a.display_name,a.email,a.phone,a.country,
           a.status,a.portal_enabled,
a.membership_started_at,a.membership_expires_at,a.renewal_status
    FROM affiliate_sessions s
    JOIN affiliates a ON a.id=s.affiliate_id
    WHERE s.token_hash=?
      AND s.revoked_at=''
      AND datetime(s.expires_at) > datetime('now')
      AND a.status='Approved'
      AND a.portal_enabled=1
    LIMIT 1
  `).bind(tokenHash).first();

  if(!row) return {error:Response.json({error:'Session expired or invalid'},{status:401})};

  await db.prepare(`
    UPDATE affiliate_sessions
    SET last_seen_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(row.session_id).run();

  return {db,affiliate:row,tokenHash};
}

export async function sendEmail(apiKey,payload){
  if(!apiKey) return {skipped:true};
  const r=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{
      Authorization:`Bearer ${apiKey}`,
      'Content-Type':'application/json'
    },
    body:JSON.stringify(payload)
  });
  if(!r.ok){
    console.error('affiliate portal email failed',r.status,await r.text());
    return {ok:false,status:r.status};
  }
  return {ok:true};
}

export function esc(v){
  return String(v??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
