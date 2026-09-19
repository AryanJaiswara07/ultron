import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  isInsideOrEqual,
  resolveWorkspacePath,
  SandboxError,
} from "../src/lib/ultron/sandbox";

let base: string;
let workspace: string;
let outside: string;

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), "ultron-sandbox-"));
  workspace = path.join(base, "workspace");
  outside = path.join(base, "outside");
  await mkdir(path.join(workspace, "projects", "demo"), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(path.join(outside, "secret.txt"), "top-secret\n", "utf8");
  await writeFile(
    path.join(workspace, "projects", "demo", "ok.txt"),
    "fine\n",
    "utf8",
  );
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("resolveWorkspacePath — allowed", () => {
  it("resolves a nested relative path inside the workspace", async () => {
    const r = await resolveWorkspacePath(workspace, "projects/demo/ok.txt");
    expect(r.absolutePath).toBe(
      path.resolve(workspace, "projects/demo/ok.txt"),
    );
    expect(r.canonicalRoot).toBeTruthy();
  });

  it("resolves not-yet-existing targets for creation", async () => {
    const r = await resolveWorkspacePath(workspace, "newdir/newfile.txt");
    expect(r.absolutePath).toContain("newdir");
  });

  it("allows the workspace root itself", async () => {
    const r = await resolveWorkspacePath(workspace, ".");
    expect(r.absolutePath).toBe(path.resolve(workspace));
  });
});

describe("resolveWorkspacePath — rejected", () => {
  it("rejects .. traversal escaping the root", async () => {
    await expect(resolveWorkspacePath(workspace, "../outside/secret.txt")).rejects.toMatchObject({
      name: "SandboxError",
      code: "ESCAPES_ROOT",
    });
    await expect(
      resolveWorkspacePath(workspace, "../../etc/passwd"),
    ).rejects.toBeInstanceOf(SandboxError);
  });

  it("rejects absolute paths (POSIX and Windows drive)", async () => {
    await expect(resolveWorkspacePath(workspace, "/etc/passwd")).rejects.toMatchObject({
      code: "ABSOLUTE_PATH",
    });
    await expect(
      resolveWorkspacePath(workspace, "C:\\Windows\\system.ini"),
    ).rejects.toMatchObject({ code: "ABSOLUTE_PATH" });
  });

  it("rejects NUL bytes", async () => {
    await expect(
      resolveWorkspacePath(workspace, "evil\0.txt"),
    ).rejects.toMatchObject({ code: "NUL_BYTE" });
  });

  it("rejects symlink escapes (link inside workspace → outside)", async () => {
    if (process.platform === "win32") return; // symlink privilege required
    const linkPath = path.join(workspace, "escape-link");
    try {
      await symlink(outside, linkPath, "dir");
    } catch {
      return; // environment does not permit symlink creation
    }
    await expect(
      resolveWorkspacePath(workspace, "escape-link/secret.txt"),
    ).rejects.toMatchObject({ code: "SYMLINK_ESCAPE" });
  });

  it("allows symlinks that stay inside the workspace", async () => {
    if (process.platform === "win32") return;
    const linkPath = path.join(workspace, "inner-link");
    try {
      await symlink(path.join(workspace, "projects"), linkPath, "dir");
    } catch {
      return;
    }
    const r = await resolveWorkspacePath(workspace, "inner-link/demo/ok.txt");
    expect(r.absolutePath).toContain("inner-link");
  });
});

describe("isInsideOrEqual", () => {
  it("is case-insensitive (fail-safe for Windows)", () => {
    expect(isInsideOrEqual("C:\\Root", "c:\\root\\child")).toBe(true);
    expect(isInsideOrEqual("/a", "/a/b")).toBe(true);
    expect(isInsideOrEqual("/a", "/ab")).toBe(false);
  });
});
