import { findSgg, SGG_LIST } from "@/lib/regions";
import { handle, ok } from "@/lib/http";

// 시군구 코드 검색: ?q=마포
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams.get("q");
  return ok(q ? findSgg(q) : SGG_LIST);
});
