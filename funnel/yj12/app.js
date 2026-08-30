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

  const root=document.getElementById('quizQuestion');
  if(root){
    const progress=document.getElementById('progressBar');
    const answers=[];
    const questions=[
      {tag:'Question 2 of 3',title:'What would be most useful right now?',choices:[['pattern','A clearer view of the forces at work.'],['timing','A better sense of timing and direction.'],['tradeoff','A framework for comparing consequences.']]},
      {tag:'Question 3 of 3',title:'How do you prefer to learn?',choices:[['guided','Live guidance with a teacher.'],['system','A structured framework I can practise.'],['applied','Ideas connected to real decisions.']]}
    ];
    root.addEventListener('click',event=>{
      const button=event.target.closest('[data-answer]');if(!button)return;
      answers.push(button.dataset.answer);
      const step=answers.length;
      progress.style.width=Math.min((step+1)*33.34,100)+'%';
      if(step<=2){const q=questions[step-1];root.innerHTML=`<p class="tag">${q.tag}</p><h2>${q.title}</h2><div class="choices">${q.choices.map(c=>`<button data-answer="${c[0]}">${c[1]}</button>`).join('')}</div>`;return;}
      const focus=answers[0]==='timing'?'timing and change':answers[0]==='tradeoff'?'consequences and considered action':'patterns and relationships';
      const resultPath=answers.join('-');
      root.innerHTML=`<p class="tag">Your YJ12 pathway</p><h2>Begin with ${focus}.</h2><p>Your answers suggest that the structured, live format of YJ12 may help you widen the frame around difficult decisions. Explore the full programme before deciding whether to enrol.</p><a class="button full" href="${trackedUrl('course.html',{path:resultPath})}">See how YJ12 works</a>`;
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
