// Actual Preview UI handlers with synthetic DOM/API responses; no browser-rendering claim.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../consultation-preview/workflow-ui.js',import.meta.url),'utf8');
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
function page(qy=true){
 const nodes=[],elements=new Map(),listeners={},calls=[];
 function element(tag='div'){
  const n={tagName:tag.toUpperCase(),value:'',hidden:true,disabled:false,dataset:{},children:[],textContent:'',setAttribute(){},setCustomValidity(){},addEventListener(type,fn){this[type]=fn;},append(...v){this.children.push(...v);},prepend(...v){this.children.unshift(...v);},replaceChildren(...v){this.children=v;},reset(){},closest(){return null;},querySelector(tag){return this.children.find(n=>n.tagName===tag.toUpperCase())||null;}};
  nodes.push(n);return n;
 }
 function el(id){const found=nodes.find(n=>n.id===id);if(found)return found;if(!elements.has(id)){const n=element();n.id=id;elements.set(id,n);}return elements.get(id);}
 el('local-tools').append(element('h2'),element('p'));el('local-customer-login').hidden=true;
 let respond=async(path)=>path.endsWith('/qy/bookings')?{ok:true,records:[],captureAdapterConfigured:false,financeReviewConfigured:false}:path.endsWith('/qy/preview/outbox')?{ok:true,syntheticOnly:true,code:'12345678',recipient:'synthetic@example.invalid',channel:'email'}:path.endsWith('/context/resume')?{ok:false}:{ok:true};
 const document={body:{dataset:{page:qy?'qy':'customer',deployment:'preview'}},documentElement:{},hidden:false,getElementById:el,createElement:element,querySelectorAll(){return []},createTreeWalker(){return {nextNode(){return null}}},addEventListener(type,fn){(listeners['document:'+type]??=[]).push(fn);}};
 const context=vm.createContext({document,window:{addEventListener(type,fn){(listeners[type]??=[]).push(fn);}},location:{hostname:'test.qy-c1-synthetic-preview.pages.dev'},NodeFilter:{SHOW_TEXT:4},MutationObserver:class{observe(){}},localStorage:{getItem(){return null},setItem(key){assert.equal(key,'qy-consultation-language');}},sessionStorage:{setItem(){throw Error('Secret storage forbidden')}},URL,crypto:globalThis.crypto,FormData:class{},fetch:async(path,options)=>{calls.push({path,options});const data=await respond(path,options);return {ok:data.ok!==false,status:data.ok===false?401:200,json:async()=>data};}});
 vm.runInContext(source,context);
 const run=code=>vm.runInContext(code,context);
 return {el,calls,run,document,async ready(){await run(qy?'refresh()':'resumeCustomer(true)');},set respond(fn){respond=fn;},async click(id){await el(id).click({preventDefault(){},currentTarget:el(id)});},emit(type){for(const fn of listeners[type]||[])fn();}};
}
const qy=page();await qy.ready();qy.run("csrf='synthetic-csrf'");
await test('Preview QY tools appear through authenticated API refresh',()=>assert.equal(qy.el('local-tools').hidden,false));
await test('Preview labels translate in both languages',()=>{for(const label of ['Synthetic Preview access','Synthetic customer ID','Establish synthetic customer session','Account challenge ID']){qy.run("chooseLanguage('zh-CN')");assert.notEqual(qy.run('translateText('+JSON.stringify(label)+')'),label);qy.run("chooseLanguage('en')");assert.equal(qy.run('translateText('+JSON.stringify(label)+')'),label);}});
await test('dynamic account challenge label preserves ID and valid Chinese',()=>{qy.run("chooseLanguage('zh-CN')");assert.equal(qy.run("translateText('Account OTP request ID: synthetic-123')"),'账户验证码请求编号：synthetic-123');qy.run("chooseLanguage('en')");assert.equal(qy.run("translateText('Account OTP request ID: synthetic-123')"),'Account OTP request ID: synthetic-123');});
await test('bootstrap submits selected numeric customer through protected API with CSRF',async()=>{qy.el('preview-customer-id').value='1';await qy.click('preview-bootstrap');const c=qy.calls.find(c=>c.path.endsWith('/preview/bootstrap'));assert.deepEqual(JSON.parse(c.options.body),{customerId:1});assert.equal(c.options.headers['x-qy-consultation-csrf'],'synthetic-csrf');assert.equal(c.options.credentials,'same-origin');assert.equal(qy.el('preview-customer-id').value,'');});
await test('invalid synthetic customer ID sends no bootstrap request',async()=>{const before=qy.calls.length;qy.el('preview-customer-id').value='-1';await qy.click('preview-bootstrap');assert.equal(qy.calls.length,before);});
await test('outbox reads exact challenge by POST and never uses loopback list',async()=>{qy.el('preview-account-challenge').value='synthetic-challenge';await qy.click('mock-outbox');const c=qy.calls.find(c=>c.path.endsWith('/qy/preview/outbox'));assert.deepEqual(JSON.parse(c.options.body),{challengeId:'synthetic-challenge'});assert.equal(c.options.method,'POST');assert.equal(c.options.headers['x-qy-consultation-csrf'],'synthetic-csrf');assert.ok(qy.el('mock-outbox-output').textContent.includes('12345678'));assert.equal(qy.el('mock-outbox-output').dataset.noI18n,'');assert.ok(qy.calls.every(c=>!c.path.includes('/local/')));});
await test('pagehide clears private OTP and identifier fields',()=>{qy.emit('pagehide');assert.equal(qy.el('mock-outbox-output').textContent,'');assert.equal(qy.el('preview-account-challenge').value,'');});
await test('in-flight OTP response cannot repopulate private output after pagehide',async()=>{let done;qy.respond=()=>new Promise(resolve=>done=resolve);qy.el('preview-account-challenge').value='synthetic-challenge';const pending=qy.click('mock-outbox');qy.emit('pagehide');done({ok:true,code:'87654321',recipient:'synthetic@example.invalid',channel:'email'});await pending;assert.equal(qy.el('mock-outbox-output').textContent,'');});
await test('hidden document clears private OTP',()=>{qy.el('mock-outbox-output').textContent='private';qy.document.hidden=true;qy.emit('document:visibilitychange');assert.equal(qy.el('mock-outbox-output').textContent,'');});
await test('customer Preview never enables loopback login',async()=>{const customer=page(false);await customer.ready();assert.equal(customer.el('local-customer-login').hidden,true);assert.ok(customer.calls.every(c=>!c.path.includes('/local/')));});
await test('page initialization never fetches an OTP automatically',async()=>{const fresh=page();await fresh.ready();assert.ok(fresh.calls.every(c=>!c.path.includes('outbox')));});
console.log('RESULT '+passed+' passed, 0 failed; actual Preview UI handlers and bilingual labels; no browser rendering');
