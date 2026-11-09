import { matchKbComplex } from "@/lib/sources/kb";
import { fail, handle, ok } from "@/lib/http";

// 국토부 단지 → KB 단지 후보: ?sgg=11350&dong=상계동&apt=상계주공7(고층)
export const GET = handle(async (req: Request) => {
  const u = new URL(req.url).searchParams;
  const sgg = u.get("sgg") || "", apt = u.get("apt") || "";
  if (!/^\d{5}$/.test(sgg) || !apt) return fail("sgg(5자리)와 apt 가 필요합니다.");
  return ok(await matchKbComplex(sgg, u.get("dong"), apt));
});
