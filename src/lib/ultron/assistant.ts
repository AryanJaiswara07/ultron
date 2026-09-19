/**
 * ULTRON console command engine — deterministic, local, honest.
 *
 * The console offers natural-feeling conversational control over real system
 * capabilities (paths, migration, devices, events, config) without claiming
 * to be a large language model. Every response is computed from live system
 * state. Unknown free-form input receives helpful guidance, never fabricated
 * intelligence.
 */
import type { AppPaths } from "./paths";
import { ULTRON_VERSION } from "./version";

export interface AssistantQuery {
  readonly input: string;
  readonly paths: AppPaths;
  readonly stats: {
    readonly events: number;
    readonly devices: number;
    readonly conversations: number;
    readonly messages: number;
    readonly migrationRuns: number;
  };
  readonly legacyDetected: boolean;
}

export interface AssistantReply {
  readonly content: string;
  readonly intent: string;
  readonly suggestions: string[];
}

const COMMANDS: Array<{ name: string; hint: string }> = [
  { name: "status", hint: "system status overview" },
  { name: "paths", hint: "where every data category lives" },
  { name: "mode", hint: "development vs installed mode" },
  { name: "devices", hint: "device trust summary" },
  { name: "migrate", hint: "legacy data migration guidance" },
  { name: "events", hint: "recent event log guidance" },
  { name: "version", hint: "version information" },
  { name: "help", hint: "list available commands" },
];

export function runAssistant(query: AssistantQuery): AssistantReply {
  const text = query.input.trim();
  const lower = text.toLowerCase();
  const cmd = lower.replace(/^\//, "").split(/\s+/)[0] ?? "";

  if (["help", "commands", "?"].includes(cmd)) {
    return {
      intent: "help",
      content:
        "I can report live system facts and guide operational actions. Available commands:\n" +
        COMMANDS.map((c) => `  /${c.name.padEnd(9)} — ${c.hint}`).join("\n") +
        "\n\nAsk in natural language too — e.g. \"where is my data stored?\"",
      suggestions: ["/status", "/paths", "/migrate"],
    };
  }

  if (["version", "v"].includes(cmd) || lower.includes("what version")) {
    return {
      intent: "version",
      content: `ULTRON v${ULTRON_VERSION} "Presence" — voice-first operating layer architecture. Running in ${query.paths.mode} mode.`,
      suggestions: ["/status"],
    };
  }

  if (["paths", "storage", "data"].includes(cmd) || lower.includes("where") && lower.includes("data")) {
    const p = query.paths;
    return {
      intent: "paths",
      content:
        `All writable data resolves to ${p.mode === "development" ? "checkout-local directories (development mode)" : "platform user directories (installed mode)"}:\n` +
        [
          ["config", p.configDir],
          ["data", p.dataDir],
          ["databases", p.databasesDir],
          ["credentials", p.credentialsDir],
          ["logs", p.logDir],
          ["workspace", p.workspaceDir],
          ["cache", p.cacheDir],
        ]
          .map(([k, v]) => `  ${k.padEnd(12)} ${v}`)
          .join("\n") +
        "\n\nThe full map is on the System tab.",
      suggestions: ["/migrate", "/mode"],
    };
  }

  if (["mode", "install"].includes(cmd)) {
    const p = query.paths;
    return {
      intent: "mode",
      content:
        p.mode === "development"
          ? "Development mode: ULTRON detected a repository checkout, so writable paths remain inside the checkout (data/, logs/, workspace/). Nothing was moved. Install for production to relocate data to platform user directories."
          : "Installed mode: writable paths resolve to platform user directories, completely outside the application package. The package directory is treated as read-only.",
      suggestions: ["/paths", "/migrate"],
    };
  }

  if (["status", "state", "health"].includes(cmd)) {
    const s = query.stats;
    return {
      intent: "status",
      content:
        `ULTRON v${ULTRON_VERSION} operational (${query.paths.mode} mode).\n` +
        `  events          ${s.events}\n` +
        `  devices         ${s.devices}\n` +
        `  conversations   ${s.conversations}\n` +
        `  messages        ${s.messages}\n` +
        `  migration runs  ${s.migrationRuns}\n` +
        (query.legacyDetected
          ? "\nLegacy checkout data detected — review the Migration panel on the System tab."
          : "\nNo unmigrated legacy data detected."),
      suggestions: ["/paths", "/devices"],
    };
  }

  if (["devices", "device", "trust"].includes(cmd)) {
    return {
      intent: "devices",
      content: `${query.stats.devices} device record(s) on file. Issue credentials and manage the allowlist from the Devices tab. Credential files are stored with restrictive permissions in the user data directory — never inside the application package.`,
      suggestions: ["/status"],
    };
  }

  if (["migrate", "migration", "upgrade"].includes(cmd)) {
    return {
      intent: "migrate",
      content: query.legacyDetected
        ? "Legacy checkout data was detected. Migration copies (never deletes) .env, data/, logs/ and workspace/ into your platform user directories. It is idempotent — safe to run repeatedly. Review the dry-run plan on the System tab, then confirm."
        : "No legacy checkout data requires migration right now. The dry-run plan on the System tab stays available for verification.",
      suggestions: ["/status", "/paths"],
    };
  }

  if (["events", "log", "logs"].includes(cmd)) {
    return {
      intent: "events",
      content: `${query.stats.events} event(s) recorded. The Events tab streams the security-relevant audit trail (boots, migrations, device trust changes, sandbox violations).`,
      suggestions: ["/status"],
    };
  }

  return {
    intent: "fallback",
    content:
      `I parsed "${text.slice(0, 80)}" but have no deterministic handler for it. I report live system facts and guide operations — I do not fabricate answers. Try /help for what I can do, or /status for a system overview.`,
    suggestions: ["/help", "/status", "/paths"],
  };
}
