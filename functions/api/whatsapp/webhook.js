function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

async function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const receivedSignature = signatureHeader.slice(7);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody)
  );

  const expectedSignature = toHex(signature);

  return safeEqual(receivedSignature, expectedSignature);
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);

  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = context.env.WHATSAPP_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error("WHATSAPP_VERIFY_TOKEN is not configured.");

    return new Response("Server configuration error", {
      status: 500
    });
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

  return new Response("Forbidden", {
    status: 403
  });
}

export async function onRequestPost(context) {
  const appSecret = context.env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    console.error("WHATSAPP_APP_SECRET is not configured.");

    return new Response("Server configuration error", {
      status: 500
    });
  }

  const rawBody = await context.request.text();

  const signatureHeader =
    context.request.headers.get("x-hub-signature-256") || "";

  const validSignature = await verifyMetaSignature(
    rawBody,
    signatureHeader,
    appSecret
  );

  if (!validSignature) {
    console.warn("Rejected WhatsApp webhook with invalid signature.");

    return new Response("Forbidden", {
      status: 403
    });
  }

  let payload;

  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    console.error("Invalid WhatsApp webhook JSON.", error);

    return new Response("Bad Request", {
      status: 400
    });
  }

  console.log(
    "Verified WhatsApp webhook received:",
    JSON.stringify(payload)
  );

  return new Response("EVENT_RECEIVED", {
    status: 200,
    headers: {
      "Content-Type": "text/plain"
    }
  });
}