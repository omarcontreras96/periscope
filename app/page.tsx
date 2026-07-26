"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AgentLog, { type LogLine } from "@/components/AgentLog";
import ArticleCard from "@/components/ArticleCard";
import HypothesisCard from "@/components/HypothesisCard";
import Onboarding from "@/components/Onboarding";
import ProfileSidebar from "@/components/ProfileSidebar";
import { titleKey } from "@/lib/text";
import type {
  AgentEvent,
  Article,
  EvaluateResponse,
  FeedbackAction,
  FeedbackEvent,
  SearchPlanItem,
  UserProfile,
} from "@/lib/types";

const PROFILE_KEY = "periscope.profile";
const PENDING_KEY = "periscope.pending";
const TUNE_THRESHOLD = 3;

export default function Home() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [plan, setPlan] = useState<Record<string, SearchPlanItem>>({});
  const [reactions, setReactions] = useState<Record<string, FeedbackAction>>({});
  const [pending, setPending] = useState<FeedbackEvent[]>([]);
  const [log, setLog] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [learned, setLearned] = useState<string[] | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const articlesRef = useRef<Article[]>([]);
  articlesRef.current = articles;
  // Synchronous double-react guard — state alone is stale within one tick.
  const reactedRef = useRef<Set<string>>(new Set());

  // Hydrate from localStorage (migrating profiles saved before hypotheses existed).
  useEffect(() => {
    try {
      const p = localStorage.getItem(PROFILE_KEY);
      if (p) {
        const parsed = JSON.parse(p) as UserProfile;
        parsed.hypotheses = parsed.hypotheses ?? [];
        setProfile(parsed);
      }
      const f = localStorage.getItem(PENDING_KEY);
      if (f) setPending(JSON.parse(f));
    } catch {
      // corrupted storage — start fresh
    }
    setReady(true);
  }, []);

  const saveProfile = (p: UserProfile) => {
    setProfile(p);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  };
  const savePending = (f: FeedbackEvent[]) => {
    setPending(f);
    localStorage.setItem(PENDING_KEY, JSON.stringify(f));
  };

  const loadFeed = useCallback(async (p: UserProfile, append = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    setLog([]);
    if (!append) {
      setReactions({});
      setPlan({});
      reactedRef.current = new Set();
    }
    const exclude = append
      ? articlesRef.current.flatMap((a) => [a.id, titleKey(a.title)])
      : [];

    const handleEvent = (e: AgentEvent) => {
      if (e.type === "status") {
        setLog((l) => [...l, { agent: e.agent, message: e.message }]);
      } else if (e.type === "plan") {
        setPlan((prev) => {
          const next = append ? { ...prev } : {};
          for (const q of e.queries) next[q.topic] = q;
          return next;
        });
        setLog((l) => [
          ...l,
          ...e.queries.map((q) => ({
            agent: "orchestrator",
            message: `plan → ${q.topic}: “${q.query}”${
              q.exploration ? " (exploration)" : ""
            } — ${q.rationale}`,
          })),
        ]);
      } else if (e.type === "articles") {
        setLog((l) => [
          ...l,
          { agent: `search:${e.topic}`, message: `${e.count} candidates found.` },
        ]);
      } else if (e.type === "feed") {
        setDegraded(e.degraded);
        setArticles((prev) => {
          if (!append) return e.articles;
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...e.articles.filter((a) => !seen.has(a.id))];
        });
      } else if (e.type === "error") {
        setError(e.message);
      }
    };

    try {
      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: p, exclude }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`feed request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          handleEvent(JSON.parse(line) as AgentEvent);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // First feed load once a profile exists.
  useEffect(() => {
    if (ready && profile && articles.length === 0 && !loadingRef.current) {
      loadFeed(profile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, profile === null]);

  // Group the flat feed into topic buckets, preserving appearance order.
  const buckets = useMemo(() => {
    const map = new Map<string, Article[]>();
    for (const a of articles) {
      if (!map.has(a.topic)) map.set(a.topic, []);
      map.get(a.topic)!.push(a);
    }
    return [...map.entries()].map(([topic, items]) => ({
      topic,
      items: [...items].sort((x, y) => y.score - x.score),
    }));
  }, [articles]);

  const onFeedback = (article: Article, action: FeedbackAction) => {
    if (action !== "click") {
      if (reactedRef.current.has(article.id)) return;
      reactedRef.current.add(article.id);
    }
    setReactions((r) => ({ ...r, [article.id]: action }));
    setPending((prev) => {
      const next = [
        ...prev,
        {
          articleId: article.id,
          title: article.title,
          topic: article.topic,
          source: article.source,
          action,
          at: new Date().toISOString(),
        },
      ];
      localStorage.setItem(PENDING_KEY, JSON.stringify(next));
      return next;
    });
  };

  const answerHypothesis = (id: string, status: "confirmed" | "rejected") => {
    if (!profile) return;
    saveProfile({
      ...profile,
      hypotheses: profile.hypotheses.map((h) =>
        h.id === id ? { ...h, status } : h,
      ),
    });
    setLog((l) => [
      ...l,
      {
        agent: "evaluator",
        message: `Hypothesis ${status} by you — the next search plan will use it.`,
      },
    ]);
  };

  const tune = async () => {
    if (!profile || pending.length === 0 || tuning) return;
    setTuning(true);
    setError(null);
    setLog((l) => [
      ...l,
      { agent: "evaluator", message: `Analyzing ${pending.length} feedback signals…` },
    ]);
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, feedback: pending }),
      });
      if (!res.ok) throw new Error(`evaluate request failed (${res.status})`);
      const data = (await res.json()) as EvaluateResponse;
      data.profile.hypotheses = data.profile.hypotheses ?? [];
      saveProfile(data.profile);
      savePending([]);
      setLearned(data.learned);
      setLog((l) => [
        ...l,
        {
          agent: "evaluator",
          message: `Profile updated to v${data.profile.version}. Re-running searches…`,
        },
      ]);
      await loadFeed(data.profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTuning(false);
    }
  };

  const reset = () => {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(PENDING_KEY);
    reactedRef.current = new Set();
    setProfile(null);
    setArticles([]);
    setPlan({});
    setPending([]);
    setLearned(null);
    setLog([]);
  };

  if (!ready) return null;
  if (!profile) {
    return <Onboarding onStart={saveProfile} />;
  }

  const feedbackCount = pending.length;
  const tuneReady = feedbackCount >= TUNE_THRESHOLD;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16">
      <header className="sticky top-0 z-10 -mx-4 mb-6 border-b border-line bg-background/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <span className="text-2xl">🔭</span>
          <div className="mr-auto leading-tight">
            <h1 className="font-semibold tracking-tight">Periscope</h1>
            <p className="text-[11px] text-muted">
              orchestrator → search agents → evaluator
            </p>
          </div>
          <button
            onClick={() => loadFeed(profile)}
            disabled={loading || tuning}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:text-foreground disabled:opacity-40"
          >
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
          <button
            onClick={tune}
            disabled={feedbackCount === 0 || tuning || loading}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 ${
              tuneReady
                ? "animate-pulse bg-violet-500 text-white"
                : "border border-violet-500/50 text-violet-300"
            }`}
          >
            {tuning ? "Learning…" : `✨ Tune my feed (${feedbackCount})`}
          </button>
        </div>
      </header>

      {degraded && (
        <div className="mb-4 rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-300">
          Heuristic mode — the AI Gateway declined the request, so ranking and
          learning use simple rules. Usual fix: unlock free AI Gateway credits
          (Vercel dashboard → AI Gateway) or set{" "}
          <code className="font-mono">AI_GATEWAY_API_KEY</code>. Details at{" "}
          <a href="/api/debug-ai" className="underline">/api/debug-ai</a>.
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-400/40 bg-red-400/10 px-4 py-2.5 text-sm text-red-300">
          {error}
        </div>
      )}
      {learned && learned.length > 0 && (
        <div className="mb-4 rounded-lg border border-violet-400/40 bg-violet-400/10 px-4 py-3 text-sm">
          <p className="mb-1 font-medium text-violet-300">
            ✨ What the evaluator learned
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-violet-200/90">
            {learned.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}

      <HypothesisCard hypotheses={profile.hypotheses} onAnswer={answerHypothesis} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <main>
          {loading && articles.length === 0 && (
            <div className="rounded-xl border border-line bg-card p-8 text-center text-sm text-muted">
              <span className="mb-2 block animate-pulse text-2xl">🔭</span>
              Agents are scanning the news for you…
            </div>
          )}
          {!loading && articles.length === 0 && (
            <div className="rounded-xl border border-line bg-card p-8 text-center text-sm text-muted">
              No articles yet — hit ↻ Refresh.
            </div>
          )}

          {buckets.map(({ topic, items }) => (
            <section key={topic} className="mb-6">
              <div className="mb-2 flex flex-wrap items-baseline gap-2 border-b border-line pb-1.5">
                <span className="h-2.5 w-2.5 self-center rounded-sm bg-accent" />
                <h2 className="text-sm font-semibold uppercase tracking-wider">
                  {topic}
                </h2>
                <span className="text-[11px] text-muted">
                  {items.length} {items.length === 1 ? "story" : "stories"}
                  {plan[topic] ? ` · “${plan[topic].query}”` : ""}
                </span>
                {plan[topic]?.exploration && (
                  <span className="rounded-full border border-violet-400/40 px-1.5 py-px text-[10px] text-violet-300">
                    exploration
                  </span>
                )}
              </div>
              {plan[topic] && (
                <p className="mb-2 text-[11px] italic text-muted/70">
                  🧭 {plan[topic].rationale}
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((a) => (
                  <ArticleCard
                    key={a.id}
                    article={a}
                    reaction={reactions[a.id]}
                    onFeedback={(action) => onFeedback(a, action)}
                  />
                ))}
              </div>
            </section>
          ))}

          {articles.length > 0 && (
            <div className="flex flex-col items-center gap-2 pt-1">
              <button
                onClick={() => loadFeed(profile, true)}
                disabled={loading || tuning}
                className="rounded-lg border border-line bg-card px-5 py-2 text-sm text-muted transition hover:border-accent/50 hover:text-accent disabled:opacity-40"
              >
                {loading ? "Fetching more news…" : "↓ Load more news"}
              </button>
              <p className="text-center text-[11px] text-muted/60">
                {articles.length} stories · Google News RSS · Hacker News —
                react to {TUNE_THRESHOLD}+ articles, then ✨ Tune to teach the
                feed.
              </p>
            </div>
          )}
        </main>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <AgentLog lines={log} busy={loading || tuning} />
          <ProfileSidebar
            profile={profile}
            onReset={reset}
            onUpdate={saveProfile}
          />
        </aside>
      </div>
    </div>
  );
}
