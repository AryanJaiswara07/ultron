import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ULTRON_VERSION } from "../src/lib/ultron/version";

const REPO_ROOT = path.resolve(__dirname, "..");
const BIN = path.join(REPO_ROOT, "bin", "ultron.mjs");

describe("CLI entry point — ARCH-CLI-01", () => {
  it("bin/ultron.mjs exists and is a node executable script", async () => {
    await access(BIN);
    const content = await readFile(BIN, "utf8");
    expect(content.startsWith("#!/usr/bin/env node")).toBe(true);
  });

  it("contains NO duplicated startup/path/bootstrap logic", async () => {
    const content = await readFile(BIN, "utf8");
    // The launcher must not reimplement any of the core subsystems:
    for (const forbidden of [
      "XDG_",
      "resolveAppPaths",
      "homedir(",
      "mkdir(",
      "executeMigration",
      "loadEnvConfig",
      "issueDeviceCredential",
    ]) {
      expect(content.includes(forbidden)).toBe(false);
    }
  });

  it("delegates to the canonical server startup (next start)", async () => {
    const content = await readFile(BIN, "utf8");
    expect(content).toContain('"next", "start"');
  });

  it("single-sources the version from src/lib/ultron/version.ts", async () => {
    const content = await readFile(BIN, "utf8");
    expect(content).toContain("src/lib/ultron/version.ts");
    // and the version module actually exports a parseable value
    const versionSrc = await readFile(
      path.join(REPO_ROOT, "src", "lib", "ultron", "version.ts"),
      "utf8",
    );
    expect(versionSrc).toContain(`ULTRON_VERSION = "${ULTRON_VERSION}"`);
  });

  it("documentation tells users how to launch after install", async () => {
    const readme = await readFile(path.join(REPO_ROOT, "README.md"), "utf8");
    expect(readme).toContain("node bin/ultron.mjs");
    expect(readme).toContain("ULTRON_HOME");
  });
});
