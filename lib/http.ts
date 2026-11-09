// 라우트 핸들러 공용: JSON 응답 + 오류 처리
import { connection } from "next/server";

export function ok(data: unknown, init?: ResponseInit) { return Response.json(data, init); }
export function fail(message: string, status = 400) { return Response.json({ error: message }, { status }); }

/** 모든 API 는 요청 시점에 실행 (DB·외부 API·CLI 를 쓰므로 빌드 시 프리렌더 금지) */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    await connection(); // 프리렌더는 여기서 멈춤 — try 밖에 두어 Next 내부 신호를 삼키지 않음
    try { return await fn(...args); }
    catch (e) { console.error(e); return fail((e as Error).message || "서버 오류", 500); }
  };
}
export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}
export const idOf = async (ctx: { params: Promise<{ id: string }> }) => {
  const n = Number((await ctx.params).id);
  if (!Number.isInteger(n)) throw new Error("잘못된 id");
  return n;
};
