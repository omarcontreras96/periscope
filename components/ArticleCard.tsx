"use client";

import { useState } from "react";
import type { Article, FeedbackAction } from "@/lib/types";

function timeAgo(iso: string): string {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return "now";
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/**
 * Compact card: metadata line, two-line title (full "why picked" reason in the
 * tooltip), clickable keyword tags (follow/mute), and inline 👍/👎.
 */
export default function ArticleCard({
  article,
  reaction,
  onFeedback,
  onKeyword,
}: {
  article: Article;
  reaction?: FeedbackAction;
  onFeedback: (action: FeedbackAction) => void;
  onKeyword: (keyword: string, action: "follow" | "mute") => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  return (
    <article
      className={`flex flex-col rounded-lg border border-line bg-card px-3 py-2.5 transition ${
        reaction === "dislike" ? "opacity-40" : ""
      }`}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted">
        <span className="truncate">{article.source}</span>
        <span>· {timeAgo(article.publishedAt)}</span>
        <span className="ml-auto font-mono text-muted/70">{article.score}</span>
      </div>

      <h3 className="text-[13px] font-medium leading-snug">
        <a
          href={article.url}
          target="_blank"
          rel="noreferrer"
          title={`Why picked: ${article.reason}`}
          onClick={() => onFeedback("click")}
          className="line-clamp-2 hover:text-accent"
        >
          {article.title}
        </a>
      </h3>

      <div className="mt-auto flex flex-wrap items-center gap-1 pt-1.5">
        {article.keywords.slice(0, 4).map((k) => (
          <span
            key={k}
            className="relative"
            onMouseLeave={() => setMenuFor((m) => (m === k ? null : m))}
          >
            <button
              onClick={() => setMenuFor((m) => (m === k ? null : k))}
              title="Follow or mute this keyword"
              className={`rounded px-1.5 py-px text-[10px] transition ${
                menuFor === k
                  ? "bg-accent/20 text-accent"
                  : "bg-line/70 text-muted hover:bg-line hover:text-foreground"
              }`}
            >
              {k}
            </button>
            {menuFor === k && (
              <span className="absolute bottom-full left-0 z-20 mb-1 flex w-max flex-col overflow-hidden rounded-md border border-line bg-card shadow-lg">
                <button
                  onClick={() => {
                    onKeyword(k, "follow");
                    setMenuFor(null);
                  }}
                  className="px-2.5 py-1 text-left text-[11px] text-muted transition hover:bg-accent/15 hover:text-accent"
                >
                  ➕ Follow “{k}”
                </button>
                <button
                  onClick={() => {
                    onKeyword(k, "mute");
                    setMenuFor(null);
                  }}
                  className="px-2.5 py-1 text-left text-[11px] text-muted transition hover:bg-red-400/15 hover:text-red-300"
                >
                  🚫 Mute “{k}”
                </button>
              </span>
            )}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-1">
          {reaction && reaction !== "click" ? (
            <span className="text-[10px] text-muted">
              {reaction === "dislike" || reaction === "less"
                ? "✓ less"
                : "✓ more"}
            </span>
          ) : (
            <>
              <button
                onClick={() => onFeedback("like")}
                title="More like this"
                className="rounded border border-line px-1.5 py-0.5 text-[12px] leading-none text-muted transition hover:border-accent/50 hover:text-accent"
              >
                👍
              </button>
              <button
                onClick={() => onFeedback("dislike")}
                title="Less like this"
                className="rounded border border-line px-1.5 py-0.5 text-[12px] leading-none text-muted transition hover:border-red-400/50 hover:text-red-400"
              >
                👎
              </button>
            </>
          )}
        </span>
      </div>
    </article>
  );
}
