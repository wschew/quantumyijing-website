// Shared internal guards; snapshots alone never authorize a later database mutation.
import {createCustomerIdentity} from './customer-identity.js';
import {createConsultationAuth} from './auth.js';
import {tokenHash} from './auth-crypto.js';
import {PORTAL_COOKIE,CONTEXT_COOKIE,CSRF_HEADER,sessionCookie} from './customer-request-security.js';
export const DB_NOW="(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))";
const expiry="(CAST(strftime('%s',p.expires_at) AS INTEGER)*1000+CAST(substr(strftime('%f',p.expires_at),4,3) AS INTEGER))";
export function createWorkflowGuards({db,origin}) {
 const identity=createCustomerIdentity({db,origin}),qy=createConsultationAuth({db,origin});
 return Object.freeze({
  async customer(request,mutation=false){
   const a=await identity.authorize(request,{stateChanging:mutation});
   if(a.error)throw Error('Consultation authorization denied');
   const values=[a.principal.contextId,a.principal.version,a.principal.customerId,
    await tokenHash(sessionCookie(request,CONTEXT_COOKIE)),await tokenHash(sessionCookie(request,PORTAL_COOKIE))];
   if(mutation)values.push(await tokenHash(request.headers.get(CSRF_HEADER)));
   return {principal:a.principal,values,sql:`SELECT 1 FROM consultation_customer_contexts x
    JOIN academy_portal_sessions p ON p.id=x.portal_session_id JOIN customers c ON c.id=p.customer_id
    WHERE x.id=? AND x.version=? AND x.customer_id=? AND x.token_hash=? AND p.token_hash=?
    AND x.customer_id=p.customer_id AND x.revoked_at IS NULL AND x.issued_at<=${DB_NOW} AND x.expires_at>${DB_NOW}
    AND COALESCE(p.revoked_at,'')='' AND ${expiry}>${DB_NOW} AND (CAST(strftime('%s',p.created_at) AS INTEGER)*1000+CAST(substr(strftime('%f',p.created_at),4,3) AS INTEGER))<=${DB_NOW} AND c.status='Active'
    ${mutation?'AND x.csrf_hash=?':''}`};
  },
  async qy(request,mutation=false){
   const a=await qy.requirePrivateAccess(request,{stateChanging:mutation});
   if(a.error)throw Error('Consultation authorization denied');
   const values=[a.principal.sessionId,await tokenHash(sessionCookie(request,'__Host-QY_CONSULTATION'))];
   if(mutation)values.push(await tokenHash(request.headers.get('x-qy-consultation-csrf')));
   return {principal:a.principal,values,sql:`SELECT 1 FROM consultation_auth_sessions s JOIN consultation_auth_account a ON a.id=s.account_id
    WHERE s.id=? AND s.token_hash=? AND s.revoked_at IS NULL AND s.created_at<=${DB_NOW} AND s.expires_at>${DB_NOW}
    AND a.id=1 AND a.enabled=1 AND a.password_version=s.password_version ${mutation?'AND s.csrf_hash=?':''}`};
  }
 });
}
