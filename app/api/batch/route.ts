import { listRuns, nextRunAt, runBatch } from "@/lib/watch";
import { body, handle, ok } from "@/lib/http";

export const GET = handle(async () => ok({ nextRunAt: nextRunAt(), runs: await listRuns() }));
// 감시 중인 전체 매물 지금 실행. { force: true } 면 시세 변동 없어도 판정
export const POST = handle(async (req: Request) => {
  const { force } = await body<{ force?: boolean }>(req);
  return ok(await runBatch("manual", { force }));
});
