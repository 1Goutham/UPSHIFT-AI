import { authed, ApiError } from "@/lib/api";
import { revokeExtToken } from "@/lib/auth/ext-token";

export const DELETE = authed<{ tid: string }>(async (_req, user, { tid }) => {
  if (!/^[0-9a-f-]{36}$/i.test(tid)) throw new ApiError(404, "Not found.");
  await revokeExtToken(user.id, tid);
  return { ok: true };
});
