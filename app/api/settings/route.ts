import { getSettings, updateSettings } from "@/lib/service";
import { detectProviders } from "@/lib/agents";
import { sourceStatus } from "@/lib/sources";
import { molitEnabled } from "@/lib/sources/molit";
import { ecosEnabled } from "@/lib/sources/ecos";
import { body, handle, ok } from "@/lib/http";

export const GET = handle(async () => ok({
  settings: await getSettings(),
  providers: await detectProviders(),
  sources: sourceStatus(),
  keys: { molit: molitEnabled(), ecos: ecosEnabled() },
}));
export const PUT = handle(async (req: Request) => ok(await updateSettings(await body(req))));
