import { runSelfTest } from "@/lib/agents/prober";
import type { SelfTestEvent, UserProfile } from "@/lib/types";

export const maxDuration = 180;

/**
 * Runs the prober's self-test cycle against the live removal stage and streams
 * newline-delimited JSON (SelfTestEvent per line), ending with a "done" event
 * carrying every receipt.
 */
export async function POST(req: Request) {
  const { profile, count } = (await req.json()) as {
    profile: UserProfile;
    count?: number;
  };
  // Header, not body — see the note in app/api/feed/route.ts.
  const apiKey = req.headers.get("x-anthropic-key")?.trim() || undefined;

  if (!profile) {
    return Response.json({ error: "profile required" }, { status: 400 });
  }
  profile.muted = profile.muted ?? [];
  profile.hypotheses = profile.hypotheses ?? [];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: SelfTestEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runSelfTest(profile, emit, { count, apiKey });
      } catch (err) {
        emit({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
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
