import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { getWorkspace } from "@/lib/repo/projects";
import { providerStatus } from "@/lib/ai/provider";
import { ApiError } from "@/lib/api";
import { Workspace } from "@/components/workspace/workspace";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return {};
  try {
    const ws = await getWorkspace(user.id, (await params).id);
    return { title: ws.project.name };
  } catch {
    return { title: "Project" };
  }
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = (await currentUser())!;
  const { id } = await params;
  let ws;
  try {
    ws = await getWorkspace(user.id, id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const p = providerStatus();
  return <Workspace key={ws.project.id} initial={ws} provider={{ configured: p.configured, model: p.model }} />;
}
