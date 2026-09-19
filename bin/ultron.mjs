#!/usr/bin/env node
/**
 * ULTRON CLI launcher.
 *
 * Contract (architecture rule ARCH-CLI-01, pinned by tests):
 *  - This file contains NO path-resolution, migration, config or bootstrap
 *    logic. The canonical startup path lives in src/lib/ultron/bootstrap.ts
 *    and executes inside the server via src/instrumentation.ts, no matter
 *    how the process was launched.
 *  - `ultron` therefore does exactly one thing: verify a production build
 *    exists, then delegate to the canonical server entry (`next start`).
 *
 * Usage:
 *   ultron start          launch the production server (default command)
 *   ultron --version      print the ULTRON version (single-sourced)
 *   ultron --help         show this help
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readVersion() {
  try {
    const src = readFileSync(join(root, "src/lib/ultron/version.ts"), "utf8");
    const match = src.match(/ULTRON_VERSION\s*=\s*"([^"]+)"/);
    return match ? match[1] : "unknown";
  } catch {
    return "unknown";
  }
}

function help() {
  console.log(`ULTRON v${readVersion()} — installable assistant runtime

USAGE
  ultron [start]     Launch the production server (canonical startup path)
  ultron --version   Print version
  ultron --help      This help

ENVIRONMENT
  ULTRON_HOME              Root override for ALL writable directories
  ULTRON_CONFIG_DIR        Override configuration directory
  ULTRON_DATA_DIR          Override data directory
  ULTRON_CACHE_DIR         Override cache directory
  ULTRON_LOG_DIR           Override log directory
  ULTRON_WORKSPACE_DIR     Override workspace directory
  ULTRON_INSTALL_MODE      Force "development" or "installed" mode
  ULTRON_LEGACY_ROOT       Point migration scan at an old checkout
  PORT                     HTTP port for the server (default 3000)

DATA LOCATIONS
  See docs/DATA-LAYOUT.md for the per-OS directory map. Writable data never
  lives inside the application package.`);
}

const arg = process.argv[2];

if (arg === "--version" || arg === "-v") {
  console.log(readVersion());
  process.exit(0);
}

if (arg === "--help" || arg === "-h") {
  help();
  process.exit(0);
}

if (arg !== undefined && arg !== "start") {
  console.error(`Unknown command: ${arg}\n`);
  help();
  process.exit(2);
}

const buildId = join(root, ".next", "BUILD_ID");
if (!existsSync(buildId)) {
  console.error(
    "[ultron] No production build found (.next/BUILD_ID missing).\n" +
      "         Run `npm run build` first, then launch again.",
  );
  process.exit(1);
}

const child = spawn("npx", ["--yes", "next", "start"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 0));
