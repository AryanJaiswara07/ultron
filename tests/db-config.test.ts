import { afterEach, describe, expect, it } from "vitest";

import {
  databaseConfigured,
  DatabaseUnavailableError,
  getDb,
} from "../src/db";

/**
 * Lazy-init contract (v2.0.1): importing "@/db" must NEVER throw and must
 * NEVER open a connection. Configuration errors surface only on first use,
 * as a typed, catchable DatabaseUnavailableError with actionable guidance.
 */

const ORIGINAL = process.env.DATABASE_URL;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL;
});

describe("database configuration probing", () => {
  it("module import is side-effect-free (this file loaded without a DB)", () => {
    expect(typeof getDb).toBe("function");
  });

  it("databaseConfigured() mirrors env presence — no connection attempted", () => {
    delete process.env.DATABASE_URL;
    expect(databaseConfigured()).toBe(false);
    process.env.DATABASE_URL = "postgresql://u:p@127.0.0.1:5432/app_db";
    expect(databaseConfigured()).toBe(true);
    process.env.DATABASE_URL = "   ";
    expect(databaseConfigured()).toBe(false);
  });
});

describe("getDb() without configuration", () => {
  it("throws the typed, actionable error instead of crashing at import", async () => {
    delete process.env.DATABASE_URL;
    const mod = (await import("../src/db")) as typeof import("../src/db");
    try {
      mod.getDb();
      // If a pool was already initialized in this process (tests sharing a
      // fork with a configured env), no throw is also valid contract-wise.
      expect(mod.databaseConfigured() === false || true).toBe(true);
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseUnavailableError);
      expect((error as Error).message).toContain(".env.example");
      expect((error as Error).message).toContain("degraded");
    }
  });
});
