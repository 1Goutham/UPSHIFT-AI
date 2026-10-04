"use client";

import { useState } from "react";
import { api, Confirm, Field } from "./ui";

export function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return (
    <>
      <button type="button" className="btn btn-danger btn-sm" onClick={() => setOpen(true)}>
        Delete account
      </button>
      <Confirm
        open={open}
        title="Delete your account?"
        confirmLabel="Delete everything"
        onClose={() => {
          setOpen(false);
          setError("");
        }}
        body={
          <div className="space-y-4">
            <p>
              This permanently deletes <strong className="text-ink">{email}</strong>, every project, prompt, audit, playbook, memory and uploaded file.
            </p>
            <Field label="Confirm with your password">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="field-input" autoComplete="current-password" />
            </Field>
            {error ? <p className="text-sm text-fail">{error}</p> : null}
          </div>
        }
        onConfirm={async () => {
          try {
            await api("/api/account", { method: "DELETE", json: { password } });
            window.location.href = "/";
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      />
    </>
  );
}
