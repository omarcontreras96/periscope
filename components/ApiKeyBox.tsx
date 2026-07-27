"use client";

import { useState } from "react";

/**
 * Bring-your-own-key input. Without a key the agents run on heuristics, so this
 * needs to be reachable from the first screen — it renders as a collapsible pill
 * in the header ("header") and as an always-open block on onboarding ("panel").
 *
 * The key is never part of UserProfile: the profile is serialized into agent
 * prompts, and a key stored there would be sent to the model on every call.
 */
export default function ApiKeyBox({
  value,
  onSave,
  variant = "panel",
}: {
  value: string;
  onSave: (k: string) => void;
  variant?: "header" | "panel";
}) {
  const [draft, setDraft] = useState(value);
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);

  const save = () => {
    onSave(draft);
    if (variant === "header") setOpen(false);
  };

  const form = (
    <>
      <div className="flex gap-1.5">
        <input
          type={show ? "text" : "password"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="sk-ant-…"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-line bg-background/60 px-2 py-1.5 font-mono text-[11px] outline-none placeholder:text-muted/50 focus:border-accent/60"
        />
        <button
          onClick={() => setShow((s) => !s)}
          className="rounded-md border border-line px-2 py-1 text-[12px] text-muted hover:text-foreground"
          title={show ? "Hide key" : "Show key"}
        >
          {show ? "🙈" : "👁"}
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <button
          onClick={save}
          disabled={draft.trim() === value}
          className="rounded-md border border-line px-2 py-1 text-[12px] text-muted transition hover:border-accent/50 hover:text-accent disabled:opacity-40"
        >
          Save key
        </button>
        {value && (
          <button
            onClick={() => {
              setDraft("");
              onSave("");
            }}
            className="rounded-md border border-line px-2 py-1 text-[12px] text-muted transition hover:border-red-400/50 hover:text-red-400"
          >
            Clear
          </button>
        )}
      </div>
      <p className="mt-1.5 text-left text-[10px] leading-relaxed text-muted/60">
        Optional. Runs the agents on your own key instead of heuristics. Kept in
        this browser&apos;s localStorage and sent to this app&apos;s API routes
        with each request — use a scoped key you can revoke.
      </p>
    </>
  );

  if (variant === "panel") {
    return (
      <div className="w-full rounded-xl border border-line bg-card px-4 py-3">
        <p className="mb-1.5 text-left text-xs uppercase tracking-wide text-muted/70">
          Anthropic API key {value ? "· active" : ""}
        </p>
        {form}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`rounded-lg border px-3 py-1.5 text-sm transition ${
          value
            ? "border-emerald-500/50 text-emerald-300"
            : "border-line text-muted hover:text-foreground"
        }`}
      >
        {value ? "🔑 Key active" : "🔑 Add API key"}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-72 rounded-lg border border-line bg-card p-3 shadow-lg">
          {form}
        </div>
      )}
    </div>
  );
}
