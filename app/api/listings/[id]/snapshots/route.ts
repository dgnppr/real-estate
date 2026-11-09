import type { NextRequest } from "next/server";
import { addSnapshot, listSnapshots } from "@/lib/service";
import { body, fail, handle, idOf, ok } from "@/lib/http";

export const GET = handle(async (_req: NextRequest, ctx: RouteContext<"/api/listings/[id]/snapshots">) => ok(await listSnapshots(await idOf(ctx))));

// 시세 직접 기록 (KB시세·네이버 호가를 보고 입력) { source: "kb"|"naver"|"manual", data: { kbMid, askingMin, ... } }
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/listings/[id]/snapshots">) => {
  const { source = "manual", data } = await body<{ source?: string; data?: Record<string, unknown> }>(req);
  if (!data || typeof data !== "object") return fail("data 가 필요합니다.");
  return ok(await addSnapshot(await idOf(ctx), source, data), { status: 201 });
});
