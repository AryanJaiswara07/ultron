/**
 * Task orchestration — GOAL → PLAN → ACTION → OBSERVE → EVALUATE → VERIFY.
 *
 * Design contract:
 *  - plans are explicit, inspectable step lists (never hidden reasoning)
 *  - every step transition emits bus events; progress speech lines ride the
 *    same stream the presence visual consumes (UI+voice sync)
 *  - pause halts BETWEEN steps; stop aborts safely; resume continues from
 *    the next pending step (state preserved in DB + memory)
 *  - failure triggers one bounded recovery attempt where a known recipe
 *    exists, otherwise an honest failure report — never fake success
 *  - steps hitting confirmation-gated tools park the task in
 *    "awaiting_confirmation" and resume after a grant arrives
 */
import { randomUUID } from "node:crypto";

import { ultronBus } from "../bus";
import type { AppPaths } from "../paths";
import {
  executeTool,
  type ToolContext,
  type ToolDeps,
  type ToolResult,
} from "../tools/registry";

export type TaskState =
  | "queued"
  | "running"
  | "paused"
  | "awaiting_confirmation"
  | "completed"
  | "failed"
  | "stopped";

export interface PlanStep {
  readonly id: string;
  readonly title: string;
  readonly tool: string;
  readonly args: Record<string, unknown>;
  /** Concise progress speech for this step — no internal reasoning. */
  readonly speechStart: string;
  readonly speechOk: string;
  readonly speechFail: string;
  /** Bounded self-heal recipes keyed by tool error code. */
  readonly recover?: Record<string, Record<string, unknown>>;
}

export interface Task {
  readonly id: string;
  readonly goal: string;
  state: TaskState;
  steps: PlanStep[];
  stepIndex: number;
  results: Array<{ step: string; ok: boolean; error?: string }>;
  /** One-shot confirmation token for the next gated step. */
  confirmToken?: string;
  /** Tell the run loop to halt between steps. */
  control: "run" | "pause" | "stop";
}

export interface OrchestratorDeps {
  readonly paths: AppPaths;
  readonly toolDeps: ToolDeps;
  /** Persist transitions (Postgres in production; no-op in tests). */
  readonly persist?: (
    taskId: string,
    patch: Partial<{ status: TaskState; currentStep: string | null; result: unknown }>,
  ) => Promise<void>;
}

const activeTasks = new Map<string, Task>();

export function getActiveTask(): Task | null {
  for (const task of activeTasks.values()) {
    if (task.state === "running" || task.state === "paused" || task.state === "awaiting_confirmation") {
      return task;
    }
  }
  return null;
}

export function getTaskById(id: string): Task | null {
  return activeTasks.get(id) ?? null;
}

/** Test hook. */
export function clearTasks(): void {
  activeTasks.clear();
}

/* -------------------------------- planning -------------------------------- */

/** Deterministic planner for scaffold-class goals (fast, zero cost). */
export function planProjectScaffold(
  name: string,
  kind: string,
): PlanStep[] {
  return [
    {
      id: "scaffold",
      title: `Create ${name}`,
      tool: "project.scaffold",
      args: { name, kind },
      speechStart: "I'm setting up the project structure.",
      speechOk: "The structure is in place and verified.",
      speechFail: "The scaffold step failed. I'm looking at the cause.",
    },
    {
      id: "inventory",
      title: "Inventory the result",
      tool: "fs.list",
      args: { path: name },
      speechStart: "I'm checking what was created.",
      speechOk: "Everything is where it should be.",
      speechFail: "I couldn't verify the created files.",
    },
    ...(kind === "react-app"
      ? [
          {
            id: "explain-install",
            title: "Next steps",
            tool: "fs.read",
            args: { path: `${name}/README.md` },
            speechStart: "Dependencies need installing next — I'll confirm with you first.",
            speechOk: "Ready to install when you say so.",
            speechFail: "I couldn't read the project notes.",
          } satisfies PlanStep,
        ]
      : []),
  ];
}

/* ------------------------------- execution -------------------------------- */

export interface RunOutcome {
  readonly taskId: string;
  readonly state: TaskState;
  readonly speech: string;
  readonly stepsCompleted: number;
  readonly stepsTotal: number;
}

export async function runTask(
  goal: string,
  steps: PlanStep[],
  deps: OrchestratorDeps,
  existing?: Task,
): Promise<RunOutcome> {
  const task: Task =
    existing ??
    ({
      id: randomUUID(),
      goal,
      state: "queued",
      steps,
      stepIndex: 0,
      results: [],
      control: "run",
    } as Task);

  activeTasks.set(task.id, task);

  const persist = async (patch: Parameters<NonNullable<OrchestratorDeps["persist"]>>[1]) => {
    await deps.persist?.(task.id, patch).catch(() => undefined);
  };

  if (task.state === "queued" || task.state === "paused" || task.state === "awaiting_confirmation") {
    task.state = "running";
    task.control = "run";
    ultronBus.publish("task_started", { taskId: task.id, goal: goal.slice(0, 160) });
    if (task.stepIndex === 0) {
      ultronBus.publish("plan_created", { taskId: task.id, steps: task.steps.length });
    }
    await persist({ status: "running" });
  }

  const ctx = (token?: string): ToolContext => ({
    paths: deps.paths,
    deps: deps.toolDeps,
    confirmToken: token,
  });

  while (task.stepIndex < task.steps.length) {
    // ---- interruption handling (checked between steps — safe halting)
    if (task.control === "pause") {
      task.state = "paused";
      ultronBus.publish("task_paused", { taskId: task.id, atStep: task.steps[task.stepIndex]?.id });
      await persist({ status: "paused" });
      return outcome(task, "Paused. Say continue when you're ready.");
    }
    if (task.control === "stop") {
      task.state = "stopped";
      ultronBus.publish("task_stopped", { taskId: task.id });
      await persist({ status: "stopped", result: task.results });
      activeTasks.delete(task.id);
      return outcome(task, "Stopped.");
    }
    // A previous iteration may have parked the task awaiting confirmation,
    // and resume() flips it back here — read the state without narrowing.
    if ((task.state as TaskState) === "awaiting_confirmation") {
      return outcome(
        task,
        "I'm waiting for your confirmation to continue.",
      );
    }

    const step = task.steps[task.stepIndex];
    await persist({ currentStep: step.id });
    // Progress speech rides the bus; the voice layer speaks it.
    ultronBus.publish("thinking_started", { taskId: task.id, step: step.id, say: step.speechStart });

    let result = await executeTool(step.tool, step.args, ctx(task.confirmToken));
    task.confirmToken = undefined; // tokens are single-use

    // ---- confirmation gating parks the task
    if (result.confirmationRequired && result.confirmId) {
      task.state = "awaiting_confirmation";
      await persist({ status: "awaiting_confirmation" });
      return outcome(
        task,
        `${result.speech}`,
      );
    }

    // ---- bounded self-heal
    if (!result.ok && step.recover && result.error) {
      const code = result.error.split(":")[0];
      const patch = step.recover[code];
      if (patch) {
        ultronBus.publish("thinking_started", {
          taskId: task.id,
          step: step.id,
          say: "I found the problem. I'm correcting it and retrying.",
        });
        result = await executeTool(step.tool, { ...step.args, ...patch }, ctx());
      }
    }

    task.results.push({ step: step.id, ok: result.ok, error: result.error });
    ultronBus.publish("thinking_finished", {
      taskId: task.id,
      step: step.id,
      ok: result.ok,
      say: result.ok ? step.speechOk || result.speech : step.speechFail,
    });

    if (!result.ok) {
      task.state = "failed";
      ultronBus.publish("task_failed", { taskId: task.id, step: step.id }, "warning");
      await persist({ status: "failed", result: task.results });
      activeTasks.delete(task.id);
      return outcome(
        task,
        `${step.speechFail} ${result.error ? `Reason: ${result.error.slice(0, 120)}` : ""}`.trim(),
      );
    }

    task.stepIndex += 1;
  }

  task.state = "completed";
  ultronBus.publish("task_completed", { taskId: task.id, steps: task.steps.length });
  await persist({ status: "completed", result: task.results, currentStep: null });
  activeTasks.delete(task.id);
  return outcome(task, "Done. Everything checked out.");
}

function outcome(task: Task, speech: string): RunOutcome {
  return {
    taskId: task.id,
    state: task.state,
    speech,
    stepsCompleted: task.stepIndex,
    stepsTotal: task.steps.length,
  };
}

/** Steering controls (stop/pause/continue at safe points). */
export function controlTask(
  taskId: string,
  control: "pause" | "stop",
): { ok: boolean; speech: string } {
  const task = activeTasks.get(taskId);
  if (!task) return { ok: false, speech: "There's no active task with that id." };
  task.control = control;
  return {
    ok: true,
    speech: control === "stop" ? "Stopping." : "Paused. Say continue when you're ready.",
  };
}

/** Resume after a grant for a parked (awaiting_confirmation) task. */
export function resumeTaskWithToken(task: Task, token?: string): void {
  if (token) task.confirmToken = token;
  task.state = "paused"; // runTask re-enters and flips to running
  task.control = "run";
  ultronBus.publish("task_resumed", { taskId: task.id });
}
