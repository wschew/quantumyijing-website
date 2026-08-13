function dbOf(env){return env.ENQUIRIES_DB||env.DB||null}
function clean(v,m=300){return String(v??'').trim().slice(0,m)}

export async function onRequestPost({request,env}){
  const db=dbOf(env);
  if(!db) return Response.json({error:'Database unavailable'},{status:503});
  try{
    const b=await request.json();
    const visitor=clean(b.visitor_id,100);
    if(!visitor) return Response.json({error:'visitor_id required'},{status:400});

    const now=new Date();
    const iso=now.toISOString();
    const date=iso.slice(0,10);
    const month=iso.slice(0,7);

    // One row per anonymous visitor per month.
    const existing=await db.prepare(`
      SELECT id FROM affiliate_page_visits
      WHERE visitor_id=? AND visited_month=?
      LIMIT 1
    `).bind(visitor,month).first();

    if(existing) return Response.json({ok:true,deduplicated:true});

    const country=clean(request.headers.get('cf-ipcountry')||'',10);
    await db.prepare(`
      INSERT INTO affiliate_page_visits (
        visitor_id,visited_at,visited_date,visited_month,landing_page,
        referrer,utm_source,utm_medium,utm_campaign,country
      ) VALUES (?,?,?,?,?,?,?,?,?,?)
    `).bind(
      visitor,iso,date,month,clean(b.landing_page,200)||'/affiliate',
      clean(b.referrer,500),clean(b.utm_source,100),clean(b.utm_medium,100),
      clean(b.utm_campaign,160),country
    ).run();

    return Response.json({ok:true});
  }catch(e){
    console.error('affiliate visit tracking failed',e);
    return Response.json({error:'visit tracking failed'},{status:500});
  }
}
