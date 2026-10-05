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

export type Msg = { type: "open-options" } | { type: "toggle" };

/** Refinement runs over a port named "refine": one request in, deltas then one result out. */
export const REFINE_PORT = "refine";
export type RefineRequest = { prompt: string; platform: PlatformId; mode: Mode };
export type RefinePortMsg = { type: "delta"; refined: string } | { type: "result"; reply: RefineReply };

export type RefineReply = { ok: true; result: RefineResult } | { ok: false; error: string; code?: "not_connected" | "no_permission" | "provider" | "network" | "invalid" | "auth" };
