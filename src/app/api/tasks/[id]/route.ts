import { bootstrapUltron } from "@/lib/ultron/bootstrap";
import { registerCoreTools } from "@/lib/ultron/tools/handlers";
import {
  controlTask,
  getTaskById,
  resumeTaskWithToken,
  runTask,
} from "@/lib/ultron/org/orchestrator";
import { listMemories, rememberNote, updateTask } from "@/db/queries";

export const dynamic = "force-dynamic";

/** Task steering: pause / stop / resume (voice-mappable controls). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: "pause" | "stop" | "resume";
  };

  const task = getTaskById(id);
  if (!task) {
    return Response.json({ error: "Task not found or already finished." }, { status: 404 });
  }

  if (body.action === "pause" || body.action === "stop") {
    const res = controlTask(id, body.action);
    return Response.json(res);
  }

  if (body.action === "resume") {
    resumeTaskWithToken(task);
    const boot = await bootstrapUltron();
    registerCoreTools();
    const outcome = await runTask(task.goal, task.steps, {
      paths: boot.paths,
      toolDeps: {
        remember: (note: string) => rememberNote(note),
        recall: async () =>
          (await listMemories(50).catch(() => [])).map((r) => ({
            key: r.key,
            value: r.value,
          })),
      },
      persist: (taskId, patch) => updateTask(taskId, patch).catch(() => undefined),
    }, task);
    return Response.json({ ok: true, state: outcome.state, speech: outcome.speech });
  }

  return Response.json({ error: "action must be pause|stop|resume." }, { status: 400 });
}
