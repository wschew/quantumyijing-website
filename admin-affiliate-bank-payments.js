const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(c,v)=>`${c||'MYR'} ${Number(v||0).toFixed(2)}`;
let current=[];
function token(){return $('#token').value.trim()}
function msg(text,error=false){const el=$('#status');el.textContent=text||'';el.className=`status${error?' error':''}`}
async function api(url){const r=await fetch(url,{headers:{authorization:`Bearer ${token()}`},cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d}
function missingBank(x){return !String(x.bank_name||'').trim()||!String(x.bank_account_name||'').trim()||!String(x.bank_account_number||'').trim()}
function setDefaultPeriod(){if($('#period').value)return;const d=new Date();d.setMonth(d.getMonth()-1);$('#period').value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}

async function load(){
  try{
    if(!token())throw new Error('Please enter the Admin Token.');
    const p=$('#period').value;if(!p)throw new Error('Please select a payout month.');
    msg('Loading approved affiliate payouts...');
    const qs=new URLSearchParams({period:p,include_tests:$('#includeTests').checked?'1':'0'});
    const d=await api(`/api/admin/affiliate-bank-payment-list?${qs}`);
    current=d.items||[];render(current,d.totals||[]);$('#export').disabled=current.length===0;
    msg(current.length?`${current.length} approved payout${current.length===1?'':'s'} ready for bank payment preparation.`:'No Approved affiliate payouts found for this month.');
  }catch(e){current=[];$('#export').disabled=true;render([],[]);msg(e.message,true)}
}
function render(rows,totals){
  $('#sumCount').textContent=rows.length;
  const currency=totals.length===1?totals[0].currency:'MULTI';
  $('#sumSales').textContent=totals.length===1?money(currency,totals[0].total_sales):(totals.length?`${totals.length} currencies`:'MYR 0.00');
  $('#sumNet').textContent=totals.length===1?money(currency,totals[0].net_amount_payable):(totals.length?totals.map(x=>money(x.currency,x.net_amount_payable)).join(' · '):'MYR 0.00');
  $('#sumMissing').textContent=rows.filter(missingBank).length;
  $('#rows').innerHTML=rows.length?rows.map((x,i)=>{const bad=missingBank(x);return `<tr><td>${i+1}</td><td><strong>${esc(x.affiliate_code||'—')}</strong>${Number(x.is_test_account||0)?'<br><span class="test">TEST</span>':''}</td><td>${esc(x.full_name||x.display_name||'—')}</td><td class="${!x.bank_name?'missing':'bank'}">${esc(x.bank_name||'MISSING')}</td><td class="${!x.bank_account_name?'missing':'bank'}">${esc(x.bank_account_name||'MISSING')}</td><td class="${!x.bank_account_number?'missing':'bank'}">${esc(x.bank_account_number||'MISSING')}</td><td>${esc(x.country||'—')}</td><td>${esc(x.currency||'MYR')}</td><td class="amount">${money(x.currency,x.net_amount_payable)}</td><td>${esc(x.payout_period)}</td><td>${esc(x.payout_reference)}</td><td>${esc(x.email||'—')}</td><td></td><td></td><td>${bad?'BANK DETAILS INCOMPLETE':''}</td></tr>`}).join(''):'<tr><td class="empty" colspan="15">No Approved affiliate payouts for this period.</td></tr>';
}

// Small self-contained XLSX writer: ZIP store method + Office Open XML.
const te=new TextEncoder();
function xml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))}
function colName(n){let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s}
function u16(n){return [n&255,(n>>>8)&255]}
function u32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]}
const crcTable=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
function concat(parts){const size=parts.reduce((s,p)=>s+p.length,0),out=new Uint8Array(size);let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out}
function zip(files){const locals=[],centrals=[];let offset=0;for(const f of files){const name=te.encode(f.name),data=typeof f.data==='string'?te.encode(f.data):f.data,crc=crc32(data);const local=new Uint8Array([0x50,0x4b,0x03,0x04,...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...name]);locals.push(local,data);const central=new Uint8Array([0x50,0x4b,0x01,0x02,...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...name]);centrals.push(central);offset+=local.length+data.length}const cd=concat(centrals),body=concat(locals),end=new Uint8Array([0x50,0x4b,0x05,0x06,...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(cd.length),...u32(body.length),...u16(0)]);return concat([body,cd,end])}
function makeXlsx(rows){
  const headers=['No.','Affiliate Code','Affiliate Name','Bank Name','Bank Account Name','Bank Account Number','Country','Currency','Net Amount Payable','Payout Period','Payout Reference','Affiliate Email','Payment Reference','Payment Date','Remarks'];
  const data=rows.map((x,i)=>[i+1,x.affiliate_code||'',x.full_name||x.display_name||'',x.bank_name||'',x.bank_account_name||'',x.bank_account_number||'',x.country||'',x.currency||'MYR',Number(x.net_amount_payable||0),x.payout_period||'',x.payout_reference||'',x.email||'','','',missingBank(x)?'BANK DETAILS INCOMPLETE':'']);
  const all=[headers,...data];
  const sheetRows=all.map((r,ri)=>`<row r="${ri+1}">${r.map((v,ci)=>{const ref=`${colName(ci+1)}${ri+1}`,style=ri===0?' s="1"':'';if(typeof v==='number')return `<c r="${ref}"${style}><v>${v}</v></c>`;return `<c r="${ref}" t="inlineStr"${style}><is><t>${xml(v)}</t></is></c>`}).join('')}</row>`).join('');
  const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="7" customWidth="1"/><col min="2" max="3" width="22" customWidth="1"/><col min="4" max="6" width="25" customWidth="1"/><col min="7" max="8" width="14" customWidth="1"/><col min="9" max="9" width="20" customWidth="1"/><col min="10" max="15" width="24" customWidth="1"/></cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:O${all.length}"/></worksheet>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const files=[
    {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`},
    {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
    {name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Affiliate Bank Payments" sheetId="1" r:id="rId1"/></sheets></workbook>`},
    {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
    {name:'xl/worksheets/sheet1.xml',data:sheet},{name:'xl/styles.xml',data:styles}
  ];
  return new Blob([zip(files)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function exportXlsx(){if(!current.length){msg('Load an approved payment list first.',true);return}const incomplete=current.filter(missingBank).length;if(incomplete&&!confirm(`${incomplete} payout(s) have incomplete bank details. Export anyway?`))return;const period=$('#period').value||'month',blob=makeXlsx(current),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`QY-Affiliate-Bank-Payment-List-${period}.xlsx`;document.body.appendChild(a);a.click();const url=a.href;a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);msg(`Excel bank payment list exported for ${period}. No payout status was changed.`)}

$('#load').addEventListener('click',load);$('#export').addEventListener('click',exportXlsx);$('#includeTests').addEventListener('change',()=>{current=[];$('#export').disabled=true});setDefaultPeriod();
