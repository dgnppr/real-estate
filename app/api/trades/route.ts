import { searchComplexes } from "@/lib/sources/molit";
import { handle, ok } from "@/lib/http";

// 실거래가 단지 검색: ?lawd=11440&months=6&q=래미안
export const GET = handle(async (req: Request) => {
  const u = new URL(req.url);
  const list = await searchComplexes(u.searchParams.get("lawd") || "", Number(u.searchParams.get("months")) || 6);
  const q = (u.searchParams.get("q") || "").trim();
  return ok({ lawd: u.searchParams.get("lawd"), list: q ? list.filter((x) => x.apt.includes(q)) : list });
});
