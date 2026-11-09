import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { db } from "./index";

let done: Promise<void> | null = null;

/** 첫 접근 시 마이그레이션 적용 (앱·워커 공용) */
export function ensureDb() {
  if (!done) {
    if (!process.env.DATABASE_URL) mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
    done = migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  }
  return done;
}
