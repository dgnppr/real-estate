import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// 로컬 SQLite 파일 (DATABASE_URL 로 Turso 등 원격 libsql 로 교체 가능)
const url = process.env.DATABASE_URL || "file:./data/home.db";

const g = globalThis as unknown as { __homeDb?: ReturnType<typeof drizzle<typeof schema>> };
export const db = g.__homeDb ?? drizzle(createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN }), { schema });
if (process.env.NODE_ENV !== "production") g.__homeDb = db;

export { schema };
