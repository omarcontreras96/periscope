import { askJSON } from "@/lib/ai";
import {
  applyRemoval,
  looseMatch,
  matchedVariant,
  normalizeForMatch,
} from "@/lib/removal";
import {
  dedupeRaw,
  fetchBingNews,
  fetchGoogleNews,
  fetchHackerNews,
  interleave,
  isPaywalled,
} from "@/lib/sources";
import { heuristicKeywords } from "@/lib/text";
import type {
  Probe,
  ProbeProposal,
  ProbeReceipt,
  SelfTestEvent,
  UserProfile,
} from "@/lib/types";

/**
 * The prober: a self-testing agent for the removal stage.
 *
 * It picks its own topics and mute phrases, runs them through the real
 * pipeline's removal code (lib/removal.ts — the same function the search agent
 * calls), and grades the result against an independent oracle. Every run emits
 * a receipt saying what it tried, what it found and what it proposes, so the
 * loop is auditable rather than a black box that claims it improved something.
 *
 * Two failure modes it looks for:
 *   under-removal (leak)  — the oracle says the title contains the phrase, the
 *                           production matcher let it through
 *   over-removal          — production dropped something the oracle says does
 *                           not contain the phrase, or wiped out every candidate
 */

/** Adversarial transforms — the shapes that historically break phrase matching. */
const MUTATORS: { name: string; apply: (s: string) => string }[] = [
  { name: "plural", apply: (s) => (s.endsWith("s") ? s.slice(0, -1) : `${s}s`) },
  { name: "hyphenated", apply: (s) => s.replace(/\s+/g, "-") },
  { name: "de-accented", apply: (s) => normalizeForMatch(s) },
  { name: "possessive", apply: (s) => `${s}'s` },
];

/** Strip diacritics but keep casing — "Vitória" → "Vitoria". */
function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").normalize("NFC");
}

async function heuristicProbes(
  profile: UserProfile,
  max: number,
): Promise<Probe[]> {
  const topics = profile.interests
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .map((i) => i.topic);
  const seeds = topics.length > 0 ? topics : ["Technology", "Soccer"];
  const probes: Probe[] = [];

  // Best probes come from entities in real headlines: those carry the accents,
  // hyphens and multi-word shapes that actually break phrase matching. Mutating
  // a bare single-word ASCII topic can only ever test plural/possessive.
  for (const topic of seeds.slice(0, 2)) {
    if (probes.length >= max) break;
    let titles: string[] = [];
    try {
      titles = (await fetchGoogleNews(topic, 10)).map((a) => a.title);
    } catch {
      // no live data — topic mutators below still give us something to run
    }
    const entities = [
      ...new Set(titles.flatMap((t) => heuristicKeywords(t, 4))),
    ].filter((e) => e.includes(" ") || deaccent(e) !== e);

    for (const entity of entities) {
      if (probes.length >= max) break;
      const accented = deaccent(entity) !== entity;
      const phrase = accented ? deaccent(entity) : entity.replace(/\s+/g, "-");
      probes.push({
        topic,
        phrase,
        rationale: accented
          ? `"${entity}" appears in live headlines; mute its de-accented form to test whether the matcher normalizes diacritics.`
          : `"${entity}" appears in live headlines; mute a hyphenated form to test whether the matcher normalizes punctuation.`,
      });
    }
  }

  // Fill remaining slots with topic-level mutations.
  for (const topic of seeds) {
    for (const m of MUTATORS) {
      if (probes.length >= max) return probes;
      const phrase = m.apply(topic);
      if (normalizeForMatch(phrase) === normalizeForMatch(topic)) continue;
      if (probes.some((p) => p.phrase === phrase)) continue;
      probes.push({
        topic,
        phrase,
        rationale: `Mute the ${m.name} form of "${topic}" — the feed is full of the base form, so anything that slips through is a real matcher gap.`,
      });
    }
  }
  return probes;
}

async function llmProbes(
  profile: UserProfile,
  max: number,
  apiKey?: string,
): Promise<Probe[]> {
  const result = await askJSON<{ probes: Probe[] }>({
    apiKey,
    system:
      "You are the prober agent of a self-improving newsfeed. You design adversarial tests for its content-removal stage, which drops articles whose titles contain a muted phrase.",
    prompt: `User profile:
${JSON.stringify(profile, null, 2)}

Design exactly ${max} probes that are likely to expose gaps in phrase-based removal. Each probe picks a topic that will return plenty of real articles, and a phrase to mute that SHOULD match many of them but is written in a form the matcher may miss — different accents, hyphenation, plural, possessive, casing, or punctuation.

Rules:
- "topic" must be a searchable news topic, ideally drawn from the user's interests.
- "phrase" must be a variant a reasonable person would consider the same phrase.
- "rationale" states in one sentence what gap this probe is hunting for.

Return JSON: {"probes": [{"topic": "...", "phrase": "...", "rationale": "..."}]}`,
    maxOutputTokens: 900,
  });
  if (!Array.isArray(result.probes) || result.probes.length === 0) {
    throw new Error("bad probes");
  }
  return result.probes
    .filter((p) => p && typeof p.topic === "string" && typeof p.phrase === "string")
    .slice(0, max);
}

/** Runs one probe against live sources and the production removal stage. */
async function runProbe(probe: Probe): Promise<ProbeReceipt> {
  const at = new Date().toISOString();
  const id = `${normalizeForMatch(probe.phrase).replace(/\s+/g, "-")}-${Date.now().toString(36)}`;

  const [gn, bg, hn] = await Promise.all([
    fetchGoogleNews(probe.topic, 14),
    fetchBingNews(probe.topic, 12),
    fetchHackerNews(probe.topic, 6),
  ]);
  const candidates = dedupeRaw(interleave([gn, bg, hn]));

  // The exact code the search agent runs.
  const removal = applyRemoval(candidates, [probe.phrase]);

  // Grade it. A leak is a survivor the oracle says should have gone.
  const leaks = removal.kept
    .filter((a) => looseMatch(a.title, probe.phrase))
    .map((a) => a.title)
    .slice(0, 5);

  // A false positive is something removed that the oracle disagrees with.
  const falsePositives = removal.muted
    .filter((m) => !looseMatch(m.article.title, probe.phrase))
    .map((m) => m.article.title)
    .slice(0, 5);

  // Paywalled outlets that got past isPaywalled, by hostname.
  const paywallMisses = [
    ...new Set(
      removal.kept
        .filter((a) => !isPaywalled(a) && /wsj|nytimes|bloomberg|ft\.com|economist/i.test(a.url))
        .map((a) => hostOf(a.url)),
    ),
  ].slice(0, 3);

  const proposals: ProbeProposal[] = [];
  for (const a of removal.kept) {
    // Propose the surface form that actually leaked — proposing the phrase that
    // is already muted would be a no-op.
    const variant = matchedVariant(a.title, probe.phrase);
    if (!variant) continue;
    proposals.push({
      kind: "add-muted",
      value: variant,
      reason: `Muting "${probe.phrase}" left "${truncate(a.title, 60)}" in the feed; "${variant}" is the form that appears.`,
    });
    break;
  }
  for (const host of paywallMisses) {
    proposals.push({
      kind: "add-paywall-domain",
      value: host,
      reason: `Paywalled outlet ${host} passed isPaywalled().`,
    });
  }

  // A probe only proves something if the phrase was actually present in some
  // form. With no oracle hits and nothing removed, the filter was never
  // exercised — that is "no-data", not a pass. Reporting it green would make
  // the panel look healthy on the strength of probes that tested nothing.
  // Count only what actually reached the mute stage: paywall removal happens
  // first, so a matching headline dropped as paywalled never tested the mute.
  const reachedMuteStage = [
    ...removal.kept,
    ...removal.muted.map((m) => m.article),
  ];
  const oracleHits = reachedMuteStage.filter((a) =>
    looseMatch(a.title, probe.phrase),
  ).length;
  const wipedOut = candidates.length > 0 && removal.kept.length === 0;
  const verdict: ProbeReceipt["verdict"] =
    candidates.length === 0 || (oracleHits === 0 && removal.muted.length === 0)
      ? "no-data"
      : leaks.length > 0
        ? "leak"
        : falsePositives.length > 0 || wipedOut
          ? "over-removal"
          : "pass";

  return {
    id,
    at,
    topic: probe.topic,
    phrase: probe.phrase,
    rationale: probe.rationale ?? "",
    candidates: candidates.length,
    removedMuted: removal.muted.length,
    removedPaywall: removal.paywalled.length,
    survived: removal.kept.length,
    leaks,
    falsePositives,
    verdict,
    proposals: dedupeProposals(proposals),
  };
}

/**
 * Runs a full self-test cycle, streaming a receipt per probe. Never throws to
 * the client — a failed probe becomes a receipt with an error verdict, same
 * philosophy as the rest of the pipeline.
 */
export async function runSelfTest(
  profile: UserProfile,
  emit: (e: SelfTestEvent) => void,
  opts: { count?: number; apiKey?: string } = {},
): Promise<ProbeReceipt[]> {
  const count = Math.min(Math.max(opts.count ?? 4, 1), 8);

  let probes: Probe[];
  let planner: "llm" | "heuristic" = "llm";
  try {
    probes = await llmProbes(profile, count, opts.apiKey);
  } catch {
    planner = "heuristic";
    probes = await heuristicProbes(profile, count);
  }
  emit({
    type: "status",
    message: `Designed ${probes.length} probes (${planner}). Testing the removal stage against live sources…`,
  });

  const receipts: ProbeReceipt[] = [];
  for (const probe of probes) {
    emit({
      type: "status",
      message: `Probe: mute “${probe.phrase}” on topic “${probe.topic}”…`,
    });
    try {
      const r = await runProbe(probe);
      receipts.push(r);
      emit({ type: "receipt", receipt: r });
    } catch (err) {
      const r: ProbeReceipt = {
        id: `err-${Date.now().toString(36)}`,
        at: new Date().toISOString(),
        topic: probe.topic,
        phrase: probe.phrase,
        rationale: probe.rationale ?? "",
        candidates: 0,
        removedMuted: 0,
        removedPaywall: 0,
        survived: 0,
        leaks: [],
        falsePositives: [],
        verdict: "error",
        proposals: [],
        error: err instanceof Error ? err.message : String(err),
      };
      receipts.push(r);
      emit({ type: "receipt", receipt: r });
    }
  }

  emit({ type: "done", receipts });
  return receipts;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function dedupeProposals(list: ProbeProposal[]): ProbeProposal[] {
  const seen = new Set<string>();
  return list.filter((p) => {
    const k = `${p.kind}:${p.value.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
