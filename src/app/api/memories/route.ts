import { listMemories, rememberNote } from "@/db/queries";
import { ultronBus } from "@/lib/ultron/bus";

export const dynamic = "force-dynamic";

/** Inspectable memory — the user can see everything ULTRON remembers. */
export async function GET() {
  const rows = await listMemories(200).catch(() => []);
  return Response.json({ memories: rows });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    value?: string;
    kind?: "note" | "preference" | "project" | "context";
  };
  const value = (body.value ?? "").trim();
  if (!value || value.length > 2000) {
    return Response.json(
      { error: "value must be 1–2000 characters." },
      { status: 400 },
    );
  }
  const key = await rememberNote(value, body.kind ?? "note").catch(() => null);
  if (!key) return Response.json({ error: "Database unavailable." }, { status: 503 });
  ultronBus.publish("memory_updated", { op: "remember", key });
  return Response.json({ ok: true, key }, { status: 201 });
}
