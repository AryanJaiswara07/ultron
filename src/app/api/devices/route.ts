import { randomUUID } from "node:crypto";

import { bootstrapUltron } from "@/lib/ultron/bootstrap";
import {
  issueDeviceCredential,
  readDeviceAllowlist,
  writeDeviceAllowlist,
} from "@/lib/ultron/devices";
import { insertDevice, listDevices, recordEvent } from "@/db/queries";

export const dynamic = "force-dynamic";

/** List devices. Secrets are NEVER included — only fingerprints. */
export async function GET() {
  const rows = await listDevices().catch(() => []);
  return Response.json({
    devices: rows.map((d) => ({
      id: d.id,
      name: d.name,
      fingerprint: d.fingerprint,
      status: d.status,
      issuedAt: d.issuedAt,
      lastSeenAt: d.lastSeenAt,
      statusReason: d.statusReason,
      credentialPath: d.credentialPath,
    })),
  });
}

/** Issue a new device credential. The secret is returned exactly once. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? "").trim();
  if (name.length < 2 || name.length > 80) {
    return Response.json(
      { error: "Device name must be 2–80 characters." },
      { status: 400 },
    );
  }

  const ctx = await bootstrapUltron();
  let issued;
  try {
    issued = await issueDeviceCredential(ctx.paths, name);
  } catch (error) {
    return Response.json(
      {
        error: "Credential issuance failed.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }

  // The credential file must live inside the user data dir — assert it.
  if (!issued.filePath.startsWith(ctx.paths.credentialsDir)) {
    return Response.json(
      { error: "Refused: credential path escaped the user data directory." },
      { status: 500 },
    );
  }

  await insertDevice({
    id: issued.deviceId || randomUUID(),
    name: issued.name,
    fingerprint: issued.fingerprint,
    credentialPath: issued.filePath,
  });

  // Mirror into the on-disk allowlist document (status pending).
  const list = await readDeviceAllowlist(ctx.paths);
  await writeDeviceAllowlist(ctx.paths, {
    version: 1,
    entries: [
      ...list.entries,
      {
        deviceId: issued.deviceId,
        name: issued.name,
        status: "pending" as const,
        fingerprint: issued.fingerprint,
        updatedAt: new Date().toISOString(),
      },
    ],
  });

  await recordEvent("device.issued", {
    deviceId: issued.deviceId,
    name: issued.name,
    hardening: issued.hardening.status,
  });
  await recordEvent("security.permission_hardened", {
    target: issued.filePath,
    result: issued.hardening.status,
  });

  return Response.json(
    {
      device: {
        id: issued.deviceId,
        name: issued.name,
        fingerprint: issued.fingerprint,
        status: "pending",
      },
      secret: issued.secret, // shown once; never stored server-side in DB
      credentialPath: issued.filePath,
      hardening: issued.hardening,
      notice:
        "Store this secret now. It is not stored in the database and cannot be recovered — only reissued.",
    },
    { status: 201 },
  );
}
