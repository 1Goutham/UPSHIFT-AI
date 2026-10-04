import { z } from "zod";
import { authed, parseBody } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { CATEGORIES, PRIORITIES } from "@/lib/engines/taxonomy";
import { getRequirements, logEvent, requireProject, touchProject } from "@/lib/repo/projects";

const Body = z.object({
  text: z.string().trim().min(3).max(500),
  category: z.enum(CATEGORIES).default("other"),
  acceptance: z.string().max(500).default(""),
  priority: z.enum(PRIORITIES).default("should"),
});

export const POST = authed<{ id: string }>(async (req, user, { id }) => {
  const project = await requireProject(user.id, id);
  const body = await parseBody(req, Body);
  const db = await getDb();
  const count = (await getRequirements(project.id)).length;
  const [row] = await db
    .insert(schema.requirements)
    .values({ projectId: project.id, ...body, origin: "explicit", status: "confirmed", position: count })
    .returning();
  await logEvent(user.id, project.id, "requirement.added", { text: row.text });
  await touchProject(project.id);
  return { requirement: row };
});
