import {
  authenticatedCustomer,
  clean,
  json
} from "./_auth.js";


function integer(value){

  const n=
    Number(value);

  return (
    Number.isInteger(n) &&
    n>0
  )
    ? n
    : 0;
}


export async function onRequestGet({
  request,
  env
}){

  try{

    const auth=
      await authenticatedCustomer(
        request,
        env
      );


    if(
      !auth.db ||
      !auth.session ||
      !auth.customer
    ){
      return json({
        error:"Unauthorized."
      },401);
    }


    const url=
      new URL(request.url);

    const resourceId=
      integer(
        url.searchParams.get("id")
      );


    if(!resourceId){
      return json({
        error:
          "Valid resource id required."
      },400);
    }


    const resource=
      await auth.db.prepare(`
        SELECT
          r.id,
          r.resource_reference,
          r.resource_type,
          r.title_en,
          r.title_zh,
          r.description_en,
          r.description_zh,
          r.content_text,
          r.resource_url,

          l.id AS lesson_id,
          l.status AS lesson_status,
          l.available_from,
          l.available_until,

          m.id AS module_id,
          m.status AS module_status,

          p.id AS product_id,
          p.sku,
          p.name_en AS course_name_en,
          p.name_zh AS course_name_zh,
          p.status AS product_status

        FROM course_resources r

        JOIN course_lessons l
          ON l.id=r.lesson_id

        JOIN course_modules m
          ON m.id=l.module_id

        JOIN products p
          ON p.id=m.product_id

        WHERE
          r.id=?
          AND r.status='Published'
          AND l.status='Published'
          AND m.status='Published'
          AND p.status='Active'
          AND lower(p.product_type)='course'

          AND (
            COALESCE(l.available_from,'')=''
            OR datetime(l.available_from)<=datetime('now')
          )

          AND (
            COALESCE(l.available_until,'')=''
            OR datetime(l.available_until)>datetime('now')
          )

        LIMIT 1
      `)
        .bind(resourceId)
        .first();


    if(!resource){
      return json({
        error:
          "Resource not available."
      },404);
    }


    const entitlement=
      await auth.db.prepare(`
        SELECT
          id,
          entitlement_reference,
          status,
          access_scope,
          starts_at,
          ends_at

        FROM course_entitlements

        WHERE
          customer_id=?
          AND product_id=?
          AND status='Active'

          AND (
            COALESCE(starts_at,'')=''
            OR datetime(starts_at)<=datetime('now')
          )

          AND (
            COALESCE(ends_at,'')=''
            OR datetime(ends_at)>datetime('now')
          )

        ORDER BY id DESC
        LIMIT 1
      `)
        .bind(
          auth.customer.id,
          resource.product_id
        )
        .first();


    if(!entitlement){
      return json({
        error:
          "You do not currently have access to this resource."
      },403);
    }


    await auth.db.prepare(`
      INSERT INTO course_content_access_events(
        customer_id,
        course_entitlement_id,
        product_id,
        resource_id,
        event_type,
        user_agent
      )
      VALUES(
        ?,?,?,?,
        'resource_view',
        ?
      )
    `)
      .bind(
        auth.customer.id,
        entitlement.id,
        resource.product_id,
        resource.id,
        clean(
          request.headers.get("user-agent") || "",
          500
        )
      )
      .run();


    return json({
      ok:true,

      resource:{
        id:Number(resource.id),

        resource_reference:
          resource.resource_reference,

        resource_type:
          resource.resource_type,

        title_en:
          resource.title_en,

        title_zh:
          resource.title_zh,

        description_en:
          resource.description_en,

        description_zh:
          resource.description_zh,

        /*
         * These protected fields are returned only here,
         * after session + entitlement validation.
         */
        content_text:
          resource.content_text,

        resource_url:
          resource.resource_url,

        product_id:
          Number(resource.product_id),

        course_name_en:
          resource.course_name_en,

        course_name_zh:
          resource.course_name_zh
      }
    });

  }
  catch(error){

    console.error(
      "portal resource",
      error
    );

    return json({
      error:
        "Unable to load protected resource."
    },500);
  }
}