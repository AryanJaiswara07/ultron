import { describe, expect, it } from "vitest";

import {
  CHECKOUT_MARKERS,
  detectInstallMode,
  INSTALL_MODE_ENV,
} from "../src/lib/ultron/install-mode";

const allMarkers = new Set<string>(CHECKOUT_MARKERS as readonly string[]);

function existsFromMarkers(cwd: string, markers: Set<string>) {
  return (absolutePath: string) => {
    const name = absolutePath.slice(cwd.length + 1);
    return markers.has(name);
  };
}

describe("detectInstallMode", () => {
  it("detects a development checkout via markers", () => {
    const mode = detectInstallMode({
      cwd: "/repo/ultron",
      env: {},
      exists: existsFromMarkers("/repo/ultron", allMarkers),
    });
    expect(mode).toBe("development");
  });

  it("detects an installed deployment when markers are absent", () => {
    const mode = detectInstallMode({
      cwd: "/opt/pkg/ultron",
      env: {},
      exists: existsFromMarkers("/opt/pkg/ultron", new Set()),
    });
    expect(mode).toBe("installed");
  });

  it("fails safe to installed when markers are only partially present", () => {
    const partial = new Set(["package.json"]);
    const mode = detectInstallMode({
      cwd: "/somewhere",
      env: {},
      exists: existsFromMarkers("/somewhere", partial),
    });
    expect(mode).toBe("installed");
  });

  it("ULTRON_INSTALL_MODE override wins over markers", () => {
    const forced = detectInstallMode({
      cwd: "/repo/ultron",
      env: { [INSTALL_MODE_ENV]: "installed" },
      exists: existsFromMarkers("/repo/ultron", allMarkers),
    });
    expect(forced).toBe("installed");

    const forcedDev = detectInstallMode({
      cwd: "/opt/pkg",
      env: { [INSTALL_MODE_ENV]: "development" },
      exists: () => false,
    });
    expect(forcedDev).toBe("development");
  });

  it("ignores garbage override values", () => {
    const mode = detectInstallMode({
      cwd: "/opt/pkg",
      env: { [INSTALL_MODE_ENV]: "banana" },
      exists: () => false,
    });
    expect(mode).toBe("installed");
  });
});
