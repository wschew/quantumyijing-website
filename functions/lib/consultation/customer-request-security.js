// No public endpoints. All origin configuration is server-owned.
export const PORTAL_COOKIE='QY_PORTAL_SESSION';
export const CONTEXT_COOKIE='__Host-QY_CONSULTATION_CUSTOMER';
export const CSRF_HEADER='x-qy-consultation-customer-csrf';
export const TOKEN=/^[a-f0-9]{64}$/;
export function trustedOrigin(value) {
 const url=new URL(value);
 if(url.protocol!=='https:'||url.origin!==value||url.username||url.password)throw Error('Trusted HTTPS origin required');
 return value;
}
export function sessionCookie(request,name) {
 const raw=request.headers.get('cookie');
 if(!raw||raw.length>8192)return null;
 const matches=raw.split(';').map(v=>v.trim()).filter(v=>v.split('=')[0].trim()===name);
 if(matches.length!==1||!matches[0].startsWith(name+'='))return null;
 const value=matches[0].slice(name.length+1);
 return TOKEN.test(value)?value:null;
}
export function requestAllowed(request,origin,{mutation=false}={}) {
 try {
  if(new URL(request.url).origin!==origin)return false;
  const supplied=request.headers.get('origin');
  const site=request.headers.get('sec-fetch-site');
  if(mutation)return request.method==='POST'&&supplied===origin&&(!site||site==='same-origin')&&
   (request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()==='application/json';
  return ['GET','HEAD'].includes(request.method)&&(!supplied||supplied===origin)&&(!site||['same-origin','none'].includes(site));
 }catch{return false;}
}
export function contextCookie(token,seconds) {
 if(!TOKEN.test(token)||!Number.isSafeInteger(seconds)||seconds<1||seconds>1800)throw Error('Invalid context cookie');
 return `${CONTEXT_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${seconds}`;
}
export function clearContextCookie(){return `${CONTEXT_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;}
