import { authedOrToken } from "@/lib/api";
import { providerStatus } from "@/lib/ai/provider";

/** Connection check for the extension popup. */
export const GET = authedOrToken(async (_req, user) => {
  const p = providerStatus();
  return { name: user.name, email: user.email, refine: p.configured };
});
