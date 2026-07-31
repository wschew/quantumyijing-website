const root=document.documentElement;
const langToggle=document.getElementById('lang-toggle');
const menuToggle=document.getElementById('menu-toggle');
const nav=document.getElementById('main-nav');
document.getElementById('year').textContent=new Date().getFullYear();
function setLanguage(lang){root.dataset.lang=lang;root.lang=lang==='zh'?'zh-CN':'en';document.querySelectorAll('[data-en][data-zh]').forEach(el=>el.textContent=el.dataset[lang]);langToggle.textContent=lang==='en'?'中文':'EN';localStorage.setItem('qy-language',lang)}
setLanguage(localStorage.getItem('qy-language')||'en');
langToggle.addEventListener('click',()=>setLanguage(root.dataset.lang==='en'?'zh':'en'));
menuToggle.addEventListener('click',()=>{const open=nav.classList.toggle('open');menuToggle.setAttribute('aria-expanded',String(open));menuToggle.textContent=open?'✕':'☰'});
nav.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{nav.classList.remove('open');menuToggle.setAttribute('aria-expanded','false');menuToggle.textContent='☰'}));
window.addEventListener('load',()=>document.querySelectorAll('.intro-sequence').forEach(el=>el.classList.add('intro-ready')));
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}}),{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
const canvas=document.getElementById('quantum-canvas'),ctx=canvas.getContext('2d'),reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;let w=0,h=0,dpr=Math.min(devicePixelRatio||1,2),pts=[];
function resize(){w=innerWidth;h=innerHeight;canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);pts=Array.from({length:Math.max(24,Math.min(64,Math.floor(w/26)))},()=>({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.18,vy:(Math.random()-.5)*.14,r:.7+Math.random()*1.5,p:Math.random()*6.28}))}
function draw(ts=0){ctx.clearRect(0,0,w,h);pts.forEach((p,i)=>{if(!reduceMotion){p.x+=p.vx;p.y+=p.vy;p.p+=.012}if(p.x<0)p.x=w;if(p.x>w)p.x=0;if(p.y<0)p.y=h;if(p.y>h)p.y=0;const a=.08+.05*Math.sin(p.p);ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=`rgba(20,112,220,${a})`;ctx.fill();for(let j=i+1;j<pts.length;j++){const q=pts[j],d=Math.hypot(p.x-q.x,p.y-q.y);if(d<115){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.strokeStyle=`rgba(18,92,186,${.028*(1-d/115)})`;ctx.stroke()}}});if(!reduceMotion)requestAnimationFrame(draw)}
addEventListener('resize',resize);resize();draw();

const courseTabs=document.querySelectorAll('.course-tab');
const courseCards=document.querySelectorAll('.course-card');
courseTabs.forEach(tab=>tab.addEventListener('click',()=>{
  courseTabs.forEach(item=>item.classList.remove('active'));
  tab.classList.add('active');
  const filter=tab.dataset.courseFilter;
  courseCards.forEach(card=>card.classList.toggle('is-hidden',filter!=='all'&&card.dataset.courseLevel!==filter));
}));


// Version 1.6 — engagement interactions
const progressBar=document.getElementById('scroll-progress');
function updateScrollProgress(){const max=document.documentElement.scrollHeight-innerHeight;progressBar.style.width=(max>0?(scrollY/max)*100:0)+'%'}
addEventListener('scroll',updateScrollProgress,{passive:true});addEventListener('resize',updateScrollProgress);updateScrollProgress();
document.querySelectorAll('.faq-item button').forEach(button=>button.addEventListener('click',()=>{const item=button.closest('.faq-item');const opening=!item.classList.contains('open');document.querySelectorAll('.faq-item.open').forEach(openItem=>{openItem.classList.remove('open');openItem.querySelector('button').setAttribute('aria-expanded','false')});if(opening){item.classList.add('open');button.setAttribute('aria-expanded','true')}}));
const sections=[...document.querySelectorAll('main section[id]')];
const navLinks=[...document.querySelectorAll('.main-nav a[href^="#"]')];
const activeNavObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){navLinks.forEach(link=>link.classList.toggle('active',link.getAttribute('href')==='#'+entry.target.id))}}),{rootMargin:'-35% 0px -55% 0px'});
sections.forEach(section=>activeNavObserver.observe(section));




// Version 1.6.4 — Google Forms lead capture
// Paste the published Google Form URL between the quotation marks after creating the form.
const GOOGLE_FORM_URL='';

document.querySelectorAll('.google-form-link').forEach(link=>{
  link.addEventListener('click',event=>{
    event.preventDefault();
    if(GOOGLE_FORM_URL){
      const separator=GOOGLE_FORM_URL.includes('?')?'&':'?';
      window.open(GOOGLE_FORM_URL+separator+'usp=pp_url','_blank','noopener,noreferrer');
      return;
    }
    const zh=document.documentElement.dataset.lang==='zh';
    alert(zh
      ? 'Google 咨询表格尚未连接。请暂时电邮 info@quantumyijing.com。'
      : 'The Google enquiry form is being connected. Please email info@quantumyijing.com in the meantime.');
  });
});
