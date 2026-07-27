import { runEvaluator } from "@/lib/agents/evaluator";
import type { FeedbackEvent, UserProfile } from "@/lib/types";

export const maxDuration = 60;

/**
 * Runs the evaluator agent: feedback events + current profile in,
 * updated profile + human-readable "what I learned" out.
 */
export async function POST(req: Request) {
  const { profile, feedback } = (await req.json()) as {
    profile: UserProfile;
    feedback: FeedbackEvent[];
  };

  if (!profile || !Array.isArray(feedback) || feedback.length === 0) {
    return Response.json(
      { error: "profile and non-empty feedback[] required" },
      { status: 400 },
    );
  }
  // Older clients may send profiles without newer fields.
  profile.muted = profile.muted ?? [];
  profile.hypotheses = profile.hypotheses ?? [];

  // Header, not body — see the note in app/api/feed/route.ts.
  const apiKey = req.headers.get("x-anthropic-key")?.trim() || undefined;
  const result = await runEvaluator(profile, feedback, apiKey);
  return Response.json(result);
}
