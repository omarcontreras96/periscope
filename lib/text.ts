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

/** Case-insensitive dedupe, keeping the first casing seen. */
export function dedupeCI(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    const k = v.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v.trim());
  }
  return out;
}

export function includesCI(list: string[], v: string): boolean {
  const k = v.trim().toLowerCase();
  return list.some((x) => x.trim().toLowerCase() === k);
}

export function removeCI(list: string[], v: string): string[] {
  const k = v.trim().toLowerCase();
  return list.filter((x) => x.trim().toLowerCase() !== k);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-phrase match with Unicode-safe boundaries. `"AI"` matches "AI policy"
 * but not "Spain" or "airline" (JS \b is ASCII-only, hence the lookarounds).
 */
export function matchesPhrase(text: string, phrase: string): boolean {
  const p = phrase.trim();
  if (!p) return false;
  try {
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegex(p)}(?![\\p{L}\\p{N}])`,
      "iu",
    );
    return re.test(text);
  } catch {
    return text.toLowerCase().includes(p.toLowerCase());
  }
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "as",
  "at", "by", "from", "after", "over", "into", "about", "new", "says", "said",
  "how", "why", "what", "when", "where", "who", "its", "their", "his", "her",
  "this", "that", "these", "those", "will", "could", "would", "should", "can",
  "more", "than", "amid", "your", "have", "has", "are", "was", "were", "is",
  "be", "been", "not", "but", "just", "here", "there", "top", "best", "latest",
  "breaking", "live", "watch", "report", "opinion", "exclusive", "inside",
  "update", "updates", "news", "going", "getting", "making", "taking", "amid",
  "against", "before", "during", "between", "because", "while", "still",
]);

/** Lowercase words allowed inside a capitalized entity run ("Bank of America"). */
const CONNECTORS = new Set([
  "of", "de", "del", "la", "le", "di", "da", "van", "von", "der", "el", "al", "&",
]);

/**
 * Headline furniture — generic nouns aggregators Title-Case alongside real
 * entities ("Rangers vs West Ham Match Results Today: Club Friendly Live
 * Score"). In Title-Cased headlines these break entity runs; without them a run
 * swallows the whole headline.
 */
const GENERIC = new Set([
  "match", "matches", "result", "results", "score", "scores", "stat", "stats",
  "lineup", "lineups", "preview", "previews", "recap", "highlights", "analysis",
  "reaction", "reactions", "takeaways", "roundup", "round-up", "today",
  "tonight", "tomorrow", "yesterday", "club", "friendly", "preseason",
  "pre-season", "season", "kickoff", "kick-off", "time", "date", "channel",
  "odds", "prediction", "predictions", "betting", "schedule", "standings",
  "table", "fixture", "fixtures", "guide", "final", "full", "vs", "versus",
  "need", "know", "everything", "stream", "streaming", "tv",
  // headline verbs — Title-Cased alongside entities but never part of one
  "announces", "unveils", "launches", "reveals", "confirms", "denies", "calls",
  "adds", "plans", "eyes", "joins", "signs", "names", "picks", "drops",
  "faces", "hits", "sets", "wins", "beats", "loses", "opens", "closes",
  "raises", "cuts", "buys", "sells", "sues", "backs", "warns", "urges",
  "seeks", "weighs", "expands", "targets", "acquires",
]);

const CAP_TOKEN = /^\p{Lu}[\p{L}\p{M}\p{N}'’.-]*$/u;

function cleanToken(w: string): string {
  return w
    .replace(/^["'“”‘’(\[{]+/u, "")
    .replace(/["'“”‘’)\]},.:;!?]+$/u, "")
    .replace(/['’]s$/u, "");
}

/** True when the raw token ends a clause — entity runs must not cross it. */
function endsClause(raw: string): boolean {
  return /[?!.:;,]["'“”‘’)\]}]*$/.test(raw);
}

/**
 * Semantic keyword extraction from a headline, used when the LLM isn't
 * available. Pulls multi-word capitalized entities ("Real Madrid",
 * "Yan Diomandé", "RB Leipzig") rather than splitting words. Fully
 * Title-Cased headlines defeat entity detection, so those fall back to the
 * longest meaningful words (original casing kept).
 */
export function heuristicKeywords(title: string, max = 4): string[] {
  const tokens = title.normalize("NFC").split(/\s+/).map(cleanToken).filter(Boolean);

  // Title-Case detection: when nearly every long word is capitalized we can't
  // use capitalization alone to spot entities, so stopwords and headline
  // furniture become run-breakers instead (see GENERIC).
  const longTokens = tokens.filter((w) => w.length > 3);
  const capRatio = longTokens.length
    ? longTokens.filter((w) => CAP_TOKEN.test(w)).length / longTokens.length
    : 1;
  const titleCase = capRatio > 0.7;

  const rawTokens = title.normalize("NFC").split(/\s+/).filter(Boolean);
  const entities: string[] = [];
  {
    let run: string[] = [];
    const flush = () => {
      // Strip leading stopwords (sentence starters like "Is", "Why") and
      // trailing connectors, then keep runs that look like real entities.
      while (run.length && STOPWORDS.has(run[0].toLowerCase())) {
        run.shift();
      }
      while (run.length && CONNECTORS.has(run[run.length - 1].toLowerCase())) {
        run.pop();
      }
      if (run.length >= 2) {
        entities.push(run.slice(0, 4).join(" "));
      } else if (run.length === 1) {
        const w = run[0];
        if (
          !STOPWORDS.has(w.toLowerCase()) &&
          (w.length > 3 || (w.length > 1 && w === w.toUpperCase()))
        ) {
          entities.push(w);
        }
      }
      run = [];
    };
    for (let i = 0; i < rawTokens.length; i++) {
      const w = cleanToken(rawTokens[i]);
      if (!w) {
        flush();
        continue;
      }
      // In a Title-Cased headline capitalization carries no signal, so generic
      // words end the entity instead of extending it.
      if (titleCase && (STOPWORDS.has(w.toLowerCase()) || GENERIC.has(w.toLowerCase()))) {
        flush();
      } else if (CAP_TOKEN.test(w)) {
        run.push(w);
      } else if (
        run.length > 0 &&
        CONNECTORS.has(w.toLowerCase()) &&
        i + 1 < rawTokens.length &&
        !endsClause(rawTokens[i]) &&
        CAP_TOKEN.test(cleanToken(rawTokens[i + 1]))
      ) {
        run.push(w);
      } else {
        flush();
      }
      // "Real Madrid? Latest..." — the run must break at the clause boundary.
      if (endsClause(rawTokens[i])) flush();
    }
    flush();
  }

  // Multi-word entities are the point ("Real Madrid" over "Rangers"), so they
  // win the limited slots. Array.sort is stable, so ties keep headline order.
  const out = dedupeCI(entities)
    .sort((a, b) => (b.includes(" ") ? 1 : 0) - (a.includes(" ") ? 1 : 0))
    .slice(0, max);

  // Top up with meaningful single words when entity extraction came up short.
  if (out.length < 2) {
    for (const w of tokens) {
      if (out.length >= max) break;
      const k = w.toLowerCase();
      if (
        w.length > 4 &&
        !STOPWORDS.has(k) &&
        !GENERIC.has(k) &&
        !out.some((o) => o.toLowerCase().includes(k))
      ) {
        out.push(w);
      }
    }
  }
  return out.slice(0, max);
}
