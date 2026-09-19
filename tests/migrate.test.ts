import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  executeMigration,
  LEGACY_LAYOUT,
  planMigration,
  scanLegacyData,
} from "../src/lib/ultron/migrate";
import { resolveAppPaths, type AppPaths } from "../src/lib/ultron/paths";

let base: string;
let legacyRoot: string;
let installRoot: string;
let targetPaths: AppPaths;

async function seedLegacyTree(root: string) {
  await mkdir(path.join(root, "data", "databases"), { recursive: true });
  await mkdir(path.join(root, "logs"), { recursive: true });
  await mkdir(path.join(root, "workspace", "proj"), { recursive: true });
  await writeFile(path.join(root, ".env"), "DEVICE_SECRET=hunter2\n", "utf8");
  await writeFile(
    path.join(root, "data", "databases", "memory.db"),
    "sqlite-bytes",
    "utf8",
  );
  await writeFile(path.join(root, "logs", "boot.log"), "boot ok\n", "utf8");
  await writeFile(
    path.join(root, "workspace", "proj", "notes.md"),
    "# work\n",
    "utf8",
  );
}

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), "ultron-migrate-"));
  legacyRoot = path.join(base, "old-checkout");
  installRoot = path.join(base, "installed-package");
  await mkdir(installRoot, { recursive: true });
  await seedLegacyTree(legacyRoot);

  targetPaths = resolveAppPaths({
    env: { ULTRON_HOME: path.join(base, "user-home") },
    platform: "linux",
    homeDir: path.join(base, "unused-home"),
    installRoot,
    mode: "installed",
  });
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("scanLegacyData (detection)", () => {
  it("detects all four legacy categories with sizes", async () => {
    const scan = await scanLegacyData(legacyRoot);
    expect(scan.anythingPresent).toBe(true);
    const byKey = Object.fromEntries(scan.items.map((i) => [i.key, i]));
    expect(LEGACY_LAYOUT.map((s) => s.key).sort()).toEqual(
      scan.items.map((i) => i.key).sort(),
    );
    expect(byKey.dotenv.present).toBe(true);
    expect(byKey.dotenv.kind).toBe("file");
    expect(byKey.data.present).toBe(true);
    expect(byKey.data.fileCount).toBeGreaterThanOrEqual(1);
    expect(byKey.logs.present).toBe(true);
    expect(byKey.workspace.present).toBe(true);
  });

  it("reports nothing present for a clean directory", async () => {
    const empty = path.join(base, "empty-root");
    await mkdir(empty, { recursive: true });
    const scan = await scanLegacyData(empty);
    expect(scan.anythingPresent).toBe(false);
    expect(scan.items.every((i) => !i.present)).toBe(true);
  });
});

describe("planMigration (dry run)", () => {
  it("targets user directories, never the installation root", async () => {
    const scan = await scanLegacyData(legacyRoot);
    const plan = planMigration(scan, targetPaths);
    expect(plan.requiresMigration).toBe(true);
    for (const item of plan.items) {
      expect(item.destination.startsWith(installRoot)).toBe(false);
      if (item.key !== "dotenv") continue;
      expect(item.destination).toBe(
        path.join(targetPaths.configDir, ".env"),
      );
    }
  });

  it("marks same-location items as no-ops (development mode safety)", async () => {
    const devPaths = resolveAppPaths({
      env: {},
      platform: "linux",
      homeDir: path.join(base, "unused-home"),
      installRoot: legacyRoot,
      mode: "development",
    });
    const scan = await scanLegacyData(legacyRoot);
    const plan = planMigration(scan, devPaths);
    expect(plan.requiresMigration).toBe(false);
    expect(
      plan.items.every(
        (i) => i.action === "skip-same-location" || i.action === "skip-not-present",
      ),
    ).toBe(true);
  });
});

describe("executeMigration", () => {
  it("copies every category; originals preserved byte-for-byte", async () => {
    const scan = await scanLegacyData(legacyRoot);
    const plan = planMigration(scan, targetPaths);
    const report = await executeMigration(plan);

    expect(report.status).toBe("ok");
    expect(report.errorCount).toBe(0);
    expect(report.sourcesPreserved).toBe(true);

    // destinations exist
    const dotenv = await readFile(
      path.join(targetPaths.configDir, ".env"),
      "utf8",
    );
    expect(dotenv).toBe("DEVICE_SECRET=hunter2\n");
    const migratedDb = await readFile(
      path.join(targetPaths.dataDir, "databases", "memory.db"),
      "utf8",
    );
    expect(migratedDb).toBe("sqlite-bytes");

    // ORIGINALS STILL EXIST — non-destructive contract
    expect(await readFile(path.join(legacyRoot, ".env"), "utf8")).toBe(
      "DEVICE_SECRET=hunter2\n",
    );
    expect(
      await readFile(
        path.join(legacyRoot, "data", "databases", "memory.db"),
        "utf8",
      ),
    ).toBe("sqlite-bytes");
    expect(
      await readFile(path.join(legacyRoot, "workspace", "proj", "notes.md"), "utf8"),
    ).toBe("# work\n");
  });

  it("second run is fully idempotent: copies nothing, errors on nothing", async () => {
    const scan = await scanLegacyData(legacyRoot);
    const plan = planMigration(scan, targetPaths);
    const report = await executeMigration(plan);

    expect(report.copiedCount).toBe(0);
    expect(report.errorCount).toBe(0);
    expect(report.status).toBe("noop");
    expect(report.items.every((i) => i.status !== "copied")).toBe(true);
  });

  it("leaves no partial staging artifacts behind", async () => {
    const leftovers: string[] = [];
    async function walk(dir: string) {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.includes(".ultron-partial")) leftovers.push(e.name);
        if (e.isDirectory()) await walk(path.join(dir, e.name));
      }
    }
    await walk(path.join(base, "user-home"));
    expect(leftovers).toEqual([]);
  });

  it("reports failures explicitly without corrupting prior data", async () => {
    // Sabotage: put a FILE where the logs directory must be merged.
    const badHome = path.join(base, "bad-home");
    const badPaths = resolveAppPaths({
      env: { ULTRON_HOME: badHome },
      platform: "linux",
      homeDir: path.join(base, "unused-home"),
      installRoot,
      mode: "installed",
    });
    await mkdir(path.dirname(badPaths.logDir), { recursive: true });
    await writeFile(badPaths.logDir, "i am a file, not a directory", "utf8");

    const scan = await scanLegacyData(legacyRoot);
    const plan = planMigration(scan, badPaths);
    const report = await executeMigration(plan);

    expect(["partial", "failed"]).toContain(report.status);
    expect(report.errorCount).toBeGreaterThanOrEqual(1);
    const logsItem = report.items.find((i) => i.key === "logs");
    expect(logsItem?.status).toBe("error");

    // .env still migrated fine despite the logs failure (isolation)
    const dotenv = await readFile(
      path.join(badPaths.configDir, ".env"),
      "utf8",
    );
    expect(dotenv).toBe("DEVICE_SECRET=hunter2\n");

    // originals remain untouched even after a failed run
    const s = await stat(path.join(legacyRoot, "logs", "boot.log"));
    expect(s.isFile()).toBe(true);
  });

  it("merges INTO pre-created empty destination subdirectories (bootstrap regression)", async () => {
    // Regression: the runtime bootstrap creates dataDir/databases etc. during
    // startup. A naive top-level merge would see those existing directories
    // and skip them, silently dropping nested legacy content.
    const home = path.join(base, "shadowed-home");
    const shadowPaths = resolveAppPaths({
      env: { ULTRON_HOME: home },
      platform: "linux",
      homeDir: path.join(base, "unused-home"),
      installRoot,
      mode: "installed",
    });
    // Simulate bootstrap: empty category dirs already exist at destination.
    await mkdir(shadowPaths.dataDir, { recursive: true });
    await mkdir(shadowPaths.databasesDir, { recursive: true });
    await mkdir(shadowPaths.logDir, { recursive: true });
    await mkdir(shadowPaths.workspaceDir, { recursive: true });
    await mkdir(shadowPaths.configDir, { recursive: true });

    const scan = await scanLegacyData(legacyRoot);
    const plan = planMigration(scan, shadowPaths);
    const report = await executeMigration(plan);

    expect(report.errorCount).toBe(0);
    // The nested file MUST have been merged into the pre-created dir.
    expect(
      await readFile(
        path.join(shadowPaths.databasesDir, "memory.db"),
        "utf8",
      ),
    ).toBe("sqlite-bytes");
    expect(
      await readFile(path.join(shadowPaths.logDir, "boot.log"), "utf8"),
    ).toBe("boot ok\n");
    expect(
      await readFile(
        path.join(shadowPaths.workspaceDir, "proj", "notes.md"),
        "utf8",
      ),
    ).toBe("# work\n");

    // And the re-run is still fully idempotent.
    const second = await executeMigration(planMigration(scan, shadowPaths));
    expect(second.copiedCount).toBe(0);
    expect(second.status).toBe("noop");
  });

  it("never overwrites an existing destination file", async () => {
    const home = path.join(base, "conflict-home");
    const conflictPaths = resolveAppPaths({
      env: { ULTRON_HOME: home },
      platform: "linux",
      homeDir: path.join(base, "unused-home"),
      installRoot,
      mode: "installed",
    });
    await mkdir(conflictPaths.configDir, { recursive: true });
    await writeFile(
      path.join(conflictPaths.configDir, ".env"),
      "DEVICE_SECRET=existing\n",
      "utf8",
    );

    const scan = await scanLegacyData(legacyRoot);
    const plan = planMigration(scan, conflictPaths);
    const report = await executeMigration(plan);

    const dotenvItem = report.items.find((i) => i.key === "dotenv");
    expect(dotenvItem?.status).toBe("skipped");
    // the pre-existing file survived
    expect(
      await readFile(path.join(conflictPaths.configDir, ".env"), "utf8"),
    ).toBe("DEVICE_SECRET=existing\n");
  });
});
