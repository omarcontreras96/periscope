import { aiConfigured } from "@/lib/ai";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import type { AgentEvent, RunContext, UserProfile } from "@/lib/types";

export const maxDuration = 180;

/**
 * Runs the orchestrator → search-agents pipeline and streams progress as
 * newline-delimited JSON (AgentEvent per line), ending with a "feed" event.
 */
export async function POST(req: Request) {
  const { profile, exclude } = (await req.json()) as {
    profile: UserProfile;
    /** Article ids / title keys the client already shows ("load more" pages). */
    exclude?: string[];
  };
  // Read via header, not the body: keeps the key out of request-body logging
  // and out of the profile object that gets serialized into prompts.
  const apiKey = req.headers.get("x-anthropic-key")?.trim() || undefined;
  const excludeSet = new Set(Array.isArray(exclude) ? exclude : []);
  if (profile) {
    // Older clients may send profiles without newer fields.
    profile.muted = profile.muted ?? [];
    profile.hypotheses = profile.hypotheses ?? [];
  }
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      const ctx: RunContext = { aiOk: aiConfigured(apiKey), apiKey };
      try {
        const articles = await runOrchestrator(profile, ctx, emit, excludeSet);
        emit({ type: "feed", articles, degraded: !ctx.aiOk });
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
