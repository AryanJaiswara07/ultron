import { buildBrainChain } from "@/lib/ultron/brain/selector";
import { getSystemInfo, getTopProcesses } from "@/lib/ultron/sysinfo";

export const dynamic = "force-dynamic";

/** Live measured stats for the presence panels. Real values only. */
export async function GET() {
  const [info, topRss] = await Promise.all([
    getSystemInfo(),
    getTopProcesses("rss", 3),
  ]);
  const chain = buildBrainChain();
  const availability = await Promise.all(
    chain.map(async (p) => ({
      id: p.id,
      kind: p.kind,
      available: await p.isAvailable().catch(() => false),
    })),
  );
  return Response.json({ ...info, topProcesses: topRss, brain: availability });
}
