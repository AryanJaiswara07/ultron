import { listTasks } from "@/db/queries";
import { getActiveTask } from "@/lib/ultron/org/orchestrator";

export const dynamic = "force-dynamic";

export async function GET() {
  const history = await listTasks(20).catch(() => []);
  const active = getActiveTask();
  return Response.json({
    active: active
      ? {
          id: active.id,
          goal: active.goal,
          state: active.state,
          stepIndex: active.stepIndex,
          stepsTotal: active.steps.length,
        }
      : null,
    history,
  });
}
