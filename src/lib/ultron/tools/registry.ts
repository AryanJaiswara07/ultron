/**
 * Tool registry — the ONLY path from intent to effect.
 *
 * Every tool declares a permission tier; consequential tiers require a
 * single-use, TTL-limited confirmation token. The model/brain never calls
 * handlers directly: all proposals pass `executeTool`, which enforces
 * timeouts, audits everything on the event bus, and fails closed.
 *
 * Tiers:  read (free, audited-light) · write (audited) · system (audited)
 *         install / destructive (confirmation REQUIRED, every time)
 */
import { randomUUID } from "node:crypto";

import { ultronBus } from "../bus";
import type { AppPaths } from "../paths";

export type ToolTier = "read" | "write" | "system" | "install" | "destructive";

export interface ToolResult {
  readonly ok: boolean;
  /** Concise spoken line (progress speech — never chain-of-thought). */
  readonly speech: string;
  readonly data?: unknown;
  readonly error?: string;
  /** Set when the call is gated on user confirmation. */
  readonly confirmationRequired?: boolean;
  readonly confirmId?: string;
}

/** Injectable side-effects so handlers stay testable without a database. */
export interface ToolDeps {
  readonly remember: (note: string) => Promise<string>;
  readonly recall: () => Promise<Array<{ key: string; value: string }>>;
}

export interface ToolContext {
  readonly paths: AppPaths;
  readonly deps: ToolDeps;
  /** A previously granted confirmation token (single-use). */
  readonly confirmToken?: string;
}

export interface ToolDefinition {
  readonly name: string;
  readonly tier: ToolTier;
  readonly confirmRequired: boolean;
  readonly timeoutMs: number;
  readonly description: string;
  readonly handler: (
    ctx: ToolContext,
    args: Record<string, unknown>,
  ) => Promise<ToolResult>;
}

const registry = new Map<string, ToolDefinition>();

export function registerTool(def: ToolDefinition): void {
  if (registry.has(def.name)) throw new Error(`Duplicate tool: ${def.name}`);
  registry.set(def.name, def);
}

export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(name);
}

export function listTools(): Array<{
  name: string;
  tier: ToolTier;
  confirmRequired: boolean;
  description: string;
}> {
  return [...registry.values()].map((t) => ({
    name: t.name,
    tier: t.tier,
    confirmRequired: t.confirmRequired,
    description: t.description,
  }));
}

/* --------------------------- confirmation store --------------------------- */

const CONFIRM_TTL_MS = 90_000;

interface PendingConfirmation {
  readonly id: string;
  readonly tool: string;
  readonly summary: string;
  readonly createdAt: number;
  consumed: boolean;
}

const pending = new Map<string, PendingConfirmation>();

export function createConfirmation(tool: string, summary: string): PendingConfirmation {
  const entry: PendingConfirmation = {
    id: randomUUID(),
    tool,
    summary,
    createdAt: Date.now(),
    consumed: false,
  };
  pending.set(entry.id, entry);
  ultronBus.publish("confirmation_required", { confirmId: entry.id, tool, summary }, "warning");
  return entry;
}

/** Consumes a confirmation: single-use, TTL-bound. */
export function grantConfirmation(
  confirmId: string,
  granted: boolean,
): { ok: boolean; token?: string; error?: string } {
  const entry = pending.get(confirmId);
  if (!entry || entry.consumed) {
    ultronBus.publish("confirmation_denied", { confirmId, reason: "unknown or consumed" });
    return { ok: false, error: "Unknown or already-consumed confirmation id." };
  }
  if (Date.now() - entry.createdAt > CONFIRM_TTL_MS) {
    entry.consumed = true;
    ultronBus.publish("confirmation_denied", { confirmId, reason: "expired" });
    return { ok: false, error: "Confirmation expired." };
  }
  entry.consumed = true;
  if (!granted) {
    ultronBus.publish("confirmation_denied", { confirmId, tool: entry.tool });
    return { ok: true };
  }
  const token = randomUUID();
  tokens.add(token);
  ultronBus.publish("confirmation_granted", { confirmId, tool: entry.tool });
  return { ok: true, token };
}

const tokens = new Set<string>();

function consumeToken(token: string): boolean {
  if (!tokens.has(token)) return false;
  tokens.delete(token);
  return true;
}

/** Test hook: wipe pending confirmations + tokens. */
export function resetConfirmations(): void {
  pending.clear();
  tokens.clear();
}

/* ------------------------------- execution -------------------------------- */

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const def = registry.get(name);
  if (!def) {
    return {
      ok: false,
      speech: "I don't have that capability.",
      error: `Unknown tool: ${name}`,
    };
  }

  if (def.confirmRequired) {
    if (!ctx.confirmToken || !consumeToken(ctx.confirmToken)) {
      const confirmation = createConfirmation(
        name,
        summarize(name, args),
      );
      return {
        ok: false,
        confirmationRequired: true,
        confirmId: confirmation.id,
        speech: `I need your confirmation: ${confirmation.summary}.`,
        error: "confirmation_required",
      };
    }
  }

  ultronBus.publish("tool_started", { tool: name });
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<ToolResult>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Tool ${name} timed out after ${def.timeoutMs}ms`)),
        def.timeoutMs,
      );
    });
    const result = await Promise.race([def.handler(ctx, args), timeout]);
    ultronBus.publish("tool_finished", {
      tool: name,
      ok: result.ok,
      latencyMs: Date.now() - started,
      ...(result.ok ? {} : { error: (result.error ?? "").slice(0, 200) }),
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ultronBus.publish(
      "tool_finished",
      { tool: name, ok: false, latencyMs: Date.now() - started, error: message.slice(0, 200) },
      "warning",
    );
    return {
      ok: false,
      speech: "That didn't work. I'm checking why.",
      error: message.slice(0, 400),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function summarize(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case "shell.exec":
      return `run command \`${(args.argv as string[])?.slice(0, 6).join(" ") ?? ""}\``;
    case "project.scaffold":
      return `create project "${args.name ?? ""}" in the workspace`;
    default:
      return `allow tool "${tool}"`;
  }
}
