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


async function validEntitlement(
  db,
  customerId,
  productId
){

  return await db.prepare(`
    SELECT
      ce.id,
      ce.entitlement_reference,
      ce.customer_id,
      ce.product_id,
      ce.status,
      ce.access_scope,
      ce.starts_at,
      ce.ends_at

    FROM course_entitlements ce

    JOIN products p
      ON p.id=ce.product_id

    WHERE
      ce.customer_id=?
      AND ce.product_id=?
      AND ce.status='Active'
      AND p.status='Active'
      AND lower(p.product_type)='course'

      AND (
        COALESCE(ce.starts_at,'')=''
        OR datetime(ce.starts_at)<=datetime('now')
      )

      AND (
        COALESCE(ce.ends_at,'')=''
        OR datetime(ce.ends_at)>datetime('now')
      )

    ORDER BY ce.id DESC
    LIMIT 1
  `)
    .bind(
      customerId,
      productId
    )
    .first();
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

    const productId=
      integer(
        url.searchParams.get(
          "product_id"
        )
      );


    if(!productId){
      return json({
        error:
          "Valid product_id required."
      },400);
    }


    const entitlement=
      await validEntitlement(
        auth.db,
        auth.customer.id,
        productId
      );


    if(!entitlement){
      return json({
        error:
          "You do not currently have access to this course."
      },403);
    }


    const product=
      await auth.db.prepare(`
        SELECT
          id,
          sku,
          name_en,
          name_zh,
          description_en,
          description_zh,
          starts_on,
          ends_on,
          delivery_en,
          delivery_zh,
          instructor

        FROM products

        WHERE id=?

        LIMIT 1
      `)
        .bind(productId)
        .first();


    const modulesResult=
      await auth.db.prepare(`
        SELECT
          id,
          module_reference,
          title_en,
          title_zh,
          description_en,
          description_zh,
          sort_order

        FROM course_modules

        WHERE
          product_id=?
          AND status='Published'

        ORDER BY
          sort_order,
          id
      `)
        .bind(productId)
        .all();


    const modules=[];


    for(
      const module of
      modulesResult.results || []
    ){

      const lessonResult=
        await auth.db.prepare(`
          SELECT
            id,
            lesson_reference,
            title_en,
            title_zh,
            summary_en,
            summary_zh,
            sort_order,
            available_from,
            available_until

          FROM course_lessons

          WHERE
            module_id=?
            AND status='Published'

            AND (
              COALESCE(available_from,'')=''
              OR datetime(available_from)<=datetime('now')
            )

            AND (
              COALESCE(available_until,'')=''
              OR datetime(available_until)>datetime('now')
            )

          ORDER BY
            sort_order,
            id
        `)
          .bind(module.id)
          .all();


      const lessons=[];


      for(
        const lesson of
        lessonResult.results || []
      ){

        /*
         * Deliberately return resource metadata only.
         * Protected payload/url is resolved separately by
         * /api/portal/resource after entitlement is rechecked.
         */
        const resourceResult=
          await auth.db.prepare(`
            SELECT
              id,
              resource_reference,
              resource_type,
              title_en,
              title_zh,
              description_en,
              description_zh,
              sort_order

            FROM course_resources

            WHERE
              lesson_id=?
              AND status='Published'

            ORDER BY
              sort_order,
              id
          `)
            .bind(lesson.id)
            .all();


        lessons.push({
          ...lesson,

          resources:
            resourceResult.results || []
        });
      }


      modules.push({
        ...module,
        lessons
      });
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
        ?,?,?,
        NULL,
        'course_view',
        ?
      )
    `)
      .bind(
        auth.customer.id,
        entitlement.id,
        productId,
        clean(
          request.headers.get("user-agent") || "",
          500
        )
      )
      .run();


    return json({
      ok:true,

      course:product,

      entitlement:{
        id:Number(entitlement.id),

        entitlement_reference:
          entitlement.entitlement_reference,

        status:
          entitlement.status,

        access_scope:
          entitlement.access_scope,

        starts_at:
          entitlement.starts_at,

        ends_at:
          entitlement.ends_at
      },

      modules
    });

  }
  catch(error){

    console.error(
      "portal course-content",
      error
    );

    return json({
      error:
        "Unable to load protected course content."
    },500);
  }
}