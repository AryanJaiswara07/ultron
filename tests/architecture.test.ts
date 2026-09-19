import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ULTRON_EVENT_TYPES } from "../src/lib/ultron/events";
import { ULTRON_VERSION } from "../src/lib/ultron/version";

/**
 * ULTRON architecture rules — v1.16 packaging invariants.
 * Each rule here protects a real long-term invariant; none are cosmetic.
 * Violations fail the suite, not the runtime.
 */

const SRC_ROOT = path.resolve(__dirname, "..", "src");
const REPO_ROOT = path.resolve(__dirname, "..");

async function collectFiles(
  dir: string,
  exts: string[],
): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (exts.some((ext) => entry.name.endsWith(ext))) {
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}

async function readRel(p: string): Promise<string> {
  return readFile(p, "utf8");
}

describe("ARCH-PATH-01 — path resolution is centralized", () => {
  it("only src/lib/ultron/paths.ts references platform directory macros", async () => {
    const files = await collectFiles(SRC_ROOT, [".ts", ".tsx"]);
    const offenders: string[] = [];
    const macroPattern =
      /XDG_CONFIG_HOME|XDG_DATA_HOME|XDG_CACHE_HOME|XDG_STATE_HOME|LOCALAPPDATA|"APPDATA"|Application Support/;
    for (const file of files) {
      if (file.endsWith(path.join("lib", "ultron", "paths.ts"))) continue;
      const content = await readRel(file);
      if (macroPattern.test(content)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

describe("ARCH-PATH-02 — no hardcoded absolute user directories", () => {
  it("src/ and bin/ contain no user-specific absolute paths", async () => {
    const targets = [
      ...(await collectFiles(SRC_ROOT, [".ts", ".tsx"])),
      ...(await collectFiles(path.join(REPO_ROOT, "bin"), [".mjs", ".js"])),
    ];
    const hardcoded = /C:\\Users\\[A-Za-z]|\/home\/[a-z_][a-z0-9_-]*\/|\/Users\/[A-Za-z][A-Za-z0-9_-]*\//i;
    const offenders: string[] = [];
    for (const file of targets) {
      if (hardcoded.test(await readRel(file))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

describe("ARCH-SEC-01 — filesystem writes only via the ultron core library", () => {
  it("no write primitives outside src/lib/ultron", async () => {
    const files = await collectFiles(SRC_ROOT, [".ts", ".tsx"]);
    const writePattern =
      /\bwriteFile\(|\bappendFile\(|\bcreateWriteStream\(|\bmkdir\(|\bcp\(|\brm\(|\brename\(/;
    const offenders: string[] = [];
    for (const file of files) {
      if (file.includes(path.join("lib", "ultron"))) continue;
      if (writePattern.test(await readRel(file))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

describe("ARCH-ENV-01 — environment reads are confined", () => {
  const ALLOWED = new Set([
    path.join("src", "db", "index.ts"),
    path.join("src", "instrumentation.ts"),
  ]);

  it("process.env appears only in env-loader infrastructure", async () => {
    const files = await collectFiles(SRC_ROOT, [".ts", ".tsx"]);
    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(REPO_ROOT, file);
      if (ALLOWED.has(rel)) continue;
      if (file.includes(path.join("lib", "ultron"))) continue;
      if ((await readRel(file)).includes("process.env")) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

describe("ARCH-SEC-02 — single workspace sandbox implementation", () => {
  it("resolveWorkspacePath is defined exactly once", async () => {
    const files = await collectFiles(SRC_ROOT, [".ts", ".tsx"]);
    let definitions = 0;
    for (const file of files) {
      const content = await readRel(file);
      definitions += (content.match(/export async function resolveWorkspacePath/g) ?? [])
        .length;
    }
    expect(definitions).toBe(1);
  });

  it("user-facing workspace resolution flows through the sandbox module", async () => {
    const routeFile = path.join(
      SRC_ROOT,
      "app",
      "api",
      "workspace",
      "resolve",
      "route.ts",
    );
    const content = await readRel(routeFile);
    expect(content).toContain("resolveWorkspacePath");
    expect(content).toContain("SandboxError");
  });
});

describe("ARCH-EV-01 — every declared event type is emitted by real code", () => {
  it("no dead event vocabulary", async () => {
    const files = await collectFiles(SRC_ROOT, [".ts", ".tsx"]);
    const corpusParts: string[] = [];
    for (const file of files) {
      if (file.endsWith(path.join("lib", "ultron", "events.ts"))) continue;
      corpusParts.push(await readRel(file));
    }
    const corpus = corpusParts.join("\n");
    const dead = ULTRON_EVENT_TYPES.filter((t) => !corpus.includes(t));
    expect(dead).toEqual([]);
  });
});

describe("ARCH-UI-01 — no emoji in shipped UI source", () => {
  it("src/ is emoji-free (icons come from Lucide)", async () => {
    const files = await collectFiles(SRC_ROOT, [".ts", ".tsx"]);
    // Emoji + dingbat ranges. Typographic arrows/dots are intentionally fine.
    const emoji = /[☀-➿⬀-⯿️\u{1F000}-\u{1FAFF}]/u;
    const offenders: string[] = [];
    for (const file of files) {
      if (emoji.test(await readRel(file))) offenders.push(path.basename(file));
    }
    expect(offenders).toEqual([]);
  });
});

describe("ARCH-VER-01 — version is single-sourced and docs stay in sync", () => {
  it("README and CHANGELOG reference the runtime version constant", async () => {
    const readme = await readFile(path.join(REPO_ROOT, "README.md"), "utf8");
    const changelog = await readFile(path.join(REPO_ROOT, "CHANGELOG.md"), "utf8");
    expect(ULTRON_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(readme).toContain(ULTRON_VERSION);
    expect(changelog).toContain(ULTRON_VERSION);
  });
});
