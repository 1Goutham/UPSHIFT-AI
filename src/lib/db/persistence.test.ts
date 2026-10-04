import { it } from "vitest";
import { persistenceSuite } from "./persistence.shared";

// Runs on in-memory PGlite (PGLITE_DIR=memory:// in vitest config), with the real migrations.
it("persists, isolates by owner and cascades deletes (PGlite)", persistenceSuite, 60_000);
