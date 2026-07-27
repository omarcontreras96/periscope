import { aiConfigured, askJSON } from "@/lib/ai";

export const maxDuration = 60;

/** Diagnostic: verifies the AI Gateway path works from this deployment. */
export async function GET() {
  try {
    const result = await askJSON<{ ok: boolean }>({
      system: "You are a health check.",
      prompt: 'Return exactly {"ok": true}',
      maxOutputTokens: 100,
    });
    return Response.json({
      ok: result.ok === true,
      modelChain: [
        process.env.AI_MODEL ?? "anthropic/claude-opus-4-8",
        "anthropic/claude-haiku-4.5 (free-tier fallback)",
      ],
      aiConfigured: aiConfigured(),
    });
  } catch (err) {
    return Response.json({
      ok: false,
      aiConfigured: aiConfigured(),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
