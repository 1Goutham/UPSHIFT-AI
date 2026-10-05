import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/* ------------------------------------------------------------------ */
/*  Accounts                                                           */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    /** Anonymous visitor running a free audit; upgraded in place on sign-up. */
    isGuest: boolean("is_guest").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/** The cookie carries a random token; only its SHA-256 is stored here. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/*  Projects and the brief                                             */
/* ------------------------------------------------------------------ */

export type Brief = {
  taskType?: string;
  audience?: string;
  objective?: string;
  visualDirection?: string;
  technicalConstraints?: string;
  exclusions?: string;
  summary?: string;
  ambiguities?: { issue: string; why: string }[];
  questions?: { id: string; question: string; why: string; answer?: string }[];
  assumptions?: string[];
  /** How the brief was produced: "model" (with model id) or "deterministic". */
  method?: string;
  generatedAt?: string;
};

export const projects = pgTable(
  "projects",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    goal: text("goal").notNull().default(""),
    /** website | app | design | image | document | code | text */
    contentType: text("content_type").notNull().default("website"),
    /** Free text: the AI tool the user intends to run the prompt in. */
    targetTool: text("target_tool").notNull().default(""),
    brief: jsonb("brief").$type<Brief>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_user_idx").on(t.userId, t.updatedAt)],
);

export const requirements = pgTable(
  "requirements",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** objective | audience | content | functionality | visual | responsive | accessibility | performance | technical | exclusion | other */
    category: text("category").notNull().default("other"),
    text: text("text").notNull(),
    acceptance: text("acceptance").notNull().default(""),
    /** must | should | could */
    priority: text("priority").notNull().default("should"),
    /** explicit (user said it) | inferred | assumption | baseline */
    origin: text("origin").notNull().default("explicit"),
    /** proposed | confirmed | rejected */
    status: text("status").notNull().default("confirmed"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("requirements_project_idx").on(t.projectId, t.position)],
);

/* ------------------------------------------------------------------ */
/*  Prompts                                                            */
/* ------------------------------------------------------------------ */

export type PromptWeakness = {
  id: string;
  label: string;
  detail: string;
  severity: "high" | "medium" | "low";
  excerpt?: string;
  source: "deterministic" | "model";
};

export type PromptAnalysis = {
  weaknesses?: PromptWeakness[];
  changes?: { change: string; reason: string }[];
  preserved?: string[];
  assumptions?: string[];
  toolNotes?: string[];
  instruction?: string;
  /** Issue ids a correction prompt was built from. */
  findingIds?: string[];
  /** Their check keys, to match them in the next version's audit. */
  checkKeys?: string[];
  /** Version the correction was built from. */
  sourceVersion?: number;
  /** Separate messages when the fixes were split into batches. */
  parts?: string[];
};

export const prompts = pgTable(
  "prompts",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    /** original | optimized | refined | correction */
    kind: text("kind").notNull(),
    targetTool: text("target_tool").notNull().default(""),
    content: text("content").notNull(),
    concise: text("concise"),
    detailed: text("detailed"),
    analysis: jsonb("analysis").$type<PromptAnalysis>().notNull().default({}),
    /** model | deterministic | user */
    method: text("method").notNull().default("user"),
    model: text("model"),
    createdAt: createdAt(),
  },
  (t) => [index("prompts_project_idx").on(t.projectId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/*  Artefacts (successive versions of the output) and evaluations      */
/* ------------------------------------------------------------------ */

export type ArtifactMeta = {
  width?: number;
  height?: number;
  format?: string;
  finalUrl?: string;
  httpStatus?: number;
  contentType?: string;
  fileName?: string;
  pageTitle?: string;
  fetchError?: string;
  lines?: number;
  language?: string;
};

export const artifacts = pgTable(
  "artifacts",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    /** image | url | text | code */
    kind: text("kind").notNull(),
    label: text("label").notNull().default(""),
    note: text("note").notNull().default(""),
    sourceUrl: text("source_url"),
    storageKey: text("storage_key"),
    mime: text("mime"),
    sizeBytes: integer("size_bytes"),
    textContent: text("text_content"),
    meta: jsonb("meta").$type<ArtifactMeta>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("artifacts_project_version_idx").on(t.projectId, t.version)],
);

export type EvaluationSummary = {
  counts?: Record<string, number>;
  requirementCoverage?: {
    total: number;
    verifiedPass: number;
    likelyPass: number;
    failing: number;
    untested: number;
  };
  methods?: { id: string; label: string; ran: boolean; note?: string }[];
  limitations?: string[];
  screenshots?: { name: string; width: number; key: string }[];
  /** Model used for model-backed parts, if any. */
  model?: string;
  /** Outcome of the fix prompt that preceded this version, if any. */
  fixTracking?: { correctionId: string; fromVersion: number; attempted: number; resolved: number; stillFailing: number; tool: string };
  /** Extra pages checked during a crawl. */
  pages?: { url: string; status: number }[];
};

export const evaluations = pgTable(
  "evaluations",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    /** running | complete | failed */
    status: text("status").notNull().default("running"),
    error: text("error"),
    summary: jsonb("summary").$type<EvaluationSummary>().notNull().default({}),
    /** Requirements exactly as they were when the evaluation ran. */
    requirementSnapshot: jsonb("requirement_snapshot")
      .$type<{ id: string; text: string; priority: string; category: string; acceptance: string }[]>()
      .notNull()
      .default([]),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("evaluations_artifact_idx").on(t.artifactId, t.createdAt)],
);

export const findings = pgTable(
  "findings",
  {
    id: id(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    /** Stable key used to line findings up across versions: req:<id> or check:<name>. */
    checkKey: text("check_key").notNull(),
    requirementId: uuid("requirement_id"),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    /** verified_pass | verified_fail | likely_pass | likely_issue | subjective | not_tested | unable_to_verify */
    status: text("status").notNull(),
    /** critical | high | medium | low | info */
    severity: text("severity").notNull().default("info"),
    evidence: text("evidence").notNull().default(""),
    recommendation: text("recommendation").notNull().default(""),
    verification: text("verification").notNull().default(""),
    /** deterministic | browser | model */
    method: text("method").notNull(),
    category: text("category").notNull().default("other"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("findings_evaluation_idx").on(t.evaluationId, t.position)],
);

/** Images the user supplies as the target look (mockups, inspiration, brand). Not output versions. */
export const referenceImages = pgTable(
  "reference_images",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    label: text("label").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("reference_images_project_idx").on(t.projectId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/*  History, usage and memory                                          */
/* ------------------------------------------------------------------ */

export const events = pgTable(
  "events",
  {
    id: id(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("events_project_idx").on(t.projectId, t.createdAt)],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    operation: text("operation").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
    durationMs: integer("duration_ms").notNull().default(0),
    ok: boolean("ok").notNull().default(true),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_user_idx").on(t.userId, t.createdAt)],
);

/** Read-only public report links. Only a SHA-256 of the token is stored. */
export const shares = pgTable(
  "shares",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("shares_token_idx").on(t.tokenHash), index("shares_project_idx").on(t.projectId)],
);

/** Re-audit webhooks (call after each deploy). Only a SHA-256 of the token is stored. */
export const hooks = pgTable(
  "hooks",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("hooks_token_idx").on(t.tokenHash), index("hooks_project_idx").on(t.projectId)],
);

/** Browser-extension access tokens. Only a SHA-256 is stored; shown once at creation. */
export const extTokens = pgTable(
  "ext_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    label: text("label").notNull().default("Browser extension"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ext_tokens_hash_idx").on(t.tokenHash), index("ext_tokens_user_idx").on(t.userId)],
);

/** Prompt refinements, stored only when the user opts in to history. */
export const refinements = pgTable(
  "refinements",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** chatgpt | gemini | grok | claude | other */
    platform: text("platform").notNull(),
    /** quick | deep | expert */
    mode: text("mode").notNull(),
    /** extension | web */
    source: text("source").notNull().default("web"),
    original: text("original").notNull(),
    refined: text("refined").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
    model: text("model"),
    createdAt: createdAt(),
  },
  (t) => [index("refinements_user_idx").on(t.userId, t.createdAt)],
);

/** Sliding-window rate limit hits, shared across server instances. */
export const rateHits = pgTable(
  "rate_hits",
  {
    id: id(),
    key: text("key").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rate_hits_key_at_idx").on(t.key, t.at)],
);

/** User-controlled memory. Nothing is written here without an explicit user action. */
export const memories = pgTable(
  "memories",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** preference | tool | pattern | context */
    kind: text("kind").notNull(),
    content: text("content").notNull(),
    /** Where it came from, e.g. "Saved from project X". */
    source: text("source").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("memories_user_idx").on(t.userId)],
);

/** A reusable requirement set + prompt skeleton saved from a project. */
export const playbooks = pgTable(
  "playbooks",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    contentType: text("content_type").notNull().default("website"),
    targetTool: text("target_tool").notNull().default(""),
    requirements: jsonb("requirements")
      .$type<{ category: string; text: string; acceptance: string; priority: string }[]>()
      .notNull()
      .default([]),
    promptTemplate: text("prompt_template").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("playbooks_user_idx").on(t.userId)],
);

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Requirement = typeof requirements.$inferSelect;
export type Prompt = typeof prompts.$inferSelect;
export type Artifact = typeof artifacts.$inferSelect;
export type Evaluation = typeof evaluations.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type Memory = typeof memories.$inferSelect;
export type Playbook = typeof playbooks.$inferSelect;
export type ReferenceImage = typeof referenceImages.$inferSelect;
