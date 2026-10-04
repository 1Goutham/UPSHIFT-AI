"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookMarked, Brain, FolderKanban, LineChart, LogOut, Menu, Moon, Settings, Sun, X } from "lucide-react";
import { Logo } from "./logo";
import { api } from "./ui";

const NAV = [
  { href: "/app", label: "Projects", icon: FolderKanban, exact: true },
  { href: "/app/playbooks", label: "Playbooks", icon: BookMarked },
  { href: "/app/insights", label: "Insights", icon: LineChart },
  { href: "/app/memory", label: "Memory", icon: Brain },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ user, projects }: { user: { name: string; email: string }; projects: { id: string; name: string }[] }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark"), []);
  useEffect(() => setOpen(false), [path]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (next === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("upshift-theme", next);
    } catch {}
  };

  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  };

  const isActive = (href: string, exact?: boolean) => (exact ? path === href : path.startsWith(href));

  const body = (
    <div className="flex h-full flex-col">
      <div className="hidden px-4 pb-5 pt-5 md:block">
        <Link href="/app" aria-label="Projects">
          <Logo />
        </Link>
      </div>
      <nav aria-label="Workspace" className="px-2">
        <ul className="space-y-0.5">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors ${active ? "bg-raise text-ink" : "text-ink-2 hover:bg-panel hover:text-ink"}`}
                >
                  {active ? <span className="absolute left-0 top-2 bottom-2 w-px bg-accent" aria-hidden /> : null}
                  <Icon className="h-4 w-4" strokeWidth={1.6} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-2">
        <p className="eyebrow px-2.5 pb-1.5">Recent</p>
        {projects.length ? (
          <ul className="space-y-px">
            {projects.map((p) => {
              const href = `/app/p/${p.id}`;
              const active = path.startsWith(href);
              return (
                <li key={p.id}>
                  <Link href={href} aria-current={active ? "page" : undefined} className={`block truncate rounded-md px-2.5 py-1.5 text-[13px] ${active ? "text-ink" : "text-ink-3 hover:text-ink"}`}>
                    {active ? <span className="mr-1.5 text-accent">›</span> : null}
                    {p.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-2.5 text-xs text-ink-3">No projects yet.</p>
        )}
      </div>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-ink">{user.name}</p>
            <p className="truncate text-[11px] text-ink-3">{user.email}</p>
          </div>
          <button type="button" onClick={toggleTheme} className="btn btn-quiet btn-sm" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button type="button" onClick={signOut} className="btn btn-quiet btn-sm" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur md:hidden">
        <Link href="/app" aria-label="Projects">
          <Logo />
        </Link>
        <button type="button" className="btn btn-quiet btn-sm" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>
      {open ? (
        <div className="fixed inset-0 top-12 z-30 bg-bg md:hidden">
          <div className="h-full pt-3">{body}</div>
        </div>
      ) : null}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 border-r border-line bg-bg md:block">{body}</aside>
    </>
  );
}
