import type { NextConfig } from "next";

// Evaluated at build time, inlined into the client bundle. Lets the running app
// state which build it is, so "is my change actually deployed?" is answerable
// from the page itself rather than by diffing bundles.
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    NEXT_PUBLIC_COMMIT_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
  },
};

export default nextConfig;
