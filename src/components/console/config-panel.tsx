"use client";

import { useCallback, useEffect, useState } from "react";
import { EyeOff, FileCog, RefreshCw } from "lucide-react";

interface ConfigInfo {
  mode: string;
  dotenvFile: string;
  sources: Array<{ file: string; found: boolean; keysContributed: number }>;
  values: Record<string, string>;
  warnings: string[];
}

export function ConfigPanel() {
  const [config, setConfig] = useState<ConfigInfo | null>(null);

  const refresh = useCallback(async () => {
    const data = await fetch("/api/config").then((r) => r.json());
    setConfig(data);
  }, []);

  useEffect(() => {
    // Deferred to a microtask so no setState runs synchronously in the effect.
    const id = queueMicrotask(() => {
      void refresh();
    });
    return () => {
      // queueMicrotask has no cancel; guard with a mounted flag instead.
      void id;
    };
  }, [refresh]);

  if (!config) {
    return (
      <div className="panel panel-glow flex h-[calc(100vh-160px)] items-center justify-center">
        <p className="thinking msg-pre text-[var(--ink-dim)]">loading redacted config</p>
      </div>
    );
  }

  const entries = Object.entries(config.values);

  return (
    <div className="scroll-slim h-[calc(100vh-160px)] space-y-5 overflow-y-auto pr-1">
      <div className="panel panel-glow corner p-5">
        <div className="flex flex-wrap items-center gap-3">
          <FileCog size={15} className="text-[var(--cyan)]" />
          <h3 className="text-[12px] font-semibold tracking-[0.22em] uppercase">
            Configuration sources
          </h3>
          <span className={`chip ${config.mode === "development" ? "chip-warn" : "chip-live"}`}>
            {config.mode}
          </span>
          <button
            onClick={refresh}
            className="btn-ghost ml-auto inline-flex items-center gap-2 !px-3 !py-2"
          >
            <RefreshCw size={12} /> refresh
          </button>
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--ink-dim)]">
          Installed mode loads <span className="font-data text-[var(--ink)]">.env</span> from
          the user configuration directory — never from the application
          package. Development mode keeps reading the checkout{" "}
          <span className="font-data text-[var(--ink)]">.env</span>. Real
          process environment variables always win.
        </p>
        <div className="mt-4 space-y-2">
          {config.sources.map((s) => (
            <div
              key={s.file}
              className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--line)] bg-[rgba(7,9,15,0.5)] px-3 py-2.5"
            >
              <span className={`chip ${s.found ? "chip-live" : ""}`}>
                {s.found ? "loaded" : "absent"}
              </span>
              <span className="font-data break-all text-[11px] text-[var(--ink-dim)]">
                {s.file}
              </span>
              {s.found && (
                <span className="font-data ml-auto text-[10px] text-[var(--ink-faint)]">
                  {s.keysContributed} key(s)
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="panel p-5">
        <div className="mb-4 flex items-center gap-3">
          <EyeOff size={15} className="text-[var(--violet-hot)]" />
          <h3 className="text-[12px] font-semibold tracking-[0.22em] uppercase">
            Effective values — redacted
          </h3>
          <span className="tag ml-auto !text-[9px]">secrets masked at the source</span>
        </div>
        {entries.length === 0 ? (
          <p className="text-[12px] text-[var(--ink-faint)]">
            No file-sourced configuration values. Keys already present in the
            process environment take precedence and are not echoed here.
          </p>
        ) : (
          <div className="space-y-1.5">
            {entries.map(([key, value]) => (
              <div
                key={key}
                className="grid grid-cols-[minmax(140px,220px)_1fr] gap-3 rounded-md border border-transparent px-2 py-1.5 hover:border-[var(--line)]"
              >
                <span className="font-data text-[11px] text-[var(--ink)]">{key}</span>
                <span className="font-data break-all text-[11px] text-[var(--ink-dim)]">
                  {value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {config.warnings.length > 0 && (
        <div className="panel p-5">
          <h3 className="mb-3 text-[12px] font-semibold tracking-[0.22em] uppercase text-[var(--amber)]">
            Platform notes
          </h3>
          {config.warnings.map((w, i) => (
            <p key={i} className="mb-2 text-[11.5px] leading-relaxed text-[var(--ink-dim)]">
              {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
