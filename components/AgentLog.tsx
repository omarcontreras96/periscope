"use client";

import { useEffect, useRef } from "react";

export type LogLine = { agent: string; message: string };

function agentColor(agent: string): string {
  if (agent === "orchestrator") return "text-amber-400";
  if (agent === "evaluator") return "text-violet-400";
  if (agent.startsWith("search")) return "text-cyan-400";
  return "text-muted";
}

export default function AgentLog({
  lines,
  busy,
}: {
  lines: LogLine[];
  busy: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  return (
    <div className="rounded-xl border border-line bg-card">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-sm font-medium">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            busy ? "animate-pulse bg-accent" : "bg-muted/40"
          }`}
        />
        Agent activity
      </div>
      <div className="max-h-64 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-relaxed">
        {lines.length === 0 && (
          <p className="text-muted/60">Agents idle. Refresh the feed to run the pipeline.</p>
        )}
        {lines.map((l, i) => (
          <p key={i} className="mb-1">
            <span className={agentColor(l.agent)}>[{l.agent}]</span>{" "}
            <span className="text-muted">{l.message}</span>
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
