import { z } from "zod";
import { authed, parseBody } from "@/lib/api";
import { addMemory, listMemories } from "@/lib/repo/memory";

export const GET = authed(async (_req, user) => ({ memories: await listMemories(user.id) }));

const Body = z.object({
  kind: z.enum(["preference", "tool", "pattern", "context"]),
  content: z.string().trim().min(3).max(1000),
  source: z.string().max(200).default("Added by you"),
});

export const POST = authed(async (req, user) => {
  const b = await parseBody(req, Body);
  return { memory: await addMemory(user.id, b.kind, b.content, b.source) };
});
