"use client";

import { useState } from "react";
import type { Hypothesis } from "@/lib/types";

/**
 * The evaluator's open hunches, surfaced for the user to confirm or reject.
 * Rejecting asks a follow-up ("then what?") — the reply is stored on the
 * hypothesis as ground truth for the orchestrator/evaluator. Note: status is
 * only written on Save/Skip, never on the first "Not really" click — the row
 * must stay mounted while the user types.
 */
export default function HypothesisCard({
  hypotheses,
  onAnswer,
}: {
  hypotheses: Hypothesis[];
  onAnswer: (
    id: string,
    status: "confirmed" | "rejected",
    userReply?: string,
  ) => void;
}) {
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const open = hypotheses.filter((h) => h.status === "open");
  if (open.length === 0) return null;

  const reject = (id: string, text?: string) => {
    onAnswer(id, "rejected", text?.trim() ? text.trim().slice(0, 280) : undefined);
    setReplyFor(null);
    setReply("");
  };

  return (
    <div className="mb-4 rounded-lg border border-violet-400/40 bg-violet-400/10 px-4 py-3 text-sm">
      <p className="mb-2 font-medium text-violet-300">
        🔮 The evaluator has a hunch — is it right?
      </p>
      <div className="space-y-2">
        {open.map((h) => (
          <div key={h.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-violet-100/90">{h.text}</span>
              <span className="ml-auto flex gap-1.5">
                <button
                  onClick={() => onAnswer(h.id, "confirmed")}
                  className="rounded-md border border-violet-400/50 px-2 py-0.5 text-[12px] text-violet-200 transition hover:bg-violet-400/20"
                >
                  ✓ Spot on
                </button>
                <button
                  onClick={() => {
                    setReplyFor((r) => (r === h.id ? null : h.id));
                    setReply("");
                  }}
                  className={`rounded-md border px-2 py-0.5 text-[12px] transition ${
                    replyFor === h.id
                      ? "border-red-400/60 text-red-300"
                      : "border-line text-muted hover:border-red-400/50 hover:text-red-300"
                  }`}
                >
                  ✗ Not really
                </button>
              </span>
            </div>
            {replyFor === h.id && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-background/50 p-2">
                <input
                  autoFocus
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && reject(h.id, reply)}
                  maxLength={280}
                  placeholder="Then what's actually going on? (e.g. “I like match analysis, not transfer gossip”)"
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted/50"
                />
                <button
                  onClick={() => reject(h.id, reply)}
                  disabled={!reply.trim()}
                  className="rounded-md bg-violet-500 px-2.5 py-1 text-[12px] font-medium text-white transition enabled:hover:brightness-110 disabled:opacity-40"
                >
                  Teach it
                </button>
                <button
                  onClick={() => reject(h.id)}
                  className="rounded-md border border-line px-2 py-1 text-[12px] text-muted hover:text-foreground"
                >
                  Skip
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-violet-200/60">
        Answers feed the next search plan directly.
      </p>
    </div>
  );
}
