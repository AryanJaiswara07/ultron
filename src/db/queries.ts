/**
 * Data-access layer for ULTRON. The ONLY module (besides migrations and API
 * route handlers delegating here) that talks to the database tables.
 *
 * Every function acquires the client via getDb() at call time: without
 * DATABASE_URL it raises DatabaseUnavailableError, which route handlers and
 * tools catch to report a degraded (offline) state instead of crashing.
 */
import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  appState,
  conversations,
  devices,
  events,
  memories,
  messages,
  migrationRuns,
  tasks,
} from "@/db/schema";
import type {
  EventSeverity,
  UltronEventPayload,
  UltronEventType,
} from "@/lib/ultron/events";
import type { MigrationReport } from "@/lib/ultron/migrate";
import type { DeviceStatus } from "@/lib/ultron/devices";

/* ---------------------------------- state --------------------------------- */

export async function getAppState<T>(key: string): Promise<T | null> {
  const db = getDb();
  const rows = await db
    .select({ value: appState.value })
    .from(appState)
    .where(eq(appState.key, key))
    .limit(1);
  return rows.length > 0 ? (rows[0].value as T) : null;
}

export async function setAppState(key: string, value: unknown): Promise<void> {
  const db = getDb();
  await db
    .insert(appState)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appState.key,
      set: { value, updatedAt: new Date() },
    });
}

/* --------------------------------- events --------------------------------- */

export async function recordEvent(
  type: UltronEventType,
  payload: UltronEventPayload = {},
  severity: EventSeverity = "info",
): Promise<void> {
  try {
    const db = getDb();
    await db.insert(events).values({ type, payload, severity });
  } catch {
    // Event logging must never take down the request that triggered it.
  }
}

export async function listEvents(limit = 100) {
  const db = getDb();
  return db
    .select()
    .from(events)
    .orderBy(desc(events.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}

/* --------------------------------- devices -------------------------------- */

export async function insertDevice(row: {
  id: string;
  name: string;
  fingerprint: string;
  credentialPath: string;
}) {
  const db = getDb();
  await db.insert(devices).values({ ...row, status: "pending" });
}

export async function listDevices() {
  const db = getDb();
  return db.select().from(devices).orderBy(desc(devices.issuedAt));
}

export async function updateDeviceStatus(
  id: string,
  status: DeviceStatus,
  reason?: string,
) {
  const db = getDb();
  const updated = await db
    .update(devices)
    .set({ status, statusReason: reason ?? null })
    .where(eq(devices.id, id))
    .returning({ id: devices.id });
  return updated.length > 0;
}

/* -------------------------------- migrations ------------------------------- */

export async function insertMigrationRun(args: {
  status: string;
  legacyRoot: string;
  report: MigrationReport;
}) {
  const db = getDb();
  await db.insert(migrationRuns).values({
    status: args.status,
    legacyRoot: args.legacyRoot,
    report: args.report,
    startedAt: new Date(args.report.startedAt),
    completedAt: new Date(args.report.completedAt),
  });
}

export async function listMigrationRuns(limit = 20) {
  const db = getDb();
  return db
    .select()
    .from(migrationRuns)
    .orderBy(desc(migrationRuns.createdAt))
    .limit(limit);
}

/* ------------------------------ conversations ----------------------------- */

export async function createConversation(title: string) {
  const db = getDb();
  const rows = await db
    .insert(conversations)
    .values({ title })
    .returning({ id: conversations.id, title: conversations.title });
  return rows[0];
}

export async function listConversations(limit = 30) {
  const db = getDb();
  return db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .limit(limit);
}

export async function getConversation(id: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function addMessage(args: {
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  meta?: Record<string, unknown>;
}) {
  const db = getDb();
  const rows = await db
    .insert(messages)
    .values({
      conversationId: args.conversationId,
      role: args.role,
      content: args.content,
      meta: args.meta ?? {},
    })
    .returning({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
      meta: messages.meta,
    });
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, args.conversationId));
  return rows[0];
}

export async function listMessages(conversationId: string, limit = 200) {
  const db = getDb();
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.reverse();
}

/* --------------------------------- memories -------------------------------- */

export async function rememberNote(
  value: string,
  kind: "note" | "preference" | "project" | "context" = "note",
): Promise<string> {
  const db = getDb();
  const key = `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(memories).values({ key, value: value.slice(0, 2000), kind });
  return key;
}

export async function listMemories(limit = 100) {
  const db = getDb();
  return db
    .select()
    .from(memories)
    .orderBy(desc(memories.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}

export async function deleteMemory(
  id: string,
): Promise<"deleted" | "protected" | "missing"> {
  const db = getDb();
  const rows = await db
    .select()
    .from(memories)
    .where(eq(memories.id, id))
    .limit(1);
  if (rows.length === 0) return "missing";
  if (rows[0].protected === "true") return "protected";
  await db.delete(memories).where(eq(memories.id, id));
  return "deleted";
}

/* ---------------------------------- tasks ---------------------------------- */

export type TaskStatus =
  | "queued"
  | "running"
  | "paused"
  | "awaiting_confirmation"
  | "completed"
  | "failed"
  | "stopped";

export async function insertTask(goal: string, plan: unknown): Promise<string> {
  const db = getDb();
  const rows = await db
    .insert(tasks)
    .values({ goal, plan, status: "queued" })
    .returning({ id: tasks.id });
  return rows[0].id;
}

export async function updateTask(
  id: string,
  patch: Partial<{
    status: TaskStatus;
    currentStep: string | null;
    result: unknown;
  }>,
): Promise<void> {
  const db = getDb();
  await db
    .update(tasks)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(tasks.id, id));
}

export async function getTask(id: string) {
  const db = getDb();
  const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listTasks(limit = 20) {
  const db = getDb();
  return db
    .select()
    .from(tasks)
    .orderBy(desc(tasks.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

/* --------------------------------- counts ---------------------------------- */

export async function systemCounts() {
  const db = getDb();
  const [evt, dev, conv, msg, mig] = await Promise.all([
    db.select().from(events),
    db.select().from(devices),
    db.select().from(conversations),
    db.select().from(messages),
    db.select().from(migrationRuns),
  ]);
  return {
    events: evt.length,
    devices: dev.length,
    conversations: conv.length,
    messages: msg.length,
    migrationRuns: mig.length,
  };
}
