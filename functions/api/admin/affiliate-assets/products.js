function json(data, status = 200) {
  return Response.json(
    data,
    {
      status,
      headers: {
        'cache-control': 'no-store'
      }
    }
  );
}

function authorized(request, env) {
  const expected =
    String(env.ADMIN_TOKEN || '');

  const header =
    request.headers.get('authorization') || '';

  if (!expected) return false;

  return header === `Bearer ${expected}`;
}

export async function onRequestGet(context) {
  const {
    request,
    env
  } = context;

  if (!authorized(request, env)) {
    return json(
      {
        ok: false,
        error: 'Unauthorized'
      },
      401
    );
  }

  const db =
    env.ENQUIRIES_DB;

  if (!db) {
    return json(
      {
        ok: false,
        error: 'Database unavailable'
      },
      503
    );
  }

  try {

    const result =
      await db.prepare(`
        SELECT
          id,
          sku,
          slug,
          product_type,
          name_en,
          name_zh,
          status,
          price,
          currency,
          affiliate_public_path
        FROM products
        WHERE
          COALESCE(affiliate_enabled, 0) = 1
          AND lower(trim(COALESCE(status, ''))) = 'active'
          AND trim(COALESCE(affiliate_public_path, '')) <> ''
        ORDER BY
          product_type,
          name_en,
          id
      `).all();

    return json({
      ok: true,
      products:
        result.results || []
    });

  }
  catch (error) {

    console.error(
      'affiliate asset products',
      error
    );

    return json(
      {
        ok: false,
        error: 'Unable to load affiliate-enabled products'
      },
      500
    );
  }
}