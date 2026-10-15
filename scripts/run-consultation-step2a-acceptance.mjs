// Existing local acceptance only. No installs, Wrangler or owner-server control.
import {mkdirSync,openSync,closeSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const directory=resolve(process.argv[2]||'.local-c1-package-step2a-acceptance');
mkdirSync(directory); // Never replace an earlier evidence directory.
const suites=[['pages',65],['pages-ui',11],['meetings',30],['account-stepup',248],['availability',48],['preferences',13],['workflow-local',50],['booking-ui',23],['customer-resume',18],['report-navigation',15],['language',29],['foundation',142],['workflow-runtime',23],['integration',62],['preview-adapter',51]];
const results=[];
for(const [name,expected] of suites){
 const file=name==='language'?'consultation-preview/test-language.mjs':name==='foundation'?'scripts/test-bazi-consultation-foundation.mjs':'scripts/test-consultation-'+name+'.mjs';
 const log=resolve(directory,name+'.log'),fd=openSync(log,'wx');
 let result;
 try{result=spawnSync(process.execPath,['--require','./scripts/consultation-local-file-stdio.cjs',file],{stdio:['ignore',fd,fd],windowsHide:true,timeout:300000});}finally{closeSync(fd);}
 const text=readFileSync(log,'utf8'),match=text.match(/RESULT:?\s+(\d+) passed, 0 failed/);
 const passed=match?Number(match[1]):0,ok=result.status===0&&passed===expected;
 results.push({name,expected,passed,exit:result.status,ok});
 console.log(name+': '+(ok?'PASS':'FAIL')+' '+passed+'/'+expected);
}
writeFileSync(resolve(directory,'summary.json'),JSON.stringify({results,passed:results.reduce((n,r)=>n+r.passed,0),ok:results.every(r=>r.ok)},null,2)+'\n');
if(results.some(r=>!r.ok))process.exitCode=1;
