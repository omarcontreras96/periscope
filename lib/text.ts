// Small text helpers shared by server agents and the client.

/** Stable short id from any string (cheap non-crypto hash). */
export function hashId(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

/** Normalized key for near-duplicate title detection. */
export function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "as",
  "at", "by", "from", "after", "over", "into", "about", "new", "says", "said",
  "how", "why", "what", "when", "its", "their", "his", "her", "this", "that",
  "will", "could", "more", "than", "amid", "your", "have", "has", "are",
]);

/** Fallback keywords from a title when the LLM isn't available. */
export function heuristicKeywords(title: string, max = 4): string[] {
  const words = title
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w.toLowerCase()));
  return [...new Set(words.map((w) => w.toLowerCase()))].slice(0, max);
}
