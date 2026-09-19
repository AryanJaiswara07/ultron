import { bootstrapUltron } from "@/lib/ultron/bootstrap";
import { executeMigration, planMigration } from "@/lib/ultron/migrate";
import {
  insertMigrationRun,
  listMigrationRuns,
  recordEvent,
} from "@/db/queries";

export const dynamic = "force-dynamic";

/** Dry-run: scan legacy data and compute the copy plan. Copies nothing. */
export async function GET() {
  const ctx = await bootstrapUltron();
  const plan = planMigration(ctx.legacyScan, ctx.paths);
  const history = await listMigrationRuns().catch(() => []);
  return Response.json({
    plan: {
      legacyRoot: plan.legacyRoot,
      requiresMigration: plan.requiresMigration,
      items: plan.items,
    },
    mode: ctx.paths.mode,
    history,
  });
}

/**
 * Execute the migration. Non-destructive (sources preserved) and idempotent
 * (existing destinations are skipped, never overwritten).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    confirm?: boolean;
  };
  if (body.confirm !== true) {
    return Response.json(
      { error: "Explicit confirmation required: POST { \"confirm\": true }." },
      { status: 400 },
    );
  }

  const ctx = await bootstrapUltron();
  const plan = planMigration(ctx.legacyScan, ctx.paths);
  const report = await executeMigration(plan);

  await insertMigrationRun({
    status: report.status,
    legacyRoot: plan.legacyRoot,
    report,
  }).catch(() => undefined);

  await recordEvent(
    report.status === "failed" || report.status === "partial"
      ? "migration.failed"
      : "migration.completed",
    {
      status: report.status,
      copied: report.copiedCount,
      skipped: report.skippedCount,
      errors: report.errorCount,
      legacyRoot: plan.legacyRoot,
    },
    report.status === "failed" ? "critical" : report.status === "partial" ? "warning" : "info",
  );

  return Response.json(report, {
    status: report.status === "failed" ? 500 : 200,
  });
}
