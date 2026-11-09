import { chat, chatHistory, clearChat } from "@/lib/service";
import type { ProviderId } from "@/lib/agents";
import { body, fail, handle, ok } from "@/lib/http";

export const GET = handle(async () => ok(await chatHistory()));
export const POST = handle(async (req: Request) => {
  const { message, provider, listingId } = await body<{ message?: string; provider?: ProviderId; listingId?: number }>(req);
  if (!message?.trim()) return fail("message 가 필요합니다.");
  return ok(await chat(message.trim(), provider, listingId));
});
export const DELETE = handle(async () => { await clearChat(); return ok({ cleared: true }); });
