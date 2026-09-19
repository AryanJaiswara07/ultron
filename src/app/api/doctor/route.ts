import { bootstrapUltron } from "@/lib/ultron/bootstrap";
import { ultronBus } from "@/lib/ultron/bus";
import { buildBrainChain, isCloudBrainConfigured } from "@/lib/ultron/brain/selector";
import { resolveWorkspacePath, SandboxError } from "@/lib/ultron/sandbox";
import { probeCommand } from "@/lib/ultron/sysinfo";
import { getDb } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

type CheckStatus = "pass" | "warn" | "fail" | "client-check";

interface DoctorCheck {
  name: string;
  status: CheckStatus;
  detail: string;
  durationMs: number;
}

async function check(
  name: string,
  fn: () => Promise<Omit<DoctorCheck, "name" | "durationMs">>,
): Promise<DoctorCheck> {
  const started = Date.now();
  try {
    const res = await fn();
    return { name, ...res, durationMs: Date.now() - started };
  } catch (error) {
    return {
      name,
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
    };
  }
}

/**
 * `ultron doctor` — real probes with honest statuses. Anything that can only
 * be verified on the client (microphone, speaker) reports "client-check"
 * instead of pretending.
 */
export async function GET() {
  const boot = await bootstrapUltron();
  const checks: DoctorCheck[] = [];

  checks.push(
    await check("paths", async () => {
      const bad = boot.warnings.length;
      return {
        status: bad ? "warn" : "pass",
        detail:
          bad > 0
            ? `${bad} boot warning(s).`
            : `mode=${boot.paths.mode}; all writable dirs ensured.`,
      };
    }),
    await check("database", async () => {
      await getDb().execute(sql`select 1`);
      return { status: "pass", detail: "PostgreSQL reachable." };
    }),
    await check("node", async () => {
      const p = await probeCommand("node", ["--version"]);
      return {
        status: p.available ? "pass" : "fail",
        detail: p.available ? p.version : "node not found on PATH.",
      };
    }),
    await check("npm", async () => {
      const p = await probeCommand("npm", ["--version"]);
      return {
        status: p.available ? "pass" : "warn",
        detail: p.available ? `npm ${p.version}` : "npm not found.",
      };
    }),
    await check("git", async () => {
      const p = await probeCommand("git", ["--version"]);
      return {
        status: p.available ? "pass" : "warn",
        detail: p.available ? p.version : "git not found.",
      };
    }),
    await check("workspace sandbox", async () => {
      await resolveWorkspacePath(boot.paths.workspaceDir, "probe/ok.txt");
      let rejected = false;
      try {
        await resolveWorkspacePath(boot.paths.workspaceDir, "../../escape.txt");
      } catch (error) {
        rejected = error instanceof SandboxError;
      }
      return rejected
        ? { status: "pass", detail: "containment + traversal rejection verified." }
        : { status: "fail", detail: "traversal was NOT rejected." };
    }),
    await check("ollama", async () => {
      const chain = buildBrainChain();
      const ollama = chain.find((p) => p.kind === "ollama");
      const up = ollama ? await ollama.isAvailable() : false;
      return {
        status: up ? "pass" : "warn",
        detail: up
          ? "Local model server reachable."
          : "Not reachable at OLLAMA_BASE_URL (default localhost:11434).",
      };
    }),
    await check("cloud brain", async () => {
      const configured = isCloudBrainConfigured();
      return {
        status: configured ? "pass" : "warn",
        detail: configured
          ? "Key + model configured (connectivity verified on first use)."
          : "Not configured — ULTRON degrades to Ollama/deterministic.",
      };
    }),
    await check("deterministic brain", async () => ({
      status: "pass",
      detail: "Always available (zero-cost local intents).",
    })),
    await check("disk", async () => {
      const { getSystemInfo } = await import("@/lib/ultron/sysinfo");
      const info = await getSystemInfo();
      const disk = info.disks[0];
      if (!disk) return { status: "warn", detail: "Disk telemetry unavailable." };
      return {
        status: disk.usedPercent > 90 ? "fail" : disk.usedPercent > 75 ? "warn" : "pass",
        detail: `${disk.mount} ${disk.usedPercent}% full, ${(disk.freeBytes / 1024 ** 3).toFixed(1)} GiB free.`,
      };
    }),
    await check("memory", async () => {
      const { getSystemInfo } = await import("@/lib/ultron/sysinfo");
      const info = await getSystemInfo();
      return {
        status: info.memory.usedPercent > 90 ? "warn" : "pass",
        detail: `${info.memory.usedPercent}% of ${(info.memory.totalBytes / 1024 ** 3).toFixed(1)} GiB in use.`,
      };
    }),
    await check("microphone", async () => ({
      status: "client-check",
      detail: "Verified in the browser (Web Audio permission) by the presence page.",
    })),
    await check("speaker", async () => ({
      status: "client-check",
      detail: "Verified in the browser (speech synthesis) by the presence page.",
    })),
  );

  const summary = {
    pass: checks.filter((c) => c.status === "pass").length,
    warn: checks.filter((c) => c.status === "warn").length,
    fail: checks.filter((c) => c.status === "fail").length,
    clientCheck: checks.filter((c) => c.status === "client-check").length,
  };
  ultronBus.publish("doctor_completed", summary);

  return Response.json({ checks, summary, mode: boot.paths.mode });
}
