import { generateText } from "ai";

// Model routed through the Vercel AI Gateway ("provider/model" string).
// On Vercel deployments the gateway authenticates automatically via OIDC —
// no API key needed. Locally, set AI_GATEWAY_API_KEY (see .env.example).
const MODEL = process.env.AI_MODEL ?? "anthropic/claude-opus-4-8";

export function aiConfigured(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY ||
      process.env.VERCEL_OIDC_TOKEN ||
      process.env.VERCEL,
  );
}

/**
 * Ask the model a question that must be answered with a single JSON object.
 * Throws on any failure — callers are expected to catch and fall back to
 * their heuristic path (degraded mode).
 */
export async function askJSON<T>(opts: {
  system: string;
  prompt: string;
  maxOutputTokens?: number;
}): Promise<T> {
  const { text } = await generateText({
    model: MODEL,
    system:
      opts.system +
      "\n\nRespond with a single valid JSON object and nothing else — no markdown fences, no commentary.",
    prompt: opts.prompt,
    maxOutputTokens: opts.maxOutputTokens ?? 2500,
  });
  return extractJSON<T>(text);
}

export function extractJSON<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/m, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Model output contained no JSON object");
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}
