"use client";

import type { Hypothesis } from "@/lib/types";

/**
 * The evaluator's open hunches, surfaced for the user to confirm or reject.
 * Answers are written straight into the profile and picked up by the
 * orchestrator/search agents on the next run.
 */
export default function HypothesisCard({
  hypotheses,
  onAnswer,
}: {
  hypotheses: Hypothesis[];
  onAnswer: (id: string, status: "confirmed" | "rejected") => void;
}) {
  const open = hypotheses.filter((h) => h.status === "open");
  if (open.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-violet-400/40 bg-violet-400/10 px-4 py-3 text-sm">
      <p className="mb-2 font-medium text-violet-300">
        🔮 The evaluator has a hunch — is it right?
      </p>
      <div className="space-y-2">
        {open.map((h) => (
          <div key={h.id} className="flex flex-wrap items-center gap-2">
            <span className="text-violet-100/90">{h.text}</span>
            <span className="ml-auto flex gap-1.5">
              <button
                onClick={() => onAnswer(h.id, "confirmed")}
                className="rounded-md border border-violet-400/50 px-2 py-0.5 text-[12px] text-violet-200 transition hover:bg-violet-400/20"
              >
                ✓ Spot on
              </button>
              <button
                onClick={() => onAnswer(h.id, "rejected")}
                className="rounded-md border border-line px-2 py-0.5 text-[12px] text-muted transition hover:border-red-400/50 hover:text-red-300"
              >
                ✗ Not really
              </button>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-violet-200/60">
        Answers feed the next search plan directly.
      </p>
    </div>
  );
}
