const $=s=>document.querySelector(s);let lang='en';
const T={en:{eyebrow:'Affiliate Portal',title:'Affiliate Login',intro:'Sign in to view your sales, commissions, payout history and affiliate links.',email:'Email',password:'Password',login:'Sign In',forgot:'Forgot password?'},zh:{eyebrow:'联盟平台',title:'联盟会员登录',intro:'登录后查看您的销售、佣金、付款记录及联盟链接。',email:'电邮',password:'密码',login:'登录',forgot:'忘记密码？'}};
function setLang(l){lang=l;document.querySelectorAll('[data-i18n]').forEach(e=>{const k=e.dataset.i18n;if(T[l][k])e.textContent=T[l][k]});document.querySelectorAll('.lang').forEach(b=>b.classList.toggle('active',b.dataset.lang===l))}
document.querySelectorAll('.lang').forEach(b=>b.addEventListener('click',()=>setLang(b.dataset.lang)));
$('#login').addEventListener('click',async()=>{const s=$('#status');s.className='status';s.textContent=lang==='zh'?'正在登录…':'Signing in…';const r=await fetch('/api/affiliate/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:$('#email').value,password:$('#password').value})});const d=await r.json().catch(()=>({}));if(!r.ok){s.className='status error';s.textContent=d.error||`HTTP ${r.status}`;return}location.href='/affiliate-dashboard.html'});
$('#password').addEventListener('keydown',e=>{if(e.key==='Enter')$('#login').click()});
setLang('en');
