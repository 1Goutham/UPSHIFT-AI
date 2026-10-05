"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { api, ErrorNote, Field, Spinner } from "./ui";
import { Logo } from "./logo";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signup = mode === "signup";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(`/api/auth/${mode}`, {
        method: "POST",
        json: { email: f.get("email"), password: f.get("password"), ...(signup ? { name: f.get("name") } : {}) },
      });
      router.replace("/app");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-bg px-5 py-6 md:px-12">
      <Link href="/" aria-label="Home" className="w-fit">
        <Logo />
      </Link>
      <div className="flex flex-1 items-center justify-center py-12">
        <form onSubmit={submit} className="rise-in w-full max-w-sm space-y-6" noValidate={false}>
          <div>
            <h1 className="font-mono text-2xl">
              <span className="text-ink-3">[</span> {signup ? "Create account" : "Sign in"} <span className="text-ink-3">]</span>
            </h1>
          </div>
          {signup ? (
            <Field label="Name">
              <input name="name" required maxLength={80} autoComplete="name" className="field-input" />
            </Field>
          ) : null}
          <Field label="Email">
            <input name="email" type="email" required autoComplete="email" className="field-input" />
          </Field>
          <Field label="Password">
            <input name="password" type="password" required minLength={signup ? 10 : 1} autoComplete={signup ? "new-password" : "current-password"} className="field-input" placeholder={signup ? "10+ characters" : ""} />
          </Field>
          {error ? <ErrorNote message={error} /> : null}
          <button type="submit" disabled={busy} className="btn btn-primary group w-full">
            {busy ? <Spinner /> : null}
            {signup ? "Create account" : "Sign in"}
            {!busy ? <ArrowRight className="nudge-x h-4 w-4" aria-hidden /> : null}
          </button>
          <p className="text-center text-sm text-ink-3">
            {signup ? "Already have an account? " : "New here? "}
            <Link href={signup ? "/login" : "/signup"} className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              {signup ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
