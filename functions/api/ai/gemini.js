/**
 * Quantum YiJing AI
 * Gemini provider adapter
 *
 * v3.7.0
 *
 * This module contains Gemini-specific API logic only.
 * API keys are supplied through Cloudflare environment secrets.
 */

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export async function generateGeminiResponse({
  apiKey,
  model,
  systemInstruction = "",
  messages = [],
  temperature = 0.3,
  maxOutputTokens = 800
}) {
  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  if (!model) {
    throw new Error("Gemini model is not configured.");
  }

  const contents = messages
    .filter((message) => message && typeof message.content === "string")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [
        {
          text: message.content.trim()
        }
      ]
    }))
    .filter((message) => message.parts[0].text);

  if (!contents.length) {
    throw new Error("No valid messages were supplied to Gemini.");
  }

  const body = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens
    }
  };

  if (systemInstruction.trim()) {
    body.systemInstruction = {
      parts: [
        {
          text: systemInstruction.trim()
        }
      ]
    };
  }

  const endpoint =
    `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify(body)
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(`Gemini returned HTTP ${response.status}.`);
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Gemini returned HTTP ${response.status}.`;

    throw new Error(message);
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("")
      .trim() || "";

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return {
    text,
    model,
    usage: {
      promptTokens: data?.usageMetadata?.promptTokenCount ?? null,
      outputTokens: data?.usageMetadata?.candidatesTokenCount ?? null,
      totalTokens: data?.usageMetadata?.totalTokenCount ?? null
    }
  };
}