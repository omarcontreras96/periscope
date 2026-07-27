"use client";

import { useState } from "react";
import { dedupeCI, removeCI } from "@/lib/text";
import type { UserProfile } from "@/lib/types";

const clamp = (n: number) => Math.max(0.05, Math.min(1, Math.round(n * 100) / 100));

/**
 * Live view of the preference profile, directly editable: adjust or remove
 * interest weights, add new interests, and clear avoid entries — no full
 * reset needed. Edits apply on the next refresh/tune.
 */
export default function ProfileSidebar({
  profile,
  apiKey,
  onReset,
  onUpdate,
  onApiKey,
}: {
  profile: UserProfile;
  apiKey: string;
  onReset: () => void;
  onUpdate: (p: UserProfile) => void;
  onApiKey: (k: string) => void;
}) {
  const [newTopic, setNewTopic] = useState("");
  const [newMuted, setNewMuted] = useState("");
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const interests = [...profile.interests].sort((a, b) => b.weight - a.weight);

  const bump = (topic: string, delta: number) =>
    onUpdate({
      ...profile,
      interests: profile.interests.map((i) =>
        i.topic === topic ? { ...i, weight: clamp(i.weight + delta) } : i,
      ),
    });

  const remove = (topic: string) =>
    onUpdate({
      ...profile,
      interests: profile.interests.filter((i) => i.topic !== topic),
    });

  const addInterest = () => {
    const t = newTopic.trim();
    setNewTopic("");
    if (!t) return;
    if (profile.interests.some((i) => i.topic.toLowerCase() === t.toLowerCase()))
      return;
    onUpdate({
      ...profile,
      interests: [...profile.interests, { topic: t, weight: 0.6 }].slice(0, 8),
      // Following something overrides earlier avoid/mute signals for it.
      avoid: removeCI(profile.avoid, t),
      muted: removeCI(profile.muted, t),
    });
  };

  const unavoid = (a: string) =>
    onUpdate({ ...profile, avoid: profile.avoid.filter((x) => x !== a) });

  const addMuted = () => {
    const t = newMuted.trim();
    setNewMuted("");
    if (!t) return;
    onUpdate({
      ...profile,
      muted: dedupeCI([...profile.muted, t]).slice(0, 10),
      // Muting something removes a same-named interest.
      interests: profile.interests.filter(
        (i) => i.topic.toLowerCase() !== t.toLowerCase(),
      ),
    });
  };

  const unmute = (m: string) =>
    onUpdate({ ...profile, muted: removeCI(profile.muted, m) });

  return (
    <div className="rounded-xl border border-line bg-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="text-sm font-medium">
          Preference profile{" "}
          <span className="font-mono text-xs text-muted">v{profile.version}</span>
        </span>
        <button
          onClick={onReset}
          className="text-xs text-muted transition hover:text-red-400"
        >
          Reset
        </button>
      </div>

      <div className="space-y-4 px-4 py-3 text-sm">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-muted/70">
            Interests <span className="normal-case">(editable)</span>
          </p>
          <div className="space-y-1.5">
            {interests.map((it) => (
              <div key={it.topic} className="group">
                <div className="mb-0.5 flex items-center gap-1 text-[12px]">
                  <span className="truncate">{it.topic}</span>
                  <span className="ml-auto font-mono text-muted">
                    {(it.weight * 100).toFixed(0)}
                  </span>
                  <button
                    onClick={() => bump(it.topic, -0.1)}
                    title="Less of this"
                    className="rounded border border-line px-1 text-[10px] leading-4 text-muted hover:text-foreground"
                  >
                    −
                  </button>
                  <button
                    onClick={() => bump(it.topic, 0.1)}
                    title="More of this"
                    className="rounded border border-line px-1 text-[10px] leading-4 text-muted hover:text-foreground"
                  >
                    +
                  </button>
                  <button
                    onClick={() => remove(it.topic)}
                    title="Remove interest"
                    className="rounded border border-line px-1 text-[10px] leading-4 text-muted hover:border-red-400/50 hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-accent/80 transition-all duration-700"
                    style={{ width: `${Math.round(it.weight * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            <input
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addInterest()}
              placeholder="Add interest… (e.g. SpaceX, Trump)"
              className="min-w-0 flex-1 rounded-md border border-line bg-background/60 px-2 py-1 text-[12px] outline-none placeholder:text-muted/50 focus:border-accent/60"
            />
            <button
              onClick={addInterest}
              className="rounded-md border border-line px-2 py-1 text-[12px] text-muted hover:text-foreground"
            >
              Add
            </button>
          </div>
          <p className="mt-1 text-[10px] text-muted/60">
            Edits apply on the next ↻ Refresh or ✨ Tune.
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-xs uppercase tracking-wide text-muted/70">
            Muted keywords
          </p>
          {profile.muted.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {profile.muted.map((m) => (
                <button
                  key={m}
                  onClick={() => unmute(m)}
                  title="Unmute"
                  className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-300 hover:border-amber-400/60"
                >
                  🚫 {m} ✕
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <input
              value={newMuted}
              onChange={(e) => setNewMuted(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addMuted()}
              placeholder="Mute a phrase… (e.g. transfer rumors)"
              className="min-w-0 flex-1 rounded-md border border-line bg-background/60 px-2 py-1 text-[12px] outline-none placeholder:text-muted/50 focus:border-amber-400/50"
            />
            <button
              onClick={addMuted}
              className="rounded-md border border-line px-2 py-1 text-[12px] text-muted hover:text-foreground"
            >
              Mute
            </button>
          </div>
          <p className="mt-1 text-[10px] text-muted/60">
            Articles whose titles contain a muted phrase are dropped before
            ranking — even inside topics you follow.
          </p>
        </div>

        {profile.avoid.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-muted/70">
              Avoiding
            </p>
            <div className="flex flex-wrap gap-1.5">
              {profile.avoid.map((a) => (
                <button
                  key={a}
                  onClick={() => unavoid(a)}
                  title="Stop avoiding"
                  className="rounded-full border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-[11px] text-red-300 hover:border-red-400/60"
                >
                  {a} ✕
                </button>
              ))}
            </div>
          </div>
        )}

        {profile.notes.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-muted/70">
              What the agents know about you
            </p>
            <ul className="list-inside list-disc space-y-1 text-[12px] text-muted">
              {profile.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}

        {profile.searchHints.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-muted/70">
              Learned search strategy
            </p>
            <ul className="list-inside list-disc space-y-1 text-[12px] text-muted">
              {profile.searchHints.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </div>
        )}

        {profile.hypotheses.some((h) => h.status !== "open") && (
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-muted/70">
              Answered hunches
            </p>
            <ul className="space-y-1 text-[12px] text-muted">
              {profile.hypotheses
                .filter((h) => h.status !== "open")
                .map((h) => (
                  <li key={h.id}>
                    {h.status === "confirmed" ? "✓" : "✗"} {h.text}
                    {h.userReply ? ` — “${h.userReply}”` : ""}
                  </li>
                ))}
            </ul>
          </div>
        )}

        <div className="border-t border-line pt-3">
          <p className="mb-1.5 text-xs uppercase tracking-wide text-muted/70">
            Anthropic API key{" "}
            <span className="normal-case">
              {apiKey ? "(active)" : "(optional)"}
            </span>
          </p>
          <div className="flex gap-1.5">
            <input
              type={showKey ? "text" : "password"}
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onApiKey(keyDraft)}
              placeholder="sk-ant-…"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-md border border-line bg-background/60 px-2 py-1 font-mono text-[11px] outline-none placeholder:text-muted/50 focus:border-accent/60"
            />
            <button
              onClick={() => setShowKey((s) => !s)}
              className="rounded-md border border-line px-2 py-1 text-[12px] text-muted hover:text-foreground"
              title={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? "🙈" : "👁"}
            </button>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <button
              onClick={() => onApiKey(keyDraft)}
              disabled={keyDraft.trim() === apiKey}
              className="rounded-md border border-line px-2 py-1 text-[12px] text-muted transition hover:border-accent/50 hover:text-accent disabled:opacity-40"
            >
              Save key
            </button>
            {apiKey && (
              <button
                onClick={() => {
                  setKeyDraft("");
                  onApiKey("");
                }}
                className="rounded-md border border-line px-2 py-1 text-[12px] text-muted transition hover:border-red-400/50 hover:text-red-400"
              >
                Clear
              </button>
            )}
          </div>
          <p className="mt-1 text-[10px] text-muted/60">
            Runs the agents on your own key instead of heuristics. Kept in this
            browser&apos;s localStorage and sent to this app&apos;s API routes
            with each request — use a scoped key you can revoke, not a shared
            production one.
          </p>
        </div>
      </div>
    </div>
  );
}
