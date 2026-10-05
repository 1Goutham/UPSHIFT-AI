"use client";

import { useState } from "react";
import { api, Field, Spinner, useToast } from "./ui";

export function ChangePassword() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-wrap items-end gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        setBusy(true);
        try {
          await api("/api/account", { method: "PATCH", json: { current: f.get("current"), next: f.get("next") } });
          form.reset();
          toast("Password changed. Other devices were signed out.");
        } catch (err) {
          toast((err as Error).message, "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Current password" className="w-52">
        <input name="current" type="password" required autoComplete="current-password" className="field-input" />
      </Field>
      <Field label="New password" className="w-52">
        <input name="next" type="password" required minLength={10} autoComplete="new-password" className="field-input" />
      </Field>
      <button type="submit" className="btn btn-ghost btn-sm" disabled={busy}>
        {busy ? <Spinner /> : null} Update
      </button>
    </form>
  );
}
