/**
 * Filesystem permission hardening for sensitive artifacts (credentials,
 * allowlists, databases).
 *
 * Honest security model:
 *  - POSIX (Linux/macOS): chmod 0600 for files, 0700 for directories is
 *    REAL and enforced via fs.chmod. Tests verify the resulting mode bits.
 *  - Windows: POSIX mode bits are a no-op. NTFS ACLs govern access; Node
 *    cannot set them without native tooling. We therefore report
 *    "unsupported" truthfully and document that credential files inherit the
 *    ACL protections of the per-user local application data directory,
 *    which NTFS restricts to the owning user by default. We do NOT claim
 *    0600 semantics on Windows.
 */
import { chmod, mkdir } from "node:fs/promises";

import type { SupportedPlatform } from "./paths";

export type HardeningStatus = "applied" | "unsupported";

export interface HardeningResult {
  readonly status: HardeningStatus;
  readonly target: string;
  readonly detail: string;
}

export async function hardenCredentialFile(
  target: string,
  platform: SupportedPlatform = processPlatform(),
): Promise<HardeningResult> {
  if (platform === "win32") {
    return {
      status: "unsupported",
      target,
      detail:
        "POSIX 0600 mode bits are not enforceable on Windows from Node.js. " +
        "The file inherits NTFS ACLs from the user profile directory; see docs/DATA-LAYOUT.md.",
    };
  }
  await chmod(target, 0o600);
  return { status: "applied", target, detail: "mode=0600" };
}

export async function ensurePrivateDirectory(
  target: string,
  platform: SupportedPlatform = processPlatform(),
): Promise<HardeningResult> {
  await mkdir(target, { recursive: true, mode: 0o700 });
  if (platform === "win32") {
    return {
      status: "unsupported",
      target,
      detail:
        "Directory created; POSIX 0700 bits are not enforceable on Windows " +
        "(NTFS ACLs from the user profile apply).",
    };
  }
  await chmod(target, 0o700);
  return { status: "applied", target, detail: "mode=0700" };
}

function processPlatform(): SupportedPlatform {
  return process.platform === "win32" || process.platform === "darwin"
    ? process.platform
    : "linux";
}
