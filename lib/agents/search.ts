import { askJSON } from "@/lib/ai";
import {
  articleId,
  dedupeRaw,
  fetchBingNews,
  fetchGoogleNews,
  fetchHackerNews,
  interleave,
  isPaywalled,
  type RawArticle,
} from "@/lib/sources";
import { dedupeCI, heuristicKeywords, matchesPhrase } from "@/lib/text";
import type {
  AgentEvent,
  Article,
  RunContext,
  SearchPlanItem,
  UserProfile,
} from "@/lib/types";

const PICKS_PER_TOPIC = 8;

type Pick = { i: number; score: number; reason: string; keywords?: string[] };

/**
 * Search agent: one instance per planned topic. Pulls candidates from the
 * news sources, then uses the LLM to rank them against the user's profile.
 * Falls back to a recency/keyword heuristic when the LLM is unavailable.
 */
export async function runSearchAgent(
  plan: SearchPlanItem,
  profile: UserProfile,
  ctx: RunContext,
  emit: (e: AgentEvent) => void,
  exclude?: Set<string>,
): Promise<Article[]> {
  const agent = `search:${plan.topic}`;
  emit({ type: "status", agent, message: `Searching for “${plan.query}”…` });

  const [gn, bg, hn] = await Promise.all([
    fetchGoogleNews(plan.query, 14),
    fetchBingNews(plan.query, 12),
    fetchHackerNews(plan.query, 6),
  ]);
  // Interleave before slicing so no aggregator drowns out the others, then
  // hard-filter paywalled outlets and muted phrases before ranking.
  const raw = dedupeRaw(interleave([gn, bg, hn]), exclude)
    .filter((a) => !isPaywalled(a))
    .filter((a) => !profile.muted.some((m) => matchesPhrase(a.title, m)))
    .slice(0, 30);
  emit({ type: "articles", topic: plan.topic, count: raw.length });
  if (raw.length === 0) return [];

  emit({
    type: "status",
    agent,
    message: `Ranking ${raw.length} candidates against your profile…`,
  });

  let picks: Pick[];
  try {
    picks = await rankWithLLM(plan, profile, raw);
  } catch {
    ctx.aiOk = false;
    picks = rankHeuristically(plan, profile, raw);
  }

  return picks
    .filter((p) => raw[p.i])
    .slice(0, PICKS_PER_TOPIC)
    .map((p) => ({
      id: articleId(raw[p.i].url),
      title: raw[p.i].title,
      url: raw[p.i].url,
      source: raw[p.i].source,
      publishedAt: raw[p.i].publishedAt,
      topic: plan.topic,
      score: Math.max(0, Math.min(100, Math.round(p.score))),
      reason: p.reason,
      keywords:
        Array.isArray(p.keywords) && p.keywords.length > 0
          ? dedupeCI(
              p.keywords.filter(
                (k) =>
                  typeof k === "string" &&
                  k.trim() &&
                  k.trim().length <= 32 &&
                  k.trim().split(/\s+/).length <= 4,
              ),
            ).slice(0, 4)
          : heuristicKeywords(raw[p.i].title),
    }));
}

async function rankWithLLM(
  plan: SearchPlanItem,
  profile: UserProfile,
  raw: RawArticle[],
): Promise<Pick[]> {
  const candidates = raw
    .map(
      (a, i) =>
        `${i}. "${a.title}" — ${a.source}, ${hoursAgo(a.publishedAt)}h ago`,
    )
    .join("\n");

  const result = await askJSON<{ picks: Pick[] }>({
    system: `You are the search agent for the topic "${plan.topic}" in a personalized newsfeed. Select the articles this specific user will most want to read.`,
    prompt: `User profile:
${JSON.stringify(profile, null, 2)}

Why this topic was searched: ${plan.rationale}

Candidate articles:
${candidates}

Pick the best ${PICKS_PER_TOPIC} articles for this user. Rules:
- Skip anything matching the "avoid" list or clearly duplicating another pick.
- Respect the preference notes and search hints. Profile hypotheses: "confirmed" ones are established preferences, "rejected" ones are disproven (assume the opposite), "open" ones are unverified — weigh them lightly.
- Prefer substantive, recent coverage over churnalism and press-release rewrites.
- "score" is 0-100 relevance for THIS user. "reason" is one short sentence, addressed to the user, explaining why it was picked (reference their preferences when relevant).
- "keywords" is 2-4 semantic concept tags per article: Proper-Cased named entities and multi-word concepts (e.g. "Real Madrid", "Yan Diomandé", "transfer market", "Fed rate cut"). A multi-word name is ONE keyword, never split. No generic words ("news", "update", "latest").

Return JSON: {"picks": [{"i": <candidate index>, "score": <0-100>, "reason": "<why>", "keywords": ["...", "..."]}]}`,
  });
  if (!Array.isArray(result.picks)) throw new Error("bad picks");
  return result.picks;
}

function rankHeuristically(
  plan: SearchPlanItem,
  profile: UserProfile,
  raw: RawArticle[],
): Pick[] {
  const keywords = profile.interests.flatMap((it) =>
    it.topic.toLowerCase().split(/\s+/),
  );
  return raw
    .map((a, i) => {
      const age = hoursAgo(a.publishedAt);
      const freshness = Math.max(0, 48 - age) / 48; // 0..1
      const text = a.title.toLowerCase();
      const matches = keywords.filter((k) => k.length > 3 && text.includes(k));
      const score = Math.round(40 + freshness * 35 + Math.min(matches.length, 3) * 8);
      return {
        i,
        score,
        reason: `Recent coverage of ${plan.topic} (heuristic ranking).`,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function hoursAgo(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
}
