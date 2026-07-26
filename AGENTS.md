<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Periscope — self-improving newsfeed (SundAI SF hack, Jul 26 2026)

## What this is

A one-day hackathon project by **Omar** (@omarcontreras96) and **James** (@128k):
a newsfeed that scrapes the web, learns what the user likes from 👍/👎 feedback,
and rewrites its own search strategy. Publicly deployed on Vercel.

**Demo flow:** pick interests → orchestrator plans searches → parallel search
agents fetch + LLM-rank articles → user reacts (👍/👎/clicks) → evaluator agent
rewrites the preference profile ("what I learned") → feed refreshes visibly
better. The agent-activity panel makes the multi-agent pipeline visible on
stage.

## Architecture

```
Browser (profile in localStorage)
   │  POST /api/feed {profile}                 POST /api/evaluate {profile, feedback}
   ▼                                              ▼
Orchestrator agent                            Evaluator agent
   • reads profile (interests/avoid/hints)       • reads feedback events
   • LLM → search plan (4 queries,               • LLM → rewritten profile:
     one "exploration" pick)                       weights, avoid-list, notes,
   • fans out search agents in parallel            searchHints, version+1
   • merges/dedupes, round-robin by topic        • returns "learned" bullets
   ▼
Search agents (one per planned topic)
   • fetch Google News RSS + Hacker News (Algolia) — no API keys
   • LLM ranks candidates against the profile → top 6 with per-article "reason"
```

The **self-improvement loop**: evaluator output (weights, `avoid`, `notes`,
`searchHints`) is fed back into the orchestrator's planning prompt and the
search agents' ranking prompts on every run. The profile is the shared memory.

- **State:** the whole profile lives in the browser's localStorage and is sent
  with each request. No database — deliberate hackathon tradeoff. The server is
  stateless.
- **LLM calls:** Vercel AI Gateway via the AI SDK (`lib/ai.ts`), model string
  `anthropic/claude-opus-4-8` (override with env `AI_MODEL`). On Vercel this
  authenticates automatically via OIDC — **no API key needed in prod**. All
  LLM output is requested as JSON and parsed defensively (`extractJSON`).
- **Degraded mode:** every agent has a heuristic fallback if the LLM call
  fails (no gateway credits, local dev without keys). The UI shows an amber
  banner. The demo never hard-fails.
- **Streaming:** `/api/feed` streams newline-delimited JSON `AgentEvent`s so
  the UI can show live agent activity while the pipeline runs.

## File map

| Path | What it is |
|---|---|
| `lib/types.ts` | All shared types (`UserProfile`, `Article`, `AgentEvent`…) — start here |
| `lib/ai.ts` | AI Gateway wrapper: `askJSON()` + `aiConfigured()` |
| `lib/sources.ts` | News source adapters (Google News RSS, HN Algolia) + dedupe |
| `lib/agents/orchestrator.ts` | Plans searches, fans out, merges |
| `lib/agents/search.ts` | Per-topic fetch + LLM ranking |
| `lib/agents/evaluator.ts` | Feedback → updated profile + "learned" summary |
| `app/api/feed/route.ts` | NDJSON streaming endpoint running the pipeline |
| `app/api/evaluate/route.ts` | Evaluator endpoint |
| `app/page.tsx` | Entire client app (state, streaming reader, feedback queue) |
| `components/*` | Onboarding, ArticleCard, AgentLog, ProfileSidebar |
| `docs/INTEGRATIONS.md` | maritime.sh + autolab assessment (hackathon requirement) |

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

Local LLM calls need `AI_GATEWAY_API_KEY` in `.env.local` (create one at
vercel.com → AI Gateway). Without it the app still runs in heuristic mode.
`npm run build` must pass before pushing — CI is just Vercel's build.

## Deploying

Production is on Vercel (team `omarcc96-projects`, project `periscope`). Zero
env vars required — AI Gateway auth is via OIDC. Deploy with `vercel --prod`
(after `vercel login` + `vercel link`), or connect this GitHub repo in the
Vercel dashboard for deploy-on-push.

## Conventions & gotchas

- TypeScript strict; Tailwind v4 (theme tokens in `app/globals.css` via
  `@theme inline` — use `bg-card`, `border-line`, `text-muted`, `text-accent`).
- Agents must never throw to the client: catch, set `ctx.aiOk = false`, fall
  back to heuristics.
- LLM prompts live inline in the agent files on purpose (fast iteration).
  Keep the "return JSON only" contract and sanitize anything that touches the
  profile (`sanitizeProfile` in `evaluator.ts`).
- Google News titles carry a trailing " - Outlet" that `lib/sources.ts` strips;
  its RSS `link` values redirect via news.google.com — fine for the demo.
- `useEffect` deps in `app/page.tsx` are intentionally narrow to avoid feed
  reload loops — mind the eslint-disable comments.

## Ideas / open work (pick up freely)

- Persist profiles server-side (Upstash Redis via Vercel Marketplace) so the
  feed survives across devices; keyed by a share code.
- Scheduled background refresh (Vercel cron → maritime.sh agent, see
  `docs/INTEGRATIONS.md`).
- Track "shown but ignored" as implicit negative feedback.
- Per-article chat ("why did you pick this?") reusing the profile context.
- A/B evaluator prompts via autolab (see `docs/INTEGRATIONS.md`).
