import { mkdtemp, readFile, rm, stat, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  fingerprintSecret,
  issueDeviceCredential,
  readDeviceAllowlist,
  writeDeviceAllowlist,
} from "../src/lib/ultron/devices";
import {
  isWithinDirectory,
  resolveAppPaths,
  type AppPaths,
} from "../src/lib/ultron/paths";

let base: string;
let installRoot: string;
let paths: AppPaths;

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), "ultron-devices-"));
  installRoot = path.join(base, "installed-package");
  await mkdir(installRoot, { recursive: true });
  paths = resolveAppPaths({
    env: { ULTRON_HOME: path.join(base, "user-home") },
    platform: "linux",
    homeDir: path.join(base, "unused-home"),
    installRoot,
    mode: "installed",
  });
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("issueDeviceCredential", () => {
  it("stores the credential file OUTSIDE the installation root", async () => {
    const issued = await issueDeviceCredential(paths, "test-sensor", "linux");
    expect(isWithinDirectory(installRoot, issued.filePath)).toBe(false);
    expect(issued.filePath.startsWith(paths.credentialsDir)).toBe(true);
  });

  it("hardens the credential file to 0600 on POSIX", async () => {
    const issued = await issueDeviceCredential(paths, "perm-check", "linux");
    expect(issued.hardening.status).toBe("applied");
    const mode = (await stat(issued.filePath)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("credentials directory itself is 0700", async () => {
    const mode = (await stat(paths.credentialsDir)).mode & 0o777;
    expect(mode).toBe(0o700);
  });

  it("writes the documented envelope and matching fingerprint", async () => {
    const issued = await issueDeviceCredential(paths, "envelope", "linux");
    const body = await readFile(issued.filePath, "utf8");
    expect(body).toContain("ULTRON-DEVICE-CREDENTIAL v1");
    expect(body).toContain(`id=${issued.deviceId}`);
    expect(body).toContain(`name=envelope`);
    expect(issued.fingerprint).toBe(fingerprintSecret(issued.secret));
    expect(issued.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("two issuances never share a secret or id", async () => {
    const a = await issueDeviceCredential(paths, "dup-a", "linux");
    const b = await issueDeviceCredential(paths, "dup-b", "linux");
    expect(a.secret).not.toBe(b.secret);
    expect(a.deviceId).not.toBe(b.deviceId);
  });
});

describe("device allowlist", () => {
  it("round-trips entries and hardens the file to 0600", async () => {
    const hardening = await writeDeviceAllowlist(
      paths,
      {
        version: 1,
        entries: [
          {
            deviceId: "dev-1",
            name: "sensor",
            status: "allowed",
            fingerprint: "f".repeat(64),
            updatedAt: new Date().toISOString(),
          },
        ],
      },
      "linux",
    );
    expect(hardening.status).toBe("applied");
    const mode = (await stat(paths.deviceAllowlistFile)).mode & 0o777;
    expect(mode).toBe(0o600);

    const read = await readDeviceAllowlist(paths);
    expect(read.entries).toHaveLength(1);
    expect(read.entries[0].status).toBe("allowed");
  });

  it("missing allowlist degrades to empty — never to allow-all", async () => {
    const freshBase = await mkdtemp(path.join(tmpdir(), "ultron-allow-"));
    const fresh = resolveAppPaths({
      env: { ULTRON_HOME: path.join(freshBase, "home") },
      platform: "linux",
      homeDir: freshBase,
      installRoot,
      mode: "installed",
    });
    const read = await readDeviceAllowlist(fresh);
    expect(read.entries).toEqual([]);
    await rm(freshBase, { recursive: true, force: true });
  });
});
