import { bootstrapUltron } from "@/lib/ultron/bootstrap";
import {
  readDeviceAllowlist,
  writeDeviceAllowlist,
  type DeviceStatus,
} from "@/lib/ultron/devices";
import { recordEvent, updateDeviceStatus } from "@/db/queries";

export const dynamic = "force-dynamic";

const VALID_TRANSITIONS: Record<DeviceStatus, true> = {
  pending: true,
  allowed: true,
  blocked: true,
  revoked: true,
};

/** Update device trust status (allow / block / revoke / back to pending). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    status?: DeviceStatus;
    reason?: string;
  };
  const status = body.status;
  if (!status || !VALID_TRANSITIONS[status]) {
    return Response.json(
      { error: "status must be one of pending|allowed|blocked|revoked." },
      { status: 400 },
    );
  }

  const ok = await updateDeviceStatus(id, status, body.reason).catch(() => null);
  if (ok === null) {
    return Response.json({ error: "Database unavailable." }, { status: 503 });
  }
  if (!ok) {
    return Response.json({ error: "Device not found." }, { status: 404 });
  }

  // Keep the on-disk allowlist document in sync when entry exists.
  const ctx = await bootstrapUltron();
  const list = await readDeviceAllowlist(ctx.paths);
  const entry = list.entries.find((e) => e.deviceId === id);
  if (entry) {
    await writeDeviceAllowlist(ctx.paths, {
      version: 1,
      entries: list.entries.map((e) =>
        e.deviceId === id
          ? { ...e, status, updatedAt: new Date().toISOString() }
          : e,
      ),
    });
  }

  const eventType =
    status === "allowed"
      ? ("device.allowed" as const)
      : status === "blocked"
        ? ("device.blocked" as const)
        : status === "revoked"
          ? ("device.revoked" as const)
          : null;
  if (eventType) {
    await recordEvent(eventType, { deviceId: id, reason: body.reason ?? "" });
  }

  return Response.json({ ok: true, id, status });
}
