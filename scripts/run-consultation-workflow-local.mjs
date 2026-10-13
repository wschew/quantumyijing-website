// Explicit loopback-only, ephemeral synthetic demonstration. No Cloudflare client or remote DB.
import https from 'node:https';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createSyntheticWorkflow} from './consultation-workflow-local-fixture.mjs';
import {readLocalCredentialInput} from './setup-consultation-account-local.mjs';
const staticFiles=new Map([['/customer.html',['customer.html','text/html; charset=utf-8']],['/qy.html',['qy.html','text/html; charset=utf-8']],['/workflow-ui.js',['workflow-ui.js','text/javascript; charset=utf-8']],['/workflow.css',['workflow.css','text/css; charset=utf-8']]]);
export function localCertificate(){
 const dir=mkdtempSync(join(tmpdir(),'qy-synthetic-tls-'));
 const keyPath=join(dir,'key.pem'),certPath=join(dir,'cert.pem');
 try{
  const child=spawnSync('C:\\Program Files\\Git\\usr\\bin\\openssl.exe',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{windowsHide:true,stdio:'ignore',timeout:20000,env:{SystemRoot:process.env.SystemRoot,TEMP:tmpdir(),TMP:tmpdir()}});
  if(child.status!==0)throw Error('Local TLS setup unavailable');
  return {key:readFileSync(keyPath),cert:readFileSync(certPath)};
 }finally{
  // Only fixed files created in this freshly allocated directory; no recursive removal.
  for(const file of [keyPath,certPath]){try{unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw Error('Synthetic TLS cleanup needs manual inspection');}}
  rmdirSync(dir);
 }
}
export async function startSyntheticServer({port=8789,password,certificate=localCertificate()}){
 if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('Invalid local port');
 const origin='https://127.0.0.1:'+port;
 const fixture=await createSyntheticWorkflow({origin,password,syntheticOnly:true});
 const server=https.createServer(certificate,async (incoming,outgoing)=>{
  try{
   if(incoming.headers.host!==new URL(origin).host){outgoing.writeHead(403);outgoing.end();return;}
   const pathname=new URL(incoming.url,origin).pathname;
   const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};
   if(pathname==='/'&&['GET','HEAD'].includes(incoming.method)){outgoing.writeHead(302,{...headers,location:'/customer.html'});outgoing.end();return;}
   if(staticFiles.has(pathname)&&['GET','HEAD'].includes(incoming.method)){
    const [file,type]=staticFiles.get(pathname),bytes=readFileSync(new URL('../consultation-preview/'+file,import.meta.url));outgoing.writeHead(200,{...headers,'content-type':type});outgoing.end(incoming.method==='HEAD'?undefined:bytes);return;
   }
   if(!pathname.startsWith('/api/consultation/')){outgoing.writeHead(404,headers);outgoing.end();return;}
   const chunks=[];let size=0;
   for await(const chunk of incoming){size+=chunk.length;if(size>20000){outgoing.writeHead(413,headers);outgoing.end();return;}chunks.push(chunk);}
   const bytes=Buffer.concat(chunks);const request=new Request(origin+incoming.url,{method:incoming.method,headers:incoming.headers,...(['GET','HEAD'].includes(incoming.method)?{}:{body:bytes})});
   const response=await fixture.handler(request);outgoing.writeHead(response.status,{...headers,...Object.fromEntries(response.headers)});outgoing.end(Buffer.from(await response.arrayBuffer()));
  }catch{if(!outgoing.headersSent)outgoing.writeHead(503,{'cache-control':'no-store'});outgoing.end();}
 });
 try{await new Promise((ok,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',ok);});}
 catch{fixture.dispose();throw Error('Local server could not start; no retry attempted');}
 return {origin,fixture,async close(){server.closeAllConnections();await new Promise(ok=>server.close(ok));fixture.dispose();}};
}
async function main(){
 let running;
 try{
  if(process.argv[2]!=='--synthetic-local'||process.argv.length!==5||process.argv[3]!=='--port')throw Error('Explicit local arguments required');
  const input=await readLocalCredentialInput(process.stdin);
  if(input?.syntheticOnly!==true||input.password!==input.confirmation)throw Error('Synthetic credential input rejected');
  running=await startSyntheticServer({port:Number(process.argv[4]),password:input.password});input.password=null;input.confirmation=null;
  console.log('SYNTHETIC LOCAL ONLY. No real customer information, live credentials or provider calls.');
  console.log('In-memory data and keys disappear when stopped. Self-signed TLS is for this loopback site only.');
  console.log('Customer: '+running.origin+'/customer.html');console.log('QY: '+running.origin+'/qy.html');console.log('Dedicated test username: qy-local-test. Password is not printed.');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await running.close();process.exit(0);});
 }catch{if(running)await running.close();console.error('Synthetic local startup failed. No credentials are included.');process.exitCode=1;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
