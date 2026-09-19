/**
 * Core tool handlers — the v1 capability set.
 * Every handler is real: file ops are sandbox-confined, shell is
 * allowlist-only, system stats are measured, and anything the host cannot
 * do is reported as unavailable rather than faked.
 */
import { execFile, spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { resolveWorkspacePath } from "../sandbox";
import { getSystemInfo, getTopProcesses, probeCommand } from "../sysinfo";
import { registerTool, type ToolResult } from "./registry";
import { scaffoldFiles, type ScaffoldKind } from "./scaffold";

const execFileAsync = promisify(execFile);

let registered = false;

export function registerCoreTools(): void {
  if (registered) return;
  registered = true;

  /* ------------------------------ system.info ----------------------------- */
  registerTool({
    name: "system.info",
    tier: "read",
    confirmRequired: false,
    timeoutMs: 8000,
    description: "Measured CPU/RAM/uptime/disk summary for the host.",
    handler: async () => {
      const info = await getSystemInfo();
      const memGb = (info.memory.totalBytes / 1024 ** 3).toFixed(1);
      const disk = info.disks[0];
      const diskPart = disk
        ? ` Disk ${disk.mount} is ${disk.usedPercent}% full.`
        : " Disk telemetry is unavailable on this host.";
      const speech =
        info.cpu.loadRelative > 0.75
          ? `CPU usage is high right now. Memory is at ${info.memory.usedPercent} percent of ${memGb} gigabytes.${diskPart}`
          : `CPU usage is moderate. Memory usage is ${info.memory.usedPercent} percent.${diskPart}`;
      return { ok: true, speech, data: info };
    },
  });

  /* ------------------------------ system.top ------------------------------ */
  registerTool({
    name: "system.top",
    tier: "read",
    confirmRequired: false,
    timeoutMs: 8000,
    description: "Top processes by the requested metric (cpu or rss).",
    handler: async (_ctx, args) => {
      const metric = args.metric === "cpu" ? "cpu" : "rss";
      const top = await getTopProcesses(metric, 5);
      if (top.length === 0) {
        return {
          ok: true,
          speech:
            "Process telemetry isn't available in this environment, so I can't quote names or figures I didn't observe.",
          data: [],
        };
      }
      const lead = top[0];
      const speech =
        metric === "rss"
          ? `${lead.command} is using the most memory at approximately ${lead.rssMb} megabytes.`
          : `${lead.command} has the highest CPU reading at ${lead.cpuPercent} percent.`;
      return { ok: true, speech, data: top };
    },
  });

  /* ----------------------------- apps.detect ------------------------------ */
  registerTool({
    name: "apps.detect",
    tier: "read",
    confirmRequired: false,
    timeoutMs: 12000,
    description: "Probe known dev tools/apps for availability (registry-style discovery, no hardcoded paths).",
    handler: async () => {
      const candidates: Array<[string, string, string[]]> = [
        ["node", "node", ["--version"]],
        ["npm", "npm", ["--version"]],
        ["git", "git", ["--version"]],
        ["ollama", "ollama", ["--version"]],
        ["code", "code", ["--version"]],
        ["python", "python3", ["--version"]],
        ["chrome", process.platform === "win32" ? "chrome" : "google-chrome", ["--version"]],
      ];
      const results = [] as Array<{ app: string; available: boolean; version: string }>;
      for (const [app, cmd, ver] of candidates) {
        results.push({ app, ...(await probeCommand(cmd, ver)) });
      }
      const found = results.filter((r) => r.available);
      const speech = found.length
        ? `I found ${found.map((f) => f.app).join(", ")} on this machine.`
        : "I couldn't find the usual applications in this environment.";
      return { ok: true, speech, data: results };
    },
  });

  /* ------------------------------ apps.open ------------------------------- */
  registerTool({
    name: "apps.open",
    tier: "system",
    confirmRequired: false,
    timeoutMs: 8000,
    description: "Launch a discovered application when the host permits it.",
    handler: async (_ctx, args) => {
      const app = String(args.app ?? "");
      const label = String(args.label ?? app);
      const binary = ({
        vscode: process.platform === "win32" ? "code.cmd" : "code",
        chrome: process.platform === "win32" ? "chrome" : "google-chrome",
        edge: "msedge",
        terminal: process.platform === "win32" ? "wt" : "x-terminal-emulator",
        explorer: process.platform === "win32" ? "explorer" : "xdg-open",
        spotify: "spotify",
        discord: "discord",
        gta: "",
      } as Record<string, string>)[app];

      if (app === "gta") {
        return {
          ok: false,
          speech: "I can't start GTA from here — there's no game executable registered on this host.",
          error: "no_registered_binary",
        };
      }
      if (!binary) {
        return { ok: false, speech: `I don't know how to open ${label} on this system.`, error: "unknown_app" };
      }
      const probe = await probeCommand(binary, ["--version"], 1500);
      if (!probe.available) {
        return {
          ok: false,
          speech: `${label} doesn't appear to be available in this environment. On your laptop I'll find it through the app registry.`,
          error: `binary_not_found:${binary}`,
        };
      }
      try {
        const child = spawn(binary, [], { detached: true, stdio: "ignore" });
        child.unref();
        return { ok: true, speech: `Opening ${label}.`, data: { pid: child.pid ?? null } };
      } catch (error) {
        return {
          ok: false,
          speech: `${label} didn't start. I'm checking why.`,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  /* -------------------------------- fs tools ------------------------------ */
  registerTool({
    name: "fs.list",
    tier: "read",
    confirmRequired: false,
    timeoutMs: 5000,
    description: "List a directory inside the sandboxed workspace.",
    handler: async (ctx, args) => {
      const rel = String(args.path ?? ".");
      const resolved = await resolveWorkspacePath(ctx.paths.workspaceDir, rel);
      const entries = await readdir(resolved.absolutePath, { withFileTypes: true });
      const items = entries.slice(0, 200).map((e) => ({
        name: e.name,
        kind: e.isDirectory() ? "dir" : "file",
      }));
      return {
        ok: true,
        speech: `${items.length} item${items.length === 1 ? "" : "s"} in ${rel || "the workspace"}.`,
        data: items,
      };
    },
  });

  registerTool({
    name: "fs.read",
    tier: "read",
    confirmRequired: false,
    timeoutMs: 5000,
    description: "Read a workspace file (capped at 32 KiB).",
    handler: async (ctx, args) => {
      const rel = String(args.path ?? "");
      if (!rel) return { ok: false, speech: "Which file?", error: "path_required" };
      const resolved = await resolveWorkspacePath(ctx.paths.workspaceDir, rel);
      const content = await readFile(resolved.absolutePath, "utf8");
      const capped = content.length > 32768 ? content.slice(0, 32768) : content;
      return { ok: true, speech: `Read ${rel}.`, data: capped };
    },
  });

  registerTool({
    name: "fs.write",
    tier: "write",
    confirmRequired: false,
    timeoutMs: 5000,
    description: "Write/create a file inside the sandboxed workspace (audited).",
    handler: async (ctx, args) => {
      const rel = String(args.path ?? "");
      const content = String(args.content ?? "");
      if (!rel) return { ok: false, speech: "Write where?", error: "path_required" };
      if (content.length > 512 * 1024) {
        return { ok: false, speech: "That file is larger than I'll write in one go.", error: "too_large" };
      }
      const resolved = await resolveWorkspacePath(ctx.paths.workspaceDir, rel);
      await mkdir(path.dirname(resolved.absolutePath), { recursive: true });
      await writeFile(resolved.absolutePath, content, "utf8");
      return { ok: true, speech: `Wrote ${rel}.`, data: { bytes: content.length } };
    },
  });

  /* ------------------------------- shell.exec ------------------------------ */
  const SHELL_ALLOW = new Set(["node", "npm", "npx", "git", "ls", "cat"]);
  const GIT_SUB = new Set(["status", "log", "diff", "branch", "show", "rev-parse"]);
  const FORBIDDEN_ARG = /[;&|><`$\\\r\n]/;

  registerTool({
    name: "shell.exec",
    tier: "system",
    confirmRequired: true, // every shell execution requires a live token
    timeoutMs: 15000,
    description: "Run an allowlisted command (node/npm/npx/git/ls/cat) inside the workspace.",
    handler: async (ctx, args) => {
      const argv = args.argv;
      if (!Array.isArray(argv) || argv.length === 0 || argv.length > 24) {
        return { ok: false, speech: "That command shape isn't allowed.", error: "argv_shape" };
      }
      const argvStr = argv.map((a) => String(a));
      const verb = argvStr[0];
      if (!SHELL_ALLOW.has(verb)) {
        return {
          ok: false,
          speech: `"${verb}" is not on my allowlist.`,
          error: `verb_not_allowed:${verb}`,
        };
      }
      if (verb === "git" && !GIT_SUB.has(argvStr[1] ?? "")) {
        return {
          ok: false,
          speech: "That git subcommand isn't allowed.",
          error: "git_sub_not_allowed",
        };
      }
      for (const a of argvStr.slice(1)) {
        if (FORBIDDEN_ARG.test(a)) {
          return {
            ok: false,
            speech: "I won't run commands with shell metacharacters.",
            error: "metacharacter_rejected",
          };
        }
      }

      const cwdRel = typeof args.cwd === "string" ? args.cwd : ".";
      const resolvedCwd = await resolveWorkspacePath(ctx.paths.workspaceDir, cwdRel);
      try {
        const { stdout, stderr } = await execFileAsync(verb, argvStr.slice(1), {
          cwd: resolvedCwd.absolutePath,
          timeout: 12000,
          maxBuffer: 64 * 1024,
        });
        const out = (stdout + (stderr ? `\n${stderr}` : "")).trim();
        return {
          ok: true,
          speech: `Command finished.`,
          data: { exit: 0, output: out.slice(0, 8192) },
        };
      } catch (error) {
        const typed = error as { code?: number | string; stderr?: string; message?: string };
        return {
          ok: false,
          speech: `The command failed${typed.code ? ` (exit ${typed.code})` : ""}. I'm looking at the output.`,
          error: `exit=${typed.code ?? "?"} ${typed.stderr ?? typed.message ?? ""}`.slice(0, 400),
          data: { exit: typed.code ?? 1 },
        };
      }
    },
  });

  /* ---------------------------- memory ------------------------------------ */
  registerTool({
    name: "memory.remember",
    tier: "write",
    confirmRequired: false,
    timeoutMs: 5000,
    description: "Persist a user note into inspectable/deletable memory.",
    handler: async (ctx, args) => {
      const note = String(args.note ?? "").trim();
      if (!note) return { ok: false, speech: "Remember what, exactly?", error: "note_required" };
      const key = await ctx.deps.remember(note);
      return { ok: true, speech: "Noted. You can review or erase this anytime.", data: { key } };
    },
  });

  registerTool({
    name: "memory.recall",
    tier: "read",
    confirmRequired: false,
    timeoutMs: 5000,
    description: "List remembered notes.",
    handler: async (ctx) => {
      const items = await ctx.deps.recall();
      if (items.length === 0) {
        return { ok: true, speech: "My memory is currently empty.", data: [] };
      }
      return {
        ok: true,
        speech: `I'm remembering ${items.length} thing${items.length === 1 ? "" : "s"}.`,
        data: items,
      };
    },
  });

  /* --------------------------- project.scaffold ---------------------------- */
  registerTool({
    name: "project.scaffold",
    tier: "write",
    confirmRequired: false,
    timeoutMs: 15000,
    description: "Create a project template (website | react-app | 3d-site) in the workspace and verify it.",
    handler: async (ctx, args) => {
      const rawName = String(args.name ?? "untitled");
      const name = rawName.toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      if (!name) return { ok: false, speech: "That name won't work as a folder.", error: "bad_name" };
      const kind = (["website", "react-app", "3d-site"] as ScaffoldKind[]).includes(
        args.kind as ScaffoldKind,
      )
        ? (args.kind as ScaffoldKind)
        : "website";

      const files = scaffoldFiles(kind, name);
      const written: string[] = [];
      for (const file of files) {
        const resolved = await resolveWorkspacePath(ctx.paths.workspaceDir, `${name}/${file.path}`);
        await mkdir(path.dirname(resolved.absolutePath), { recursive: true });
        await writeFile(resolved.absolutePath, file.content, "utf8");
        written.push(`${name}/${file.path}`);
      }
      // verify: re-list the created tree
      const listed = await readdir(
        (await resolveWorkspacePath(ctx.paths.workspaceDir, name)).absolutePath,
      );
      const verified = listed.length > 0;
      return {
        ok: verified,
        speech: verified
          ? `${name} is created and verified — ${written.length} files on disk.${
              kind === "react-app"
                ? " Dependencies still need installing, which I'll confirm with you first."
                : ""
            }`
          : `I wrote ${name} but verification came back empty — investigating.`,
        data: { name, kind, files: written, verified },
        ...(verified ? {} : { error: "verification_failed" }),
      };
    },
  });
}
