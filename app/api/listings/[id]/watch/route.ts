import type { NextRequest } from "next/server";
import { runBatch } from "@/lib/watch";
import { handle, idOf, ok } from "@/lib/http";

// 이 매물만 지금 조회 + 판정
export const POST = handle(async (_req: NextRequest, ctx: RouteContext<"/api/listings/[id]/watch">) =>
  ok(await runBatch("manual", { listingId: await idOf(ctx), force: true })));
