export async function onRequestGet(context) {
  const url = new URL(context.request.url);

  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = context.env.WHATSAPP_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error("WHATSAPP_VERIFY_TOKEN is not configured.");
    return new Response("Server configuration error", { status: 500 });
  }

  if (mode === "subscribe" && token === verifyToken) {
    console.log("WhatsApp webhook verified.");

    return new Response(challenge || "", {
      status: 200,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function onRequestPost(context) {
  let payload;

  try {
    payload = await context.request.json();
  } catch (error) {
    console.error("Invalid WhatsApp webhook JSON.", error);

    return new Response("Bad Request", {
      status: 400
    });
  }

  console.log(
    "WhatsApp webhook received:",
    JSON.stringify(payload)
  );

  return new Response("EVENT_RECEIVED", {
    status: 200,
    headers: {
      "Content-Type": "text/plain"
    }
  });
}