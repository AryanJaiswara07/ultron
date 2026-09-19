import { deleteMemory } from "@/db/queries";
import { ultronBus } from "@/lib/ultron/bus";

export const dynamic = "force-dynamic";

/** Deletable memory — protected entries refuse deletion (fail closed). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await deleteMemory(id).catch(() => "missing" as const);
  if (result === "protected") {
    return Response.json(
      { error: "This memory is protected and cannot be deleted." },
      { status: 403 },
    );
  }
  if (result === "missing") {
    return Response.json({ error: "Memory not found." }, { status: 404 });
  }
  ultronBus.publish("memory_updated", { op: "delete", key: id });
  return Response.json({ ok: true, deleted: id });
}
