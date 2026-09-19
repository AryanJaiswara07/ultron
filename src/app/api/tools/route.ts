import { registerCoreTools } from "@/lib/ultron/tools/handlers";
import { listTools } from "@/lib/ultron/tools/registry";

export const dynamic = "force-dynamic";

/** Capability transparency: what ULTRON can actually do right now. */
export async function GET() {
  registerCoreTools();
  return Response.json({ tools: listTools() });
}
