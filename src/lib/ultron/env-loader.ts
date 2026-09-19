/**
 * Environment configuration loading.
 *
 * Precedence (highest first):
 *   1. Real process environment (already-set vars are never overridden)
 *   2. <configDir>/.env            (installed mode)
 *      <checkout>/.env.local then  (development mode)
 *      <checkout>/.env
 *
 * Guarantees:
 *  - installed mode NEVER reads an .env from the application/install
 *    directory — site-packages is not a configuration store
 *  - development checkout behavior is unchanged (.env at repo root)
 *  - values from files are only applied for keys NOT already in the
 *    environment — no clobbering of the operator's real env
 *  - secret-looking values are redacted in any report/log representation
 *
 * Implementation uses the already-present `dotenv` package (no new deps).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseDotenv } from "dotenv";

import type { AppPaths } from "./paths";

export interface EnvSource {
  readonly file: string;
  readonly found: boolean;
  /** Number of keys contributed by this file (values never counted out loud). */
  readonly keysContributed: number;
}

export interface LoadedEnvConfig {
  /** Effective values contributed by files (NOT including process env). */
  readonly values: Record<string, string>;
  /** Files consulted, in precedence order (lowest precedence listed last). */
  readonly sources: EnvSource[];
  /**
   * Redaction-safe view: every value whose key looks secret is masked.
   * This is the ONLY representation that may flow to logs/API responses.
   */
  readonly redacted: Record<string, string>;
}

const SECRET_KEY_PATTERN =
  /(SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE[_-]?KEY|API[_-]?KEY|DATABASE_URL|DSN)/i;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

export function redactValue(key: string, value: string): string {
  if (!isSecretKey(key)) return value;
  if (value.length === 0) return "";
  return `********(${value.length} chars)`;
}

export interface LoadEnvOptions {
  readonly paths: AppPaths;
  /** Checkout root; only consulted in development mode. */
  readonly checkoutRoot: string;
  /** Live environment (process.env). Used for "already set" precedence. */
  readonly env: Record<string, string | undefined>;
  /** Injectable reader for tests. */
  readonly readFile?: (file: string) => Promise<string | null>;
}

export function envFilesForMode(opts: {
  mode: AppPaths["mode"];
  configDir: string;
  checkoutRoot: string;
}): string[] {
  if (opts.mode === "installed") {
    return [path.join(opts.configDir, ".env")];
  }
  return [
    path.join(opts.checkoutRoot, ".env.local"),
    path.join(opts.checkoutRoot, ".env"),
  ];
}

export async function loadEnvConfig(opts: LoadEnvOptions): Promise<LoadedEnvConfig> {
  const reader =
    opts.readFile ??
    (async (file: string): Promise<string | null> => {
      try {
        return await readFile(file, "utf8");
      } catch {
        return null;
      }
    });

  const files = envFilesForMode({
    mode: opts.paths.mode,
    configDir: opts.paths.configDir,
    checkoutRoot: opts.checkoutRoot,
  });

  const values: Record<string, string> = {};
  const sources: EnvSource[] = [];

  for (const file of files) {
    const content = await reader(file);
    if (content === null) {
      sources.push({ file, found: false, keysContributed: 0 });
      continue;
    }
    const parsed = parseDotenv(content);
    let contributed = 0;
    for (const [key, value] of Object.entries(parsed)) {
      const alreadyInEnv = opts.env[key] !== undefined;
      const alreadyFromHigherFile = values[key] !== undefined;
      if (!alreadyInEnv && !alreadyFromHigherFile) {
        values[key] = value;
        contributed += 1;
      }
    }
    sources.push({ file, found: true, keysContributed: contributed });
  }

  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    redacted[key] = redactValue(key, value);
  }

  return { values, sources, redacted };
}
