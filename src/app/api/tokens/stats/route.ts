import { authedOrToken } from "@/lib/api";
import { tokenStats } from "@/lib/tokens/service";

export const GET = authedOrToken(async (_req, user) => tokenStats(user.id));
