import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { ensureDb } from "../db/migrate";

/** DB에 영속되는 API 응답 캐시 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  await ensureDb();
  const [hit] = await db.select().from(schema.apiCache).where(eq(schema.apiCache.key, key));
  if (hit && hit.expiresAt.getTime() > Date.now()) return hit.payload as T;
  const val = await fn();
  const row = { key, payload: val as unknown, expiresAt: new Date(Date.now() + ttlMs) };
  await db.insert(schema.apiCache).values(row).onConflictDoUpdate({ target: schema.apiCache.key, set: row });
  return val;
}
