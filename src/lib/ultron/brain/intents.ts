/**
 * Deterministic intent router — the zero-cost first line of understanding.
 * Handles natural phrasing variations for high-frequency commands locally
 * (cost-awareness contract: cloud reasoning is reserved for complex work).
 *
 * Output is an ACTION PROPOSAL. Execution belongs to the tool registry /
 * orchestrator — never to this module.
 */
import type { BrainProvider, BrainRequest, BrainResponse } from "./providers";

export type IntentAction =
  | { kind: "reply"; text: string }
  | { kind: "tool"; tool: string; args: Record<string, string> }
  | { kind: "task"; goal: string }
  | { kind: "unresolved" };

export interface IntentResult {
  readonly intent: string;
  readonly confidence: number;
  readonly action: IntentAction;
  /** What ULTRON would say while acting (concise, no chain-of-thought). */
  readonly speech: string;
}

/* ------------------------------ word banks ------------------------------- */

const AFFIRM_WAKE = [
  "Yes, boss.",
  "I'm here.",
  "Listening.",
  "Go ahead.",
];

const OPEN_APP = [
  // wake variations — leading "hey/ok/okay/hi" around the wake word too,
  // because people naturally repeat the full wake phrase every command
  /^(?:hey|ok(?:ay)?|hi|yo)[,.\s]+ultron[,.\s]+/i,
  /^ultron[,\s]+/i,
  /^(please\s+)?(can you\s+|could you\s+)?/i,
];

/** Leading wake aliases that leave NOTHING behind → bare wake affirmation. */
const BARE_WAKE_PATTERN =
  /^(?:hey|ok(?:ay)?|hi|yo)?[,.\s]*(?:ultron)?[.!?\s]*$/i;

/**
 * Strip wake word + politeness, normalize spaces.
 * Returns "" when the utterance was ONLY a wake phrase.
 */
export function normalizeUtterance(input: string): string {
  let text = input.trim().replace(/\s+/g, " ");
  if (BARE_WAKE_PATTERN.test(text)) return "";
  for (const strip of OPEN_APP) text = text.replace(strip, "");
  // trailing politeness + plain sentence punctuation
  text = text.replace(/\s*(please|for me)[.!?]*$/i, "");
  text = text.replace(/[.!?]+$/, "");
  return text.trim();
}

const APP_SYNONYMS: Array<[RegExp, string]> = [
  [/\b(vs\s?code|visual studio code|code editor|my editor|editor)\b/i, "vscode"],
  [/\b(chrome|google chrome|browser|web browser)\b/i, "chrome"],
  [/\b(edge|microsoft edge)\b/i, "edge"],
  [/\b(terminal|command prompt|cmd|powershell|shell)\b/i, "terminal"],
  [/\b(explorer|file explorer|files|file manager)\b/i, "explorer"],
  [/\b(spotify|music)\b/i, "spotify"],
  [/\b(discord)\b/i, "discord"],
  [/\b(gta|grand theft auto)\b/i, "gta"],
];

const OPEN_VERBS =
  /^(open|launch|start|get\s+up|fire\s+up|bring\s+up|spin\s+up|pull\s+up|run|boot\s+up)\b/i;

export function routeIntent(rawInput: string): IntentResult {
  const input = rawInput.trim();
  const text = normalizeUtterance(input);
  const lower = text.toLowerCase();

  // --- bare wake phrase (any variant: "ultron", "hey ultron", "ok ultron")
  if (text === "") {
    return {
      intent: "wake",
      confidence: 1,
      action: { kind: "reply", text: pick(AFFIRM_WAKE) },
      speech: pick(AFFIRM_WAKE),
    };
  }

  // --- open/launch application
  const openMatch = OPEN_VERBS.exec(text);
  if (openMatch) {
    const rest = text.slice(openMatch[0].length).trim();
    const app = resolveApp(rest);
    if (app) {
      return {
        intent: "app.open",
        confidence: 0.9,
        action: {
          kind: "tool",
          tool: "apps.open",
          args: { app: app.id, label: app.label },
        },
        speech: `Opening ${app.label}.`,
      };
    }
  }
  // inverted phrasing: "get VS Code up / get chrome running"
  const getUp = /^(?:get|bring)\s+(.+?)\s+(up|running)$/i.exec(text);
  if (getUp) {
    const app = resolveApp(getUp[1]);
    if (app) {
      return {
        intent: "app.open",
        confidence: 0.85,
        action: {
          kind: "tool",
          tool: "apps.open",
          args: { app: app.id, label: app.label },
        },
        speech: `Opening ${app.label}.`,
      };
    }
  }

  // --- resource questions
  if (
    /\b(what('s| is)? using|who is using|what is eating)\b.*\b(cpu|ram|memory|gpu|processor)\b/i.test(
      lower,
    ) ||
    /\b(cpu|ram|memory)\s+usage\b/i.test(lower)
  ) {
    const metric = /ram|memory/.test(lower) ? "rss" : "cpu";
    return {
      intent: "system.top",
      confidence: 0.92,
      action: { kind: "tool", tool: "system.top", args: { metric } },
      speech: "I'll check.",
    };
  }
  if (
    /\b(how('s| is) (my )?(laptop|computer|machine|pc|system)( doing)?)\b/i.test(lower) ||
    /\b(system|hardware) (status|health)\b/i.test(lower)
  ) {
    return {
      intent: "system.info",
      confidence: 0.9,
      action: { kind: "tool", tool: "system.info", args: {} },
      speech: "Checking the system now.",
    };
  }

  // --- memory
  const rememberMatch =
    /^remember (that )?(.+)$/i.exec(text);
  if (rememberMatch) {
    return {
      intent: "memory.remember",
      confidence: 0.85,
      action: {
        kind: "tool",
        tool: "memory.remember",
        args: { note: rememberMatch[2] },
      },
      speech: "Noted.",
    };
  }
  if (/\bwhat do you remember\b/i.test(lower)) {
    return {
      intent: "memory.recall",
      confidence: 0.9,
      action: { kind: "tool", tool: "memory.recall", args: {} },
      speech: "Here's what I have on file.",
    };
  }

  // --- project / website creation
  const createMatch =
    /\b(create|build|make|scaffold|set\s?up)\b(.+?)\b(called|named)\s+([a-z0-9][a-z0-9-_ ]*)$/i.exec(
      text,
    );
  if (createMatch) {
    const desc = createMatch[2].toLowerCase();
    const name = createMatch[4].trim().toLowerCase().replace(/\s+/g, "-");
    const kind = /3d|three|webgl/.test(desc)
      ? "3d-site"
      : /react/.test(desc)
        ? "react-app"
        : /game/.test(desc)
          ? "game"
          : "website";
    return {
      intent: "project.create",
      confidence: 0.86,
      action: {
        kind: "tool",
        tool: "project.scaffold",
        args: { name, kind, description: text },
      },
      speech: `Certainly. I'll create ${name} and verify the structure.`,
    };
  }

  // --- capabilities
  if (/^(help|what can you do|capabilities|commands)\b/i.test(lower)) {
    const text0 =
      "I can open applications, report live system stats, tell you what's " +
      "using your CPU or RAM, remember and recall notes, and scaffold static, " +
      "React, or cinematic 3D websites in your workspace. Try: open VS Code — " +
      "what is using my RAM — remember that my editor is VS Code — create a " +
      "3d site called nova.";
    return {
      intent: "help",
      confidence: 0.95,
      action: { kind: "reply", text: text0 },
      speech: text0,
    };
  }

  // --- task steering (stop/pause/continue handled at interaction layer too)
  if (/^(stop|halt|cancel)\b/i.test(lower)) {
    return {
      intent: "task.stop",
      confidence: 0.95,
      action: { kind: "reply", text: "Stopping." },
      speech: "Stopping.",
    };
  }
  if (/^(wait|pause|hold on)\b/i.test(lower)) {
    return {
      intent: "task.pause",
      confidence: 0.95,
      action: { kind: "reply", text: "Paused. Say continue when you're ready." },
      speech: "Paused.",
    };
  }
  if (/^(continue|resume|go on|carry on)\b/i.test(lower)) {
    return {
      intent: "task.resume",
      confidence: 0.95,
      action: { kind: "reply", text: "Continuing." },
      speech: "Continuing.",
    };
  }

  return {
    intent: "unresolved",
    confidence: 0,
    action: { kind: "unresolved" },
    speech: "",
  };
}

function resolveApp(fragment: string): { id: string; label: string } | null {
  for (const [pattern, id] of APP_SYNONYMS) {
    if (pattern.test(fragment)) {
      const label = fragment.replace(pattern, (m) => m).trim();
      return { id, label: label || id };
    }
  }
  return null;
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/* -------------------- deterministic provider (final fallback) ------------ */

export function createDeterministicProvider(): BrainProvider {
  return {
    id: "deterministic",
    kind: "deterministic",
    describe: () => ({ alwaysAvailable: true, cost: "zero" }),
    async isAvailable() {
      return true;
    },
    async complete(request: BrainRequest): Promise<BrainResponse> {
      const started = Date.now();
      const lastUser = [...request.messages].reverse().find((m) => m.role === "user");
      const intent = routeIntent(lastUser?.content ?? "");
      return {
        text:
          intent.action.kind === "reply"
            ? intent.action.text
            : intent.speech ||
              "I parsed that locally but have no deterministic handler for it. Give me a direct command, or configure a reasoning provider for open-ended requests.",
        providerId: "deterministic",
        latencyMs: Date.now() - started,
      };
    },
  };
}
