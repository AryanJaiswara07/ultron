import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Database URL comes from the environment (.env in a checkout;
 * <configDir>/.env once installed). Never hardcode credentials here —
 * this file is committed.
 */
const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Create a .env with " +
      "DATABASE_URL=postgresql://user:password@127.0.0.1:5432/app_db",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url },
});
