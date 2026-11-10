import { authedOrToken } from "@/lib/api";
import { providerStatus } from "@/lib/ai/provider";
import { tokenStats } from "@/lib/tokens/service";

/** Connection check for the extension popup, with this month's token savings. */
export const GET = authedOrToken(async (_req, user) => {
  const p = providerStatus();
  const saved = await tokenStats(user.id)
    .then((s) => s.month.saved)
    .catch(() => null);
  return { name: user.name, email: user.email, refine: p.configured, savedThisMonth: saved };
});
