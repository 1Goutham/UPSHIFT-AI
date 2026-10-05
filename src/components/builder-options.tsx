import { BUILDERS } from "@/lib/engines/builders";

/** Suggestions for the "built with" field; free text is still allowed. */
export function BuilderOptions() {
  return (
    <datalist id="builders">
      {BUILDERS.map((b) => (
        <option key={b.id} value={b.label} />
      ))}
    </datalist>
  );
}
