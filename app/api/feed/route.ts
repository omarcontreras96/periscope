import { aiConfigured } from "@/lib/ai";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import type { AgentEvent, RunContext, UserProfile } from "@/lib/types";

export const maxDuration = 180;

/**
 * Runs the orchestrator → search-agents pipeline and streams progress as
 * newline-delimited JSON (AgentEvent per line), ending with a "feed" event.
 */
export async function POST(req: Request) {
  const { profile } = (await req.json()) as { profile: UserProfile };
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      const ctx: RunContext = { aiOk: aiConfigured() };
      try {
        const articles = await runOrchestrator(profile, ctx, emit);
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
