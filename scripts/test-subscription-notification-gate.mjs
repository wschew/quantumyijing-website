// No database or network: authenticated body/query overrides must not enable execution.
import assert from 'node:assert/strict';
import {onRequestPost} from '../functions/api/admin/subscription-notification-automation.js';
let passed=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=()=>{throw Error('Network forbidden');};
let dbCalls=0;
const blocked={prepare(){dbCalls++;throw Error('Database forbidden');},batch(){dbCalls++;throw Error('Database forbidden');}};
function request(auth=true,cutoff='1900-01-01T00:00:00Z'){
  return new Request('https://synthetic.invalid/api/admin/subscription-notification-automation?action=run&event_not_before='+encodeURIComponent(cutoff)+'&SUBSCRIPTION_AUTOMATION_ENABLED=true',{
    method:'POST',headers:{authorization:auth?'Bearer synthetic-admin':'Bearer incorrect','content-type':'application/json'},
    body:JSON.stringify({SUBSCRIPTION_AUTOMATION_ENABLED:'true',action:'run',event_not_before:'1900-01-01T00:00:00Z'})
  });
}
try{
  for(const binding of ['ENQUIRIES_DB','DB','D1'])for(const value of [undefined,'false']){
    const env={ADMIN_TOKEN:'synthetic-admin',RESEND_API_KEY:'synthetic-key',[binding]:blocked,SUBSCRIPTION_AUTOMATION_ENABLED:value};
    for(let replay=0;replay<2;replay++){
      const response=await onRequestPost({request:request(),env});
      assert.equal(response.status,503);assert.equal((await response.json()).code,'subscription_notifications_disabled');
    }
    passed++;console.log('PASS body/query overrides cannot enable '+binding+' / '+(value??'missing'));
  }
  const env={ADMIN_TOKEN:'synthetic-admin',RESEND_API_KEY:'synthetic-key',ENQUIRIES_DB:blocked,SUBSCRIPTION_AUTOMATION_ENABLED:'true'};
  const enabled=await onRequestPost({request:request(true,'invalid-date'),env});
  assert.equal(enabled.status,400);assert.match((await enabled.json()).error,/cutoff is invalid/);passed++;console.log('PASS explicit server enablement reaches existing cutoff guard');
  const unauthorized=await onRequestPost({request:request(false),env});
  assert.equal(unauthorized.status,401);passed++;console.log('PASS enablement never bypasses authentication');
  assert.equal(dbCalls,0);console.log('RESULT: '+passed+' passed, 0 failed');
}finally{globalThis.fetch=originalFetch;}

