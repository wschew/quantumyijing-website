(() => {
  try{
    const key='qy_affiliate_visitor_id';
    let id=localStorage.getItem(key);
    if(!id){
      id='QYV-'+crypto.randomUUID();
      localStorage.setItem(key,id);
    }
    const u=new URL(location.href);
    fetch('/api/affiliate/visit',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        visitor_id:id,
        landing_page:location.pathname,
        referrer:document.referrer||'',
        utm_source:u.searchParams.get('utm_source')||'',
        utm_medium:u.searchParams.get('utm_medium')||'',
        utm_campaign:u.searchParams.get('utm_campaign')||''
      }),
      keepalive:true
    }).catch(()=>{});
  }catch(_){}
})();
