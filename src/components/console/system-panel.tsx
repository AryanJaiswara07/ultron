"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FolderTree,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

interface Location {
  key: string;
  label: string;
  path: string;
  writable: boolean;
}

interface SystemInfo {
  version: string;
  mode: string;
  installRoot: string;
  startedAt: string;
  locations: Location[];
  warnings: string[];
  envSources: Array<{ file: string; found: boolean; keysContributed: number }>;
  legacy: { root: string; anythingPresent: boolean; requiresMigration: boolean };
  counts: { events: number; devices: number; conversations: number } | null;
}

interface MigrationPlanItem {
  key: string;
  label: string;
  source: string;
  destination: string;
  action: string;
  sizeBytes: number;
}

interface MigrationState {
  plan: { legacyRoot: string; requiresMigration: boolean; items: MigrationPlanItem[] };
  mode: string;
  history: Array<{ id: string; status: string; createdAt: string }>;
}

interface MigrationReport {
  status: string;
  copiedCount: number;
  skippedCount: number;
  errorCount: number;
  items: Array<{ key: string; status: string; detail: string }>;
}

export function SystemPanel() {
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [migration, setMigration] = useState<MigrationState | null>(null);
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [running, setRunning] = useState(false);
  const [sandboxInput, setSandboxInput] = useState("projects/demo/app.ts");
  const [sandboxResult, setSandboxResult] = useState<{
    ok: boolean;
    code?: string;
    absolutePath?: string;
    error?: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    const [sysData, migData] = await Promise.all([
      fetch("/api/system").then((r) => r.json()),
      fetch("/api/migration").then((r) => r.json()),
    ]);
    setSys(sysData);
    setMigration(migData);
  }, []);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) void refresh();
    });
    return () => {
      mounted = false;
    };
  }, [refresh]);

  async function runMigration() {
    setRunning(true);
    setReport(null);
    try {
      const res = await fetch("/api/migration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      setReport(await res.json());
      await refresh();
    } finally {
      setRunning(false);
    }
  }

  async function probeSandbox(target: string) {
    const clean = target.trim();
    if (!clean) return;
    const res = await fetch("/api/workspace/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: clean }),
    });
    setSandboxResult(await res.json());
  }

  if (!sys) {
    return <PanelSkeleton label="resolving system state" />;
  }

  return (
    <div className="scroll-slim h-[calc(100vh-160px)] space-y-5 overflow-y-auto pr-1">
      {/* mode header */}
      <div className="panel panel-glow corner p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="tag mb-2">runtime mode</p>
            <div className="flex items-center gap-3">
              <span className="display-xl text-2xl uppercase">
                {sys.mode === "development" ? "Development" : "Installed"}
              </span>
              <span className={`chip ${sys.mode === "development" ? "chip-warn" : "chip-live"}`}>
                {sys.mode === "development" ? "checkout-local data" : "user-dir data"}
              </span>
            </div>
          </div>
          <button onClick={refresh} className="btn-ghost inline-flex items-center gap-2 !px-3 !py-2">
            <RefreshCw size={12} /> refresh
          </button>
        </div>
        <p className="font-data mt-3 break-all text-[11px] text-[var(--ink-faint)]">
          install root (read-only contract): {sys.installRoot}
        </p>
        {sys.warnings.length > 0 && (
          <div className="mt-4 space-y-2">
            {sys.warnings.map((w, i) => (
              <p key={i} className="flex items-start gap-2 text-[11.5px] text-[var(--amber)]">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {w}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* path map */}
      <div className="panel p-5">
        <div className="mb-4 flex items-center gap-3">
          <FolderTree size={15} className="text-[var(--cyan)]" />
          <h3 className="text-[12px] font-semibold tracking-[0.22em] uppercase">
            Writable path map
          </h3>
          <span className="tag ml-auto !text-[9px]">resolved live · centralized module</span>
        </div>
        <div className="space-y-1.5">
          {sys.locations.map((loc) => (
            <div
              key={loc.key}
              className="grid grid-cols-[130px_16px_1fr] items-center gap-3 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-[var(--line)] hover:bg-[rgba(34,211,238,0.03)]"
            >
              <span className="tag !text-[9px] !tracking-[0.14em]">{loc.label}</span>
              {loc.writable ? (
                <CheckCircle2 size={12} className="text-[var(--green)]" />
              ) : (
                <AlertTriangle size={12} className="text-[var(--amber)]" />
              )}
              <span className="font-data break-all text-[11px] text-[var(--ink-dim)]">
                {loc.path}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* migration */}
      <div className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Copy size={15} className="text-[var(--violet-hot)]" />
          <h3 className="text-[12px] font-semibold tracking-[0.22em] uppercase">
            Legacy data migration
          </h3>
          {migration?.plan.requiresMigration ? (
            <span className="chip chip-warn">action available</span>
          ) : (
            <span className="chip chip-live">nothing pending</span>
          )}
        </div>

        {migration && (
          <>
            <p className="font-data mb-4 break-all text-[11px] text-[var(--ink-faint)]">
              scanning legacy root: {migration.plan.legacyRoot}
            </p>
            <div className="space-y-2">
              {migration.plan.items.map((item) => (
                <div
                  key={item.key}
                  className="rounded-md border border-[var(--line)] bg-[rgba(7,9,15,0.5)] p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold">{item.label}</span>
                    <span
                      className={`chip ${
                        item.action === "copy" ? "chip-warn" : ""
                      }`}
                    >
                      {item.action}
                    </span>
                  </div>
                  {item.action === "copy" && (
                    <p className="font-data mt-2 break-all text-[10.5px] leading-relaxed text-[var(--ink-dim)]">
                      {item.source}
                      <span className="mx-2 text-[var(--cyan)]">→</span>
                      {item.destination}
                      <span className="ml-2 text-[var(--ink-faint)]">
                        ({item.sizeBytes} B)
                      </span>
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={runMigration}
                disabled={running || !migration.plan.requiresMigration}
                className="btn-core inline-flex items-center gap-2"
              >
                <Play size={13} /> {running ? "migrating…" : "Execute migration"}
              </button>
              <p className="max-w-sm text-[11px] leading-relaxed text-[var(--ink-faint)]">
                Copies only. Sources are never deleted. Re-runs skip existing
                destinations — idempotent by design.
              </p>
            </div>
          </>
        )}

        {report && (
          <div className="mt-4 rounded-md border border-[var(--line)] p-4 fade-up">
            <div className="flex items-center gap-3">
              {report.status === "ok" || report.status === "noop" ? (
                <ShieldCheck size={15} className="text-[var(--green)]" />
              ) : (
                <ShieldAlert size={15} className="text-[var(--amber)]" />
              )}
              <span className="display-xl text-sm uppercase">
                migration {report.status}
              </span>
              <span className="font-data ml-auto text-[10px] text-[var(--ink-faint)]">
                copied {report.copiedCount} · skipped {report.skippedCount} · errors{" "}
                {report.errorCount}
              </span>
            </div>
            <div className="mt-3 space-y-1">
              {report.items.map((item) => (
                <p key={item.key} className="font-data text-[10.5px] text-[var(--ink-dim)]">
                  <span
                    className={
                      item.status === "copied"
                        ? "text-[var(--green)]"
                        : item.status === "error"
                          ? "text-[var(--red)]"
                          : "text-[var(--ink-faint)]"
                    }
                  >
                    [{item.status}]
                  </span>{" "}
                  {item.key} — {item.detail}
                </p>
              ))}
            </div>
          </div>
        )}

        {migration && migration.history.length > 0 && (
          <p className="font-data mt-4 text-[10px] text-[var(--ink-faint)]">
            {migration.history.length} prior run(s) audited in the database.
          </p>
        )}
      </div>

      {/* sandbox probe */}
      <div className="panel p-5">
        <div className="mb-4 flex items-center gap-3">
          <ShieldCheck size={15} className="text-[var(--green)]" />
          <h3 className="text-[12px] font-semibold tracking-[0.22em] uppercase">
            Workspace sandbox probe
          </h3>
          <span className="tag ml-auto !text-[9px]">violations are logged as security events</span>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            probeSandbox(sandboxInput);
          }}
          className="flex gap-3"
        >
          <input
            value={sandboxInput}
            onChange={(e) => setSandboxInput(e.target.value)}
            className="input-core flex-1"
            placeholder="relative path inside the workspace"
          />
          <button type="submit" className="btn-ghost">probe</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {["../../etc/passwd", "/etc/passwd", "C:\\Windows\\system.ini", "nested/ok/file.txt"].map(
            (probe) => (
              <button
                key={probe}
                onClick={() => {
                  setSandboxInput(probe);
                  probeSandbox(probe);
                }}
                className="chip transition-colors hover:border-[var(--line-bright)] hover:text-[var(--cyan-hot)]"
              >
                {probe}
              </button>
            ),
          )}
        </div>
        {sandboxResult && (
          <div className="mt-3 rounded-md border border-[var(--line)] p-3 fade-up">
            {sandboxResult.ok ? (
              <p className="font-data text-[11px] text-[var(--green)]">
                ALLOWED → {sandboxResult.absolutePath}
              </p>
            ) : (
              <p className="font-data text-[11px] text-[var(--red)]">
                BLOCKED [{sandboxResult.code}] — {sandboxResult.error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PanelSkeleton({ label }: { label: string }) {
  return (
    <div className="panel panel-glow flex h-[calc(100vh-160px)] items-center justify-center">
      <p className="thinking msg-pre text-[var(--ink-dim)]">{label}</p>
    </div>
  );
}
