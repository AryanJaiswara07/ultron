/**
 * Canonical ULTRON startup sequence — the ONE bootstrap path used by the
 * server runtime (via Next.js instrumentation) regardless of how the process
 * was launched (`next start`, the `ultron` CLI launcher, or `next dev`).
 *
 * There is deliberately no alternative startup implementation: the CLI
 * launcher delegates here through the running server, and the architecture
 * test ARCH-CLI-01 enforces that bin/ contains no duplicated path/bootstrap
 * logic.
 *
 * Sequence:
 *   1. detect install mode (development checkout vs installed)
 *   2. resolve all writable paths (user dirs in installed mode)
 *   3. create writable directories; harden the credentials directory
 *   4. load environment configuration (file sources, never clobbering env)
 *   5. scan for legacy checkout data (migration is user-triggered, explicit)
 *
 * The function is idempotent and memoized: repeat calls return the boot
 * context without re-running side effects.
 */
import { mkdir } from "node:fs/promises";

import { loadEnvConfig, type LoadedEnvConfig } from "./env-loader";
import { ensurePrivateDirectory } from "./permissions";
import { getRuntimePaths, type AppPaths } from "./paths";
import { scanLegacyData, type LegacyScan } from "./migrate";
import { ULTRON_VERSION } from "./version";

export interface BootstrapContext {
  readonly version: string;
  readonly startedAt: string;
  readonly paths: AppPaths;
  readonly env: LoadedEnvConfig;
  /** Legacy data detection result (scanned at the resolved checkout root). */
  readonly legacyScan: LegacyScan;
  /** Directories ensured writable during boot. */
  readonly ensured: string[];
  /** Non-fatal boot warnings, safe to display (already redacted). */
  readonly warnings: string[];
}

let bootContext: BootstrapContext | null = null;
let bootPromise: Promise<BootstrapContext> | null = null;

export async function bootstrapUltron(): Promise<BootstrapContext> {
  if (bootContext) return bootContext;
  if (!bootPromise) {
    bootPromise = doBootstrap().then((ctx) => {
      bootContext = ctx;
      return ctx;
    });
  }
  return bootPromise;
}

/** Test hook: reset the memoized boot context. */
export function resetBootstrapForTests(): void {
  bootContext = null;
  bootPromise = null;
}

async function doBootstrap(): Promise<BootstrapContext> {
  const startedAt = new Date().toISOString();
  const warnings: string[] = [];

  const paths = getRuntimePaths();

  const ensured: string[] = [];
  const dirs = [
    paths.configDir,
    paths.dataDir,
    paths.cacheDir,
    paths.logDir,
    paths.workspaceDir,
    paths.databasesDir,
    paths.transcriptsDir,
    paths.memoryDir,
    paths.identityDir,
    paths.exportsDir,
    paths.visualizerDir,
  ];
  for (const dir of dirs) {
    try {
      await mkdir(dir, { recursive: true });
      ensured.push(dir);
    } catch (error) {
      warnings.push(
        `Could not create ${redactPathForLog(dir)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // Credentials directory is special: 0700 where enforceable.
  const credResult = await ensurePrivateDirectory(paths.credentialsDir);
  ensured.push(paths.credentialsDir);
  if (credResult.status === "unsupported") {
    warnings.push(
      "Credential directory permissions: POSIX 0700 not enforceable on this " +
        "platform (Windows NTFS ACLs apply instead). Documented in docs/DATA-LAYOUT.md.",
    );
  }

  const env = await loadEnvConfig({
    paths,
    checkoutRoot: process.cwd(),
    env: process.env,
  });

  // Legacy data detection: when running from a checkout, the checkout itself
  // is the live location (migration is inert); operators can also point
  // ULTRON_LEGACY_ROOT at an OLD checkout after installing.
  const legacyRoot = process.env.ULTRON_LEGACY_ROOT ?? process.cwd();
  let legacyScan: LegacyScan;
  try {
    legacyScan = await scanLegacyData(legacyRoot);
  } catch (error) {
    warnings.push(
      `Legacy scan failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    legacyScan = { legacyRoot, items: [], anythingPresent: false };
  }

  return {
    version: ULTRON_VERSION,
    startedAt,
    paths,
    env,
    legacyScan,
    ensured,
    warnings,
  };
}

/** Best-effort home-directory masking for log lines (never leaks username). */
function redactPathForLog(p: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (home && p.startsWith(home)) return `~${p.slice(home.length)}`;
  return p;
}
