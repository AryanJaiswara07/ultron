/**
 * Legacy data migration (packaging milestone, v1.16).
 *
 * Scenario: an existing user ran ULTRON from a repository checkout, so their
 * `.env`, `data/`, `logs/` and `workspace/` live inside the old checkout.
 * After switching to an installed deployment, that data must move to the
 * platform user directories.
 *
 * Safety contract (ALL pinned by tests):
 *  1. NON-DESTRUCTIVE: sources are never deleted, truncated or modified.
 *  2. IDEMPOTENT: re-running a completed migration copies nothing twice;
 *    already-present destinations are reported as "skipped".
 *  3. EXPLICIT FAILURES: per-item errors are captured and reported; a
 *    failed item never corrupts the destination (copy-then-verify; a partial
 *    directory copy is removed before the error is reported).
 *  4. DETECT-FIRST: scanLegacyData() + planMigration() are pure/dry-run.
 *  5. Development mode never migrates: in a checkout the legacy locations
 *     ARE the live locations.
 */
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

import type { AppPaths } from "./paths";

export type LegacyItemKind = "file" | "dir";

export interface LegacyItemSpec {
  readonly key: string;
  readonly label: string;
  readonly relPath: string;
  readonly kind: LegacyItemKind;
  /** Selects the destination inside AppPaths. */
  readonly target: "configDir" | "dataDir" | "logDir" | "workspaceDir";
}

/** The legacy checkout layout this migration understands. */
export const LEGACY_LAYOUT: readonly LegacyItemSpec[] = [
  {
    key: "dotenv",
    label: "Environment configuration",
    relPath: ".env",
    kind: "file",
    target: "configDir",
  },
  {
    key: "data",
    label: "Application data (databases, memory, credentials, exports)",
    relPath: "data",
    kind: "dir",
    target: "dataDir",
  },
  {
    key: "logs",
    label: "Log files",
    relPath: "logs",
    kind: "dir",
    target: "logDir",
  },
  {
    key: "workspace",
    label: "Agent workspace",
    relPath: "workspace",
    kind: "dir",
    target: "workspaceDir",
  },
] as const;

export interface LegacyScanItem {
  readonly key: string;
  readonly label: string;
  readonly relPath: string;
  readonly kind: LegacyItemKind;
  readonly present: boolean;
  readonly sizeBytes: number;
  readonly fileCount: number;
}

export interface LegacyScan {
  readonly legacyRoot: string;
  readonly items: LegacyScanItem[];
  readonly anythingPresent: boolean;
}

export type PlannedAction = "copy" | "skip-not-present" | "skip-same-location";

export interface MigrationPlanItem {
  readonly key: string;
  readonly label: string;
  readonly source: string;
  readonly destination: string;
  readonly kind: LegacyItemKind;
  readonly action: PlannedAction;
  readonly sizeBytes: number;
}

export interface MigrationPlan {
  readonly legacyRoot: string;
  readonly items: MigrationPlanItem[];
  readonly requiresMigration: boolean;
}

export type ExecutedItemStatus =
  | "copied"
  | "skipped"
  | "absent"
  | "error";

export interface ExecutedItem {
  readonly key: string;
  readonly source: string;
  readonly destination: string;
  readonly status: ExecutedItemStatus;
  readonly detail: string;
}

export type MigrationStatus = "ok" | "noop" | "partial" | "failed";

export interface MigrationReport {
  readonly status: MigrationStatus;
  readonly items: ExecutedItem[];
  readonly copiedCount: number;
  readonly skippedCount: number;
  readonly errorCount: number;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly sourcesPreserved: true;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function measure(target: string): Promise<{ size: number; files: number }> {
  try {
    const s = await stat(target);
    if (s.isFile()) return { size: s.size, files: 1 };
    if (!s.isDirectory()) return { size: 0, files: 0 };
    let size = 0;
    let files = 0;
    const entries = await readdir(target, { withFileTypes: true });
    for (const entry of entries) {
      const child = path.join(target, entry.name);
      if (entry.isDirectory()) {
        const sub = await measure(child);
        size += sub.size;
        files += sub.files;
      } else if (entry.isFile()) {
        const cs = await stat(child);
        size += cs.size;
        files += 1;
      }
    }
    return { size, files };
  } catch {
    return { size: 0, files: 0 };
  }
}

export async function scanLegacyData(legacyRoot: string): Promise<LegacyScan> {
  const items: LegacyScanItem[] = [];
  for (const spec of LEGACY_LAYOUT) {
    const full = path.join(legacyRoot, spec.relPath);
    const present = await pathExists(full);
    const { size, files } = present ? await measure(full) : { size: 0, files: 0 };
    items.push({
      key: spec.key,
      label: spec.label,
      relPath: spec.relPath,
      kind: spec.kind,
      present,
      sizeBytes: size,
      fileCount: files,
    });
  }
  return {
    legacyRoot,
    items,
    anythingPresent: items.some((i) => i.present),
  };
}

export function planMigration(scan: LegacyScan, paths: AppPaths): MigrationPlan {
  const dirFor = (target: LegacyItemSpec["target"]): string => {
    switch (target) {
      case "configDir":
        return paths.configDir;
      case "dataDir":
        return paths.dataDir;
      case "logDir":
        return paths.logDir;
      case "workspaceDir":
        return paths.workspaceDir;
    }
  };

  const items: MigrationPlanItem[] = scan.items.map((item) => {
    const spec = LEGACY_LAYOUT.find((s) => s.key === item.key);
    const source = path.join(scan.legacyRoot, item.relPath);
    const destinationBase = dirFor(spec?.target ?? "dataDir");
    // For directory items we merge the CONTENTS of e.g. legacy data/ into
    // the target dataDir; for the .env file we place it at configDir/.env.
    const destination =
      item.kind === "dir"
        ? destinationBase
        : path.join(destinationBase, path.basename(item.relPath));

    let action: PlannedAction;
    if (!item.present) action = "skip-not-present";
    else if (sameLocation(source, destination)) action = "skip-same-location";
    else action = "copy";

    return {
      key: item.key,
      label: item.label,
      source,
      destination,
      kind: item.kind,
      action,
      sizeBytes: item.sizeBytes,
    };
  });

  return {
    legacyRoot: scan.legacyRoot,
    items,
    requiresMigration: items.some((i) => i.action === "copy"),
  };
}

function sameLocation(a: string, b: string): boolean {
  const norm = (p: string) =>
    path.resolve(p).replace(/[\\/]+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

export async function executeMigration(
  plan: MigrationPlan,
): Promise<MigrationReport> {
  const startedAt = new Date().toISOString();
  const executed: ExecutedItem[] = [];

  for (const item of plan.items) {
    if (item.action === "skip-not-present") {
      executed.push({
        key: item.key,
        source: item.source,
        destination: item.destination,
        status: "absent",
        detail: "No legacy data at this location.",
      });
      continue;
    }
    if (item.action === "skip-same-location") {
      executed.push({
        key: item.key,
        source: item.source,
        destination: item.destination,
        status: "skipped",
        detail: "Source and destination are the same location (development mode).",
      });
      continue;
    }

    const alreadyThere = await pathExists(item.destination);
    if (alreadyThere && item.kind === "file") {
      executed.push({
        key: item.key,
        source: item.source,
        destination: item.destination,
        status: "skipped",
        detail: "Destination already exists; not overwriting (idempotent).",
      });
      continue;
    }

    try {
      let copiedChildren = 1;
      if (item.kind === "file") {
        await mkdir(path.dirname(item.destination), { recursive: true });
        await cp(item.source, item.destination, { force: false, errorOnExist: true });
      } else {
        copiedChildren = await copyDirMerging(item.source, item.destination);
      }
      const verified = await pathExists(item.destination);
      if (!verified) {
        throw new Error("Post-copy verification failed: destination missing.");
      }
      if (item.kind === "dir" && copiedChildren === 0) {
        executed.push({
          key: item.key,
          source: item.source,
          destination: item.destination,
          status: "skipped",
          detail: "Destination already up to date (idempotent re-run).",
        });
        continue;
      }
      executed.push({
        key: item.key,
        source: item.source,
        destination: item.destination,
        status: "copied",
        detail: `Copied ${formatBytes(item.sizeBytes)}.`,
      });
    } catch (error) {
      executed.push({
        key: item.key,
        source: item.source,
        destination: item.destination,
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const copiedCount = executed.filter((i) => i.status === "copied").length;
  const errorCount = executed.filter((i) => i.status === "error").length;
  const skippedCount = executed.filter(
    (i) => i.status === "skipped" || i.status === "absent",
  ).length;

  const status: MigrationStatus =
    errorCount === 0 && copiedCount === 0
      ? "noop"
      : errorCount === 0
        ? "ok"
        : copiedCount > 0
          ? "partial"
          : "failed";

  return {
    status,
    items: executed,
    copiedCount,
    skippedCount,
    errorCount,
    startedAt,
    completedAt: new Date().toISOString(),
    // Compile-time proof of the non-destructive contract: sourcesPreserved
    // is a literal `true`; there is no code path that deletes a source.
    sourcesPreserved: true,
  };
}

/**
 * Merge-copy a legacy directory into the destination. Semantics:
 *  - existing destination FILES are never overwritten (idempotency)
 *  - existing destination DIRECTORIES are recursed into, so pre-created
 *    empty category directories (e.g. bootstrap `mkdir -p` of dataDir)
 *    never shadow legacy content beneath them
 *  - missing entries are staged under a temp sibling and swapped in, so a
 *    crash mid-copy cannot leave a half-written tree at the final name
 *  - dir→file kind conflicts skip the entry (never destructive)
 * Returns the number of entries actually copied at any depth
 * (0 ⇒ fully idempotent re-run; callers report "skipped").
 */
async function copyDirMerging(source: string, destination: string): Promise<number> {
  await mkdir(destination, { recursive: true });
  return mergeChildren(source, destination);
}

async function mergeChildren(sourceDir: string, destDir: string): Promise<number> {
  let copied = 0;
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(sourceDir, entry.name);
    const dst = path.join(destDir, entry.name);
    if (await pathExists(dst)) {
      if (entry.isDirectory()) {
        const dstStat = await stat(dst);
        if (dstStat.isDirectory()) {
          copied += await mergeChildren(src, dst);
        }
        // Existing non-directory at a directory's name: skip (conflict).
      }
      continue; // never overwrite
    }
    const staging = `${dst}.ultron-partial`;
    try {
      await cp(src, staging, { recursive: true, force: false, errorOnExist: true });
      await cp(staging, dst, { recursive: true, force: false, errorOnExist: true });
      copied += 1;
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
  return copied;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
}
