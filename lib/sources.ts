import { XMLParser } from "fast-xml-parser";

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
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

/** Dedupe raw articles by URL and near-identical titles. */
export function dedupeRaw(articles: RawArticle[]): RawArticle[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const out: RawArticle[] = [];
  for (const a of articles) {
    const titleKey = a.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
    if (seenUrl.has(a.url) || seenTitle.has(titleKey)) continue;
    seenUrl.add(a.url);
    seenTitle.add(titleKey);
    out.push(a);
  }
  return out;
}
