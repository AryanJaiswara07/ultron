/**
 * Centralized application path resolution — the single place in the codebase
 * allowed to decide where anything writable lives.
 *
 * Contracts enforced here (and pinned by tests + architecture rules):
 *
 *  1. In "installed" mode, NO writable path may resolve inside the
 *     installation root (the equivalent of site-packages / node_modules).
 *  2. In "development" mode (repository checkout), writable paths stay inside
 *     the checkout under data/, logs/, workspace/ so the existing developer
 *     workflow keeps working unchanged.
 *  3. Platform-appropriate user directories are used per OS:
 *       - Linux:  XDG_CONFIG_HOME / XDG_DATA_HOME / XDG_CACHE_HOME / XDG_STATE_HOME
 *       - macOS:  ~/Library/Application Support, ~/Library/Caches, ~/Library/Logs
 *       - Windows:%APPDATA% (roaming config) and %LOCALAPPDATA% (machine-local
 *                 data, credentials, cache, logs — credentials must not roam)
 *  4. Overrides: ULTRON_HOME roots everything; ULTRON_CONFIG_DIR,
 *     ULTRON_DATA_DIR, ULTRON_CACHE_DIR, ULTRON_LOG_DIR, ULTRON_WORKSPACE_DIR
 *     override individual categories. Explicit overrides win over mode logic.
 *  5. Pure and injectable: resolution takes env + platform + homeDir, so tests
 *     exercise every OS branch without a real install.
 */
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { detectInstallMode, type InstallMode } from "./install-mode";
import {
  ULTRON_DIR_NAME,
  ULTRON_DIR_NAME_XDG,
  ULTRON_HOME_ENV,
} from "./version";

export type SupportedPlatform = "linux" | "darwin" | "win32";

export interface ResolvePathsOptions {
  readonly env: Record<string, string | undefined>;
  readonly platform: SupportedPlatform;
  /** User home directory — injected so tests never touch os.homedir(). */
  readonly homeDir: string;
  /**
   * Installation/checkout root (where the application code lives).
   * In development mode this is the checkout; writable paths are derived
   * from it. In installed mode it is ONLY used as a forbidden-region check.
   */
  readonly installRoot: string;
  readonly mode: InstallMode;
}

/**
 * Every writable location ULTRON uses, fully resolved.
 * Category list matches the packaging design: configuration, databases,
 * transcripts, memory, identity, device credentials, device allowlist,
 * logs, workspace, exports, visualiser output, cache.
 */
export interface AppPaths {
  readonly mode: InstallMode;
  /** Root of the installed application code. NEVER writable at runtime. */
  readonly installRoot: string;
  /** Configuration root (holds .env in installed mode). */
  readonly configDir: string;
  /** Primary persistent data root. */
  readonly dataDir: string;
  /** Ephemeral/rebuildable cache root. */
  readonly cacheDir: string;
  /** Log output root. */
  readonly logDir: string;
  /** Agent workspace root (sandbox boundary). */
  readonly workspaceDir: string;
  /** SQLite-style embedded databases. */
  readonly databasesDir: string;
  /** Voice/conversation transcripts. */
  readonly transcriptsDir: string;
  /** Long-term memory data. */
  readonly memoryDir: string;
  /** Identity/key material for the assistant persona. */
  readonly identityDir: string;
  /** Device credential files. Restrictive permissions (0600 on POSIX). */
  readonly credentialsDir: string;
  /** Device allowlist JSON document. */
  readonly deviceAllowlistFile: string;
  /** User-facing exports. */
  readonly exportsDir: string;
  /** Visualiser output. */
  readonly visualizerDir: string;
  /** Path of the .env file consulted for this mode (informational). */
  readonly dotenvFile: string;
}

function envValue(
  env: Record<string, string | undefined>,
  key: string,
): string | undefined {
  const value = env[key];
  return value !== undefined && value.trim() !== "" ? value : undefined;
}

/** Platform-correct join so win32 simulations in tests produce win32 paths. */
function makeJoin(platform: SupportedPlatform): (...parts: string[]) => string {
  return platform === "win32" ? path.win32.join : path.posix.join;
}

interface BaseDirs {
  readonly configDir: string;
  readonly dataDir: string;
  readonly cacheDir: string;
  readonly logDir: string;
  readonly workspaceDir: string;
}

function resolvePlatformBases(
  opts: ResolvePathsOptions,
  join: (...parts: string[]) => string,
): BaseDirs {
  const { env, platform, homeDir } = opts;

  switch (platform) {
    case "linux": {
      const configHome =
        envValue(env, "XDG_CONFIG_HOME") ?? join(homeDir, ".config");
      const dataHome =
        envValue(env, "XDG_DATA_HOME") ?? join(homeDir, ".local", "share");
      const cacheHome =
        envValue(env, "XDG_CACHE_HOME") ?? join(homeDir, ".cache");
      const stateHome =
        envValue(env, "XDG_STATE_HOME") ?? join(homeDir, ".local", "state");
      return {
        configDir: join(configHome, ULTRON_DIR_NAME_XDG),
        dataDir: join(dataHome, ULTRON_DIR_NAME_XDG),
        cacheDir: join(cacheHome, ULTRON_DIR_NAME_XDG),
        logDir: join(stateHome, ULTRON_DIR_NAME_XDG, "logs"),
        workspaceDir: join(dataHome, ULTRON_DIR_NAME_XDG, "workspace"),
      };
    }
    case "darwin": {
      const appSupport = join(homeDir, "Library", "Application Support", ULTRON_DIR_NAME);
      return {
        configDir: join(appSupport, "Config"),
        dataDir: appSupport,
        cacheDir: join(homeDir, "Library", "Caches", ULTRON_DIR_NAME),
        logDir: join(homeDir, "Library", "Logs", ULTRON_DIR_NAME),
        workspaceDir: join(appSupport, "Workspace"),
      };
    }
    case "win32": {
      const roaming =
        envValue(env, "APPDATA") ?? join(homeDir, "AppData", "Roaming");
      const local =
        envValue(env, "LOCALAPPDATA") ?? join(homeDir, "AppData", "Local");
      // Credentials/databases stay machine-local (LOCALAPPDATA) so they can
      // never roam onto other machines; only non-sensitive config roams.
      return {
        configDir: join(roaming, ULTRON_DIR_NAME),
        dataDir: join(local, ULTRON_DIR_NAME),
        cacheDir: join(local, ULTRON_DIR_NAME, "Cache"),
        logDir: join(local, ULTRON_DIR_NAME, "Logs"),
        workspaceDir: join(local, ULTRON_DIR_NAME, "Workspace"),
      };
    }
  }
}

function resolveDevelopmentBases(
  installRoot: string,
  join: (...parts: string[]) => string,
): BaseDirs {
  return {
    configDir: installRoot,
    dataDir: join(installRoot, "data"),
    cacheDir: join(installRoot, "data", "cache"),
    logDir: join(installRoot, "logs"),
    workspaceDir: join(installRoot, "workspace"),
  };
}

export function resolveAppPaths(opts: ResolvePathsOptions): AppPaths {
  const join = makeJoin(opts.platform);
  const { env, mode, installRoot } = opts;

  const ultronHome = envValue(env, ULTRON_HOME_ENV);
  const bases: BaseDirs = ultronHome
    ? {
        configDir: join(ultronHome, "config"),
        dataDir: join(ultronHome, "data"),
        cacheDir: join(ultronHome, "cache"),
        logDir: join(ultronHome, "logs"),
        workspaceDir: join(ultronHome, "workspace"),
      }
    : mode === "development"
      ? resolveDevelopmentBases(installRoot, join)
      : resolvePlatformBases(opts, join);

  // Explicit per-category overrides beat every rule above.
  const configDir = envValue(env, "ULTRON_CONFIG_DIR") ?? bases.configDir;
  const dataDir = envValue(env, "ULTRON_DATA_DIR") ?? bases.dataDir;
  const cacheDir = envValue(env, "ULTRON_CACHE_DIR") ?? bases.cacheDir;
  const logDir = envValue(env, "ULTRON_LOG_DIR") ?? bases.logDir;
  const workspaceDir =
    envValue(env, "ULTRON_WORKSPACE_DIR") ?? bases.workspaceDir;

  const paths: AppPaths = {
    mode,
    installRoot,
    configDir,
    dataDir,
    cacheDir,
    logDir,
    workspaceDir,
    databasesDir: join(dataDir, "databases"),
    transcriptsDir: join(dataDir, "transcripts"),
    memoryDir: join(dataDir, "memory"),
    identityDir: join(dataDir, "identity"),
    credentialsDir: join(dataDir, "credentials"),
    deviceAllowlistFile: join(dataDir, "device-allowlist.json"),
    exportsDir: join(dataDir, "exports"),
    visualizerDir: join(dataDir, "visualizer"),
    dotenvFile: join(configDir, ".env"),
  };

  assertNoWritablePathInsideInstallRoot(paths);
  return paths;
}

/**
 * Hard invariant (architecture rule ARCH-PATH-01): in installed mode no
 * writable path may live inside the installation root. In development mode
 * the install root IS the checkout, so the check is skipped by design.
 */
export function assertNoWritablePathInsideInstallRoot(paths: AppPaths): void {
  if (paths.mode !== "installed") return;
  const candidates: ReadonlyArray<[string, string]> = [
    ["configDir", paths.configDir],
    ["dataDir", paths.dataDir],
    ["cacheDir", paths.cacheDir],
    ["logDir", paths.logDir],
    ["workspaceDir", paths.workspaceDir],
  ];
  for (const [label, candidate] of candidates) {
    if (isWithinDirectory(paths.installRoot, candidate)) {
      throw new PathResolutionError(
        `Refusing to start: ${label} (${candidate}) resolves inside the installation root (${paths.installRoot}). Installed package directories are not writable storage.`,
      );
    }
  }
}

export class PathResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathResolutionError";
  }
}

/** True when `candidate` equals `root` or sits beneath it. */
export function isWithinDirectory(root: string, candidate: string): boolean {
  const normRoot = normalizeForCompare(root);
  const normCandidate = normalizeForCompare(candidate);
  if (normCandidate === normRoot) return true;
  // After normalization both sides use "/" separators exclusively.
  return normCandidate.startsWith(normRoot + "/");
}

function normalizeForCompare(p: string): string {
  // Windows is case-insensitive; lower-casing everywhere is the conservative
  // choice (it can over-match, which fails safe: it forbids, never permits).
  let out = p.replace(/[\\/]+/g, "/").toLowerCase();
  if (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

/* ------------------------------------------------------------------ */
/* Runtime convenience resolver (cached). Tests use resolveAppPaths(). */
/* ------------------------------------------------------------------ */

const RUNTIME_ENV: Record<string, string | undefined> = process.env;

let cachedRuntimePaths: AppPaths | undefined;
let cachedRuntimeKey: string | undefined;

/** Resolve paths for the current process. Memoized per env signature. */
export function getRuntimePaths(): AppPaths {
  const key = JSON.stringify([
    RUNTIME_ENV[ULTRON_HOME_ENV],
    RUNTIME_ENV.ULTRON_CONFIG_DIR,
    RUNTIME_ENV.ULTRON_DATA_DIR,
    RUNTIME_ENV.ULTRON_CACHE_DIR,
    RUNTIME_ENV.ULTRON_LOG_DIR,
    RUNTIME_ENV.ULTRON_WORKSPACE_DIR,
    RUNTIME_ENV.ULTRON_INSTALL_MODE,
    process.platform,
    process.cwd(),
  ]);
  if (cachedRuntimePaths && cachedRuntimeKey === key) return cachedRuntimePaths;

  const platform: SupportedPlatform =
    process.platform === "win32" || process.platform === "darwin"
      ? process.platform
      : "linux";
  const installRoot = process.cwd();
  const mode = detectInstallMode({
    cwd: installRoot,
    env: RUNTIME_ENV,
    exists: (p) => existsSyncSafe(p),
  });
  cachedRuntimePaths = resolveAppPaths({
    env: RUNTIME_ENV,
    platform,
    homeDir: os.homedir(),
    installRoot,
    mode,
  });
  cachedRuntimeKey = key;
  return cachedRuntimePaths;
}

/** Test hook: drop the memoized runtime resolution. */
export function resetRuntimePathsCache(): void {
  cachedRuntimePaths = undefined;
  cachedRuntimeKey = undefined;
}

function existsSyncSafe(p: string): boolean {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}
