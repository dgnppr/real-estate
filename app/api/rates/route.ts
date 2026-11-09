import { getRates } from "@/lib/sources/ecos";
import { handle, ok } from "@/lib/http";

// ECOS_KEY 가 없으면 null (화면은 수동 금리 사용)
export const GET = handle(async () => ok(await getRates()));
