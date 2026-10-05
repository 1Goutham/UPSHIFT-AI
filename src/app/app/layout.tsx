import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { listProjects } from "@/lib/repo/projects";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const projects = await listProjects(user.id);
  return (
    <div className="flex min-h-dvh flex-col bg-bg md:flex-row">
      <Sidebar user={{ name: user.name, email: user.email, isGuest: user.isGuest }} projects={projects.slice(0, 12).map((p) => ({ id: p.id, name: p.name }))} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
