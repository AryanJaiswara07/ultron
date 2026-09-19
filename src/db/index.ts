import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Database access is LAZY and degradation-aware (v2.0.1).
 *
 * Importing this module never throws and never connects. The first actual
 * database use creates the pool if — and only if — DATABASE_URL is set.
 * Without configuration, getDb() raises DatabaseUnavailableError, which
 * callers catch to report "database offline" honestly instead of crashing
 * every route (ULTRON must stay usable — voice, intents, tools, stats —
 * on a laptop that hasn't finished its PostgreSQL setup yet).
 */
export class DatabaseUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

/** True when a connection string is configured (does not probe the server). */
export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== "");
}

const globalForDb = globalThis as typeof globalThis & {
  __ultronDbPool?: Pool;
  __ultronDb?: NodePgDatabase;
};

function createPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim() === "") {
    throw new DatabaseUnavailableError(
      "DATABASE_URL is not set. Copy .env.example to .env, point it at your " +
        "PostgreSQL instance, and restart ULTRON. (ULTRON keeps running in " +
        "degraded mode until then; persistence is paused.)",
    );
  }
  return new Pool({ connectionString: databaseUrl });
}

/** Lazily create/return the Drizzle client. Throws DatabaseUnavailableError. */
export function getDb(): NodePgDatabase {
  if (globalForDb.__ultronDb) return globalForDb.__ultronDb;
  const pool = globalForDb.__ultronDbPool ?? createPool();
  globalForDb.__ultronDbPool = pool;
  globalForDb.__ultronDb = drizzle(pool);
  return globalForDb.__ultronDb;
}
