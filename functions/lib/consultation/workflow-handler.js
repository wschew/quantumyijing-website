// Local/isolated Preview mounting only. No Pages endpoint is created by this module.
import {normalizeContact} from './contact-policy.js';
import {requestAllowed} from './customer-request-security.js';
const response=(status,data)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function readWorkflowBody(request,maxBytes=20000){
 const reader=request.body?.getReader();if(!reader)return {};
 const decoder=new TextDecoder('utf-8',{fatal:true});let text='',total=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>maxBytes){await reader.cancel();throw Error('Request rejected');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}finally{reader.releaseLock();}
}
export function createWorkflowHandler({origin,workflow,stepup,contacts,identity,qyAuth,policies,preferences=null,lifecycle=null,customerSearch=null,captures=null,captureAdapterConfigured=false}){
 return async request=>{
  try{
   const url=new URL(request.url),mutation=request.method==='POST';
   if(!['GET','POST'].includes(request.method)||!requestAllowed(request,origin,{mutation}))return response(403,{ok:false,error:'Request rejected.'});
   const path=url.pathname.replace(/^\/api\/consultation\//,'');
   if(!url.pathname.startsWith('/api/consultation/')||url.searchParams.has('token'))return response(404,{ok:false});
   const input=mutation?await readWorkflowBody(request):null;
   if(path==='context/resume'&&mutation){if(!input||Object.keys(input).length)return response(400,{ok:false,code:'CONTEXT_INPUT_REJECTED'});return identity.resume(request);}
   if(path==='account/state'&&!mutation)return response(200,{ok:true,...await stepup.progress(request)});
   if(path==='context'&&mutation)return identity.establish(request);
   if(path==='qy/login'&&mutation){if(!input||Object.keys(input).some(k=>!['username','password'].includes(k)))return response(400,{ok:false});return qyAuth.login(request,input);}
   if(path==='qy/customers/search'&&mutation&&customerSearch)return response(200,{ok:true,...await customerSearch.search(request,input)});
   if(path==='qy/logout'&&mutation)return qyAuth.logout(request);
   if(path==='account/options'&&!mutation)return response(200,{ok:true,...await stepup.options(request)});
   if(path==='account/challenge'&&mutation)return response(200,{ok:true,...await stepup.challenge(request,input)});
   if(path==='account/confirm'&&mutation){
    const auth=await identity.authorize(request,{stateChanging:true});if(auth.error)return response(401,{ok:false,code:'OTP_SESSION_CHANGED'});
    if(!input||typeof input.code!=='string'||!/^\d{8}$/.test(input.code))return response(400,{ok:false,code:'OTP_FORMAT'});
    const read=new Request(request.url,{method:'GET',headers:request.headers});
    let state;try{state=await stepup.progress(read,input.challengeId);}catch{return response(409,{ok:false,code:'OTP_CHALLENGE_REQUIRED'});}
    if(!state.challenge)return response(409,{ok:false,code:'OTP_CHALLENGE_REQUIRED'});
    if(state.challenge.state!=='Pending')return response(409,{ok:false,code:state.challenge.state==='Expired'?'OTP_EXPIRED':state.challenge.state==='Locked'?'OTP_LOCKED':state.challenge.state==='Consumed'?'OTP_USED':'OTP_CHALLENGE_REQUIRED'});
    try{const result=await stepup.confirm(request,input);return response(200,{ok:true,...result,...(result.verified?{}:{code:'OTP_INCORRECT'})});}catch{return response(409,{ok:false,code:'OTP_STATE_CHANGED'});}
   }
   if(path==='qy/account/review'&&mutation){
    const authorization=await qyAuth.requirePrivateAccess(request,{stateChanging:true});
    if(authorization.error)return response(401,{ok:false,code:'REVIEW_AUTH_REQUIRED'});
    try{normalizeContact(input?.channel,input?.contact);}catch{return response(400,{ok:false,code:'REVIEW_CONTACT_FORMAT'});}
    try{return response(200,{ok:true,code:'REVIEW_RECORDED',...await stepup.reviewContact(request,input)});}
    catch{return response(409,{ok:false,code:'REVIEW_REJECTED'});}
   }
   if(path==='contact/state'&&!mutation)return contacts.progress(request);
   if(path==='contact/challenge'&&mutation)return contacts.requestChallenge(request,input);
   if(path==='contact/confirm'&&mutation)return contacts.confirm(request,input);
   if(path==='qy/contact/instructions'&&!mutation)return contacts.instructions(request,{challengeId:url.searchParams.get('id')});
   if(path==='qy/contact/delivered'&&mutation)return contacts.markDelivered(request,input);
   if(preferences&&path==='preferences'&&!mutation)return response(200,{ok:true,...await preferences.read(request,url.searchParams.get('id'))});
   if(preferences&&path==='preferences'&&mutation)return response(200,{ok:true,...await preferences.save(request,input)});
   if(preferences&&path==='qy/preferences'&&!mutation)return response(200,{ok:true,...await preferences.read(request,url.searchParams.get('id'),{qy:true})});
   if(path==='bookings'&&!mutation)return response(200,{ok:true,records:await workflow.list(request),policies});
   if(path==='bookings'&&mutation)return response(200,{ok:true,...await workflow.submit(request,input)});
   if(path==='offer'&&!mutation)return response(200,{ok:true,offer:await workflow.currentOffer(request,url.searchParams.get('id'))});
   if(path==='offer/accept'&&mutation)return response(200,{ok:true,...await workflow.accept(request,input)});
   if(path==='qy/bookings'&&!mutation)return response(200,{ok:true,records:await workflow.list(request,{qy:true}),captureAdapterConfigured,financeReviewConfigured:captures!==null});
   if(path==='qy/private'&&!mutation)return response(200,{ok:true,privateIntake:await workflow.readPrivate(request,url.searchParams.get('id'))});
   if(lifecycle){
    if(path==='reschedule/list'&&!mutation)return response(200,{ok:true,records:await lifecycle.reschedules(request,url.searchParams.get('id'))});
    if(path==='qy/reschedule/list'&&!mutation)return response(200,{ok:true,records:await lifecycle.reschedules(request,url.searchParams.get('id'),{qy:true})});
    const actions={'reschedule/request':'requestReschedule','qy/reschedule/decide':'decideReschedule','qy/offer/expire':'expireOffer','qy/forfeit':'forfeit','qy/report/status':'reportStatus'};
    if(mutation&&Object.hasOwn(actions,path))return response(200,{ok:true,...await lifecycle[actions[path]](request,input)});
   }
   const operations={'qy/status':'change','qy/offer':'propose','qy/report':'report'};
   if(mutation&&Object.hasOwn(operations,path))return response(200,{ok:true,...await workflow[operations[path]](request,input)});
   if(captures&&path==='qy/payment/link'&&mutation)return response(200,{ok:true,...await captures.linkOrder(request,input)});
   if(captures&&path==='qy/payment/finance-review'&&mutation)return response(200,{ok:true,...await captures.recordFinanceReview(request,input)});
   if(path==='qy/payment/reconcile'&&mutation&&captureAdapterConfigured)return response(200,{ok:true,...await workflow.reconcilePayment(request,input)});
   return response(404,{ok:false,error:'Operation unavailable.'});
  }catch{return response(409,{ok:false,error:'Authorization, expiry, validation or version conflict. No automatic retry.'});}
 };
}
