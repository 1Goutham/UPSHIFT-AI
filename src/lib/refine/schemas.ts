import { z } from "zod";

/**
 * Structured model output for prompt refinement. Validated before anything
 * renders. Kept deliberately small: every field costs output tokens, and
 * output tokens are most of the wait. "refined" comes first so it can be
 * streamed to the user while the short analysis is still being written.
 */
export const PromptAnalysisSchema = z.object({
  intent: z.string().describe("What the user is trying to achieve. One short sentence."),
  taskType: z.string().describe("2-3 words, e.g. 'website build', 'code fix', 'email draft'."),
  ambiguities: z.array(z.object({ phrase: z.string().describe("The exact vague words from the prompt."), why: z.string().describe("At most 8 words.") })).describe("0-3."),
  missingContext: z.array(z.object({ item: z.string().describe("2-4 word label, e.g. 'Target audience'."), why: z.string().describe("At most 8 words.") })).describe("0-4."),
});

export const RefinementSchema = z.object({
  refined: z.string().describe("The refined prompt, ready to paste. Same language as the original."),
  changes: z.array(z.object({ change: z.string().describe("At most 8 words."), reason: z.string().describe("At most 10 words.") })).describe("The changes that matter, 1-4."),
  assumptions: z.array(z.string()).describe("Assumptions in the refined prompt the user should confirm. 0-3, short."),
  placeholders: z.array(z.string()).describe("{{placeholders}} left for facts only the user knows."),
  analysis: PromptAnalysisSchema,
  platformNotes: z.array(z.string()).describe("Expert mode only, else empty: why the prompt is shaped this way for the platform. 0-3, short. Say when something is general practice rather than platform-specific."),
});

export type PromptAnalysis = z.infer<typeof PromptAnalysisSchema>;
export type Refinement = z.infer<typeof RefinementSchema>;
