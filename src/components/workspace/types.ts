import type { Artifact, Evaluation, EventRow, Finding, Project, Prompt, Requirement } from "@/lib/db/schema";

/** Workspace payload as the client sees it (dates may arrive as strings after a JSON reload). */
export type WS = {
  project: Project;
  requirements: Requirement[];
  prompts: Prompt[];
  artifacts: Artifact[];
  evaluations: Evaluation[];
  findings: Finding[];
  events: EventRow[];
};

export type Provider = { configured: boolean; model: string };

export type Ctx = {
  ws: WS;
  provider: Provider;
  reload: () => Promise<void>;
  setTab: (t: Tab) => void;
};

export type Tab = "brief" | "prompt" | "outputs" | "compare" | "history";

export const fmtTime = (d: Date | string) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const latestEvaluation = (ws: WS, artifactId: string) => ws.evaluations.find((e) => e.artifactId === artifactId) ?? null;
