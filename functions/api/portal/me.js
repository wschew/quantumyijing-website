import {
  authenticatedCustomer,
  json
} from "./_auth.js";


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


    if(!auth.db){
      return json({
        error:"Database unavailable."
      },503);
    }


    if(
      !auth.session ||
      !auth.customer
    ){
      return json({
        error:"Unauthorized."
      },401);
    }


    const db=
      auth.db;

    const customerId=
      auth.customer.id;


    const students=
      await db.prepare(`
        SELECT DISTINCT
          s.id,
          s.student_id,
          s.name,
          s.email,
          s.phone,
          s.country,
          s.programme,
          s.lifecycle_stage

        FROM students s

        JOIN customer_enquiry_links cel
          ON cel.enquiry_id=s.enquiry_id

        WHERE cel.customer_id=?

        ORDER BY s.id
      `)
        .bind(customerId)
        .all();


    const courses=
      await db.prepare(`
        SELECT
          ce.id,
          ce.entitlement_reference,
          ce.product_id,
          ce.student_id,
          ce.status,
          ce.access_scope,
          ce.starts_at,
          ce.ends_at,

          p.sku,
          p.name_en,
          p.name_zh,
          p.starts_on AS course_starts_on,
          p.ends_on AS course_ends_on,
          p.delivery_en,
          p.delivery_zh,
          p.instructor

        FROM course_entitlements ce

        JOIN products p
          ON p.id=ce.product_id

        WHERE ce.customer_id=?

        ORDER BY
          ce.id DESC
      `)
        .bind(customerId)
        .all();


    const memberships=
      await db.prepare(`
        SELECT
          m.id,
          m.membership_reference,
          m.product_id,
          m.status,
          m.starts_at,
          m.ends_at,
          m.activated_at,

          p.sku,
          p.name_en,
          p.name_zh

        FROM memberships m

        JOIN products p
          ON p.id=m.product_id

        WHERE m.customer_id=?

        ORDER BY m.id DESC
      `)
        .bind(customerId)
        .all();


    const subscriptions=
      await db.prepare(`
        SELECT
          s.id,
          s.subscription_reference,
          s.plan_id,
          s.membership_id,
          s.status,
          s.current_period_start,
          s.current_period_end,
          s.next_renewal_at,
          s.grace_ends_at,
          s.auto_renew,
          s.cancel_at_period_end,

          p.sku,
          p.name_en,
          p.name_zh

        FROM subscriptions s

        LEFT JOIN memberships m
          ON m.id=s.membership_id

        LEFT JOIN products p
          ON p.id=m.product_id

        WHERE s.customer_id=?

        ORDER BY s.id DESC
      `)
        .bind(customerId)
        .all();


    return json({
      ok:true,

      customer:
        auth.customer,

      students:
        students.results || [],

      courses:
        courses.results || [],

      memberships:
        memberships.results || [],

      subscriptions:
        subscriptions.results || [],

      session:{
        expires_at:
          auth.session.expires_at
      }
    });

  }
  catch(error){

    console.error(
      "academy portal me",
      error
    );

    return json({
      error:
        "Unable to load Academy Portal."
    },500);
  }
}