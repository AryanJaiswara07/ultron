import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * ULTRON persistence schema (v1.16).
 *
 * The database is itself user data: it lives OUTSIDE the application package
 * (provisioned via DATABASE_URL), satisfying the packaging requirement that
 * conversation data, credentials metadata and migration history must never
 * reside inside the installed package.
 */

export const appState = pgTable("ultron_app_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const events = pgTable(
  "ultron_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    type: text("type").notNull(),
    severity: text("severity").notNull().default("info"),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ultron_events_created_at_idx").on(t.createdAt)],
);

export const devices = pgTable("ultron_devices", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  /** SHA-256 fingerprint of the secret — the secret itself is never stored. */
  fingerprint: text("fingerprint").notNull(),
  /** Reference to the on-disk credential file (inside the user data dir). */
  credentialPath: text("credential_path").notNull(),
  status: text("status").notNull().default("pending"),
  issuedAt: timestamp("issued_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  statusReason: text("status_reason"),
});

export const migrationRuns = pgTable("ultron_migration_runs", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  status: text("status").notNull(),
  legacyRoot: text("legacy_root").notNull(),
  report: jsonb("report").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const conversations = pgTable("ultron_conversations", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const messages = pgTable(
  "ultron_messages",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // "user" | "assistant" | "system"
    content: text("content").notNull(),
    meta: jsonb("meta").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ultron_messages_conversation_idx").on(t.conversationId)],
);

/* ------------------------------ v2 "Presence" ----------------------------- */

/** Inspectable/deletable memory. `protected` rows can never be mutated by
 * the model or deleted through the API. */
export const memories = pgTable("ultron_memories", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  kind: text("kind").notNull().default("note"), // note | preference | project | context
  protected: text("protected").notNull().default("false"), // "true" | "false"
  meta: jsonb("meta").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Long-running task state (pause/resume/stop, context awareness). */
export const tasks = pgTable("ultron_tasks", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  goal: text("goal").notNull(),
  status: text("status").notNull().default("queued"), // queued|running|paused|awaiting_confirmation|completed|failed|stopped
  plan: jsonb("plan").notNull().default([]),
  currentStep: text("current_step"),
  result: jsonb("result"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
