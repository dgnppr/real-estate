// 배치 감시: 감시 중인 매물마다 시세 소스를 조회해 스냅샷을 쌓고, 시뮬레이션 + 에이전트 판정, 알림까지
import { spawn } from "node:child_process";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { ensureDb } from "./db/migrate";
import type { ListingRow, SnapshotData } from "./db/schema";
import { ADAPTERS } from "./sources";
import { decide, getSettings, listListings, updateListing } from "./service";

let running = false;

async function lastSnapshot(listingId: number, source: string) {
  const [s] = await db.select().from(schema.snapshots)
    .where(and(eq(schema.snapshots.listingId, listingId), eq(schema.snapshots.source, source)))
    .orderBy(desc(schema.snapshots.takenAt)).limit(1);
  return s;
}

const sameData = (a?: SnapshotData, b?: SnapshotData) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

function notify(title: string, body: string) {
  if (process.platform !== "darwin") return;
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  spawn("osascript", ["-e", `display notification "${esc(body)}" with title "${esc(title)}"`], { stdio: "ignore" }).on("error", () => {});
}

const F = (n?: number) => (n == null ? "-" : n >= 10000 ? `${Math.floor(n / 10000)}억${n % 10000 ? " " + (n % 10000).toLocaleString() : ""}` : n.toLocaleString());

/** 한 매물 처리. 반환: 로그 라인들 */
export async function watchOne(l: ListingRow, trigger: "batch" | "manual", force = false) {
  const log: string[] = [];
  const settings = await getSettings();
  let changed = false;
  const patch: Partial<ListingRow> = {};

  for (const a of ADAPTERS) {
    if (!a.available() || !a.applicable(l)) continue;
    try {
      const data = await a.fetch(l);
      if (!data) continue;
      const prev = await lastSnapshot(l.id, a.id);
      if (!prev || !sameData(prev.data, data)) {
        await db.insert(schema.snapshots).values({ listingId: l.id, source: a.id, data });
        changed = true;
        const parts = [data.lastPrice && `실거래 ${F(data.lastPrice)}`, data.median3 && `중위 ${F(data.median3)}`, data.kbMid && `KB ${F(data.kbMid)}`, data.askingAvg && `호가평균 ${F(data.askingAvg)}(${data.askingCount ?? 0}건)`, data.askingMin && `최저호가 ${F(data.askingMin)}`].filter(Boolean).join(" / ");
        log.push(`${l.name} · ${a.label}: ${data.note ?? parts} (변경)`);
      } else log.push(`${l.name} · ${a.label}: 변동 없음`);
      if (a.id === "kb" && data.kbComplexId && String(data.kbComplexId) !== l.kbComplexId) patch.kbComplexId = String(data.kbComplexId);
      if (l.autoSync) {
        if (data.kbMid) patch.kb = data.kbMid;
        else if (data.median3 && a.id === "molit") patch.kb = data.median3;
      }
    } catch (e) {
      log.push(`${l.name} · ${a.label}: 오류 ${(e as Error).message}`);
    }
  }
  if (Object.keys(patch).length) await updateListing(l.id, patch);

  if (force || changed || settings.decideOn === "always") {
    const [prev] = await db.select().from(schema.decisions).where(eq(schema.decisions.listingId, l.id)).orderBy(desc(schema.decisions.runAt)).limit(1);
    const d = await decide(l.id, trigger);
    log.push(`${l.name} · 판정(${d.provider}): ${d.verdict} — ${d.headline ?? ""}`);
    if (settings.notify && d.verdict !== "ERROR" && (d.verdict === "BUY" || (prev && prev.verdict !== d.verdict))) {
      notify(`🏠 ${l.name}: ${d.verdict}`, d.headline ?? "");
    }
  } else log.push(`${l.name} · 시세 변동 없음 → 판정 생략`);
  return log;
}

/** 감시 중인 전체 매물 배치 실행 */
export async function runBatch(trigger: "batch" | "manual" = "batch", opts: { force?: boolean; listingId?: number } = {}) {
  await ensureDb();
  if (running) return { skipped: true, log: ["이미 실행 중입니다."] };
  running = true;
  const [run] = await db.insert(schema.runs).values({ trigger, status: "running", log: [] }).returning();
  const log: string[] = [];
  try {
    const targets = (await listListings()).filter((l) => (opts.listingId ? l.id === opts.listingId : l.watch));
    if (!targets.length) log.push("감시 중인 매물이 없습니다.");
    for (const l of targets) log.push(...(await watchOne(l, trigger, opts.force)));
    await db.update(schema.runs).set({ status: "ok", finishedAt: new Date(), log }).where(eq(schema.runs.id, run.id));
    return { runId: run.id, log };
  } catch (e) {
    log.push(`실패: ${(e as Error).message}`);
    await db.update(schema.runs).set({ status: "error", finishedAt: new Date(), log }).where(eq(schema.runs.id, run.id));
    return { runId: run.id, log, error: true };
  } finally {
    running = false;
  }
}

export async function listRuns(limit = 20) {
  await ensureDb();
  return db.select().from(schema.runs).orderBy(desc(schema.runs.id)).limit(limit);
}

/* ---------------- 앱 내 스케줄러 ---------------- */
const g = globalThis as unknown as { __homeScheduler?: NodeJS.Timeout; __homeNextRun?: number };

export function nextRunAt() { return g.__homeNextRun ?? null; }

export async function startScheduler() {
  if (g.__homeScheduler) return;
  const tick = async () => {
    try {
      const s = await getSettings();
      const now = Date.now();
      if (!g.__homeNextRun) g.__homeNextRun = now + 60_000; // 서버 시작 1분 후 첫 실행
      if (s.batchEnabled && now >= g.__homeNextRun) {
        g.__homeNextRun = now + s.intervalMin * 60_000;
        const r = await runBatch("batch");
        console.log(`[batch] ${new Date().toLocaleString()}\n  ${r.log.join("\n  ")}`);
      }
    } catch (e) { console.error("[batch] 오류", e); }
  };
  g.__homeScheduler = setInterval(tick, 30_000);
  void tick();
}
