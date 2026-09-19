/**
 * Interaction pipeline — the server-side half of LISTEN→UNDERSTAND→THINK→
 * SPEAK→ACT→OBSERVE→ADAPT→REPORT.
 *
 * Cost-aware routing (§48): deterministic intents answer high-frequency
 * commands locally; unknown requests escalate through the brain chain.
 * ALL effects flow through the tool registry/orchestrator with audits.
 */
import { ultronBus } from "./bus";
import { bootstrapUltron } from "./bootstrap";
import { routeIntent, type IntentResult } from "./brain/intents";
import { completeWithFallback, selectBrain } from "./brain/selector";
import { listMemories, rememberNote } from "@/db/queries";
import {
  getActiveTask,
  controlTask,
  planProjectScaffold,
  resumeTaskWithToken,
  runTask,
} from "./org/orchestrator";
import { registerCoreTools } from "./tools/handlers";
import {
  executeTool,
  listTools,
  type ToolContext,
  type ToolDeps,
} from "./tools/registry";
import { updateTask } from "@/db/queries";

export interface InteractResponse {
  readonly speech: string;
  readonly intent: string;
  readonly taskId?: string;
  readonly taskState?: string;
  readonly confirmationId?: string;
  readonly data?: unknown;
  readonly provider?: string;
}

export async function handleInteraction(rawText: string): Promise<InteractResponse> {
  const text = rawText.trim().slice(0, 500);
  if (!text) {
    return { speech: "I didn't catch that.", intent: "empty" };
  }

  registerCoreTools();
  const boot = await bootstrapUltron();
  const toolDeps: ToolDeps = {
    remember: async (note) => {
      const key = await rememberNote(note);
      ultronBus.publish("memory_updated", { op: "remember", key });
      return key;
    },
    recall: async () => {
      const rows = await listMemories(50).catch(() => []);
      return rows.map((r) => ({ key: r.key, value: r.value }));
    },
  };
  const ctx = (token?: string): ToolContext => ({
    paths: boot.paths,
    deps: toolDeps,
    confirmToken: token,
  });

  ultronBus.publish("interaction_started", { chars: text.length });
  const intent = routeIntent(text);

  // ---- task steering intents act on the ACTIVE task
  if (["task.stop", "task.pause"].includes(intent.intent)) {
    const active = getActiveTask();
    if (active) {
      const res = controlTask(active.id, intent.intent === "task.stop" ? "stop" : "pause");
      finish(intent, res.speech);
      return { speech: res.speech, intent: intent.intent, taskId: active.id };
    }
    finish(intent, "Nothing is running right now.");
    return { speech: "Nothing is running right now.", intent: intent.intent };
  }
  if (intent.intent === "task.resume") {
    const active = getActiveTask();
    if (active && (active.state === "paused" || active.state === "awaiting_confirmation")) {
      resumeTaskWithToken(active);
      const outcome = await runTask(active.goal, active.steps, orchestratorDeps(boot.paths, toolDeps), active);
      finish(intent, outcome.speech);
      return {
        speech: outcome.speech,
        intent: intent.intent,
        taskId: outcome.taskId,
        taskState: outcome.state,
      };
    }
    finish(intent, "There's nothing paused to continue.");
    return { speech: "There's nothing paused to continue.", intent: intent.intent };
  }

  // ---- project scaffold intents become orchestrated tasks
  if (intent.intent === "project.create" && intent.action.kind === "tool") {
    const { name, kind } = intent.action.args;
    ultronBus.publish("thinking_started", { say: intent.speech });
    const outcome = await runTask(
      text,
      planProjectScaffold(name ?? "untitled", kind ?? "website"),
      orchestratorDeps(boot.paths, toolDeps),
    );
    finish(intent, `${intent.speech} ${outcome.speech}`);
    return {
      speech: `${intent.speech} ${outcome.speech}`,
      intent: intent.intent,
      taskId: outcome.taskId,
      taskState: outcome.state,
    };
  }

  // ---- direct tool intents
  if (intent.action.kind === "tool") {
    ultronBus.publish("thinking_started", { say: intent.speech });
    const result = await executeTool(intent.action.tool, intent.action.args, ctx());
    if (result.confirmationRequired) {
      finish(intent, result.speech);
      return {
        speech: result.speech,
        intent: intent.intent,
        confirmationId: result.confirmId,
      };
    }
    const speech = result.ok && result.speech ? result.speech : composeToolSpeech(intent, result.speech, result.error);
    finish(intent, speech);
    return { speech, intent: intent.intent, data: result.data ?? null };
  }

  // ---- pure replies (wake etc.)
  if (intent.action.kind === "reply") {
    finish(intent, intent.speech);
    return { speech: intent.speech, intent: intent.intent };
  }

  // ---- unresolved → brain chain (cloud → ollama), then honest fallback.
  // Probe FIRST: only announce "thinking" when a real reasoning provider is
  // actually available — otherwise go straight to the capability answer
  // instead of a confusing think-then-refuse beat.
  const selection = await selectBrain().catch(() => null);
  if (selection && selection.provider.kind !== "deterministic") {
    ultronBus.publish("thinking_started", { say: "Let me think about that." });
    try {
      const res = await completeWithFallback({
        timeoutMs: 20000,
        maxOutputTokens: 400,
        messages: [
          {
            role: "system",
            content:
              "You are ULTRON, a calm, precise, slightly witty personal computer assistant. " +
              "The user is your owner; address them respectfully ('boss' sparingly). " +
              "Keep answers concise — they are spoken aloud. Never fabricate system facts; " +
              "if a capability is missing, say what you verified instead. Available tools: " +
              listTools()
                .map((t) => `${t.name} (${t.tier})`)
                .join(", ") +
              ". If a direct action is needed, answer with a single line: ACTION <tool> <json-args>.",
          },
          { role: "user", content: text },
        ],
      });
      const actionMatch = /^ACTION\s+([a-z._-]+)\s+(\{.*\})$/im.exec(res.text.trim());
      if (actionMatch) {
        const result = await executeTool(
          actionMatch[1],
          JSON.parse(actionMatch[2]) as Record<string, unknown>,
          ctx(),
        );
        finish(intent, result.speech, res.providerId);
        return {
          speech: result.speech,
          intent: "llm.action",
          provider: res.providerId,
          confirmationId: result.confirmationRequired ? result.confirmId : undefined,
        };
      }
      const spoken = res.text.slice(0, 500);
      finish(intent, spoken, res.providerId);
      return { speech: spoken, intent: "llm.answer", provider: res.providerId };
    } catch {
      // fall through to the deterministic honest line
    }
  }

  const fallback =
    "I don't have a handler for that one yet, boss. Say 'what can you do' " +
    "for my live commands, or configure Ollama for open-ended conversation " +
    "— I'm fully deterministic until then and I won't guess.";
  finish(intent, fallback);
  return { speech: fallback, intent: "unresolved", provider: "deterministic" };
}

function orchestratorDeps(
  paths: import("./paths").AppPaths,
  toolDeps: ToolDeps,
) {
  return {
    paths,
    toolDeps,
    persist: async (taskId: string, patch: Parameters<typeof updateTask>[1]) => {
      await updateTask(taskId, patch).catch(() => undefined);
    },
  };
}

function composeToolSpeech(intent: IntentResult, speech: string, error?: string): string {
  if (speech) return speech;
  if (error) return `${intent.speech} That failed — ${error.slice(0, 120)}`;
  return intent.speech || "Done.";
}

function finish(intent: IntentResult, speech: string, provider?: string): void {
  ultronBus.publish("thinking_finished", { ok: true, say: speech });
  ultronBus.publish("interaction_responded", {
    intent: intent.intent,
    provider: provider ?? "deterministic",
    chars: speech.length,
  });
}
