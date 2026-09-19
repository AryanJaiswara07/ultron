import { handleInteraction } from "@/lib/ultron/interact";
import { registerCoreTools } from "@/lib/ultron/tools/handlers";
import { grantConfirmation } from "@/lib/ultron/tools/registry";
import { bootstrapUltron } from "@/lib/ultron/bootstrap";
import { listMemories, rememberNote, updateTask } from "@/db/queries";
import {
  getActiveTask,
  resumeTaskWithToken,
  runTask,
} from "@/lib/ultron/org/orchestrator";

export const dynamic = "force-dynamic";

/** Main voice/text interaction endpoint. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = (body.text ?? "").trim();
  if (!text || text.length > 1000) {
    return Response.json(
      { error: "text must be 1–1000 characters." },
      { status: 400 },
    );
  }
  const response = await handleInteraction(text);
  return Response.json(response);
}

/**
 * Confirmation resolution: PATCH { confirmId, granted }.
 * Grants are single-use tokens; a task parked awaiting confirmation resumes
 * immediately with the token.
 */
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    confirmId?: string;
    granted?: boolean;
  };
  if (!body.confirmId || typeof body.granted !== "boolean") {
    return Response.json(
      { error: "confirmId and granted are required." },
      { status: 400 },
    );
  }
  const grant = grantConfirmation(body.confirmId, body.granted);
  if (!grant.ok) {
    return Response.json({ error: grant.error }, { status: 404 });
  }
  if (!body.granted) {
    return Response.json({
      ok: true,
      granted: false,
      speech: "Understood. I won't do that.",
    });
  }

  const parked = getActiveTask();
  if (parked && parked.state === "awaiting_confirmation" && grant.token) {
    resumeTaskWithToken(parked, grant.token);
    const boot = await bootstrapUltron();
    registerCoreTools();
    const outcome = await runTask(
      parked.goal,
      parked.steps,
      {
        paths: boot.paths,
        toolDeps: {
          remember: (note: string) => rememberNote(note),
          recall: async () =>
            (await listMemories(50).catch(() => [])).map((r) => ({
              key: r.key,
              value: r.value,
            })),
        },
        persist: (id, patch) => updateTask(id, patch).catch(() => undefined),
      },
      parked,
    );
    return Response.json({
      ok: true,
      granted: true,
      resumedTask: outcome.taskId,
      taskState: outcome.state,
      speech: outcome.speech,
    });
  }
  return Response.json({ ok: true, granted: true, token: grant.token });
}
