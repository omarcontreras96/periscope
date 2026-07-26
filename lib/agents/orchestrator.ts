import { askJSON } from "@/lib/ai";
import { runSearchAgent } from "@/lib/agents/search";
import type {
  AgentEvent,
  Article,
  RunContext,
  SearchPlanItem,
  UserProfile,
} from "@/lib/types";

const MAX_TOPICS = 4;
const FEED_SIZE = 28;

/**
 * Orchestrator: reads the user's profile, plans which topics to search
 * (exploitation of known interests + one exploration pick), fans out the
 * search agents in parallel, then merges and dedupes their results.
 */
export async function runOrchestrator(
  profile: UserProfile,
  ctx: RunContext,
  emit: (e: AgentEvent) => void,
  exclude?: Set<string>,
): Promise<Article[]> {
  emit({
    type: "status",
    agent: "orchestrator",
    message: `Reading preference profile v${profile.version} (${profile.interests.length} interests, ${profile.avoid.length} avoids)…`,
  });

  let plan: SearchPlanItem[];
  try {
    plan = await planWithLLM(profile);
  } catch {
    ctx.aiOk = false;
    plan = planHeuristically(profile);
  }
  plan = plan.slice(0, MAX_TOPICS);
  emit({ type: "plan", queries: plan });
  emit({
    type: "status",
    agent: "orchestrator",
    message: `Dispatching ${plan.length} search agents in parallel…`,
  });

  const results = await Promise.all(
    plan.map((p) =>
      runSearchAgent(p, profile, ctx, emit, exclude).catch(() => []),
    ),
  );

  const merged = mergeResults(results);
  emit({
    type: "status",
    agent: "orchestrator",
    message: `Merged and deduped ${merged.length} articles across ${plan.length} topics.`,
  });
  return merged;
}

async function planWithLLM(profile: UserProfile): Promise<SearchPlanItem[]> {
  const result = await askJSON<{ queries: SearchPlanItem[] }>({
    system:
      "You are the orchestrator of a personalized newsfeed. You decide what to search for this user right now.",
    prompt: `User profile:
${JSON.stringify(profile, null, 2)}

Produce a search plan of exactly ${MAX_TOPICS} items. Rules:
- Weight coverage toward the highest-weight interests, but don't search the same interest twice.
- Exactly one item should be an EXPLORATION pick: something adjacent to their interests they haven't asked for, to discover new preferences. Mark it "exploration": true.
- Hypotheses in the profile: treat "confirmed" as established preferences and "rejected" as disproven (assume the opposite). A rejected hypothesis carrying "userReply" is the user's own correction — treat it as authoritative and plan accordingly. If there is an "open" hypothesis, you may shape ONE query to help test it — say so in that item's rationale.
- Apply the searchHints when crafting query strings. Queries should be concrete news-search strings (3-8 words), not vague topics.
- Never plan anything on the avoid list, and never craft queries around muted phrases (those are hard-blocked).
- "topic" is a short human label (1-3 words); "rationale" is one sentence on why this search, for this user, now.

Return JSON: {"queries": [{"topic": "...", "query": "...", "rationale": "...", "exploration": false}]}`,
  });
  if (!Array.isArray(result.queries) || result.queries.length === 0) {
    throw new Error("bad plan");
  }
  return result.queries;
}

function planHeuristically(profile: UserProfile): SearchPlanItem[] {
  const sorted = [...profile.interests].sort((a, b) => b.weight - a.weight);
  return sorted.slice(0, MAX_TOPICS).map((it) => ({
    topic: it.topic,
    query: `${it.topic} latest news`,
    rationale: `High-weight interest (${it.weight.toFixed(2)}).`,
  }));
}

/** Round-robin across topics by score so one topic can't flood the feed. */
function mergeResults(results: Article[][]): Article[] {
  const queues = results
    .map((r) => [...r].sort((a, b) => b.score - a.score))
    .filter((r) => r.length > 0);
  const out: Article[] = [];
  const seen = new Set<string>();
  while (out.length < FEED_SIZE && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const a = q.shift();
      if (!a) continue;
      const key = a.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
      if (seen.has(key) || seen.has(a.id)) continue;
      seen.add(key);
      seen.add(a.id);
      out.push(a);
      if (out.length >= FEED_SIZE) break;
    }
  }
  return out;
}
