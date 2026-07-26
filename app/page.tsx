"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AgentLog, { type LogLine } from "@/components/AgentLog";
import ArticleCard from "@/components/ArticleCard";
import Onboarding from "@/components/Onboarding";
import ProfileSidebar from "@/components/ProfileSidebar";
import type {
  AgentEvent,
  Article,
  EvaluateResponse,
  FeedbackAction,
  FeedbackEvent,
  UserProfile,
} from "@/lib/types";

const PROFILE_KEY = "periscope.profile";
const PENDING_KEY = "periscope.pending";
const TUNE_THRESHOLD = 3;

export default function Home() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [reactions, setReactions] = useState<Record<string, FeedbackAction>>({});
  const [pending, setPending] = useState<FeedbackEvent[]>([]);
  const [log, setLog] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [learned, setLearned] = useState<string[] | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  // Hydrate from localStorage.
  useEffect(() => {
    try {
      const p = localStorage.getItem(PROFILE_KEY);
      if (p) setProfile(JSON.parse(p));
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

  const handleEvent = useCallback((e: AgentEvent) => {
    if (e.type === "status") {
      setLog((l) => [...l, { agent: e.agent, message: e.message }]);
    } else if (e.type === "plan") {
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
      setArticles(e.articles);
      setDegraded(e.degraded);
    } else if (e.type === "error") {
      setError(e.message);
    }
  }, []);

  const loadFeed = useCallback(
    async (p: UserProfile) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      setLog([]);
      setReactions({});
      try {
        const res = await fetch("/api/feed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: p }),
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
    },
    [handleEvent],
  );

  // First feed load once a profile exists.
  useEffect(() => {
    if (ready && profile && articles.length === 0 && !loadingRef.current) {
      loadFeed(profile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, profile === null]);

  const onFeedback = (article: Article, action: FeedbackAction) => {
    if (action !== "click" && reactions[article.id]) return;
    setReactions((r) => ({ ...r, [article.id]: action }));
    savePending([
      ...pending,
      {
        articleId: article.id,
        title: article.title,
        topic: article.topic,
        source: article.source,
        action,
        at: new Date().toISOString(),
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
    setProfile(null);
    setArticles([]);
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

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <main className="space-y-3">
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
          {articles.map((a) => (
            <ArticleCard
              key={a.id}
              article={a}
              reaction={reactions[a.id]}
              onFeedback={(action) => onFeedback(a, action)}
            />
          ))}
          {articles.length > 0 && (
            <p className="pt-2 text-center text-[11px] text-muted/60">
              Sources: Google News RSS · Hacker News — react to at least{" "}
              {TUNE_THRESHOLD} articles, then hit ✨ Tune to teach the feed.
            </p>
          )}
        </main>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <AgentLog lines={log} busy={loading || tuning} />
          <ProfileSidebar profile={profile} onReset={reset} />
        </aside>
      </div>
    </div>
  );
}
