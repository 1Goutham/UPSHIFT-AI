import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export async function listMemories(userId: string) {
  const db = await getDb();
  return db.select().from(schema.memories).where(eq(schema.memories.userId, userId)).orderBy(desc(schema.memories.createdAt));
}

export async function addMemory(userId: string, kind: string, content: string, source: string) {
  const db = await getDb();
  const [row] = await db.insert(schema.memories).values({ userId, kind, content, source }).returning();
  return row;
}

export async function updateMemory(userId: string, id: string, content: string) {
  const db = await getDb();
  const rows = await db
    .update(schema.memories)
    .set({ content })
    .where(and(eq(schema.memories.id, id), eq(schema.memories.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteMemory(userId: string, id: string) {
  const db = await getDb();
  await db.delete(schema.memories).where(and(eq(schema.memories.id, id), eq(schema.memories.userId, userId)));
}
