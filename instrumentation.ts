// 서버 시작 시 배치 스케줄러 시작 (Node 런타임에서만). BATCH_IN_APP=0 이면 끔 → 별도 워커/cron 사용
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.BATCH_IN_APP !== "0") {
    const { startScheduler } = await import("./lib/watch");
    await startScheduler();
  }
}
