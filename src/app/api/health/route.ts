import { databaseConfigured, getDb } from "@/db";
import { ULTRON_VERSION } from "@/lib/ultron/version";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, version: ULTRON_VERSION });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        version: ULTRON_VERSION,
        degraded: !databaseConfigured(),
        reason:
          error instanceof Error && error.name === "DatabaseUnavailableError"
            ? "DATABASE_URL not configured"
            : "database unreachable",
      },
      { status: 500 },
    );
  }
}
