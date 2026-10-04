import { authed } from "@/lib/api";
import { getWorkspace, logEvent } from "@/lib/repo/projects";
import { projectMarkdown } from "@/lib/services/export";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const ws = await getWorkspace(user.id, id);
  await logEvent(user.id, id, "project.exported", {});
  const name = ws.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60) || "project";
  return new Response(projectMarkdown(ws), {
    headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${name}.md"` },
  });
});
