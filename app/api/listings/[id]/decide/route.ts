import type { NextRequest } from "next/server";
import { decide } from "@/lib/service";
import type { ProviderId } from "@/lib/agents";
import { body, handle, idOf, ok } from "@/lib/http";

// 에이전트로 즉시 판정 (provider 생략 시 설정값)
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/listings/[id]/decide">) => {
  const { provider } = await body<{ provider?: ProviderId }>(req);
  return ok(await decide(await idOf(ctx), "manual", provider));
});
