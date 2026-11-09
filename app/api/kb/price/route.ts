import { kbPrice, kbTypes, pickType } from "@/lib/sources/kb";
import { fail, handle, ok } from "@/lib/http";

// KB 단지의 면적 타입 목록 + 선택 타입 시세: ?complexId=965&area=49.94
export const GET = handle(async (req: Request) => {
  const u = new URL(req.url).searchParams;
  const id = Number(u.get("complexId"));
  if (!Number.isInteger(id) || id <= 0) return fail("complexId 가 필요합니다.");
  const types = await kbTypes(id);
  const t = pickType(types, Number(u.get("area")) || null);
  return ok({ types, price: t ? await kbPrice(id, t.areaSeq) : null });
});
