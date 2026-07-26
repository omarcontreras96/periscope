# maritime.sh & autolab — assessment

Hackathon requirement: review both platforms' docs and assess how they fit
Periscope. Summary: **neither belongs in the demo's critical path**, but both
map cleanly onto the two halves of "self-improving" — *running* the agents
(maritime) and *improving* the agents (autolab).

## maritime.sh — where the agents should live

**What it is** ([docs](https://maritime.sh/docs)): "the cloud built for AI
agents" — serverless containers with identity, memory, and triggers that sleep
when idle and wake on the next message. REST API + CLI + dashboard; supports
agent frameworks (OpenClaw, Hermes, ZeroClaw) and browser automation.

**Fit for Periscope:** our agents currently run inside Vercel request/response
cycles, which caps them at request-scoped lifetimes: no background work, no
agent-side memory, everything re-planned per request. Maritime is the natural
next step for exactly those gaps:

1. **Scheduled refresh agent** — a maritime agent that wakes on a timer (or
   webhook), runs the orchestrator pipeline for each stored profile, and caches
   the ranked feed. The web app then just reads the cache → instant loads.
2. **Persistent evaluator memory** — maritime agents have identity + memory, so
   the evaluator could accumulate long-horizon observations across sessions
   instead of being limited to the profile JSON we pass around.
3. **Browser automation for scraping** — maritime's browser capability would
   let search agents read paywalled-preview/JS-rendered pages instead of RSS
   only.

**Integration sketch:** extract `lib/agents/*` + `lib/sources.ts` (already
UI-independent, pure TS) into a small worker, deploy with `maritime create`,
trigger via maritime's scheduler, and have it POST results to a cache the
Next.js app reads. Est. effort: ~2–3h. Skipped in the demo window because it
requires an account/wallet and adds a second deploy target.

## autolab — how the agents should improve

**What it is** ([docs](https://docs.autolab.ai)): autonomous research from the
terminal — an LLM agent proposes hypotheses, writes code, schedules experiment
jobs on your own execution nodes, and analyzes results. Projects behave like
git repos; experiments are commits. Integrates with Claude Code via
`autolab install`.

**Fit for Periscope:** the evaluator *is* a hypothesis machine ("this user
prefers technical depth"), but we currently never measure whether its profile
updates actually improve the feed. Autolab is the offline experimentation loop
for that:

1. **Evaluator prompt A/B** — treat each evaluator prompt variant as an
   experiment; replay recorded feedback sessions and score how well the updated
   profile predicts held-out likes/dislikes.
2. **Ranking strategy search** — let autolab's agent propose variations
   (candidate-pool size, exploration ratio, scoring rubric), run them against
   logged sessions on an execution node, and report which lifts precision.
3. **Regression harness** — before shipping a prompt change, `autolab start`
   a replay suite so "did we make the feed dumber?" has a number attached.

**Integration sketch:** log anonymized (profile, feedback, feed) triples to a
JSONL file, `autolab init` a project with a replay-scoring script, and let the
autolab agent iterate on `lib/agents/evaluator.ts` prompts. Est. effort: ~2h
for the harness. Skipped in the demo window because it needs logged sessions
to be useful — a natural post-demo step once real feedback exists.

## Bottom line

- **Demo (today):** Vercel-only — fastest path to a public, working loop.
- **maritime.sh (next):** move the pipeline into scheduled, memory-bearing
  agents; app becomes a thin reader.
- **autolab (after data exists):** close the outer loop — measure and evolve
  the evaluator itself, so the system self-improves at the *strategy* level,
  not just the *profile* level.
