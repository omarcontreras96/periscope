import { askJSON } from "@/lib/ai";
import type { FeedbackEvent, Interest, UserProfile } from "@/lib/types";

/**
 * Evaluator agent: turns raw feedback events into an updated preference
 * profile — adjusting interest weights, learning new interests and avoids,
 * and rewriting the search hints the other agents use next run.
 */
export async function runEvaluator(
  profile: UserProfile,
  feedback: FeedbackEvent[],
): Promise<{ profile: UserProfile; learned: string[]; degraded: boolean }> {
  try {
    const result = await evaluateWithLLM(profile, feedback);
    return { ...result, degraded: false };
  } catch {
    const result = evaluateHeuristically(profile, feedback);
    return { ...result, degraded: true };
  }
}

async function evaluateWithLLM(
  profile: UserProfile,
  feedback: FeedbackEvent[],
): Promise<{ profile: UserProfile; learned: string[] }> {
  const events = feedback
    .map((f) => `- [${f.action}] "${f.title}" (topic: ${f.topic}, source: ${f.source})`)
    .join("\n");

  const result = await askJSON<{ profile: UserProfile; learned: string[] }>({
    system:
      "You are the evaluator agent of a self-improving newsfeed. You study the user's feedback and rewrite their preference profile so future searches serve them better.",
    prompt: `Current profile:
${JSON.stringify(profile, null, 2)}

New feedback events (most recent last):
${events}

Rewrite the profile. Rules:
- "like"/"more"/"click" strengthen; "dislike"/"less" weaken. Look past the topic label at what the *titles* have in common — the signal is often an angle (e.g. "dislikes funding-round news") rather than a whole topic.
- interests: adjust weights (0-1, two decimals). Add new interests you can infer from liked titles (start ~0.5). Drop interests that fell below ~0.15, moving them to "avoid" only if actively disliked. Keep at most 8.
- avoid: topics or angles to exclude. Keep at most 6, most recent signals win.
- notes: durable preference observations in third person ("prefers technical depth over business coverage"). Keep at most 5.
- searchHints: concrete advice for crafting future search queries based on what worked ("add 'research' or 'benchmark' to AI queries, skip 'raises'"). Keep at most 4.
- version: increment by 1.
- learned: 2-4 short first-person-plural bullets for the user explaining what changed and why ("Noticed you skipped both funding stories — dialing back business news.").

Return JSON: {"profile": {...full updated profile...}, "learned": ["...", "..."]}`,
  });
  return {
    profile: sanitizeProfile(result.profile, profile),
    learned: Array.isArray(result.learned) ? result.learned.slice(0, 4) : [],
  };
}

function evaluateHeuristically(
  profile: UserProfile,
  feedback: FeedbackEvent[],
): { profile: UserProfile; learned: string[] } {
  const interests = new Map(
    profile.interests.map((i) => [i.topic.toLowerCase(), { ...i }]),
  );
  const avoid = new Set(profile.avoid);
  const learned: string[] = [];

  for (const f of feedback) {
    const key = f.topic.toLowerCase();
    const existing = interests.get(key);
    if (f.action === "like" || f.action === "more" || f.action === "click") {
      if (existing) existing.weight = Math.min(1, existing.weight + 0.12);
      else interests.set(key, { topic: f.topic, weight: 0.55 });
    } else {
      if (existing) {
        existing.weight = Math.max(0, existing.weight - 0.18);
        if (existing.weight < 0.15) {
          interests.delete(key);
          avoid.add(f.topic);
          learned.push(`Dropped "${f.topic}" — repeated negative feedback.`);
        }
      }
    }
  }

  const ups = feedback.filter((f) => f.action !== "dislike" && f.action !== "less");
  const downs = feedback.filter((f) => f.action === "dislike" || f.action === "less");
  if (ups.length) {
    learned.push(
      `Boosted ${[...new Set(ups.map((f) => f.topic))].join(", ")} based on your positive signals.`,
    );
  }
  if (downs.length) {
    learned.push(
      `Dialed back ${[...new Set(downs.map((f) => f.topic))].join(", ")}.`,
    );
  }

  return {
    profile: {
      ...profile,
      interests: [...interests.values()],
      avoid: [...avoid].slice(-6),
      version: profile.version + 1,
    },
    learned,
  };
}

/** Guard against malformed LLM output so a bad update can't corrupt the profile. */
function sanitizeProfile(next: UserProfile, prev: UserProfile): UserProfile {
  const clamp = (n: number) => Math.max(0, Math.min(1, Number(n) || 0));
  const interests: Interest[] = Array.isArray(next.interests)
    ? next.interests
        .filter((i) => i && typeof i.topic === "string" && i.topic.trim())
        .map((i) => ({ topic: i.topic.trim(), weight: Math.round(clamp(i.weight) * 100) / 100 }))
        .slice(0, 8)
    : prev.interests;
  const strList = (v: unknown, max: number, fallback: string[]) =>
    Array.isArray(v)
      ? v.filter((s) => typeof s === "string" && s.trim()).slice(0, max)
      : fallback;
  return {
    interests: interests.length > 0 ? interests : prev.interests,
    avoid: strList(next.avoid, 6, prev.avoid),
    notes: strList(next.notes, 5, prev.notes),
    searchHints: strList(next.searchHints, 4, prev.searchHints),
    version: prev.version + 1,
  };
}
