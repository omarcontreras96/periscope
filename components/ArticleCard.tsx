"use client";

import type { Article, FeedbackAction } from "@/lib/types";

function timeAgo(iso: string): string {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function ArticleCard({
  article,
  reaction,
  onFeedback,
}: {
  article: Article;
  reaction?: FeedbackAction;
  onFeedback: (action: FeedbackAction) => void;
}) {
  return (
    <article
      className={`rounded-xl border border-line bg-card p-4 transition ${
        reaction === "dislike" ? "opacity-45" : ""
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-accent">
          {article.topic}
        </span>
        <span className="text-muted">
          {article.source} · {timeAgo(article.publishedAt)}
        </span>
        <span className="ml-auto font-mono text-muted/70">
          match {article.score}
        </span>
      </div>

      <h3 className="text-[15px] font-medium leading-snug">
        <a
          href={article.url}
          target="_blank"
          rel="noreferrer"
          onClick={() => onFeedback("click")}
          className="hover:text-accent"
        >
          {article.title}
        </a>
      </h3>

      <p className="mt-1.5 text-[13px] italic text-muted">🧭 {article.reason}</p>

      <div className="mt-3 flex items-center gap-2 text-[13px]">
        {reaction && reaction !== "click" ? (
          <span className="text-muted">
            {reaction === "like" || reaction === "more"
              ? "✓ Noted — more like this"
              : "✓ Noted — less like this"}
          </span>
        ) : (
          <>
            <button
              onClick={() => onFeedback("like")}
              className="rounded-md border border-line px-2.5 py-1 text-muted transition hover:border-accent/50 hover:text-accent"
            >
              👍 More like this
            </button>
            <button
              onClick={() => onFeedback("dislike")}
              className="rounded-md border border-line px-2.5 py-1 text-muted transition hover:border-red-400/50 hover:text-red-400"
            >
              👎 Less like this
            </button>
          </>
        )}
      </div>
    </article>
  );
}
