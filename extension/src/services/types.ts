import type { Mode, PlatformId } from "../../../src/lib/refine/platforms";

export type Settings = {
  serverUrl: string;
  token: string;
  /** Show the gap count on the button while typing (analysis runs locally). */
  liveHints: boolean;
  /** Ask the server to keep refinements in the user's history. */
  saveHistory: boolean;
  /** Hostnames where UPSHIFT stays hidden. */
  disabledHosts: string[];
  mode: Mode;
};

/** The server's refine response, as the extension uses it. Validated in background before use. */
export type RefineResult = {
  id: string | null;
  refined: string;
  model: string;
  analysis: {
    intent: string;
    taskType: string;
    strengths: string[];
    ambiguities: { phrase: string; why: string }[];
    missingContext: { item: string; why: string }[];
    assumptions: string[];
  };
  changes: { change: string; reason: string }[];
  assumptions: string[];
  placeholders: string[];
  platformNotes: string[];
  checks: { originalWords: number; refinedWords: number; tooLong: boolean; intent: { terms: number; kept: number; missing: string[]; ratio: number } };
};

export type Msg =
  | { type: "refine"; prompt: string; platform: PlatformId; mode: Mode }
  | { type: "open-options" }
  | { type: "toggle" };

export type RefineReply = { ok: true; result: RefineResult } | { ok: false; error: string; code?: "not_connected" | "no_permission" | "provider" | "network" | "invalid" | "auth" };
