// Shared types for the Periscope multi-agent pipeline.

export type Interest = {
  topic: string;
  /** 0..1 — how much the user cares about this topic right now. */
  weight: number;
};

export type UserProfile = {
  interests: Interest[];
  /** Topics/angles the user has signalled they don't want. */
  avoid: string[];
  /** Freeform learned preferences ("prefers technical depth over funding news"). */
  notes: string[];
  /** Learned query-crafting advice the search agents should apply. */
  searchHints: string[];
  /** Bumped by the evaluator on every update. */
  version: number;
};

export type FeedbackAction = "like" | "dislike" | "more" | "less" | "click";

export type FeedbackEvent = {
  articleId: string;
  title: string;
  topic: string;
  source: string;
  action: FeedbackAction;
  at: string; // ISO timestamp
};

export type Article = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string; // ISO timestamp
  topic: string;
  /** 0..100 relevance score assigned by the search agent. */
  score: number;
  /** Why this article was picked for this user. */
  reason: string;
};

export type SearchPlanItem = {
  topic: string;
  query: string;
  rationale: string;
  /** True when the orchestrator picked this to explore beyond known interests. */
  exploration?: boolean;
};

/** Events streamed from /api/feed while the pipeline runs. */
export type AgentEvent =
  | { type: "status"; agent: string; message: string }
  | { type: "plan"; queries: SearchPlanItem[] }
  | { type: "articles"; topic: string; count: number }
  | { type: "feed"; articles: Article[]; degraded: boolean }
  | { type: "error"; message: string };

export type EvaluateResponse = {
  profile: UserProfile;
  /** Human-readable summary of what the evaluator learned. */
  learned: string[];
  degraded: boolean;
};

/** Mutable context threaded through a single pipeline run. */
export type RunContext = {
  /** Set to false when any AI call fails and we fall back to heuristics. */
  aiOk: boolean;
};
