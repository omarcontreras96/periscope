"use client";

import { useState } from "react";
import type { UserProfile } from "@/lib/types";

const PRESETS = [
  "AI & machine learning",
  "Startups & venture",
  "Climate & energy",
  "Space",
  "Biotech & health",
  "Geopolitics",
  "Chips & hardware",
  "Crypto & fintech",
  "Cybersecurity",
  "Robotics",
  "Science",
  "Sports",
];

export default function Onboarding({
  onStart,
}: {
  onStart: (profile: UserProfile) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");

  const toggle = (t: string) =>
    setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  const addCustom = () => {
    const t = custom.trim();
    if (t && !selected.includes(t)) setSelected((s) => [...s, t]);
    setCustom("");
  };

  const start = () => {
    if (selected.length === 0) return;
    onStart({
      interests: selected.map((topic) => ({ topic, weight: 0.6 })),
      avoid: [],
      notes: [],
      searchHints: [],
      muted: [],
      hypotheses: [],
      version: 1,
    });
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div>
        <div className="mb-3 text-5xl">🔭</div>
        <h1 className="text-3xl font-semibold tracking-tight">Periscope</h1>
        <p className="mt-2 text-muted">
          A newsfeed that learns you. Pick a few starting interests — the
          agents take it from there.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {PRESETS.map((t) => (
          <button
            key={t}
            onClick={() => toggle(t)}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
              selected.includes(t)
                ? "border-accent bg-accent/15 text-accent"
                : "border-line bg-card text-muted hover:border-accent/50 hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
        {selected
          .filter((t) => !PRESETS.includes(t))
          .map((t) => (
            <button
              key={t}
              onClick={() => toggle(t)}
              className="rounded-full border border-accent bg-accent/15 px-4 py-1.5 text-sm text-accent"
            >
              {t} ✕
            </button>
          ))}
      </div>

      <div className="flex w-full max-w-sm gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCustom()}
          placeholder="Add your own topic…"
          className="flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none placeholder:text-muted/60 focus:border-accent/60"
        />
        <button
          onClick={addCustom}
          className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-muted hover:text-foreground"
        >
          Add
        </button>
      </div>

      <button
        onClick={start}
        disabled={selected.length === 0}
        className="rounded-lg bg-accent px-6 py-2.5 font-medium text-background transition enabled:hover:brightness-110 disabled:opacity-40"
      >
        Build my feed →
      </button>

      <p className="text-xs text-muted/70">
        Orchestrator → parallel search agents → evaluator. Your profile lives
        in your browser and improves with every 👍 / 👎.
      </p>
    </div>
  );
}
