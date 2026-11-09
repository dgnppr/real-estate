import { getRules, updateRules } from "@/lib/service";
import { DEFAULT_RULES } from "@/lib/rules";
import { body, handle, ok } from "@/lib/http";

// 도메인 규칙 (LTV·상한·DSR·규제지역 등). DELETE 는 기본값으로 초기화
export const GET = handle(async () => ok({ rules: await getRules(), defaults: DEFAULT_RULES }));
export const PUT = handle(async (req: Request) => ok(await updateRules(await body(req))));
export const DELETE = handle(async () => ok(await updateRules(null)));
