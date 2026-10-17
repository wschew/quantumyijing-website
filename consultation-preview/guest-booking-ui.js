// Stage A4: request first; final price and reservation require a later offer acceptance.
const el=id=>document.getElementById(id),form=el('intake');
let policies=null,pricing=null,offerToken=null,offer=null,busy=false,submissionAttempted=false,commandId=crypto.randomUUID();
const status=text=>{el('status').textContent=text;applyLanguage();};
const myt=value=>new Intl.DateTimeFormat(uiLanguage==='zh-CN'?'zh-CN':'en-MY',{timeZone:'Asia/Kuala_Lumpur',dateStyle:'medium',timeStyle:'short'}).format(value)+(uiLanguage==='zh-CN'?' 马来西亚时间':' MYT');
async function api(path,input){const response=await fetch('/api/consultation/'+path,{method:input===undefined?'GET':'POST',headers:input===undefined?{}:{'content-type':'application/json'},credentials:'same-origin',cache:'no-store',...(input===undefined?{}:{body:JSON.stringify(input)})});const data=await response.json();if(!response.ok||data.ok!==true){const error=Error('Request unavailable');error.safeCode=data.code;throw error;}return data;}
function renderRequestPricing(){if(!pricing)return;const zh=uiLanguage==='zh-CN',money=n=>'RM '+(n/100).toFixed(2);el('request-pricing').textContent=(zh?'原价：':'Regular price: ')+money(pricing.regularPriceSen)+' | '+(zh?'适用优惠价：':'Applicable promotional price: ')+(pricing.promotionId?money(pricing.sellingPriceSen):(zh?'无':'None'));}
function renderOfferSummary(){if(!offer)return;const p=offer.breakdown,money=n=>'RM '+(n/100).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});const host=el('offer-summary');host.replaceChildren();const list=document.createElement('dl');list.className='case-summary';for(const [label,value,final]of [['Booking reference',offer.reference],['Appointment',myt(offer.startAt)],...(p?[['Regular price',money(p.regular_price_sen)],[p.base_price_sen<p.regular_price_sen?'Promotional price':'Applicable selling price',money(p.base_price_sen)]]:[]),['Your final price',money(offer.sellingPriceSen),true],['Offer expiry',myt(offer.expiresAt)],...(p?.discount_description?[['Description',p.discount_description]]:[])]){const term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=translateText(label);detail.dataset.noI18n='';if(final){const strong=document.createElement('strong');strong.textContent=value;detail.className='offer-final-price';detail.append(strong);}else detail.textContent=value;list.append(term,detail);}host.append(list);}

const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
el('preferred-date').min=today;el('preferred-date').max=new Date(Date.now()+30*86400000+8*3600000).toISOString().slice(0,10);
form.addEventListener('submit',async event=>{event.preventDefault();if(busy||!policies||submissionAttempted)return;if(!el('request-ack').checked){status('Acknowledge the booking request terms before submitting.');return;}const preferredStart=Date.parse(el('preferred-date').value+'T'+el('preferred-time').value+':00+08:00');if(!Number.isSafeInteger(preferredStart)||preferredStart<Date.now()+72*3600000||preferredStart>Date.now()+31*86400000||preferredStart%1800000!==0){status('Choose a preferred time at least 72 hours ahead, within 30 days, on the hour or half hour.');return;}busy=true;el('request-submit').disabled=true;
 try{const data=new FormData(form),precision=data.get('birthTimePrecision');const intake={fullName:data.get('fullName'),calculationGender:data.get('calculationGender'),birthDate:data.get('birthDate'),birthTimePrecision:precision,birthTime:precision==='unknown'?null:data.get('birthTime'),birthCity:data.get('birthCity'),birthCountry:String(data.get('birthCountry')).toUpperCase(),questions:data.get('questions'),reportChannel:data.get('reportChannel'),selfBooking:data.get('selfBooking')==='on',adultAcknowledged:data.get('adultAcknowledged')==='on',privacyAcknowledgement:{accepted:data.get('privacy')==='on',version:policies.consultation_privacy.version},futureCalculationsConsent:{accepted:data.get('future')==='on',version:policies.future_calculations.version},marketingConsent:{accepted:data.get('marketing')==='on',version:policies.marketing.version}};
  submissionAttempted=true;const result=await api('guest/review-request',{commandId,intake,contact:data.get('contact'),preferredStart,bookingAcknowledgement:{accepted:true,version:policies.booking.version,hash:policies.booking.hash}});form.reset();form.hidden=true;el('request-result').hidden=false;status('Request received: '+result.reference+'. UnderReview. Await QY final price and appointment offer. No appointment or payment is confirmed.');
 }catch{status('Submission result is uncertain. Contact QY before submitting again; no automatic retry.');}finally{busy=false;el('request-submit').disabled=submissionAttempted;}});
el('guest-accept').addEventListener('click',async()=>{if(!offer||!offerToken||!el('offer-consent').checked)return;el('guest-accept').disabled=true;try{await api('guest/offer/accept',{token:offerToken,acknowledged:true,snapshotHash:offer.snapshotHash,policyHash:offer.policyHash});status('Offer accepted. PaymentPending: await QY payment instructions. Zoom consultation is confirmed only after trusted full-payment verification.');offerToken=null;el('offer-consent').disabled=true;}catch(error){status(error.safeCode==='APPOINTMENT_UNAVAILABLE'?'This appointment is unavailable. Contact QY for another proposal. Do not pay.':error.safeCode==='OFFER_CHANGED_OR_EXPIRED'?'This offer has expired or changed. Contact QY for a current offer. Do not pay.':'Acceptance could not be verified. Contact QY before retrying or paying.');}});
async function initialize(){const hash=new URLSearchParams(location.hash.slice(1));offerToken=hash.get('offer');if(location.hash)history.replaceState(null,'',location.pathname);try{if(hash.has('invitation')){form.hidden=true;status('Pricing invitations have been retired. Submit a new consultation request for QY review.');return;}if(offerToken){form.hidden=true;el('request-intro').hidden=true;el('booking-heading').textContent='Your Bazi Consultation Offer';offer=await api('guest/offer',{token:offerToken});const notices=await api('guest/policies');el('offer-privacy').textContent=notices.policies.consultation_privacy.text;el('guest-offer').hidden=false;renderOfferSummary();el('offer-policy').textContent=offer.policyText;el('guest-accept').disabled=offer.state!=='Offered';if(offer.state==='PaymentPending')status('PaymentPending. This is not a confirmed consultation.');applyLanguage();}else{const data=await api('guest/policies');policies=data.policies;pricing=data.pricing;renderRequestPricing();el('request-policy').textContent=policies.booking.text;for(const purpose of ['consultation_privacy','future_calculations','marketing']){const p=document.createElement('p');p.textContent=policies[purpose].text;el('policies').append(p);}status('Synthetic Preview only. Use invented adult self-booking details. No real payment or messages.');}}catch{policies=null;form.hidden=true;status('This request page or offer is unavailable. Contact QY. No private records are publicly searchable.');}}
window.addEventListener('pagehide',()=>{offerToken=null;offer=null;policies=null;form.reset();});
// Reuse workflow-ui.js's language preference and text-node/WeakMap approach.
// Presentation only: never rebuild controls or modify policy hashes/API values.
const zhLabels={
 'This appointment is unavailable. Contact QY for another proposal. Do not pay.':'该预约时段不可用。请联系 QY 提出其他预约方案，请勿付款。',
 'This offer has expired or changed. Contact QY for a current offer. Do not pay.':'此方案已过期或变更。请联系 QY 获取有效方案，请勿付款。',
 'Acceptance could not be verified. Contact QY before retrying or paying.':'无法核实接受结果。重试或付款前请先联系 QY。',
 'Your Bazi Consultation Offer':'您的八字命理咨询方案',
 '90-minute online Zoom consultation with personalized PDF report.':'90 分钟 Zoom 在线咨询，包含个性化 PDF 报告。',
 'Booking reference':'咨询编号',
 'Appointment':'预约时间',
 'Regular price':'原价',
 'Promotional price':'优惠价',
 'Applicable selling price':'适用售价',
 'Your final price':'您的最终价格',
 'Offer expiry':'方案有效期至',
 'Description':'说明',
 'Consultation terms and privacy notice':'咨询条款与隐私声明',
 'Consultation terms':'咨询条款',
 'Privacy notice':'隐私声明',
 'I accept the displayed final price, appointment and consultation terms, and acknowledge the privacy notice.':'本人接受所显示的最终价格、预约时间与咨询条款，并确认已阅读隐私声明。',
 'Accept Offer':'接受方案',
 'Your appointment is reserved after accepting the offer. Final confirmation requires verified full payment. Payment instructions will be provided separately.':'接受方案后将为您预留预约时段。核实全额付款后方可最终确认。付款指引将另行提供。',
 'Synthetic Preview only. No live payment is enabled.':'仅限模拟预览，未启用真实付款。',
 'Preferred time':'意向时间',
 'Enter your preferred date and time. QY will confirm or propose an alternative after review.':'请输入意向日期与时间。QY 审核后将确认或建议其他时间。',
 'Submit Consultation Request':'提交咨询申请',
 'Choose a preferred time at least 72 hours ahead, within 30 days, on the hour or half hour.':'请选择至少 72 小时后、30 天内的意向时间，限整点或半点。',
 'Acceptance not confirmed. The appointment may be unavailable or the offer expired or changed. Contact QY to arrange another time. Do not pay.':'尚未确认接受。该时段可能不可用，或方案已过期或变更。请联系 QY 安排其他时间，请勿付款。',
 'Your final consultation price will be provided by QY after reviewing your request.':'QY 审核您的申请后，将提供最终咨询价格。',
 'Booking request terms':'咨询申请条款',
 'I acknowledge the booking request terms. QY will provide the final price and appointment offer for my separate acceptance.':'本人已知悉咨询申请条款。QY 将另行提供最终价格与预约方案，供本人另行明确接受。',
 'Acknowledge the booking request terms before submitting.':'提交前请确认咨询申请条款。',
 'No appointment is reserved. QY will review your request and provide a private appointment offer. Do not pay before accepting a valid offer.':'目前尚未预留时段。QY 将审核您的申请并提供私人预约方案。接受有效方案前请勿付款。',
 'Pricing invitations have been retired. Submit a new consultation request for QY review.':'专属价格邀请功能已停用。请另行提交咨询申请，供 QY 审核。',
 'Individual Special Price':'个人专属价格',
 'Private single-use invitation. Anyone holding this link may use it before expiry. No appointment is reserved until submission.':'私人一次性邀请。持有此链接的任何人均可在到期前使用。提交前不会暂留预约时段。',
 'Discount Code (optional)':'\u6298\u6263\u7801\uff08\u53ef\u9009\uff09',
 'Save this private link. Lost links cannot be recovered automatically; contact QY support without sending birth details. Payment is unavailable in synthetic Preview.':'\u8bf7\u4fdd\u5b58\u6b64\u79c1\u4eba\u94fe\u63a5\u3002\u9057\u5931\u540e\u65e0\u6cd5\u81ea\u52a8\u6062\u590d\uff1b\u8bf7\u8054\u7cfb QY \u5ba2\u670d\uff0c\u5207\u52ff\u53d1\u9001\u51fa\u751f\u8d44\u6599\u3002\u6a21\u62df\u9884\u89c8\u65e0\u6cd5\u4ed8\u6b3e\u3002',
 'Review price and booking terms':'核对价格与预约条款',
 'I accept the displayed price and booking terms.':'本人接受所展示的价格与预约条款。',
 'Payment is unavailable in synthetic Preview. Submission holds the appointment and ends at PaymentPending, not confirmation.':'模拟预览无法付款。提交后暂留时段，状态为等待付款，并非确认预约。',
 'Review price and terms':'核对价格与条款',
 'Accept terms and reserve appointment':'接受条款并暂留预约',
 'Review the actual price and booking terms below, then accept to reserve. No booking has been created.':'请核对下方实际价格与预约条款，同意后再暂留时段。目前尚未创建预约。',
 'Accept the displayed price and terms before reserving.':'请先同意所展示的价格与条款，再暂留时段。',
 'Submission result is uncertain. Contact QY before submitting again; no automatic retry.':'提交结果尚未确定。再次提交前请联系 QY；系统不会自动重试。',
 'Price and terms review unavailable. Check the chosen time and try again manually.':'暂时无法核对价格与条款。请检查所选时段后手动重试。',
 'View this booking privately':'私密查看此预约',
 'Keep this link private. Payment is unavailable in synthetic Preview.':'请妥善保管此私人链接。模拟预览无法付款。',
 '90 minutes; at least 72 hours ahead. The appointment is held only after you accept the actual price and terms. Confirmation requires verified full payment.':'每次咨询 90 分钟，至少提前 72 小时预约。同意实际价格与条款后才会暂留时段。必须核实全额付款后才能确认。',
 'Bazi Consultation — Local Preview':'八字命理咨询 — 本地预览',
 'Customer Booking':'客户预约','QY Dashboard':'QY 管理面板',
 'Consultation navigation':'咨询导航','Quantum YiJing Academy logo':'Quantum YiJing 学院标志',
 'Consultation request':'咨询申请',
 '90 minutes online via Zoom. Personalized PDF report included, delivered manually. Regular price RM1,300. Promotional price RM980 for offers issued 11 October-31 December 2026 (Malaysia time), subject to the approved promotion being active. Minimum appointment lead time: 72 hours. Appointment offers are valid for 48 hours. Adults 18+ booking for themselves. Local/isolated Preview only.':'通过 Zoom 进行 90 分钟线上咨询，包含人工交付的个性化 PDF 报告。原价 RM1,300。2026 年 10 月 11 日至 12 月 31 日（马来西亚时间）发出的预约方案，若经批准的优惠活动有效，优惠价为 RM980。至少提前 72 小时预约；方案有效期为 48 小时。仅限年满 18 岁的成年人为本人预约。仅供本地／独立预览测试。',
 'No account or OTP is needed. Contact details are unverified until QY reviews them. Preview: invented test data only.':'无需账户或验证码。联系方式在 QY 核实前均为未核实状态。预览测试仅可使用虚构资料。',
 'Contact channel':'联系渠道','Email':'电子邮箱','WhatsApp':'WhatsApp',
 'Contact details':'联系方式','Preferred appointment (Malaysia time)':'期望预约时间（马来西亚时间）',
 'Date':'日期','Show available times':'查看可用时段','Available start times':'可选开始时间',
 'Choose a date first':'请先选择日期',
 'Loading available times...':'正在读取可用时段……',
 '90 minutes; at least 72 hours ahead. This request does not reserve or confirm the appointment.':'每次咨询 90 分钟，须至少提前 72 小时申请。提交申请不代表预留时段或确认预约。',
 'Policy texts':'政策文本','Full name':'姓名','Gender used for Bazi calculation':'用于八字计算的性别',
 'Female':'女','Male':'男','Birth date':'出生日期','Birth time precision':'出生时间精确度',
 'Unknown':'未知','Exact':'准确','Approximate':'大约','Birth time':'出生时间','Birth city':'出生城市',
 'Country ISO code':'国家 ISO 代码','Questions':'咨询问题',
 'These are my own birth details.':'以上为本人的出生资料。','I am at least 18.':'本人已年满 18 岁。',
 'I acknowledge the consultation privacy policy shown by QY.':'本人已阅读并知悉 QY 展示的咨询隐私政策。',
 'Optional personalized-calculation permission, separate from this consultation.':'可选：授权用于未来个性化计算，与本次咨询分开。',
 'Optional marketing consent.':'可选：同意接收营销信息。',
 'No customer charts are used in classes. Completed intake retention is five MYT calendar years. No PDF is stored here.':'客户命盘不会用于课堂。已完成咨询的资料保留五个马来西亚时间日历年。此处不存储 PDF 文件。',
 'Submit consultation request':'提交咨询申请','Appointment offer':'预约方案',
 'I accept this appointment offer and its displayed policy.':'本人接受此预约方案及所展示的政策。',
 'Accept offer':'接受方案',
 'Acceptance remains PaymentPending. Follow QY payment instructions separately; only trusted full-payment verification permits confirmation. No live payment is enabled in Preview.':'接受方案后仍为等待付款状态。请另行遵循 QY 的付款指示；只有通过可信流程核实全额付款后，才可确认预约。预览环境未启用真实付款。',
 'Quantum YiJing International Academy - Synthetic Preview only':'Quantum YiJing 国际学院 — 仅供模拟预览',
 'Choose a time. The slot is held only after price and terms acceptance.':'\u8bf7\u9009\u62e9\u65f6\u6bb5\u3002\u63a5\u53d7\u4ef7\u683c\u4e0e\u6761\u6b3e\u540e\u624d\u4f1a\u6682\u7559\u65f6\u6bb5\u3002',
 'No available times on this date. Choose another date.':'该日期没有可用时段，请选择其他日期。',
 'Calendar unavailable. Check the date and try again manually.':'无法读取日历，请检查日期后手动重试。',
 'Request not confirmed. Check the form or ask QY before retrying. No automatic retry.':'尚未确认申请结果。请检查表单或先联系 QY，再决定是否重试。系统不会自动重试。',
 'Offer accepted. PaymentPending: await QY payment instructions. Zoom consultation is confirmed only after trusted full-payment verification.':'已接受方案，目前为等待付款状态，请等待 QY 的付款指示。只有通过可信流程核实全额付款后，才会确认 Zoom 咨询。',
 'Acceptance not confirmed. The offer may have expired or changed. Contact QY; do not pay against an expired offer.':'尚未确认接受结果，方案可能已过期或更改。请联系 QY；不要依据过期方案付款。',
 'PaymentPending. This is not a confirmed consultation.':'等待付款。咨询预约尚未确认。',
 'Synthetic Preview only. Use invented adult self-booking details. No real payment or messages.':'仅供模拟预览。请使用虚构成年人的本人预约资料。不会进行真实付款或发送真实消息。',
 'This request page or offer is unavailable. Contact QY. No private records are publicly searchable.':'此申请页面或方案暂不可用，请联系 QY。私人记录不可公开查询。',
 'Please select this required acknowledgement.':'请勾选此必选确认项。',
 'Please complete this required field.':'请填写此必填项。',
 'Please use the requested format.':'请按要求的格式填写。',
 'Please enter a value within the allowed range.':'请输入允许范围内的值。',
 'Please check the required length.':'请检查所需的长度。','Please enter a valid value.':'请输入有效值。',
 'DRAFT - SYNTHETIC PREVIEW TEST ONLY; NOT APPROVED FOR REAL CUSTOMERS. Enter invented adult self-booking details and test contacts only. No real personal, financial or health information. C1 encrypts intake and restricts private access. This is a test acknowledgement, not an approved customer privacy notice. No real messages are sent.':'草案 — 仅供模拟预览测试，未经批准用于真实客户。仅可填写虚构成年人的本人预约资料和测试联系方式。请勿填写真实个人、财务或健康信息。C1 对咨询资料进行加密并限制私人访问。此内容仅为测试确认，并非经批准的客户隐私声明。不会发送真实消息。',
 'DRAFT - SYNTHETIC PREVIEW TEST ONLY; NOT APPROVED FOR REAL CUSTOMERS. Optional consent tests future personalized-calculation permission using invented data only. Declining does not prevent this synthetic booking. No real secondary use is authorized.':'草案 — 仅供模拟预览测试，未经批准用于真实客户。此可选同意仅使用虚构资料测试未来个性化计算授权。拒绝不会影响本次模拟预约，亦不授权任何真实的二次用途。',
 'DRAFT - SYNTHETIC PREVIEW TEST ONLY; NOT APPROVED FOR REAL CUSTOMERS. Optional marketing consent is exercised as test metadata only. No real marketing or outbound communication is authorized. Declining does not prevent this synthetic booking.':'草案 — 仅供模拟预览测试，未经批准用于真实客户。可选营销同意仅作为测试元数据，不授权真实营销或对外通信。拒绝不会影响本次模拟预约。',
 'DRAFT - SYNTHETIC PREVIEW TEST ONLY; NOT APPROVED FOR REAL CUSTOMERS. Test adult self-booking for a 90-minute online Bazi consultation with a manually prepared personalized PDF report. No real consultation, Zoom invitation, PDF transmission or payment occurs in this test. Offers require at least 72 hours lead time and expire after 48 hours. Acceptance does not confirm a booking. Verified full payment is required for confirmation; trusted payment integration is disabled in this Preview. No real customer policy or legal approval is represented.':'草案 — 仅供模拟预览测试，未经批准用于真实客户。测试成年人为本人预约 90 分钟线上八字咨询，并包含人工制作的个性化 PDF 报告。测试不会进行真实咨询、发送 Zoom 邀请、传输 PDF 或付款。方案须至少提前 72 小时发出，有效期为 48 小时。接受方案不代表确认预约；确认必须以核实全额付款为前提。本预览未启用可信付款集成，亦不代表真实客户政策或法律批准。'
};
let uiLanguage='en';
try{if(localStorage.getItem('qy-consultation-language')==='zh-CN')uiLanguage='zh-CN';}catch{}
const originalText=new WeakMap();
function translateText(value){
 if(uiLanguage!=='zh-CN')return value;
 if(zhLabels[value])return zhLabels[value];
 const reviewed=value.match(/^Request received: (BAZI-[A-Za-z0-9_-]+)\. UnderReview\. Await QY final price and appointment offer\. No appointment or payment is confirmed\.$/);
 if(reviewed)return '\u7533\u8bf7\u5df2\u6536\u5230\uff1a'+reviewed[1]+'\u3002\u5ba1\u6838\u4e2d\uff0c\u8bf7\u7b49\u5f85 QY \u6700\u7ec8\u4ef7\u683c\u4e0e\u9884\u7ea6\u65b9\u6848\u3002\u5c1a\u672a\u786e\u8ba4\u9884\u7ea6\u6216\u4ed8\u6b3e\u3002';
 const held=value.match(/^Appointment held: (BAZI-[A-Za-z0-9_-]+)\. PaymentPending\. Payment is unavailable in synthetic Preview\. No consultation is confirmed\.$/);
 if(held)return '预约已暂留：'+held[1]+'。等待付款。模拟预览无法付款，咨询尚未确认。';
 const receipt=value.match(/^Request received: (BAZI-[A-Za-z0-9_-]+)\. Await QY review and a private appointment offer\. No appointment or payment is confirmed\.$/);
 return receipt?'申请已收到：'+receipt[1]+'。请等待 QY 审核及私人预约方案。目前尚未确认预约或付款。':value;
}
function applyLanguage(){
 document.documentElement.lang=uiLanguage;
 const walk=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT);let node;
 while(node=walk.nextNode()){
  if(['SCRIPT','STYLE','TEXTAREA'].includes(node.parentElement?.tagName)||node.parentElement?.closest('[data-language-control],[data-no-i18n]'))continue;
  const previous=originalText.get(node),original=previous&&node.nodeValue===previous.rendered?previous.original:node.nodeValue;
  const trim=original.trim(),rendered=original.replace(trim,translateText(trim));
  originalText.set(node,{original,rendered});if(node.nodeValue!==rendered)node.nodeValue=rendered;
 }
 for(const item of document.querySelectorAll('[data-language]'))item.setAttribute('aria-pressed',String(item.dataset.language===uiLanguage));
 for(const item of document.querySelectorAll('[data-i18n-label]'))item.setAttribute('aria-label',translateText(item.dataset.i18nLabel));
 for(const item of document.querySelectorAll('[data-i18n-alt]'))item.setAttribute('alt',translateText(item.dataset.i18nAlt));
}
function chooseLanguage(language,persist=true){
 uiLanguage=language==='zh-CN'?'zh-CN':'en';
 if(persist)try{localStorage.setItem('qy-consultation-language',uiLanguage);}catch{}
 renderOfferSummary();renderRequestPricing();applyLanguage();
 for(const field of document.querySelectorAll('input,select,textarea'))field.setCustomValidity('');
}
for(const item of document.querySelectorAll('[data-language]'))item.addEventListener('click',()=>chooseLanguage(item.dataset.language));
window.addEventListener('storage',event=>{if(event.key==='qy-consultation-language')chooseLanguage(event.newValue,false);});
document.addEventListener('invalid',event=>{
 const field=event.target,v=field.validity;if(!v)return;
 const message=v.valueMissing?(field.type==='checkbox'?'Please select this required acknowledgement.':'Please complete this required field.'):v.patternMismatch?'Please use the requested format.':v.rangeUnderflow||v.rangeOverflow?'Please enter a value within the allowed range.':v.tooShort||v.tooLong?'Please check the required length.':'Please enter a valid value.';
 field.setCustomValidity(translateText(message));
},true);
document.addEventListener('input',event=>event.target.setCustomValidity?.(''));
new MutationObserver(()=>applyLanguage()).observe(document.body,{childList:true,characterData:true,subtree:true});
applyLanguage();

initialize();
