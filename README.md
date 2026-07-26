# 🔭 Periscope — a newsfeed that learns you

Self-improving, multi-agent newsfeed built in one day at the SundAI SF hack
(Jul 26, 2026) by Omar ([@omarcontreras96](https://github.com/omarcontreras96))
and James ([@128k](https://github.com/128k)).

**The loop:** an **orchestrator agent** reads your preference profile and plans
what to search (including one deliberate "exploration" pick) → parallel
**search agents** pull candidates from Google News RSS + Hacker News and
LLM-rank them against your profile, each pick annotated with *why you're seeing
it* → you react with 👍/👎/clicks → the **evaluator agent** rewrites your
profile: interest weights, an avoid-list, durable preference notes, and
concrete search hints the other agents apply on the next run. The feed visibly
gets better while you watch — the agent-activity panel shows the pipeline live.

## Quickstart

```bash
npm install
npm run dev        # → http://localhost:3000
```

No database, no required API keys:

- **News sources** are keyless (Google News RSS, HN Algolia).
- **LLM calls** go through the Vercel AI Gateway (`anthropic/claude-opus-4-8`).
  On Vercel this authenticates automatically (OIDC). Locally, copy
  `.env.example` → `.env.local` and set `AI_GATEWAY_API_KEY`.
- Without gateway access everything still works in **heuristic mode**
  (recency/keyword ranking, rule-based learning) — the UI shows a banner.

## Architecture

See [AGENTS.md](AGENTS.md) for the full architecture, file map, and
conventions (that file is also the context brief for Claude Code / coding
agents — `CLAUDE.md` points at it).

```
profile (localStorage) ──▶ orchestrator ──▶ search agents ×4 ──▶ ranked feed
        ▲                                                             │
        └────────────── evaluator ◀────────── 👍/👎/click feedback ◀──┘
```

## maritime.sh & autolab

Assessed as part of the hack — where they fit and why they're not in the demo
path: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md). Short version:
**maritime.sh** is where the agents should *run* next (scheduled, memory-
bearing, wake-on-trigger containers); **autolab** is how the agents should
*improve* next (offline experiments A/B-testing evaluator prompts against
replayed feedback sessions).

## Deploy

Vercel, zero config: `vercel --prod`, or import the repo in the Vercel
dashboard for deploy-on-push. No env vars required in production.
