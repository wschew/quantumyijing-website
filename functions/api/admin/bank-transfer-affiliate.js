function clean(value,max=1000){
  return String(value ?? "")
    .trim()
    .slice(0,max);
}


function money(value){
  const n=Number(value || 0);

  return Number.isFinite(n)
    ? Math.round(n*100)/100
    : 0;
}


async function ensureCustomerAttribution(
  db,
  order,
  affiliate
){
  const email=
    clean(
      order.customer_email || "",
      200
    ).toLowerCase();

  if(!affiliate?.id || !email){
    return {
      created:false,
      reason:"missing-affiliate-or-email"
    };
  }

  const existing=
    await db.prepare(`
      SELECT
        id,
        affiliate_id,
        expires_at,
        status
      FROM affiliate_customer_attributions
      WHERE customer_email_normalized=?
      LIMIT 1
    `)
      .bind(email)
      .first();

  const now=
    new Date();

  const expires=
    new Date(now);

  expires.setUTCFullYear(
    expires.getUTCFullYear()+1
  );

  if(!existing){

    await db.prepare(`
      INSERT INTO affiliate_customer_attributions(
        affiliate_id,
        customer_email_normalized,
        customer_name,
        first_order_id,
        first_order_reference,
        started_at,
        expires_at,
        status
      )
      VALUES(
        ?,?,?,?,?,?,?,'Active'
      )
    `)
      .bind(
        affiliate.id,
        email,
        clean(
          order.customer_name || "",
          160
        ),
        order.id,
        clean(
          order.order_reference || "",
          100
        ),
        now.toISOString(),
        expires.toISOString()
      )
      .run();

    return {
      created:true,
      affiliate_id:
        Number(affiliate.id)
    };
  }

  const expiry=
    new Date(
      existing.expires_at || 0
    );

  if(
    existing.status!=="Active" ||
    Number.isNaN(expiry.getTime()) ||
    expiry.getTime()<=now.getTime()
  ){

    await db.prepare(`
      UPDATE affiliate_customer_attributions
      SET
        affiliate_id=?,
        customer_name=?,
        first_order_id=?,
        first_order_reference=?,
        started_at=?,
        expires_at=?,
        status='Active',
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `)
      .bind(
        affiliate.id,
        clean(
          order.customer_name || "",
          160
        ),
        order.id,
        clean(
          order.order_reference || "",
          100
        ),
        now.toISOString(),
        expires.toISOString(),
        existing.id
      )
      .run();

    return {
      created:true,
      reassigned:true,
      affiliate_id:
        Number(affiliate.id)
    };
  }

  return {
    created:false,
    existing:true,
    affiliate_id:
      Number(existing.affiliate_id),
    expires_at:
      existing.expires_at
  };
}


export async function ensureFullyPaidBankTransferAffiliate(
  db,
  orderId
){
  const result={
    created:0,
    existing:0,
    total_commission:0,
    items:[],
    warning:"",
    customer_attribution:null
  };

  try{

    const order=
      await db.prepare(`
        SELECT
          id,
          order_reference,
          customer_name,
          customer_email,
          currency,
          total,
          affiliate_code,
          payment_status
        FROM orders
        WHERE id=?
        LIMIT 1
      `)
        .bind(orderId)
        .first();

    if(!order){
      result.warning=
        "Order not found.";

      return result;
    }

    if(order.payment_status!=="Paid"){
      result.warning=
        "Affiliate commission requires a fully paid order.";

      return result;
    }

    const code=
      clean(
        order.affiliate_code || "",
        100
      );

    if(!code){
      return result;
    }

    const paid=
      await db.prepare(`
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN status='Paid'
                 AND verification_status='Verified'
                THEN
                  CASE
                    WHEN COALESCE(gross_amount,0)>0
                    THEN gross_amount
                    ELSE amount
                  END
                ELSE 0
              END
            ),
            0
          ) AS verified_paid
        FROM payments
        WHERE order_id=?
      `)
        .bind(order.id)
        .first();

    const gross=
      money(order.total);

    const verifiedPaid=
      money(
        paid?.verified_paid || 0
      );

    if(
      verifiedPaid + 0.01 <
      gross
    ){
      result.warning=
        "Affiliate commission requires cumulative verified payment to cover the order total.";

      return result;
    }

    const affiliate=
      await db.prepare(`
        SELECT
          id,
          affiliate_code,
          full_name,
          status,
          membership_expires_at
        FROM affiliates
        WHERE upper(affiliate_code)=upper(?)
        LIMIT 1
      `)
        .bind(code)
        .first();

    if(
      !affiliate?.id ||
      affiliate.status!=="Approved"
    ){
      result.warning=
        "Affiliate is not approved.";

      return result;
    }

    if(affiliate.membership_expires_at){

      const expiry=
        new Date(
          affiliate.membership_expires_at
        );

      if(
        !Number.isNaN(
          expiry.getTime()
        ) &&
        expiry.getTime()<Date.now()
      ){
        result.warning=
          "Affiliate membership has expired; commission was not created.";

        return result;
      }
    }

    const products=
      await db.prepare(`
        SELECT DISTINCT
          p.id AS product_id,
          p.sku,
          p.name_en,
          p.affiliate_enabled,
          p.commission_type,
          p.commission_value
        FROM order_items oi
        JOIN products p
          ON p.id=oi.product_id
        WHERE
          oi.order_id=?
          AND COALESCE(
            p.affiliate_enabled,
            0
          )=1
        ORDER BY p.id
      `)
        .bind(order.id)
        .all();

    const eligible=
      products.results || [];

    if(!eligible.length){
      result.warning=
        "No affiliate-enabled product was found on this order.";

      return result;
    }

    /*
     * Preserve the established QY single-product
     * commission-anchor behavior.
     */
    const product=
      eligible[0];

    const existing=
      await db.prepare(`
        SELECT
          id,
          commission_rate,
          commission_amount,
          gross_sale,
          status
        FROM affiliate_commissions
        WHERE
          affiliate_id=?
          AND order_id=?
          AND product_id=?
        LIMIT 1
      `)
        .bind(
          affiliate.id,
          order.id,
          product.product_id
        )
        .first();

    if(existing){

      result.existing=1;

      result.total_commission=
        money(
          existing.commission_amount
        );

      result.items.push(
        existing
      );

      result.customer_attribution=
        await ensureCustomerAttribution(
          db,
          order,
          affiliate
        );

      return result;
    }

    const type=
      clean(
        product.commission_type ||
        "percentage",
        30
      ).toLowerCase();

    const value=
      Math.max(
        0,
        Number(
          product.commission_value || 0
        )
      );

    let rate=0;
    let commission=0;

    if(type==="fixed"){

      commission=
        money(value);

      rate=
        gross>0
          ? commission/gross*100
          : 0;
    }
    else {

      rate=
        Math.min(
          value,
          100
        );

      commission=
        money(
          gross*rate/100
        );
    }

    if(commission<=0){

      result.warning=
        `Affiliate product ${product.sku || product.product_id} has no positive commission configured.`;

      return result;
    }

    const inserted=
      await db.prepare(`
        INSERT INTO affiliate_commissions(
          affiliate_id,
          order_id,
          product_id,
          order_reference,
          customer_name,
          product_name,
          gross_sale,
          currency,
          commission_rate,
          commission_amount,
          status,
          created_at,
          updated_at
        )
        VALUES(
          ?,?,?,?,?,?,?,?,?,?,
          'Approved',
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `)
        .bind(
          affiliate.id,
          order.id,
          product.product_id,
          order.order_reference,
          order.customer_name,
          product.name_en ||
            product.sku ||
            "Quantum YiJing Product",
          gross,
          order.currency || "MYR",
          rate,
          commission
        )
        .run();

    result.created=1;

    result.total_commission=
      commission;

    result.items.push({
      id:
        Number(
          inserted.meta?.last_row_id ||
          0
        ),

      affiliate_code:
        affiliate.affiliate_code,

      product_id:
        product.product_id,

      sku:
        product.sku,

      product_name:
        product.name_en,

      gross_sale:
        gross,

      commission_rate:
        rate,

      commission_amount:
        commission,

      status:
        "Approved"
    });

    result.customer_attribution=
      await ensureCustomerAttribution(
        db,
        order,
        affiliate
      );

    return result;

  }
  catch(error){

    result.warning=
      clean(
        error?.message ||
        "Bank-transfer affiliate processing failed.",
        1000
      );

    console.error(
      "BANK TRANSFER AFFILIATE POST-HOOK FAILED",
      result.warning
    );

    return result;
  }
}