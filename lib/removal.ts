// The removal stage: everything that drops a candidate before ranking.
// Extracted so the search agent and the prober (lib/agents/prober.ts) exercise
// the same code — a self-test against a reimplementation proves nothing.

import { isPaywalled, type RawArticle } from "@/lib/sources";
import { matchesPhrase } from "@/lib/text";

export type RemovalResult = {
  kept: RawArticle[];
  /** Dropped for being behind a hard paywall. */
  paywalled: RawArticle[];
  /** Dropped by a muted phrase, paired with the phrase that caught it. */
  muted: { article: RawArticle; phrase: string }[];
};

/** Production removal stage. `muted` is normally profile.muted. */
export function applyRemoval(
  raw: RawArticle[],
  muted: string[],
): RemovalResult {
  const out: RemovalResult = { kept: [], paywalled: [], muted: [] };
  for (const a of raw) {
    if (isPaywalled(a)) {
      out.paywalled.push(a);
      continue;
    }
    const hit = muted.find((m) => matchesPhrase(a.title, m));
    if (hit) {
      out.muted.push({ article: a, phrase: hit });
      continue;
    }
    out.kept.push(a);
  }
  return out;
}

/**
 * Aggressive normalization for the *oracle* below — strips diacritics, curly
 * quotes, casing and punctuation so "Vitória de Guimarães" and
 * "Vitoria de Guimaraes" collapse to the same string.
 *
 * Deliberately NOT what matchesPhrase does. matchesPhrase is intentionally
 * strict (a mute shouldn't fire on something the user didn't type); this is a
 * looser "what a human would obviously call the same phrase" comparison, used
 * only to find where the strict matcher under-removes.
 */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‘’'`]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Simple singular/plural pair, enough to catch rumor/rumors, not a stemmer. */
function inflections(p: string): string[] {
  const out = [p];
  if (p.endsWith("ies") && p.length > 4) out.push(p.slice(0, -3) + "y");
  else if (p.endsWith("es") && p.length > 3) out.push(p.slice(0, -2));
  if (p.endsWith("s") && p.length > 2) out.push(p.slice(0, -1));
  else out.push(p + "s");
  return [...new Set(out)];
}

/**
 * The oracle: would a human say this title contains this phrase? Used to grade
 * matchesPhrase, never to filter production traffic.
 */
export function looseMatch(text: string, phrase: string): boolean {
  return matchedVariant(text, phrase) !== null;
}

/**
 * Which surface form actually appears in the text, if any. The prober proposes
 * *this* rather than the original phrase — proposing the phrase that is already
 * muted would be a no-op, whereas the form that leaked is directly actionable.
 */
export function matchedVariant(text: string, phrase: string): string | null {
  const norm = normalizeForMatch(text);
  const t = ` ${norm} `;
  const p = normalizeForMatch(phrase);
  if (!p) return null;
  for (const v of inflections(p)) {
    const at = t.indexOf(` ${v} `);
    if (at === -1) continue;
    // Recover the original casing/accents from the raw text where we can, so
    // the proposal reads like the headline rather than a flattened token.
    const re = new RegExp(
      v.split(" ").map(escapeRegex).join("[^\\p{L}\\p{N}]+"),
      "iu",
    );
    const m = text.normalize("NFC").match(re);
    return m ? m[0] : v;
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
