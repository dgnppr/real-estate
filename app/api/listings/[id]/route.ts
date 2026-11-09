import type { NextRequest } from "next/server";
import { deleteListing, listDecisions, listSnapshots, simulate, updateListing } from "@/lib/service";
import { body, fail, handle, idOf, ok } from "@/lib/http";

// GET: 매물 + 시뮬레이션 + 스냅샷 + 판정 이력
export const GET = handle(async (_req: NextRequest, ctx: RouteContext<"/api/listings/[id]">) => {
  const id = await idOf(ctx);
  const sim = await simulate(id);
  if (!sim) return fail("매물이 없습니다.", 404);
  const [snapshots, decisions] = await Promise.all([listSnapshots(id), listDecisions(id, 20)]);
  return ok({ ...sim, snapshots, decisions });
});
export const PATCH = handle(async (req: NextRequest, ctx: RouteContext<"/api/listings/[id]">) => {
  const row = await updateListing(await idOf(ctx), await body(req));
  return row ? ok(row) : fail("매물이 없습니다.", 404);
});
export const DELETE = handle(async (_req: NextRequest, ctx: RouteContext<"/api/listings/[id]">) =>
  (await deleteListing(await idOf(ctx))) ? ok({ deleted: true }) : fail("매물이 없습니다.", 404));
