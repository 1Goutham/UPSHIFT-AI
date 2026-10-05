import "server-only";
import { generateStructured, INJECTION_RULE, providerStatus, untrusted } from "@/lib/ai/provider";
import { lintPrompt } from "@/lib/engines/prompt-lint";
import { RefinementSchema, type Refinement } from "./schemas";
import { intentCoverage, wordCount } from "./intent-check";
import { platformLabel, type Mode } from "./platforms";
import { partialStringField } from "./partial";
import { ApiError } from "@/lib/api";

/**
 * Intent → context → strategy → refinement. Provider-agnostic: the model is
 * reached only through generateStructured (Grok or Claude today), and the
 * result is checked deterministically after it comes back.
 */

const BASE = `You are UPSHIFT, an AI utilisation layer. You improve a user's prompt before they send it to an AI tool.

Non-negotiable:
- Preserve the user's intent, voice, language and every requirement they stated. Never drop or contradict anything they asked for.
- Do not invent requirements the user did not state or clearly imply. If a fact only the user knows is needed, leave a {{placeholder}}; if you must assume, list it in "assumptions".
- Longer is not better. Every added sentence must remove ambiguity or add structure the task needs.
- Output only the prompt in "refined": no preface, no commentary, no quotes around it.
- Write the refined prompt in the same language as the original.
${INJECTION_RULE}`;

const MODE_RULES: Record<Mode, string> = {
  quick: `Mode QUICK: a light edit. Fix ambiguity, grammar and an unclear objective; add only context the user clearly implied. Keep it about the same length (at most roughly 1.5x, unless the original is a fragment). Keep the user's phrasing wherever it is already clear. No headings.`,
  deep: `Mode DEEP: analyse intent, context, audience, constraints, desired output, technical requirements, edge cases and success criteria, then write a clearly structured prompt (short sections or a numbered list where it helps): objective, context, requirements, output format, done-when. Include only sections that carry real information for this task.`,
  expert: `Mode EXPERT: do everything in DEEP, and shape the prompt for the target platform and task type: choose a structure and delimiters that make the input unambiguous, give an explicit output format/schema, and ask for step-by-step reasoning only when the task genuinely needs multi-step reasoning. Explain the platform-specific choices in platformNotes; if a choice is general good practice rather than specific to that platform, say so. Do not claim platform features you are not sure exist.`,
};

export type RefineInput = { prompt: string; platform: string; mode: Mode; userId: string; taskHint?: string };

export type RefineResponse = Refinement & {
  model: string;
  platform: string;
  mode: Mode;
  checks: {
    gaps: ReturnType<typeof lintPrompt>;
    originalWords: number;
    refinedWords: number;
    intent: ReturnType<typeof intentCoverage>;
    /** Quick mode grew much more than a light edit should. */
    tooLong: boolean;
  };
};

export const MAX_PROMPT_CHARS = 12_000;

/**
 * @param onRefined called with the refined prompt so far while the model is
 *   still writing (display only; the final result is validated as usual).
 */
export async function refinePrompt(input: RefineInput, onRefined?: (soFar: string) => void): Promise<RefineResponse> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new ApiError(400, "Add a prompt first.");
  if (prompt.length > MAX_PROMPT_CHARS) throw new ApiError(413, `Prompts up to ${MAX_PROMPT_CHARS.toLocaleString()} characters.`);
  if (!providerStatus().configured) throw new ApiError(503, "Refinement needs a model on the UPSHIFT server. Analysis still works.", "provider_not_configured");

  const gaps = lintPrompt(prompt);
  const { data, model } = await generateStructured({
    operation: `refine.${input.mode}`,
    userId: input.userId,
    system: `${BASE}\n\n${MODE_RULES[input.mode]}`,
    effort: input.mode === "quick" ? "low" : "medium",
    speed: "fast",
    maxTokens: input.mode === "quick" ? 4000 : 8000,
    schema: RefinementSchema,
    onText: onRefined
      ? (raw) => {
          const soFar = partialStringField(raw, "refined");
          if (soFar) onRefined(soFar);
        }
      : undefined,
    content: [
      {
        type: "text",
        text: [
          `Target platform: ${platformLabel(input.platform)}`,
          input.taskHint ? `Task hint: ${input.taskHint}` : "",
          gaps.length ? `Rule-based checks flagged: ${gaps.map((g) => g.label).join("; ")}. Address these only where the user implied the answer; otherwise use a placeholder or assumption.` : "",
          untrusted("user prompt", prompt),
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const refined = data.refined.trim();
  if (!refined) throw new ApiError(502, "Couldn't refine this prompt right now. Try again.");
  const originalWords = wordCount(prompt);
  const refinedWords = wordCount(refined);
  return {
    ...data,
    refined,
    platformNotes: input.mode === "expert" ? data.platformNotes : [],
    model,
    platform: input.platform,
    mode: input.mode,
    checks: {
      gaps,
      originalWords,
      refinedWords,
      intent: intentCoverage(prompt, refined),
      tooLong: input.mode === "quick" && refinedWords > Math.max(originalWords * 2.5, originalWords + 60),
    },
  };
}
