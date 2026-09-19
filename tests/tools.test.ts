import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveAppPaths, type AppPaths } from "../src/lib/ultron/paths";
import { subscribe } from "node:diagnostics_channel";

// registers all core tools on import side effect below
import { registerCoreTools } from "../src/lib/ultron/tools/handlers";
import {
  createConfirmation,
  executeTool,
  getTool,
  grantConfirmation,
  listTools,
  resetConfirmations,
  type ToolDeps,
} from "../src/lib/ultron/tools/registry";
import { scaffoldFiles } from "../src/lib/ultron/tools/scaffold";
import { ultronBus } from "../src/lib/ultron/bus";

let base: string;
let paths: AppPaths;

const memoryStore = new Map<string, string>();
const toolDeps: ToolDeps = {
  remember: async (note) => {
    const key = `k-${memoryStore.size}`;
    memoryStore.set(key, note);
    return key;
  },
  recall: async () => [...memoryStore.entries()].map(([key, value]) => ({ key, value })),
};

function ctx(token?: string) {
  return { paths, deps: toolDeps, confirmToken: token };
}

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), "ultron-tools-"));
  paths = resolveAppPaths({
    env: { ULTRON_HOME: path.join(base, "home") },
    platform: "linux",
    homeDir: base,
    installRoot: path.join(base, "pkg"),
    mode: "installed",
  });
  registerCoreTools();
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("registry contracts", () => {
  it("core v1 set is registered with declared tiers", () => {
    const tools = listTools();
    const names = tools.map((t) => t.name).sort();
    for (const required of [
      "system.info",
      "system.top",
      "apps.detect",
      "apps.open",
      "fs.list",
      "fs.read",
      "fs.write",
      "shell.exec",
      "memory.remember",
      "memory.recall",
      "project.scaffold",
    ]) {
      expect(names).toContain(required);
    }
    expect(getTool("shell.exec")?.confirmRequired).toBe(true);
    expect(getTool("fs.write")?.tier).toBe("write");
  });

  it("unknown tools fail closed with a spoken line", async () => {
    const r = await executeTool("evil.tool", {}, ctx());
    expect(r.ok).toBe(false);
    expect(r.speech).toContain("don't have that capability");
  });
});

describe("fs tools — sandbox confinement", () => {
  it("write then read roundtrips inside the workspace", async () => {
    const w = await executeTool(
      "fs.write",
      { path: "notes/hello.txt", content: "hello ultron" },
      ctx(),
    );
    expect(w.ok).toBe(true);
    const r = await executeTool("fs.read", { path: "notes/hello.txt" }, ctx());
    expect(r.ok).toBe(true);
    expect(r.data).toBe("hello ultron");
    const listed = await executeTool("fs.list", { path: "notes" }, ctx());
    expect((listed.data as Array<{ name: string }>).map((i) => i.name)).toContain(
      "hello.txt",
    );
  });

  it("traversal escapes are rejected on every fs tool", async () => {
    for (const tool of ["fs.read", "fs.write"] as const) {
      const r = await executeTool(
        tool,
        { path: "../../etc/passwd", content: "x" },
        ctx(),
      );
      expect(r.ok).toBe(false);
      expect(r.error ?? "").toMatch(/workspace|ESCAPES/i);
    }
  });
});

describe("shell.exec — confirmation + allowlist", () => {
  it("requires a confirmation token BEFORE anything runs", async () => {
    resetConfirmations();
    const r = await executeTool("shell.exec", { argv: ["ls"] }, ctx());
    expect(r.ok).toBe(false);
    expect(r.confirmationRequired).toBe(true);
    expect(r.confirmId).toBeTruthy();
  });

  it("executes an allowlisted verb after a live single-use grant", async () => {
    resetConfirmations();
    const pending = createConfirmation("shell.exec", "run `ls`");
    const grant = grantConfirmation(pending.id, true);
    expect(grant.ok).toBe(true);
    const r = await executeTool("shell.exec", { argv: ["ls"] }, ctx(grant.token));
    expect(r.ok).toBe(true);
    // token is burned: immediate reuse must be re-gated
    const again = await executeTool("shell.exec", { argv: ["ls"] }, ctx(grant.token));
    expect(again.confirmationRequired).toBe(true);
  });

  it("blocks non-allowlisted verbs even WITH a token", async () => {
    resetConfirmations();
    const pending = createConfirmation("shell.exec", "run `rm -rf /`");
    const grant = grantConfirmation(pending.id, true);
    const r = await executeTool("shell.exec", { argv: ["rm", "-rf", "/"] }, ctx(grant.token));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("verb_not_allowed");
  });

  it("rejects shell metacharacters and chained commands", async () => {
    resetConfirmations();
    const pending = createConfirmation("shell.exec", "t");
    const grant = grantConfirmation(pending.id, true);
    const r = await executeTool(
      "shell.exec",
      { argv: ["ls", ";", "cat", "/etc/passwd"] },
      ctx(grant.token),
    );
    expect(r.ok).toBe(false);
    expect(r.error).toBe("metacharacter_rejected");
  });

  it("restricts git subcommands", async () => {
    resetConfirmations();
    const pending = createConfirmation("shell.exec", "t");
    const grant = grantConfirmation(pending.id, true);
    const r = await executeTool(
      "shell.exec",
      { argv: ["git", "push", "origin", "main"] },
      ctx(grant.token),
    );
    expect(r.ok).toBe(false);
    expect(r.error).toBe("git_sub_not_allowed");
  });

  it("confirmation denies are honored and audited", async () => {
    resetConfirmations();
    const pending = createConfirmation("shell.exec", "t");
    const denied = grantConfirmation(pending.id, false);
    expect(denied.ok).toBe(true);
    expect(denied.token).toBeUndefined();
  });
});

describe("memory tools", () => {
  it("remember + recall via injected deps (no secrets, user-inspectable)", async () => {
    const w = await executeTool(
      "memory.remember",
      { note: "my main project is Nova" },
      ctx(),
    );
    expect(w.ok).toBe(true);
    const r = await executeTool("memory.recall", {}, ctx());
    const items = r.data as Array<{ value: string }>;
    expect(items.some((i) => i.value.includes("Nova"))).toBe(true);
  });
});

describe("project.scaffold", () => {
  it("creates + verifies a 3d-site project on disk", async () => {
    const r = await executeTool(
      "project.scaffold",
      { name: "Nova Site!", kind: "3d-site" },
      ctx(),
    );
    expect(r.ok).toBe(true);
    const data = r.data as { name: string; files: string[]; verified: boolean };
    expect(data.name).toBe("nova-site");
    expect(data.verified).toBe(true);
    const index = await readFile(
      path.join(paths.workspaceDir, "nova-site", "index.html"),
      "utf8",
    );
    expect(index).toContain("importmap");
    expect(index).toContain("three");
    const mainStat = await stat(
      path.join(paths.workspaceDir, "nova-site", "main.js"),
    );
    expect(mainStat.isFile()).toBe(true);
  });

  it("scaffold templates: react-app has package.json with vite", () => {
    const files = scaffoldFiles("react-app", "demo");
    const pkg = files.find((f) => f.path === "package.json");
    expect(pkg?.content).toContain('"vite"');
    expect(pkg?.content).toContain('"react"');
  });

  it("publishes confirmation events on the bus for gated tools", async () => {
    resetConfirmations();
    const seen: string[] = [];
    const unsub = ultronBus.subscribe((e) => {
      if (e.type === "confirmation_required") seen.push(String(e.payload.tool));
    });
    await executeTool("shell.exec", { argv: ["ls"] }, ctx());
    unsub();
    expect(seen).toContain("shell.exec");
  });
});
