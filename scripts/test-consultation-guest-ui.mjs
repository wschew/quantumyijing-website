// Focused synthetic DOM test; no browser/remote operations or real data.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
const uiRoot=process.env.QY_C1_LEGACY_PACKAGE?new URL('file:///'+process.env.QY_C1_LEGACY_PACKAGE.replaceAll('\\','/')+'/public/'):new URL('../consultation-preview/',import.meta.url);
const html=readFileSync(new URL('customer.html',uiRoot),'utf8');
const source=readFileSync(new URL('guest-booking-ui.js',uiRoot),'utf8');
const policies=JSON.parse(readFileSync(new URL('../.local-c1-package-preview-synthetic-activation/policies.draft.json',import.meta.url),'utf8'));
let checks=0;function check(value,message){assert.ok(value,message);checks++;}
export function page(hash='',transport=null){
 const elements=new Map(),all=[],listeners={},calls=[],storage=new Map(),historyCalls=[],windowListeners={},pageLocation={hash,pathname:'/customer.html'};
 class Element{
  constructor(tag,attrs={}){this.tagName=tag.toUpperCase();this.attrs=attrs;this.dataset={};for(const [k,v]of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;this.children=[];this.handlers={};this.value=attrs.value||'';this.checked=false;this.disabled=false;this.hidden='hidden'in attrs;this.type=attrs.type||'';this.name=attrs.name||'';this.validity={};all.push(this);if(attrs.id)elements.set(attrs.id,this);}
  append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}}
  get textContent(){return this.children.map(n=>n instanceof Element?n.textContent:n.nodeValue).join('');}
  set textContent(value){this.children=[];this.append({nodeValue:String(value)});}
  get options(){return this.children.filter(n=>n.tagName==='OPTION');}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  setAttribute(k,v){this.attrs[k]=v;}
  setCustomValidity(v){this.validationMessage=v;}
  addEventListener(type,fn){this.handlers[type]=fn;}
  closest(){let n=this;while(n){if('languageControl'in n.dataset||'noI18n'in n.dataset)return n;n=n.parentElement;}return null;}
  querySelector(){return all.find(n=>n.tagName==='BUTTON'&&n.type==='submit');}
  reset(){for(const n of all)if(['INPUT','TEXTAREA','SELECT'].includes(n.tagName)){n.value='';n.checked=false;}}
 }
 const root=new Element('root'),stack=[root];
 for(const m of html.matchAll(/<([^>]+)>|([^<]+)/g)){
  if(m[2]){stack.at(-1).append({nodeValue:m[2]});continue;}
  const tag=m[1];if(tag.startsWith('!'))continue;if(tag.startsWith('/')){stack.pop();continue;}
  const name=tag.split(/\s/)[0],attrs={};for(const a of tag.slice(name.length).matchAll(/([^\s=]+)(?:="([^"]*)")?/g))attrs[a[1]]=a[2]??'';
  const n=new Element(name,attrs);stack.at(-1).append(n);if(!['meta','link','img','input','br'].includes(name))stack.push(n);
 }
 const textNodes=()=>{const out=[];function visit(n){for(const c of n.children||[])if(c instanceof Element)visit(c);else out.push(c);}visit(root);return out;};
 const document={documentElement:all.find(n=>n.tagName==='HTML'),body:all.find(n=>n.tagName==='BODY'),getElementById:id=>elements.get(id),createElement:tag=>new Element(tag),createTreeWalker(){const texts=textNodes();let i=0;return {nextNode:()=>texts[i++]||null};},querySelectorAll(selector){return selector==='input,select,textarea'?all.filter(n=>['INPUT','SELECT','TEXTAREA'].includes(n.tagName)):all.filter(n=>selector==='[data-language]'?'language'in n.dataset:selector==='[data-i18n-label]'?'i18nLabel'in n.dataset:selector==='[data-i18n-alt]'?'i18nAlt'in n.dataset:false);},addEventListener(type,fn){listeners[type]=fn;}};
 const start=Date.now()+5*86400000;
 const context=vm.createContext({document,NodeFilter:{SHOW_TEXT:4},MutationObserver:class{observe(){}},window:{addEventListener(type,fn){windowListeners[type]=fn;}},location:pageLocation,history:{replaceState(state,title,url){historyCalls.push(url);pageLocation.hash='';}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},crypto:globalThis.crypto,URLSearchParams,Intl,Date,FormData:class{get(name){const n=all.find(x=>x.name===name);return n?.type==='checkbox'?(n.checked?'on':null):n?.value??null;}},fetch:async(path,options={})=>{const body=options.body?JSON.parse(options.body):null;calls.push({path,body});if(transport)return transport(path,options);const data=path.endsWith('/guest/policies')?{ok:true,policies}:path.endsWith('/guest/calendar')?{ok:true,slots:[start]}:path.endsWith('/guest/requests')?{ok:true,reference:'BAZI-synthetic-reference',state:'Submitted'}:path.endsWith('/guest/offer')?{ok:true,reference:'BAZI-synthetic-offer',state:'Offered',startAt:start,expiresAt:start+86400000,sellingPriceSen:130000,snapshotHash:'a'.repeat(64),policyHash:policies.booking.hash,policyText:policies.booking.text}:{ok:true,state:'PaymentPending'};return {ok:true,json:async()=>data};}});
 vm.runInContext(source.replace(/initialize\(\);\s*$/,'globalThis.ready=initialize();'),context);
 return {context,document,all,elements,listeners,calls,storage,historyCalls,windowListeners,ready:context.ready,run:code=>vm.runInContext(code,context),click:async id=>elements.get(id).handlers.click(),language:async lang=>all.find(n=>n.dataset.language===lang).handlers.click(),field:name=>all.find(n=>n.name===name)};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
check((html.match(/<h1\b/g)||[]).length===1,'one h1');check(!html.includes('page-eyebrow'),'redundant heading removed');check(html.includes('academy-logo.png')&&html.includes('RM1,300')&&html.includes('RM980'),'branding and prices retained');
const ui=page();await ui.ready;
const heading=ui.all.find(n=>n.tagName==='H1').textContent;check(heading==='Bazi Consultation / '+String.fromCodePoint(0x516b,0x5b57,0x547d,0x7406,0x54a8,0x8be2),'exact bilingual main heading');
const fixed=new Set(['Quantum YiJing','International Academy \u00b7 \u56fd\u9645\u5b66\u9662','English','\u7b80\u4f53\u4e2d\u6587','|',heading,'WhatsApp']);
const visibleEnglish=ui.all.filter(n=>!['SCRIPT','STYLE','TITLE'].includes(n.tagName)).flatMap(n=>n.children.filter(x=>!x.tagName).map(x=>x.nodeValue.trim()).filter(Boolean));
for(const text of visibleEnglish){if(fixed.has(text))continue;check(ui.run('chooseLanguage("zh-CN"); translateText('+JSON.stringify(text)+')')!==text,'translation coverage: '+text);}
await ui.language('en');ui.field('fullName').value='Synthetic Name';ui.field('questions').value='Synthetic questions';ui.field('birthDate').value='2000-02-29';ui.field('calculationGender').value='male';ui.field('birthTimePrecision').value='unknown';ui.field('birthCity').value='Synthetic City';ui.field('birthCountry').value='MY';ui.field('reportChannel').value='email';ui.field('contact').value='synthetic@example.invalid';for(const key of ['privacy','adultAcknowledged','selfBooking'])ui.field(key).checked=true;
await ui.click('load-times');ui.field('preferredStart').value=ui.elements.get('preferred-start').options[0].value;
const snapshot=()=>JSON.stringify(ui.all.filter(n=>['INPUT','SELECT','TEXTAREA'].includes(n.tagName)).map(n=>[n.name,n.value,n.checked]));const before=snapshot(),apiBefore=ui.calls.length;
await ui.language('zh-CN');check(ui.document.documentElement.lang==='zh-CN','Chinese selected');check(ui.elements.get('load-times').textContent!== 'Show available times','button translated');check(snapshot()===before,'Chinese preserves all fields and selections');check(ui.elements.get('preferred-start').options[0].textContent.includes('\u9a6c\u6765\u897f\u4e9a'),'calendar timezone localized');check(ui.calls.length===apiBefore,'switch sends no API requests');
ui.listeners.invalid({target:Object.assign(ui.field('fullName'),{validity:{valueMissing:true}})});check(ui.field('fullName').validationMessage==='\u8bf7\u586b\u5199\u6b64\u5fc5\u586b\u9879\u3002','Chinese validation');
await ui.language('en');check(snapshot()===before,'English preserves all fields');check(ui.elements.get('load-times').textContent==='Show available times','English restored');check(ui.elements.get('status').textContent.startsWith('Choose a time.'),'dynamic message restored');
await ui.language('zh-CN');await ui.elements.get('intake').handlers.submit({preventDefault(){}});const submitted=ui.calls.find(c=>c.path.endsWith('/guest/requests')).body;check(submitted.intake.fullName==='Synthetic Name'&&submitted.intake.questions==='Synthetic questions','untranslated customer data submitted');check(submitted.intake.calculationGender==='male'&&submitted.intake.reportChannel==='email','API enums preserved');check(submitted.intake.privacyAcknowledgement.version===policies.consultation_privacy.version,'policy version unchanged');check(ui.elements.get('status').textContent.startsWith('\u7533\u8bf7\u5df2\u6536\u5230'),'success localized');
const offer=page('#offer='+'a'.repeat(64));await offer.ready;await offer.language('zh-CN');check(offer.elements.get('offer-summary').textContent.includes('90 \u5206\u949f'),'offer summary localized');check(offer.elements.get('offer-policy').textContent.startsWith('\u8349\u6848'),'policy draft translated');await offer.language('en');check(offer.elements.get('offer-summary').textContent.includes('90 minutes'),'offer summary restored');check(offer.elements.get('offer-policy').textContent===policies.booking.text,'original policy restored');
console.log('PASS: '+checks+' focused guest UI assertions; single heading, complete static/policy translation, dynamic messages, validation, language switching preserves inputs and API values. Synthetic DOM only.');

}
