"use client";

import { useState } from "react";
import type { ProbeReceipt } from "@/lib/types";

const VERDICT: Record<
  ProbeReceipt["verdict"],
  { label: string; cls: string }
> = {
  pass: { label: "PASS", cls: "border-emerald-500/40 text-emerald-300" },
  leak: { label: "LEAK", cls: "border-red-500/40 text-red-300" },
  "over-removal": {
    label: "OVER-REMOVAL",
    cls: "border-amber-400/40 text-amber-300",
  },
  "no-data": { label: "NO DATA", cls: "border-line text-muted" },
  error: { label: "ERROR", cls: "border-red-500/40 text-red-300" },
};

/**
 * Receipts from the prober — one card per probe, showing what it tried and what
 * it found. Deliberately shows counts and real titles rather than a summary
 * verdict, so "it improved things" is checkable rather than asserted.
 */
export default function SelfTestPanel({
  receipts,
  running,
  status,
  onRun,
  onClear,
  onApply,
}: {
  receipts: ProbeReceipt[];
  running: boolean;
  status: string | null;
  onRun: () => void;
  onClear: () => void;
  onApply: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const counts = receipts.reduce<Record<string, number>>((acc, r) => {
    acc[r.verdict] = (acc[r.verdict] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="rounded-xl border border-line bg-card">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <button
          onClick={() => setOpen((o) => !o)}
          className="mr-auto flex items-center gap-1.5 text-sm font-medium"
        >
          <span className="text-muted">{open ? "▾" : "▸"}</span>
          Prober
          {receipts.length > 0 && (
            <span className="font-mono text-xs text-muted">
              {counts.pass ?? 0}✓ {(counts.leak ?? 0) + (counts["over-removal"] ?? 0)}✗
            </span>
          )}
        </button>
        {receipts.length > 0 && (
          <button
            onClick={onClear}
            className="text-xs text-muted transition hover:text-red-400"
          >
            Clear
          </button>
        )}
        <button
          onClick={onRun}
          disabled={running}
          className="rounded-lg border border-violet-500/50 px-2.5 py-1 text-xs text-violet-300 transition hover:bg-violet-500/10 disabled:opacity-40"
        >
          {running ? "Testing…" : "Run self-test"}
        </button>
      </div>

      {open && (
        <div className="space-y-3 px-4 py-3">
          <p className="text-[11px] leading-relaxed text-muted/70">
            Picks its own topics and mute phrases, runs them through the live
            removal stage, and grades the result against an independent oracle.
            Leaks mean the filter missed something it should have removed.
          </p>

          {status && (
            <p className="font-mono text-[11px] text-violet-300/80">{status}</p>
          )}

          {receipts.length === 0 && !running && (
            <p className="text-[12px] text-muted">
              No receipts yet — run a self-test.
            </p>
          )}

          {receipts.map((r) => {
            const v = VERDICT[r.verdict];
            return (
              <div
                key={r.id}
                className="rounded-lg border border-line bg-background/40 p-2.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${v.cls}`}
                  >
                    {v.label}
                  </span>
                  <span className="truncate text-[12px]">
                    mute “{r.phrase}” on {r.topic}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-muted/60">
                    {new Date(r.at).toLocaleTimeString()}
                  </span>
                </div>

                {r.rationale && (
                  <p className="mt-1 text-[11px] italic text-muted/70">
                    {r.rationale}
                  </p>
                )}

                <p className="mt-1.5 font-mono text-[10px] text-muted">
                  {r.candidates} candidates · {r.removedMuted} muted ·{" "}
                  {r.removedPaywall} paywalled · {r.survived} kept
                </p>

                {r.leaks.length > 0 && (
                  <div className="mt-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-red-300/80">
                      Leaked past the filter
                    </p>
                    <ul className="mt-0.5 space-y-0.5 text-[11px] text-muted">
                      {r.leaks.map((t) => (
                        <li key={t} className="truncate">
                          · {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {r.falsePositives.length > 0 && (
                  <div className="mt-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-amber-300/80">
                      Removed but shouldn&apos;t have been
                    </p>
                    <ul className="mt-0.5 space-y-0.5 text-[11px] text-muted">
                      {r.falsePositives.map((t) => (
                        <li key={t} className="truncate">
                          · {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {r.error && (
                  <p className="mt-1.5 text-[11px] text-red-300/80">
                    {r.error}
                  </p>
                )}

                {r.proposals.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {r.proposals.map((p) => (
                      <div
                        key={`${p.kind}:${p.value}`}
                        className="flex items-start gap-1.5"
                      >
                        <span className="text-[11px] text-muted">
                          <span className="font-mono text-[10px] text-violet-300/80">
                            {p.kind}
                          </span>{" "}
                          <span className="font-mono">{p.value}</span> —{" "}
                          {p.reason}
                        </span>
                        {p.kind === "add-muted" && (
                          <button
                            onClick={() => onApply(p.value)}
                            className="ml-auto shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted hover:border-accent/50 hover:text-accent"
                          >
                            Apply
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
