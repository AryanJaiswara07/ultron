import { listEvents } from "@/db/queries";
import { ULTRON_EVENT_TYPES } from "@/lib/ultron/events";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "100");
  const rows = await listEvents(Number.isFinite(limit) ? limit : 100).catch(
    () => [],
  );
  return Response.json({
    events: rows,
    vocabulary: ULTRON_EVENT_TYPES,
  });
}
