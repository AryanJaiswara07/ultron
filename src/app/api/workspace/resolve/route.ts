import { bootstrapUltron } from "@/lib/ultron/bootstrap";
import { resolveWorkspacePath, SandboxError } from "@/lib/ultron/sandbox";
import { recordEvent } from "@/db/queries";

export const dynamic = "force-dynamic";

/**
 * Dry-run workspace path resolution: demonstrates and enforces the sandbox
 * contract (containment, traversal rejection, symlink-escape rejection).
 * Violations are recorded as security events.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { path?: string };
  const userPath = body.path ?? "";
  if (typeof userPath !== "string" || userPath.trim() === "") {
    return Response.json({ error: "Provide a non-empty \"path\"." }, { status: 400 });
  }

  const ctx = await bootstrapUltron();
  try {
    const resolved = await resolveWorkspacePath(
      ctx.paths.workspaceDir,
      userPath,
    );
    return Response.json({ ok: true, ...resolved });
  } catch (error) {
    if (error instanceof SandboxError) {
      await recordEvent(
        "sandbox.violation",
        { code: error.code, attempted: userPath.slice(0, 120) },
        "warning",
      );
      return Response.json(
        { ok: false, code: error.code, error: error.message },
        { status: 403 },
      );
    }
    return Response.json(
      { ok: false, error: "Workspace unavailable." },
      { status: 500 },
    );
  }
}
