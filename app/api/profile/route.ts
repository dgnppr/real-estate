import { getProfile, updateProfile } from "@/lib/service";
import { body, handle, ok } from "@/lib/http";

export const GET = handle(async () => ok(await getProfile()));
export const PUT = handle(async (req: Request) => ok(await updateProfile(await body(req))));
