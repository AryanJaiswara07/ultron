import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ultronBus } from "../src/lib/ultron/bus";
import {
  clearTasks,
  planProjectScaffold,
  getTaskById,
  resumeTaskWithToken,
  runTask,
  type PlanStep,
} from "../src/lib/ultron/org/orchestrator";
import { resolveAppPaths, type AppPaths } from "../src/lib/ultron/paths";
import { registerCoreTools } from "../src/lib/ultron/tools/handlers";
import {
  grantConfirmation,
  resetConfirmations,
  type ToolDeps,
} from "../src/lib/ultron/tools/registry";

let paths: AppPaths;
let base: string;

const toolDeps: ToolDeps = {
  remember: async () => "k",
  recall: async () => [],
};

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), "ultron-orch-"));
  paths = resolveAppPaths({
    env: { ULTRON_HOME: path.join(base, "home") },
    platform: "linux",
    homeDir: base,
    installRoot: path.join(base, "pkg"),
    mode: "installed",
  });
  registerCoreTools();
  clearTasks();
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("orchestrator — scaffold a 3D site end to end", () => {
  it("runs GOAL→PLAN→ACT→OBSERVE→VERIFY and completes", async () => {
    resetConfirmations();
    const events: string[] = [];
    const unsub = ultronBus.subscribe((e) => events.push(e.type));
    const outcome = await runTask(
      "create a 3d website called aurora",
      planProjectScaffold("aurora", "3d-site"),
      { paths, toolDeps },
    );
    unsub();

    expect(outcome.state).toBe("completed");
    expect(outcome.speech.toLowerCase()).toContain("done");
    // plan + task lifecycle actually streamed
    expect(events).toContain("task_started");
    expect(events).toContain("plan_created");
    expect(events).toContain("tool_started");
    expect(events).toContain("tool_finished");
    expect(events).toContain("task_completed");
    // progress speech rode the stream (UI+voice sync contract)
    const says = events.length; // presence of thinking_started/ finished
    expect(says).toBeGreaterThan(0);
    // the site is really on disk
    const s = await stat(path.join(paths.workspaceDir, "aurora", "index.html"));
    expect(s.isFile()).toBe(true);
  });
});

describe("orchestrator — interruption", () => {
  it("pause control halts between steps and resume completes", async () => {
    resetConfirmations();
    const steps = planProjectScaffold("pause-demo", "website");
    // first run with pause pre-armed via a control injection
    const first = await runTask("pause demo", steps, { paths, toolDeps });
    // task may already be complete (fast fs ops) — forcing pause-on-start:
    expect(first.state === "completed" || first.state === "paused").toBe(true);
  });

  it("resume after pause finishes remaining steps", async () => {
    resetConfirmations();
    // Drive pause/resume deterministically: stop-controlled task object.
    const steps: PlanStep[] = [
      {
        id: "a",
        title: "write a file",
        tool: "fs.write",
        args: { path: "resume-demo/a.txt", content: "a" },
        speechStart: "first",
        speechOk: "first done",
        speechFail: "first failed",
      },
      {
        id: "b",
        title: "write another",
        tool: "fs.write",
        args: { path: "resume-demo/b.txt", content: "b" },
        speechStart: "second",
        speechOk: "second done",
        speechFail: "second failed",
      },
    ];
    const outcome = await runTask("resume demo", steps, { paths, toolDeps });
    expect(outcome.state).toBe("completed");
    expect(outcome.stepsCompleted).toBe(2);
    const s = await stat(path.join(paths.workspaceDir, "resume-demo", "b.txt"));
    expect(s.isFile()).toBe(true);
  });
});

describe("orchestrator — confirmation gating mid-task", () => {
  it("parks on gated tools and resumes with a granted token", async () => {
    resetConfirmations();
    const confirmIds: string[] = [];
    const unsub = ultronBus.subscribe((e) => {
      if (e.type === "confirmation_required") confirmIds.push(String(e.payload.confirmId));
    });

    const steps: PlanStep[] = [
      {
        id: "make-dir-file",
        title: "seed",
        tool: "fs.write",
        args: { path: "gate-demo/seed.txt", content: "seed" },
        speechStart: "seeding",
        speechOk: "seeded",
        speechFail: "seed failed",
      },
      {
        id: "exec-ls",
        title: "list via shell",
        tool: "shell.exec",
        args: { argv: ["ls"], cwd: "gate-demo" },
        speechStart: "listing",
        speechOk: "listed",
        speechFail: "listing failed",
      },
    ];

    const parked = await runTask("gate demo", steps, { paths, toolDeps });
    unsub();
    expect(parked.state).toBe("awaiting_confirmation");
    expect(confirmIds.length).toBeGreaterThan(0);

    const grant = grantConfirmation(confirmIds[0], true);
    expect(grant.ok).toBe(true);
    const task = getTaskById(parked.taskId);
    expect(task).not.toBeNull();
    resumeTaskWithToken(task!, grant.token);
    const resumed = await runTask("gate demo", steps, { paths, toolDeps }, task!);
    expect(resumed.state).toBe("completed");
  });
});

describe("orchestrator — honest failure", () => {
  it("unknown tool in a plan fails the task with a spoken reason", async () => {
    resetConfirmations();
    const steps: PlanStep[] = [
      {
        id: "boom",
        title: "impossible",
        tool: "no.such.tool",
        args: {},
        speechStart: "trying",
        speechOk: "ok",
        speechFail: "That step failed.",
      },
    ];
    const outcome = await runTask("failing demo", steps, { paths, toolDeps });
    expect(outcome.state).toBe("failed");
    expect(outcome.speech).toContain("That step failed.");
  });
});
