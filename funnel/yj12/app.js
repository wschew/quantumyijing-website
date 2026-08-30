(function(){
  const params=new URLSearchParams(location.search);
  const tracking=['aff','utm_source','utm_medium','utm_campaign','utm_content'];
  document.querySelectorAll('[data-register]').forEach(link=>{
    const url=new URL(link.href,location.href);
    tracking.forEach(key=>{if(params.get(key))url.searchParams.set(key,params.get(key));});
    link.href=url.href;
  });

  const root=document.getElementById('quizQuestion');
  if(!root)return;
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
    root.innerHTML=`<p class="tag">Your YJ12 pathway</p><h2>Begin with ${focus}.</h2><p>Your answers suggest that the structured, live format of YJ12 may help you widen the frame around difficult decisions. Explore the full programme before deciding whether to enrol.</p><a class="button full" href="index.html?path=${encodeURIComponent(answers.join('-'))}">See how YJ12 works</a>`;
  });
})();
