import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

// Two routes to the same models. With an Anthropic key (user-supplied or
// server-side) we call Anthropic directly with bare model ids; without one we
// go through the Vercel AI Gateway, which takes "provider/model" strings and
// authenticates via OIDC on Vercel deployments (locally: AI_GATEWAY_API_KEY).
//
// Each list is tried in order: the gateway's free tier rate-limits frontier
// models, so we fall back to a lighter one before giving up and going
// heuristic. The direct route keeps the same ladder — a user's key can still
// hit rate limits or an overload, and the demo should never hard-fail.
const GATEWAY_MODELS = [
  ...new Set([
    process.env.AI_MODEL ?? "anthropic/claude-opus-4-8",
    "anthropic/claude-haiku-4.5",
    "anthropic/claude-haiku-4-5",
  ]),
];
const DIRECT_MODELS = [
  ...new Set([
    process.env.AI_MODEL_DIRECT ?? "claude-opus-4-8",
    "claude-haiku-4-5",
  ]),
];

/** Deployment-wide key, if configured. A user-supplied key takes precedence. */
const SERVER_KEY = process.env.ANTHROPIC_API_KEY;

/**
 * Anthropic keys must never reach logs. Error messages from the provider can
 * echo request details, so scrub anything key-shaped before printing.
 */
function redact(s: string): string {
  return s.replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-***");
}

/** `apiKey` is the caller's own key for this request, if they supplied one. */
export function aiConfigured(apiKey?: string): boolean {
  return Boolean(
    apiKey ||
      SERVER_KEY ||
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
  /** Caller's Anthropic key — request-scoped, never stored server-side. */
  apiKey?: string;
}): Promise<T> {
  // A key (user-supplied or server-side) routes direct to Anthropic; otherwise
  // fall through to the gateway. Either way we walk that route's model ladder.
  const key = opts.apiKey || SERVER_KEY;
  const direct = key ? createAnthropic({ apiKey: key }) : null;

  let lastErr: unknown;
  for (const id of direct ? DIRECT_MODELS : GATEWAY_MODELS) {
    try {
      const { text } = await generateText({
        model: direct ? direct(id) : id,
        system:
          opts.system +
          "\n\nRespond with a single valid JSON object and nothing else — no markdown fences, no commentary.",
        prompt: opts.prompt,
        maxOutputTokens: opts.maxOutputTokens ?? 2500,
      });
      return extractJSON<T>(text);
    } catch (err) {
      // Surface the cause in server logs, then try the next model; callers
      // swallow the final error to fall back to heuristic mode. Redacted
      // because provider errors can echo the key into the logs.
      lastErr = err;
      console.error(
        `[periscope:ai] ${id}:`,
        redact(err instanceof Error ? err.message : String(err)),
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
