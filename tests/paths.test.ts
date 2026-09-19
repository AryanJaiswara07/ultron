import { describe, expect, it } from "vitest";

import {
  isWithinDirectory,
  resolveAppPaths,
  PathResolutionError,
} from "../src/lib/ultron/paths";

const INSTALL_ROOT = "/opt/ultron-package/lib/node_modules/ultron";
const WIN_INSTALL_ROOT = "C:\\Program Files\\ultron";

describe("resolveAppPaths — installed mode, Linux (XDG)", () => {
  it("honours XDG base directories", () => {
    const paths = resolveAppPaths({
      env: {
        XDG_CONFIG_HOME: "/xdg/config",
        XDG_DATA_HOME: "/xdg/data",
        XDG_CACHE_HOME: "/xdg/cache",
        XDG_STATE_HOME: "/xdg/state",
      },
      platform: "linux",
      homeDir: "/home/tester",
      installRoot: INSTALL_ROOT,
      mode: "installed",
    });
    expect(paths.configDir).toBe("/xdg/config/ultron");
    expect(paths.dataDir).toBe("/xdg/data/ultron");
    expect(paths.cacheDir).toBe("/xdg/cache/ultron");
    expect(paths.logDir).toBe("/xdg/state/ultron/logs");
    expect(paths.workspaceDir).toBe("/xdg/data/ultron/workspace");
    expect(paths.databasesDir).toBe("/xdg/data/ultron/databases");
    expect(paths.credentialsDir).toBe("/xdg/data/ultron/credentials");
    expect(paths.deviceAllowlistFile).toBe(
      "/xdg/data/ultron/device-allowlist.json",
    );
    expect(paths.transcriptsDir).toBe("/xdg/data/ultron/transcripts");
    expect(paths.memoryDir).toBe("/xdg/data/ultron/memory");
    expect(paths.identityDir).toBe("/xdg/data/ultron/identity");
    expect(paths.exportsDir).toBe("/xdg/data/ultron/exports");
    expect(paths.visualizerDir).toBe("/xdg/data/ultron/visualizer");
    expect(paths.dotenvFile).toBe("/xdg/config/ultron/.env");
  });

  it("falls back to ~/.config, ~/.local/share, ~/.cache, ~/.local/state", () => {
    const paths = resolveAppPaths({
      env: {},
      platform: "linux",
      homeDir: "/home/tester",
      installRoot: INSTALL_ROOT,
      mode: "installed",
    });
    expect(paths.configDir).toBe("/home/tester/.config/ultron");
    expect(paths.dataDir).toBe("/home/tester/.local/share/ultron");
    expect(paths.cacheDir).toBe("/home/tester/.cache/ultron");
    expect(paths.logDir).toBe("/home/tester/.local/state/ultron/logs");
  });
});

describe("resolveAppPaths — installed mode, macOS", () => {
  it("uses ~/Library conventions", () => {
    const paths = resolveAppPaths({
      env: {},
      platform: "darwin",
      homeDir: "/Users/tester",
      installRoot: INSTALL_ROOT,
      mode: "installed",
    });
    expect(paths.dataDir).toBe("/Users/tester/Library/Application Support/Ultron");
    expect(paths.configDir).toBe(
      "/Users/tester/Library/Application Support/Ultron/Config",
    );
    expect(paths.cacheDir).toBe("/Users/tester/Library/Caches/Ultron");
    expect(paths.logDir).toBe("/Users/tester/Library/Logs/Ultron");
  });
});

describe("resolveAppPaths — installed mode, Windows", () => {
  it("uses APPDATA for config and LOCALAPPDATA for machine-local data", () => {
    const paths = resolveAppPaths({
      env: {
        APPDATA: "C:\\Users\\tester\\AppData\\Roaming",
        LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local",
      },
      platform: "win32",
      homeDir: "C:\\Users\\tester",
      installRoot: WIN_INSTALL_ROOT,
      mode: "installed",
    });
    expect(paths.configDir).toBe("C:\\Users\\tester\\AppData\\Roaming\\Ultron");
    // Credentials/databases are machine-local and must not roam.
    expect(paths.dataDir).toBe("C:\\Users\\tester\\AppData\\Local\\Ultron");
    expect(paths.credentialsDir).toBe(
      "C:\\Users\\tester\\AppData\\Local\\Ultron\\credentials",
    );
    expect(paths.cacheDir).toBe(
      "C:\\Users\\tester\\AppData\\Local\\Ultron\\Cache",
    );
    expect(paths.logDir).toBe(
      "C:\\Users\\tester\\AppData\\Local\\Ultron\\Logs",
    );
  });

  it("falls back to %USERPROFILE%\\AppData when env vars are missing", () => {
    const paths = resolveAppPaths({
      env: {},
      platform: "win32",
      homeDir: "C:\\Users\\tester",
      installRoot: WIN_INSTALL_ROOT,
      mode: "installed",
    });
    expect(paths.configDir).toBe("C:\\Users\\tester\\AppData\\Roaming\\Ultron");
    expect(paths.dataDir).toBe("C:\\Users\\tester\\AppData\\Local\\Ultron");
  });
});

describe("resolveAppPaths — overrides", () => {
  it("ULTRON_HOME roots every category", () => {
    const paths = resolveAppPaths({
      env: { ULTRON_HOME: "/var/lib/ultron-home" },
      platform: "linux",
      homeDir: "/home/tester",
      installRoot: INSTALL_ROOT,
      mode: "installed",
    });
    expect(paths.configDir).toBe("/var/lib/ultron-home/config");
    expect(paths.dataDir).toBe("/var/lib/ultron-home/data");
    expect(paths.cacheDir).toBe("/var/lib/ultron-home/cache");
    expect(paths.logDir).toBe("/var/lib/ultron-home/logs");
    expect(paths.workspaceDir).toBe("/var/lib/ultron-home/workspace");
  });

  it("per-category overrides win over ULTRON_HOME", () => {
    const paths = resolveAppPaths({
      env: {
        ULTRON_HOME: "/var/lib/ultron-home",
        ULTRON_DATA_DIR: "/mnt/bigdisk/ultron-data",
        ULTRON_WORKSPACE_DIR: "/mnt/fast/ultron-ws",
      },
      platform: "linux",
      homeDir: "/home/tester",
      installRoot: INSTALL_ROOT,
      mode: "installed",
    });
    expect(paths.dataDir).toBe("/mnt/bigdisk/ultron-data");
    expect(paths.workspaceDir).toBe("/mnt/fast/ultron-ws");
    expect(paths.configDir).toBe("/var/lib/ultron-home/config");
  });
});

describe("resolveAppPaths — development mode", () => {
  it("keeps writable paths inside the checkout (existing workflow)", () => {
    const paths = resolveAppPaths({
      env: {},
      platform: "linux",
      homeDir: "/home/tester",
      installRoot: "/home/tester/dev/ultron",
      mode: "development",
    });
    expect(paths.dataDir).toBe("/home/tester/dev/ultron/data");
    expect(paths.logDir).toBe("/home/tester/dev/ultron/logs");
    expect(paths.workspaceDir).toBe("/home/tester/dev/ultron/workspace");
    expect(paths.credentialsDir).toBe(
      "/home/tester/dev/ultron/data/credentials",
    );
    expect(paths.dotenvFile).toBe("/home/tester/dev/ultron/.env");
  });
});

describe("installed-mode hard invariants", () => {
  const installed = resolveAppPaths({
    env: {},
    platform: "linux",
    homeDir: "/home/tester",
    installRoot: INSTALL_ROOT,
    mode: "installed",
  });

  it("no user data path resolves inside the installation root", () => {
    for (const candidate of [
      installed.configDir,
      installed.dataDir,
      installed.cacheDir,
      installed.logDir,
      installed.workspaceDir,
      installed.credentialsDir,
      installed.databasesDir,
    ]) {
      expect(isWithinDirectory(INSTALL_ROOT, candidate)).toBe(false);
    }
  });

  it("throws PathResolutionError when an override points inside the install root", () => {
    expect(() =>
      resolveAppPaths({
        env: { ULTRON_DATA_DIR: `${INSTALL_ROOT}/data` },
        platform: "linux",
        homeDir: "/home/tester",
        installRoot: INSTALL_ROOT,
        mode: "installed",
      }),
    ).toThrow(PathResolutionError);
  });

  it("isWithinDirectory handles separators, case and trailing slashes", () => {
    expect(isWithinDirectory("/a/b", "/a/b/c")).toBe(true);
    expect(isWithinDirectory("/a/b", "/a/b")).toBe(true);
    expect(isWithinDirectory("/a/b", "/a/bc")).toBe(false);
    expect(isWithinDirectory("C:\\Pkg\\U", "c:\\pkg\\u\\data")).toBe(true);
    expect(isWithinDirectory("/a/b/", "/a/b/c")).toBe(true);
  });
});
