import { XMLParser } from "fast-xml-parser";
import { hashId, titleKey } from "@/lib/text";

// Raw article as returned by a news source, before agent ranking.
export type RawArticle = {
  title: string;
  url: string;
  source: string;
  publishedAt: string; // ISO
};

const xml = new XMLParser({ ignoreAttributes: false });

const FETCH_TIMEOUT_MS = 8000;

async function timedFetch(url: string, headers?: Record<string, string>) {
  return fetch(url, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
}

/** Google News RSS search — broad coverage across mainstream outlets, no API key. */
export async function fetchGoogleNews(
  query: string,
  limit = 18,
): Promise<RawArticle[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
      query,
    )}&hl=en-US&gl=US&ceid=US:en`;
    const res = await timedFetch(url, {
      "User-Agent": "Mozilla/5.0 (compatible; Periscope/0.1)",
    });
    if (!res.ok) return [];
    const doc = xml.parse(await res.text());
    let items = doc?.rss?.channel?.item ?? [];
    if (!Array.isArray(items)) items = [items];
    return items
      .slice(0, limit)
      .map((it: Record<string, unknown>) => {
        const source = it.source as Record<string, string> | string | undefined;
        return {
          // Google News titles end with " - Outlet"; strip the suffix.
          title: String(it.title ?? "").replace(/\s+-\s+[^-]+$/, ""),
          url: String(it.link ?? ""),
          source:
            typeof source === "object"
              ? String(source["#text"] ?? "Google News")
              : String(source ?? "Google News"),
          publishedAt: new Date(
            String(it.pubDate ?? new Date().toUTCString()),
          ).toISOString(),
        };
      })
      .filter((a: RawArticle) => a.title && a.url.startsWith("http"));
  } catch {
    return [];
  }
}

/** Bing News RSS search — query-capable aggregator, no API key. */
export async function fetchBingNews(
  query: string,
  limit = 10,
): Promise<RawArticle[]> {
  try {
    const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
    const res = await timedFetch(url, {
      "User-Agent": "Mozilla/5.0 (compatible; Periscope/0.1)",
    });
    if (!res.ok) return [];
    const doc = xml.parse(await res.text());
    let items = doc?.rss?.channel?.item ?? [];
    if (!Array.isArray(items)) items = [items];
    return items
      .slice(0, limit)
      .map((it: Record<string, unknown>) => {
        // Bing links are bing.com/news/apiclick redirects carrying the real
        // article URL in ?url= — resolve it so dedupe and paywall checks work.
        const realUrl = resolveBingUrl(String(it.link ?? ""));
        const source = it["News:Source"] ?? it["news:Source"];
        return {
          title: String(it.title ?? ""),
          url: realUrl,
          source: source ? String(source) : hostnameOf(realUrl),
          publishedAt: new Date(
            String(it.pubDate ?? new Date().toUTCString()),
          ).toISOString(),
        };
      })
      .filter((a: RawArticle) => a.title && a.url.startsWith("http"));
  } catch {
    return [];
  }
}

function resolveBingUrl(link: string): string {
  try {
    const real = new URL(link).searchParams.get("url");
    return real ? decodeURIComponent(real) : link;
  } catch {
    return link;
  }
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Web";
  }
}

// Outlets that hard-paywall most articles — filtered out per the product goal
// of relying on popular, freely readable US sources. Google News items carry
// only the outlet *name* (their URL is news.google.com), while Yahoo/Bing/HN
// carry the real *domain* — so both must be checked.
const PAYWALLED_NAMES = new Set(
  [
    "the wall street journal", "wall street journal", "wsj",
    "the new york times", "new york times", "nytimes",
    "bloomberg", "bloomberg news", "bloomberg.com",
    "the washington post", "washington post",
    "financial times", "the economist", "the athletic", "the information",
    "business insider", "insider", "barron's", "barrons",
    "los angeles times", "la times",
  ].map((n) => n.replace(/[^a-z0-9]/g, "")),
);

const PAYWALLED_DOMAINS = [
  "wsj.com", "nytimes.com", "bloomberg.com", "washingtonpost.com", "ft.com",
  "economist.com", "theathletic.com", "theinformation.com",
  "businessinsider.com", "barrons.com", "latimes.com",
];

export function isPaywalled(a: RawArticle): boolean {
  const name = a.source.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (name && PAYWALLED_NAMES.has(name)) return true;
  try {
    const host = new URL(a.url).hostname.replace(/^www\./, "");
    // Suffix match must be dot-anchored: "microsoft.com".endsWith("ft.com").
    return PAYWALLED_DOMAINS.some(
      (d) => host === d || host.endsWith("." + d),
    );
  } catch {
    return false;
  }
}

/** Round-robin merge so no single source dominates the candidate pool. */
export function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      if (i < l.length) out.push(l[i]);
    }
  }
  return out;
}

/** Hacker News via Algolia — strong for tech/startup topics, no API key. */
export async function fetchHackerNews(
  query: string,
  limit = 8,
): Promise<RawArticle[]> {
  try {
    // Only stories from the last 45 days — relevance search alone happily
    // returns decade-old classics.
    const minCreated = Math.floor(Date.now() / 1000) - 45 * 86400;
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(
      query,
    )}&tags=story&hitsPerPage=${limit}&numericFilters=${encodeURIComponent(
      `points>10,created_at_i>${minCreated}`,
    )}`;
    const res = await timedFetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.hits ?? [])
      .filter((h: Record<string, unknown>) => h.title)
      .map((h: Record<string, unknown>) => ({
        title: String(h.title),
        url: String(h.url || `https://news.ycombinator.com/item?id=${h.objectID}`),
        source: "Hacker News",
        publishedAt: new Date(Number(h.created_at_i ?? 0) * 1000).toISOString(),
      }));
  } catch {
    return [];
  }
}

/** Cheap stable id from a URL. */
export function articleId(url: string): string {
  return hashId(url);
}

/**
 * Dedupe raw articles by URL and near-identical titles, dropping anything in
 * `exclude` (article ids or title keys the client has already seen).
 */
export function dedupeRaw(
  articles: RawArticle[],
  exclude?: Set<string>,
): RawArticle[] {
  const seen = new Set<string>();
  const out: RawArticle[] = [];
  for (const a of articles) {
    const tk = titleKey(a.title);
    if (seen.has(a.url) || seen.has(tk)) continue;
    if (exclude && (exclude.has(articleId(a.url)) || exclude.has(tk))) continue;
    seen.add(a.url);
    seen.add(tk);
    out.push(a);
  }
  return out;
}
