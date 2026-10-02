import {requireAffiliate} from '../auth/_auth.js';

function baseUrl(origin, product) {
  if (
    String(product.sku || '')
      .trim()
      .toUpperCase() === 'YJ12'
  ) {
    return `${origin}/funnel/yj12/`;
  }

  const path =
    String(product.affiliate_public_path || '')
      .trim();

  if (path) {
    return /^https?:\/\//i.test(path)
      ? path
      : origin + (path.startsWith('/') ? path : `/${path}`);
  }

  return `${origin}/lp/${encodeURIComponent(product.slug)}.html`;
}

function addAffiliate(url, code) {
  const target =
    new URL(url);

  target.searchParams.set(
    'aff',
    code
  );

  return target.toString();
}

function personalize(content, affiliateUrl) {
  return String(content || '')
    .split('{{AFFILIATE_LINK}}')
    .join(affiliateUrl);
}

export async function onRequestGet({request, env}) {

  const auth =
    await requireAffiliate(
      request,
      env
    );

  if (auth.error) {
    return auth.error;
  }

  const {
    db,
    affiliate
  } = auth;

  const origin =
    new URL(request.url).origin;

  try {

    const result =
      await db.prepare(`
        SELECT
          d.id,
          d.title,
          d.content,
          d.language,
          d.platform,
          d.output_length,
          d.approved_at,

          p.id AS product_id,
          p.sku,
          p.slug,
          p.name_en,
          p.name_zh,
          p.affiliate_public_path

        FROM ai_content_drafts d

        INNER JOIN products p
          ON d.source_reference =
             ('product:' || CAST(p.id AS TEXT))

        WHERE d.content_type = 'affiliate_asset'
          AND d.status = 'approved'
          AND d.source_type = 'product'

          AND lower(trim(p.status)) = 'active'
          AND p.affiliate_enabled = 1
          AND trim(
                COALESCE(
                  p.affiliate_public_path,
                  ''
                )
              ) <> ''

        ORDER BY
          d.approved_at DESC,
          d.id DESC

        LIMIT 100
      `).all();

    const assets =
      (result.results || [])
        .map(row => {

          const personalizedUrl =
            addAffiliate(
              baseUrl(
                origin,
                row
              ),
              affiliate.affiliate_code
            );

          return {
            id:
              row.id,

            title:
              row.title || '',

            content:
              row.content || '',

            language:
              row.language || '',

            platform:
              row.platform || '',

            output_length:
              row.output_length || '',

            source_product_id:
              row.product_id,

            product_name:
              row.name_en ||
              row.name_zh ||
              row.sku ||
              '',

            personalized_url:
              personalizedUrl,

            personalized_content:
              personalize(
                row.content,
                personalizedUrl
              ),

            approved_at:
              row.approved_at || ''
          };
        });

    return Response.json(
      {
        ok: true,
        affiliate_code:
          affiliate.affiliate_code,
        assets
      },
      {
        headers: {
          'cache-control':
            'no-store'
        }
      }
    );

  }
  catch (error) {

    console.error(
      'AFFILIATE PORTAL ASSETS ERROR',
      error
    );

    return Response.json(
      {
        ok: false,
        error:
          'Unable to load affiliate marketing assets.'
      },
      {
        status: 500,
        headers: {
          'cache-control':
            'no-store'
        }
      }
    );
  }
}