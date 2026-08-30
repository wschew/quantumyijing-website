(function(){
  const params=new URLSearchParams(location.search);
  const tracking=['aff','utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
  const savedAff=params.get('aff')||localStorage.getItem('qy_affiliate_code')||'';
  if(params.get('aff'))localStorage.setItem('qy_affiliate_code',params.get('aff'));

  function trackedUrl(href,extra={}){
    const url=new URL(href,location.href);
    tracking.forEach(key=>{
      const value=key==='aff'?savedAff:params.get(key);
      if(value)url.searchParams.set(key,value);
    });
    Object.entries(extra).forEach(([key,value])=>{if(value)url.searchParams.set(key,value)});
    return url.href;
  }

  document.querySelectorAll('[data-register],[data-offer]').forEach(link=>{link.href=trackedUrl(link.getAttribute('href'))});

  async function syncProductPricing(){
    const price=document.querySelector('[data-effective-price]');
    if(!price)return;
    const isZh=document.documentElement.lang.toLowerCase().startsWith('zh');
    try{
      const response=await fetch('/api/product-pricing/yj12-yijing-science-of-prediction',{headers:{accept:'application/json'},cache:'no-store'});
      if(!response.ok)throw new Error('Pricing unavailable');
      const product=await response.json();
      const currency=product.currency||'MYR';
      const prefix=currency==='MYR'?'RM':currency;
      const amount=value=>Number(value||0).toLocaleString('en-MY',{maximumFractionDigits:2});
      const date=value=>new Intl.DateTimeFormat(isZh?'zh-MY':'en-MY',{timeZone:'Asia/Kuala_Lumpur',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${value}T00:00:00+08:00`));
      const label=document.querySelector('[data-price-label]');
      const standard=document.querySelector('[data-standard-price]');
      const deadline=document.querySelector('[data-price-deadline]');
      const announcement=document.querySelector('[data-price-announcement]');
      price.innerHTML=`<small>${currency}</small> ${amount(product.effectivePrice)}`;
      if(product.earlyBirdActive){
        label.textContent=isZh?'早鸟课程费':'Early-bird tuition';
        standard.hidden=false;standard.innerHTML=isZh?`原价 <s>${prefix} ${amount(product.standardPrice)}</s>`:`Standard tuition <s>${prefix} ${amount(product.standardPrice)}</s>`;
        deadline.hidden=false;deadline.textContent=isZh?`优惠截止：${date(product.earlyBirdEnd)}`:`Available through ${date(product.earlyBirdEnd)}`;
        announcement.textContent=isZh?`早鸟优惠 ${prefix}${amount(product.earlyBirdPrice)} · 截止于 ${date(product.earlyBirdEnd)}`:`Early-bird ${currency} ${amount(product.earlyBirdPrice)} until ${date(product.earlyBirdEnd)}`;
      }else{
        label.textContent=isZh?'课程费':'Course tuition';
        standard.hidden=true;deadline.hidden=true;
        announcement.textContent=isZh?`YJ12 课程费 ${prefix}${amount(product.effectivePrice)}`:`YJ12 tuition ${currency} ${amount(product.effectivePrice)}`;
      }
    }catch(error){console.warn('Using funnel fallback pricing.',error)}
  }
  syncProductPricing();

  const root=document.getElementById('quizQuestion');
  if(root){
    const isZh=document.documentElement.lang.toLowerCase().startsWith('zh');
    const progress=document.getElementById('progressBar');
    const answers=[];
    const questions=isZh?[
      {tag:'第 2 题，共 3 题',title:'现在对您最有帮助的是什么？',choices:[['pattern','更清楚地看见正在影响事情的各种力量。'],['timing','更准确地掌握时机与方向。'],['tradeoff','用一个框架比较不同选择的后果。']]},
      {tag:'第 3 题，共 3 题',title:'您比较喜欢怎样学习？',choices:[['guided','由老师进行实时引导。'],['system','学习一套可以反复练习的系统框架。'],['applied','把观念应用到真实决定中。']]}
    ]:[
      {tag:'Question 2 of 3',title:'What would be most useful right now?',choices:[['pattern','A clearer view of the forces at work.'],['timing','A better sense of timing and direction.'],['tradeoff','A framework for comparing consequences.']]},
      {tag:'Question 3 of 3',title:'How do you prefer to learn?',choices:[['guided','Live guidance with a teacher.'],['system','A structured framework I can practise.'],['applied','Ideas connected to real decisions.']]}
    ];
    root.addEventListener('click',event=>{
      const button=event.target.closest('[data-answer]');if(!button)return;
      answers.push(button.dataset.answer);
      const step=answers.length;
      progress.style.width=Math.min((step+1)*33.34,100)+'%';
      if(step<=2){const q=questions[step-1];root.innerHTML=`<p class="tag">${q.tag}</p><h2>${q.title}</h2><div class="choices">${q.choices.map(c=>`<button data-answer="${c[0]}">${c[1]}</button>`).join('')}</div>`;return;}
      const focus=isZh?(answers[0]==='timing'?'时机与变化':answers[0]==='tradeoff'?'后果与审慎行动':'规律与关系'):(answers[0]==='timing'?'timing and change':answers[0]==='tradeoff'?'consequences and considered action':'patterns and relationships');
      const resultPath=answers.join('-');
      root.innerHTML=isZh?`<p class="tag">您的 YJ12 学习方向</p><h2>从${focus}开始。</h2><p>您的答案显示，YJ12 的系统化直播学习方式或能帮助您以更全面的角度看待困难的决定。您可以先了解完整课程，再决定是否报名。</p><a class="button full" href="${trackedUrl('zh.html',{path:resultPath})}">了解 YJ12 如何运作</a>`:`<p class="tag">Your YJ12 pathway</p><h2>Begin with ${focus}.</h2><p>Your answers suggest that the structured, live format of YJ12 may help you widen the frame around difficult decisions. Explore the full programme before deciding whether to enrol.</p><a class="button full" href="${trackedUrl('course.html',{path:resultPath})}">See how YJ12 works</a>`;
    });
  }

  const leadForm=document.getElementById('leadForm');
  if(leadForm){
    const isZh=document.documentElement.lang.toLowerCase().startsWith('zh');
    const startedAt=Date.now();
    leadForm.addEventListener('submit',async event=>{
      event.preventDefault();
      const status=document.getElementById('leadStatus');
      const button=leadForm.querySelector('button[type="submit"]');
      const form=new FormData(leadForm);
      button.disabled=true;button.textContent='Sending…';status.className='form-status';status.textContent='';
      const body={
        name:form.get('name'),email:form.get('email'),phone:form.get('phone'),country:form.get('country'),
        interest:'Academy Course',message:isZh?'YJ12 漏斗潜在客户——索取课程资料。':'YJ12 funnel lead — requested course information.',language:isZh?'zh':'en',
        consent:form.get('consent'),website:form.get('website'),startedAt,
        marketingSource:'YJ12 Funnel',campaignCode:params.get('utm_campaign')||'YJ12-FUNNEL',
        landingPage:location.pathname,referrer:document.referrer,
        utmSource:params.get('utm_source')||'',utmMedium:params.get('utm_medium')||'',utmCampaign:params.get('utm_campaign')||'',
        utmContent:params.get('utm_content')||'',utmTerm:params.get('utm_term')||'',affiliateCode:savedAff,
        productSlug:'yj12-yijing-science-of-prediction',createOrder:false
      };
      try{
        const response=await fetch('/api/enquiry',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||'Unable to send your request.');
        leadForm.reset();status.className='form-status success';status.textContent=isZh?`谢谢。您的咨询编号是 ${data.reference}。`:`Thank you. Your enquiry reference is ${data.reference}.`;
      }catch(error){status.className='form-status error';status.textContent=error.message||(isZh?'暂时无法发送，请再试一次。':'Unable to send your request. Please try again.')}
      finally{button.disabled=false;button.textContent=isZh?'发送课程资料给我':'Send me the course information'}
    });
  }
})();
