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

**What it would take — concrete (researched from their quickstart):**

```bash
npm install -g maritime-cli && maritime login
# package lib/agents/* + lib/sources.ts as a small worker with a Dockerfile
maritime create periscope-refresher --repo https://github.com/omarcontreras96/periscope
maritime env set periscope-refresher AI_GATEWAY_API_KEY=...   # secrets encrypted by default
maritime deploy periscope-refresher                            # cron/webhook/API triggers
maritime sleep periscope-refresher                             # pause billing when idle
```

Steps: (1) Maritime account + wallet; (2) a `worker/` entry that loops stored
profiles → `runOrchestrator` → writes ranked feeds to a cache (needs Upstash/
Vercel KV, since the app is currently stateless); (3) cron trigger hourly;
(4) the Next.js feed route reads cache-first. Est. ~2–3h.
**How it improves the build:** instant feed loads (no 15–30s pipeline wait),
the feed refreshes while the tab is closed ("self-improving even when you're
away"), and their OpenClaw-Browser template adds Playwright scraping for
JS-rendered pages our RSS adapters can't read. Blocked on: account/wallet.

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

**What it would take — concrete (researched from their quickstart):**

```bash
curl -fsSL https://app.autolab.ai/install.sh | sh && autolab login
# write eval/replay.ts: replays logged (profile, feedback, feed) sessions and
# prints how well the evaluator's updated profile predicts held-out likes
autolab init -y --name "periscope-evaluator" \
  --objective "maximize held-out like precision" --run "npx tsx eval/replay.ts"
autolab serve --project you/periscope-evaluator   # any laptop as execution node
autolab start
autolab submit --nocode -m "penalize churnalism harder in the rank prompt"
```

Steps: (1) account + CLI; (2) log anonymized session triples (a ~20-line
addition to the two API routes) — **prerequisite: real usage data, currently
zero**; (3) the replay scorer (~1–2h); (4) submit idea-experiments and let
autolab's agent edit `lib/agents/evaluator.ts` prompts and measure.
**How it improves the build:** turns evaluator-prompt tweaking from vibes into
measured experiments — the outer self-improvement loop (today the system
improves the *profile*; autolab improves the *learner*). Blocked on: account +
logged sessions.

## Bottom line

- **Demo (today):** Vercel-only — fastest path to a public, working loop.
- **maritime.sh (next):** move the pipeline into scheduled, memory-bearing
  agents; app becomes a thin reader.
- **autolab (after data exists):** close the outer loop — measure and evolve
  the evaluator itself, so the system self-improves at the *strategy* level,
  not just the *profile* level.
