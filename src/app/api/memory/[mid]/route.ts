import { z } from "zod";
import { authed, ApiError, parseBody } from "@/lib/api";
import { deleteMemory, updateMemory } from "@/lib/repo/memory";

const Body = z.object({ content: z.string().trim().min(3).max(1000) });
const check = (id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, "Not found.");
};

export const PATCH = authed<{ mid: string }>(async (req, user, { mid }) => {
  check(mid);
  const { content } = await parseBody(req, Body);
  const memory = await updateMemory(user.id, mid, content);
  if (!memory) throw new ApiError(404, "Not found.");
  return { memory };
});

export const DELETE = authed<{ mid: string }>(async (_req, user, { mid }) => {
  check(mid);
  await deleteMemory(user.id, mid);
  return { ok: true };
});
