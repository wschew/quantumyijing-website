// Optional Windows test transport: regular local files instead of anonymous pipes.
// Only workerd's one-shot config stdin and control/log output are adapted.
// Does not change runtime configuration, network policy, tests or application code.
const cp=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {PassThrough,Writable}=require('node:stream');
const {EventEmitter}=require('node:events');
const original=cp.spawn;
const originalSync=cp.spawnSync;
const originalExecFileSync=cp.execFileSync;
// Historical frontend tests read committed fixtures with git show. Capture only
// that read-only command through regular file handles on affected Windows hosts.
cp.execFileSync=function(command,args,options={}){
 if(process.platform!=='win32'||command!=='git'||args?.[0]!=='show')return originalExecFileSync.apply(this,arguments);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'c1-git-show-'));
 const out=path.join(dir,'stdout'),err=path.join(dir,'stderr'),a=fs.openSync(out,'wx'),b=fs.openSync(err,'wx');
 try{
  const result=originalSync(command,args,{...options,stdio:['ignore',a,b],windowsHide:true});
  if(result.status!==0)throw Error('Read-only historical Git fixture unavailable');
  const bytes=fs.readFileSync(out);return options.encoding?bytes.toString(options.encoding):bytes;
 }finally{fs.closeSync(a);fs.closeSync(b);fs.unlinkSync(out);fs.unlinkSync(err);fs.rmdirSync(dir);}
};
cp.spawnSync=function(command,args,options){
 if(process.platform==='win32'&&process.env.QY_TEST_PYTHON&&/[\\/]openssl\.exe$/i.test(command)&&args?.[0]==='req'&&args.includes('/CN=localhost')){
  return originalSync(process.env.QY_TEST_PYTHON,[path.join(__dirname,'consultation-test-certificate.py'),args[args.indexOf('-keyout')+1],args[args.indexOf('-out')+1]],{...options,stdio:'inherit',env:process.env,windowsHide:true});
 }
 return originalSync.apply(this,arguments);
};
cp.spawn=function(command,args,options){
 if(process.platform!=='win32'||!/(?:^|[\\/])workerd(?:\.exe)?$/i.test(command)||options?.stdio?.length!==4)return original.apply(this,arguments);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'c1-workerd-stdio-'));
 const files=[0,1,2,3].map(i=>path.join(directory,String(i)));
 for(const file of files)fs.writeFileSync(file,Buffer.alloc(0),{mode:0o600});
 const result=new EventEmitter(),chunks=[],streams=[null,new PassThrough(),new PassThrough(),new PassThrough()];
 let child,timer;
 const positions=[0,0,0,0];
 function read(){for(let i=1;i<4;i++){if(streams[i].destroyed)continue;const size=fs.statSync(files[i]).size;if(size>positions[i]){const fd=fs.openSync(files[i],'r'),buffer=Buffer.alloc(size-positions[i]);try{fs.readSync(fd,buffer,0,buffer.length,positions[i]);}finally{fs.closeSync(fd);}positions[i]=size;streams[i].write(buffer);}}}
 result.stdin=new Writable({write(chunk,encoding,callback){chunks.push(Buffer.from(chunk));callback();},final(callback){
  fs.writeFileSync(files[0],Buffer.concat(chunks));
  const fds=files.map((f,i)=>fs.openSync(f,i?'a':'r'));
  try{child=original(command,args,{...options,stdio:fds});result.pid=child.pid;}catch(e){callback(e);return;}finally{for(const fd of fds)fs.closeSync(fd);}
  timer=setInterval(read,10);
  child.on('error',e=>result.emit('error',e));
  child.on('exit',(code,signal)=>{clearInterval(timer);read();for(let i=1;i<4;i++)streams[i].end();result.emit('exit',code,signal);result.emit('close',code,signal);for(const file of files)fs.unlinkSync(file);fs.rmdirSync(directory);});
  callback();
 }});
 result.stdout=streams[1];result.stderr=streams[2];result.stdio=[result.stdin,...streams.slice(1)];
 result.kill=signal=>child?.kill(signal);result.ref=()=>child?.ref();result.unref=()=>child?.unref();
 return result;
};
