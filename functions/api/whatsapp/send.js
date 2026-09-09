export async function onRequestPost(context) {
  const token = context.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = context.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "WhatsApp configuration missing"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  let body;

  try {
    body = await context.request.json();
  } catch {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Invalid JSON"
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const to = String(body.to || "").trim();
  const message = String(body.message || "").trim();

  if (!to || !message) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "to and message are required"
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const response = await fetch(
    `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
          preview_url: false,
          body: message
        }
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    console.error(
      "WhatsApp send failed:",
      JSON.stringify(result)
    );

    return new Response(
      JSON.stringify({
        ok: false,
        error: "WhatsApp API request failed",
        details: result
      }),
      {
        status: response.status,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  console.log(
    "WhatsApp message sent:",
    JSON.stringify(result)
  );

  return new Response(
    JSON.stringify({
      ok: true,
      result
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}