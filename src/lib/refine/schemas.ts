import { z } from "zod";

/** Structured model output for prompt analysis + refinement. Validated before anything renders. */
export const PromptAnalysisSchema = z.object({
  intent: z.string().describe("What the user is actually trying to achieve, in one sentence."),
  taskType: z.string().describe("Short task type, e.g. 'website build', 'code fix', 'research summary', 'email draft'."),
  strengths: z.array(z.string()).describe("What the prompt already does well. 0-3 short items."),
  ambiguities: z.array(z.object({ phrase: z.string().describe("The exact vague words from the prompt."), why: z.string() })).describe("Vague phrases, quoted exactly. 0-5."),
  missingContext: z.array(z.object({ item: z.string().describe("2-4 word label, e.g. 'Target audience'."), why: z.string() })).describe("Context whose absence would change the output. 0-5."),
  assumptions: z.array(z.string()).describe("What an AI would likely assume if given the original prompt."),
});

export const RefinementSchema = z.object({
  analysis: PromptAnalysisSchema,
  refined: z.string().describe("The refined prompt, ready to paste. Same language as the original."),
  changes: z.array(z.object({ change: z.string(), reason: z.string() })).describe("The few changes that matter, 1-6."),
  assumptions: z.array(z.string()).describe("Assumptions you had to make in the refined prompt; the user should confirm them."),
  placeholders: z.array(z.string()).describe("{{placeholders}} you left for facts only the user knows."),
  platformNotes: z.array(z.string()).describe("Only in expert mode: why the prompt is shaped this way for the platform. Say when something is general practice rather than platform-specific."),
});

export type PromptAnalysis = z.infer<typeof PromptAnalysisSchema>;
export type Refinement = z.infer<typeof RefinementSchema>;
