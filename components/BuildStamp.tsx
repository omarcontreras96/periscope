"use client";

const ISO = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";
const SHA = process.env.NEXT_PUBLIC_COMMIT_SHA ?? "";

/**
 * When this build was made (and which commit, on Vercel). Rendered client-side
 * only — the timestamp is a build-time constant but the locale formatting is
 * the viewer's, so formatting it on the server would risk a hydration mismatch.
 */
export default function BuildStamp({ className = "" }: { className?: string }) {
  if (!ISO) return null;
  const d = new Date(ISO);
  if (Number.isNaN(d.getTime())) return null;

  const stamp = d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <span className={className} title={ISO}>
      Updated {stamp}
      {SHA ? ` · ${SHA}` : ""}
    </span>
  );
}
