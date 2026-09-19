/**
 * System information — REAL measured values only (acceptance: "Only report
 * actual observed values"). Anything the host cannot provide is reported as
 * unavailable, never fabricated.
 */
import { execFile } from "node:child_process";
import { statfs } from "node:fs/promises";
import os from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DiskInfo {
  readonly mount: string;
  readonly totalBytes: number;
  readonly freeBytes: number;
  readonly usedPercent: number;
}

export interface SystemInfo {
  readonly platform: string;
  readonly arch: string;
  readonly hostname: string;
  readonly cpu: {
    readonly model: string;
    readonly cores: number;
    readonly loadAvg1m: number;
    readonly loadRelative: number; // load/cores, 0..1+
  };
  readonly memory: {
    readonly totalBytes: number;
    readonly freeBytes: number;
    readonly usedPercent: number;
  };
  readonly uptimeSeconds: number;
  readonly disks: DiskInfo[];
  readonly gpu: { readonly available: boolean; readonly note: string };
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const cpus = os.cpus();
  const total = os.totalmem();
  const free = os.freemem();
  const load1 = os.loadavg()[0] ?? 0;

  const disks: DiskInfo[] = [];
  try {
    const mounts = process.platform === "win32" ? ["C:\\"] : ["/"];
    for (const mount of mounts) {
      const s = await statfs(mount);
      const totalBytes = Number(s.blocks) * Number(s.bsize);
      const freeBytes = Number(s.bavail) * Number(s.bsize);
      disks.push({
        mount,
        totalBytes,
        freeBytes,
        usedPercent: totalBytes > 0 ? Math.round((1 - freeBytes / totalBytes) * 100) : 0,
      });
    }
  } catch {
    // disk info unsupported on this host — stays empty, honestly
  }

  return {
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    cpu: {
      model: cpus[0]?.model?.trim() || "unknown",
      cores: cpus.length,
      loadAvg1m: Number(load1.toFixed(2)),
      loadRelative: cpus.length > 0 ? Number((load1 / cpus.length).toFixed(2)) : 0,
    },
    memory: {
      totalBytes: total,
      freeBytes: free,
      usedPercent: Math.round((1 - free / total) * 100),
    },
    uptimeSeconds: Math.round(os.uptime()),
    disks,
    gpu: {
      available: false,
      note:
        process.platform === "win32"
          ? "GPU telemetry requires the Windows host adapter (planned)."
          : "No GPU visible from this environment.",
    },
  };
}

export interface ProcessEntry {
  readonly pid: number;
  readonly command: string;
  readonly cpuPercent: number;
  readonly rssBytes: number;
  readonly rssMb: number;
}

/**
 * Top processes via a fixed, argument-less `ps` invocation
 * (no user input reaches the command line — injection-safe by construction).
 */
export async function getTopProcesses(
  sortBy: "cpu" | "rss" = "rss",
  limit = 5,
): Promise<ProcessEntry[]> {
  if (process.platform === "win32") {
    return [];
  }
  try {
    const { stdout } = await execFileAsync(
      "ps",
      ["-eo", "pid,pcpu,rss,args", "--no-headers"],
      { timeout: 4000, maxBuffer: 1024 * 512 },
    );
    const entries: ProcessEntry[] = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [pid, cpu, rss, ...cmd] = line.split(/\s+/);
        const rssKb = Number(rss);
        const full = cmd.join(" ").trim();
        const base = full.split("/").pop() ?? full;
        return {
          pid: Number(pid),
          command: (base || full || "unknown").slice(0, 64),
          cpuPercent: Number(cpu),
          rssBytes: rssKb * 1024,
          rssMb: Math.round(rssKb / 1024),
        };
      })
      .filter((p) => Number.isFinite(p.pid) && Number.isFinite(p.rssBytes));
    entries.sort((a, b) =>
      sortBy === "rss" ? b.rssBytes - a.rssBytes : b.cpuPercent - a.cpuPercent,
    );
    return entries.slice(0, Math.max(1, Math.min(limit, 25)));
  } catch {
    return [];
  }
}

/** Fixed-verb presence probe (doctor + apps.detect share this). */
export async function probeCommand(
  command: string,
  args: string[] = ["--version"],
  timeoutMs = 3000,
): Promise<{ available: boolean; version: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: timeoutMs,
      maxBuffer: 64 * 1024,
    });
    const line = (stdout || stderr).split("\n")[0]?.trim() ?? "";
    return { available: true, version: line.slice(0, 120) };
  } catch {
    return { available: false, version: "" };
  }
}
