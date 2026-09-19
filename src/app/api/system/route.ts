import { access, constants } from "node:fs/promises";

import { bootstrapUltron } from "@/lib/ultron/bootstrap";
import { planMigration } from "@/lib/ultron/migrate";
import { systemCounts } from "@/db/queries";

export const dynamic = "force-dynamic";

async function writable(dir: string): Promise<boolean> {
  try {
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const ctx = await bootstrapUltron();
  const p = ctx.paths;
  const counts = await systemCounts().catch(() => null);

  const locations = [
    { key: "config", label: "Configuration", path: p.configDir },
    { key: "data", label: "Application data", path: p.dataDir },
    { key: "databases", label: "Databases", path: p.databasesDir },
    { key: "transcripts", label: "Transcripts", path: p.transcriptsDir },
    { key: "memory", label: "Memory", path: p.memoryDir },
    { key: "identity", label: "Identity", path: p.identityDir },
    { key: "credentials", label: "Device credentials", path: p.credentialsDir },
    { key: "allowlist", label: "Device allowlist", path: p.deviceAllowlistFile },
    { key: "workspace", label: "Workspace", path: p.workspaceDir },
    { key: "logs", label: "Logs", path: p.logDir },
    { key: "exports", label: "Exports", path: p.exportsDir },
    { key: "visualizer", label: "Visualiser output", path: p.visualizerDir },
    { key: "cache", label: "Cache", path: p.cacheDir },
  ];

  const withWritability = await Promise.all(
    locations.map(async (loc) => ({
      ...loc,
      writable: await writable(loc.path.endsWith(".json") ? p.dataDir : loc.path),
    })),
  );

  const migrationPlan = planMigration(ctx.legacyScan, p);

  return Response.json({
    version: ctx.version,
    startedAt: ctx.startedAt,
    mode: p.mode,
    installRoot: p.installRoot,
    dotenvFile: p.dotenvFile,
    locations: withWritability,
    warnings: ctx.warnings,
    envSources: ctx.env.sources.map((s) => ({
      file: s.file,
      found: s.found,
      keysContributed: s.keysContributed,
    })),
    legacy: {
      root: ctx.legacyScan.legacyRoot,
      anythingPresent: ctx.legacyScan.anythingPresent,
      requiresMigration: migrationPlan.requiresMigration,
    },
    counts,
  });
}
