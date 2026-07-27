import { generateText } from "ai";

// Models routed through the Vercel AI Gateway ("provider/model" strings).
// On Vercel deployments the gateway authenticates automatically via OIDC —
// no API key needed. Locally, set AI_GATEWAY_API_KEY (see .env.example).
// Tried in order: the gateway's free tier rate-limits frontier models, so we
// fall back to a lighter model before giving up and going heuristic.
const MODELS = [
  ...new Set([
    process.env.AI_MODEL ?? "anthropic/claude-opus-4-8",
    "anthropic/claude-haiku-4.5",
    "anthropic/claude-haiku-4-5",
  ]),
];

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
  let lastErr: unknown;
  for (const model of MODELS) {
    try {
      const { text } = await generateText({
        model,
        system:
          opts.system +
          "\n\nRespond with a single valid JSON object and nothing else — no markdown fences, no commentary.",
        prompt: opts.prompt,
        maxOutputTokens: opts.maxOutputTokens ?? 2500,
      });
      return extractJSON<T>(text);
    } catch (err) {
      // Surface the cause in server logs, then try the next model; callers
      // swallow the final error to fall back to heuristic mode.
      lastErr = err;
      console.error(
        `[periscope:ai] ${model}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  throw lastErr;
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
