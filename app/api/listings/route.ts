import { createListing, listListings } from "@/lib/service";
import { body, handle, ok } from "@/lib/http";

export const GET = handle(async () => ok(await listListings()));
export const POST = handle(async (req: Request) => ok(await createListing(await body(req)), { status: 201 }));
