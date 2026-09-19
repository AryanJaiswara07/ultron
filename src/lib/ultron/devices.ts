/**
 * Device credential + allowlist storage.
 *
 * Storage contract:
 *  - credential files live in <dataDir>/credentials — a user-data directory,
 *    NEVER inside the application installation (pinned by tests/rule ARCH-SEC-01)
 *  - files are created with mode 0600 on POSIX and hardened explicitly;
 *    on Windows the limitation is reported honestly (see permissions.ts)
 *  - the database stores only a SHA-256 fingerprint + file reference;
 *    the secret itself is shown exactly once at issuance
 *  - the device allowlist is a JSON document inside the data dir
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import type { AppPaths, SupportedPlatform } from "./paths";
import {
  ensurePrivateDirectory,
  hardenCredentialFile,
  type HardeningResult,
} from "./permissions";

export const CREDENTIAL_FILE_PREFIX = "device-" as const;
export const CREDENTIAL_FILE_SUFFIX = ".cred" as const;
export const CREDENTIAL_FORMAT_VERSION = "ULTRON-DEVICE-CREDENTIAL v1" as const;

export interface IssuedDeviceCredential {
  readonly deviceId: string;
  readonly name: string;
  /** Shown ONCE at issuance. Never persisted to the database. */
  readonly secret: string;
  /** SHA-256 hex of the secret — safe to store/log. */
  readonly fingerprint: string;
  /** Absolute path of the credential file (inside credentialsDir). */
  readonly filePath: string;
  readonly hardening: HardeningResult;
}

export function fingerprintSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function credentialFilePathFor(paths: AppPaths, deviceId: string): string {
  // join via dataDir-derived credentialsDir; keep POSIX/win correctness by
  // using the same separator the paths module produced.
  const sep = paths.credentialsDir.includes("\\") && !paths.credentialsDir.includes("/") ? "\\" : "/";
  return `${paths.credentialsDir}${sep}${CREDENTIAL_FILE_PREFIX}${deviceId}${CREDENTIAL_FILE_SUFFIX}`;
}

export async function issueDeviceCredential(
  paths: AppPaths,
  name: string,
  platform?: SupportedPlatform,
): Promise<IssuedDeviceCredential> {
  const deviceId = randomUUID();
  const secret = randomBytes(32).toString("base64url");
  await ensurePrivateDirectory(paths.credentialsDir, platform);

  const filePath = credentialFilePathFor(paths, deviceId);
  const body = [
    CREDENTIAL_FORMAT_VERSION,
    `id=${deviceId}`,
    `name=${name}`,
    `secret=${secret}`,
    "",
  ].join("\n");
  await writeFile(filePath, body, { mode: 0o600, flag: "wx" });
  const hardening = await hardenCredentialFile(filePath, platform);

  return {
    deviceId,
    name,
    secret,
    fingerprint: fingerprintSecret(secret),
    filePath,
    hardening,
  };
}

/* ------------------------------------------------------------------ */
/* Device allowlist (JSON document inside the data dir)                */
/* ------------------------------------------------------------------ */

export type DeviceStatus = "pending" | "allowed" | "blocked" | "revoked";

export interface AllowlistEntry {
  readonly deviceId: string;
  readonly name: string;
  readonly status: DeviceStatus;
  readonly fingerprint: string;
  readonly updatedAt: string;
}

export interface DeviceAllowlist {
  readonly version: 1;
  readonly entries: AllowlistEntry[];
}

export async function readDeviceAllowlist(paths: AppPaths): Promise<DeviceAllowlist> {
  try {
    const raw = await readFile(paths.deviceAllowlistFile, "utf8");
    const parsed = JSON.parse(raw) as DeviceAllowlist;
    if (parsed && Array.isArray(parsed.entries)) return parsed;
  } catch {
    // Missing/corrupt file degrades to an empty allowlist; never to "allow all".
  }
  return { version: 1, entries: [] };
}

export async function writeDeviceAllowlist(
  paths: AppPaths,
  list: DeviceAllowlist,
  platform?: SupportedPlatform,
): Promise<HardeningResult> {
  await ensurePrivateDirectory(paths.dataDir, platform);
  await writeFile(paths.deviceAllowlistFile, JSON.stringify(list, null, 2), {
    mode: 0o600,
  });
  return hardenCredentialFile(paths.deviceAllowlistFile, platform);
}
