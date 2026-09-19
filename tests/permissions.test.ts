import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ensurePrivateDirectory,
  hardenCredentialFile,
} from "../src/lib/ultron/permissions";

let base: string;

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), "ultron-perms-"));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("hardenCredentialFile", () => {
  it("applies real 0600 on POSIX (verified via stat mode bits)", async () => {
    const file = path.join(base, "cred.cred");
    await writeFile(file, "secret-material", "utf8");
    const result = await hardenCredentialFile(file, "linux");
    expect(result.status).toBe("applied");
    const mode = (await stat(file)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("reports Windows honestly instead of claiming POSIX semantics", async () => {
    const file = path.join(base, "cred2.cred");
    await writeFile(file, "secret-material", "utf8");
    const result = await hardenCredentialFile(file, "win32");
    expect(result.status).toBe("unsupported");
    expect(result.detail.toLowerCase()).toContain("windows");
    expect(result.detail).not.toContain("mode=0600");
  });
});

describe("ensurePrivateDirectory", () => {
  it("creates a 0700 directory on POSIX", async () => {
    const dir = path.join(base, "private-dir");
    const result = await ensurePrivateDirectory(dir, "linux");
    expect(result.status).toBe("applied");
    const mode = (await stat(dir)).mode & 0o777;
    expect(mode).toBe(0o700);
  });

  it("creates the directory on Windows but reports ACL reality", async () => {
    const dir = path.join(base, "private-dir-win");
    const result = await ensurePrivateDirectory(dir, "win32");
    expect(result.status).toBe("unsupported");
    const s = await stat(dir);
    expect(s.isDirectory()).toBe(true);
  });
});
