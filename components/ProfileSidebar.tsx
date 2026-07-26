"use client";

import type { UserProfile } from "@/lib/types";

export default function ProfileSidebar({
  profile,
  onReset,
}: {
  profile: UserProfile;
  onReset: () => void;
}) {
  const interests = [...profile.interests].sort((a, b) => b.weight - a.weight);

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
            Interests
          </p>
          <div className="space-y-1.5">
            {interests.map((it) => (
              <div key={it.topic}>
                <div className="mb-0.5 flex justify-between text-[12px]">
                  <span>{it.topic}</span>
                  <span className="font-mono text-muted">
                    {(it.weight * 100).toFixed(0)}
                  </span>
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
        </div>

        {profile.avoid.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-muted/70">
              Avoiding
            </p>
            <div className="flex flex-wrap gap-1.5">
              {profile.avoid.map((a) => (
                <span
                  key={a}
                  className="rounded-full border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-[11px] text-red-300"
                >
                  {a}
                </span>
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
      </div>
    </div>
  );
}
