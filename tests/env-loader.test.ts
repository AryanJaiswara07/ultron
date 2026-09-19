import { describe, expect, it } from "vitest";

import {
  envFilesForMode,
  isSecretKey,
  loadEnvConfig,
  redactValue,
} from "../src/lib/ultron/env-loader";
import { resolveAppPaths } from "../src/lib/ultron/paths";

const devPaths = resolveAppPaths({
  env: {},
  platform: "linux",
  homeDir: "/home/tester",
  installRoot: "/repo/ultron",
  mode: "development",
});

const installedPaths = resolveAppPaths({
  env: {},
  platform: "linux",
  homeDir: "/home/tester",
  installRoot: "/opt/pkg/ultron",
  mode: "installed",
});

describe("envFilesForMode", () => {
  it("development reads checkout .env.local then .env", () => {
    const files = envFilesForMode({
      mode: "development",
      configDir: devPaths.configDir,
      checkoutRoot: "/repo/ultron",
    });
    expect(files).toEqual(["/repo/ultron/.env.local", "/repo/ultron/.env"]);
  });

  it("installed mode NEVER consults the package/checkout directory", () => {
    const files = envFilesForMode({
      mode: "installed",
      configDir: installedPaths.configDir,
      checkoutRoot: "/opt/pkg/ultron",
    });
    expect(files).toEqual(["/home/tester/.config/ultron/.env"]);
    expect(files.every((f) => !f.startsWith("/opt/pkg/ultron"))).toBe(true);
  });
});

describe("loadEnvConfig", () => {
  it("higher-precedence file wins; process env wins over both", async () => {
    const files: Record<string, string> = {
      "/repo/ultron/.env.local": "A=local\nB=local",
      "/repo/ultron/.env": "A=base\nC=base\nD=base",
    };
    const result = await loadEnvConfig({
      paths: devPaths,
      checkoutRoot: "/repo/ultron",
      env: { D: "from-process" },
      readFile: async (f) => files[f] ?? null,
    });
    expect(result.values).toEqual({ A: "local", B: "local", C: "base" });
    expect(result.values.D).toBeUndefined(); // process env untouched
    expect(result.sources.map((s) => s.found)).toEqual([true, true]);
  });

  it("missing files are reported as absent without failing", async () => {
    const result = await loadEnvConfig({
      paths: devPaths,
      checkoutRoot: "/repo/ultron",
      env: {},
      readFile: async () => null,
    });
    expect(result.sources).toHaveLength(2);
    expect(result.sources.every((s) => !s.found)).toBe(true);
    expect(Object.keys(result.values)).toHaveLength(0);
  });
});

describe("redaction", () => {
  it("masks secret-looking keys", () => {
    expect(isSecretKey("OPENAI_API_KEY")).toBe(true);
    expect(isSecretKey("DATABASE_URL")).toBe(true);
    expect(isSecretKey("ULTRON_VOICE_TOKEN")).toBe(true);
    expect(isSecretKey("DEVICE_SECRET")).toBe(true);
    expect(isSecretKey("ULTRON_THEME")).toBe(false);

    expect(redactValue("OPENAI_API_KEY", "sk-1234567890")).toBe(
      "********(13 chars)",
    );
    expect(redactValue("ULTRON_THEME", "cyan")).toBe("cyan");
  });

  it("redacted view never exposes raw secret values", async () => {
    const files = {
      "/repo/ultron/.env": "DATABASE_URL=postgres://u:p@h/db\nTHEME=cyan",
    };
    const result = await loadEnvConfig({
      paths: devPaths,
      checkoutRoot: "/repo/ultron",
      env: {},
      readFile: async (f) => (files as Record<string, string>)[f] ?? null,
    });
    expect(result.redacted.DATABASE_URL).not.toContain("postgres://");
    expect(result.redacted.DATABASE_URL).toContain("********");
    expect(result.redacted.THEME).toBe("cyan");
    expect(JSON.stringify(result.redacted)).not.toContain("postgres://u:p@h");
  });
});
