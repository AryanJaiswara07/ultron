"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Pause, Play } from "lucide-react";

interface EventRow {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical" | string;
  payload: Record<string, unknown>;
  createdAt: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  info: "text-[var(--cyan)]",
  warning: "text-[var(--amber)]",
  critical: "text-[var(--red)]",
};

export function EventsPanel() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const [live, setLive] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const data = await fetch("/api/events?limit=150").then((r) => r.json());
    setEvents(data.events ?? []);
    setVocabulary(data.vocabulary ?? []);
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

  useEffect(() => {
    if (live) {
      timer.current = setInterval(refresh, 4000);
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [live, refresh]);

  return (
    <div className="panel panel-glow corner flex h-[calc(100vh-160px)] flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-[var(--line)] px-5 py-3.5">
        <Activity size={14} className="text-[var(--cyan)]" />
        <h3 className="text-[12px] font-semibold tracking-[0.22em] uppercase">
          Audit trail
        </h3>
        <span className="chip">{events.length} events</span>
        <button
          onClick={() => setLive((v) => !v)}
          className="btn-ghost ml-auto inline-flex items-center gap-2 !px-3 !py-1.5 !text-[9px]"
        >
          {live ? <Pause size={11} /> : <Play size={11} />}
          {live ? "pause" : "resume"}
        </button>
      </div>

      <div className="scroll-slim flex-1 overflow-y-auto px-5 py-4">
        {events.length === 0 ? (
          <p className="text-[12px] text-[var(--ink-faint)]">
            No events recorded yet. Boot, migrations, device trust changes and
            sandbox violations appear here.
          </p>
        ) : (
          <div className="relative space-y-0 border-l border-[var(--line)] pl-5">
            {events.map((e) => (
              <div key={e.id} className="relative pb-4">
                <span
                  className="absolute -left-[26.5px] top-1 inline-block h-[9px] w-[9px] rounded-full border border-[var(--line)]"
                  style={{
                    background:
                      e.severity === "critical"
                        ? "var(--red)"
                        : e.severity === "warning"
                          ? "var(--amber)"
                          : "var(--cyan)",
                    boxShadow: `0 0 8px ${
                      e.severity === "critical"
                        ? "var(--red)"
                        : e.severity === "warning"
                          ? "var(--amber)"
                          : "var(--cyan)"
                    }`,
                  }}
                />
                <div className="flex flex-wrap items-baseline gap-3">
                  <span
                    className={`font-data text-[11px] font-semibold ${SEVERITY_COLOR[e.severity] ?? ""}`}
                  >
                    {e.type}
                  </span>
                  <span className="font-data text-[9.5px] text-[var(--ink-faint)]">
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                </div>
                {Object.keys(e.payload ?? {}).length > 0 && (
                  <p className="font-data mt-1 break-all text-[10px] leading-relaxed text-[var(--ink-dim)]">
                    {Object.entries(e.payload)
                      .map(([k, v]) => `${k}=${String(v)}`)
                      .join("  ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--line)] px-5 py-3">
        <p className="font-data text-[9px] tracking-[0.14em] text-[var(--ink-faint)] uppercase">
          vocabulary: {vocabulary.join(" · ")}
        </p>
      </div>
    </div>
  );
}
