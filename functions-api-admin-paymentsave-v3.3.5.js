// v3.3.5 PAYMENT & ACCOUNTING CLEANUP
//
// 1) Update the validation sets near the top of functions/api/admin.js:
//
// const paymentMethods = new Set(['DOKU','Bank Transfer','External Platform','Cash','Manual','Other']);
// const paymentStatuses = new Set(['Pending','Paid','External','Failed','Cancelled','Refunded']);
// const verificationStatuses = new Set(['Unverified','Verified','Review']);
// const settlementStatuses = new Set(['Pending','Settled','Reconciled','Exception']);
//
// 2) Replace the existing savePayment(context) with this function:

async function savePayment(context) {
  let body;
  try { body = await context.request.json(); }
  catch { return json({error:'Invalid request.'},400); }

  const orderId = Number(body.orderId);
  const method = clean(body.paymentMethod,60);
  const provider = clean(body.provider,80) || method;
  const tx = clean(body.transactionReference,200);
  const status = clean(body.status,30) || 'Pending';
  const currency = clean(body.currency,10) || 'MYR';
  const settlementDate = clean(body.settlementDate,20);
  const verification = clean(body.verificationStatus,30) || 'Unverified';
  const settlementStatus = clean(body.settlementStatus,30) || 'Pending';
  const issuer = clean(body.customerReceiptIssuer,100) || 'Quantum YiJing';
  const notes = clean(body.notes,1000);

  const gross = Number(body.grossAmount || 0);
  const fee = body.providerFee === '' || body.providerFee == null ? 0 : Number(body.providerFee);
  const net = body.netAmount === '' || body.netAmount == null ? gross - fee : Number(body.netAmount);
  const bank = body.bankReceivedAmount === '' || body.bankReceivedAmount == null
    ? null
    : Number(body.bankReceivedAmount);

  if (!Number.isInteger(orderId) || orderId < 1)
    return json({error:'Select a valid order.'},400);

  if (!paymentMethods.has(method))
    return json({error:'Invalid payment method.'},400);

  if (!paymentStatuses.has(status))
    return json({error:'Invalid payment status.'},400);

  if (!verificationStatuses.has(verification))
    return json({error:'Invalid verification status.'},400);

  if (!settlementStatuses.has(settlementStatus))
    return json({error:'Invalid settlement status.'},400);

  if ([gross,fee,net].some(v => !Number.isFinite(v) || v < 0) ||
      (bank !== null && (!Number.isFinite(bank) || bank < 0)))
    return json({error:'Payment amounts must be valid non-negative numbers.'},400);

  const db = context.env.ENQUIRIES_DB;

  const order = await db.prepare(
    `SELECT id,total,currency,payment_status FROM orders WHERE id=?`
  ).bind(orderId).first();

  if (!order) return json({error:'Order not found.'},404);

  // Keep order currency authoritative.
  const recordCurrency = clean(order.currency,10) || currency || 'MYR';

  const paidAt = (status === 'Paid' || status === 'External')
    ? new Date().toISOString()
    : '';

  const verifiedAt = verification === 'Verified'
    ? new Date().toISOString()
    : '';

  const reconciledAt = settlementStatus === 'Reconciled'
    ? new Date().toISOString()
    : '';

  const insert = await db.prepare(`INSERT INTO payments(
    order_id,provider,provider_transaction_id,amount,currency,status,raw_reference,paid_at,
    payment_method,gross_amount,provider_fee,net_amount,settlement_date,bank_received_amount,
    verification_status,verified_at,customer_receipt_issuer,notes,
    settlement_status,reconciled_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    orderId,provider,tx,gross,recordCurrency,status,tx,paidAt,
    method,gross,fee,net,settlementDate || null,bank,
    verification,verifiedAt,issuer,notes,
    settlementStatus,reconciledAt
  ).run();

  const orderStatus = status === 'External' ? 'External' : (status === 'Paid' ? 'Paid' : status);

  await db.prepare(`
    UPDATE orders
    SET payment_provider=?, payment_status=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(provider,orderStatus,orderId).run();

  return json({
    ok:true,
    id:insert.meta?.last_row_id,
    netAmount:net,
    bankReceivedAmount:bank,
    settlementStatus
  });
}
