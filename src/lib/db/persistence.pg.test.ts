import { it } from "vitest";
import { persistenceSuite } from "./persistence.shared";

// Set TEST_DATABASE_URL to run the same suite against a real PostgreSQL server.
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
it.skipIf(!url)("persists, isolates by owner and cascades deletes (PostgreSQL)", persistenceSuite, 60_000);
