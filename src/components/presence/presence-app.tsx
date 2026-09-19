"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BrainCircuit,
  Cpu,
  HardDrive,
  MemoryStick,
  Mic,
  MicOff,
  Power,
  Radio,
  ShieldQuestion,
  Square,
  Stethoscope,
  Volume2,
} from "lucide-react";

import { CoreCanvas, type ResourceMode } from "./core-canvas";
import { useEventStream } from "./use-event-stream";
import { useVoice } from "./use-voice";

interface InteractReply {
  speech: string;
  intent: string;
  taskId?: string;
  taskState?: string;
  confirmationId?: string;
  provider?: string;
  data?: unknown;
}

interface SystemStats {
  cpu: { model: string; cores: number; loadAvg1m: number; loadRelative: number };
  memory: { totalBytes: number; usedPercent: number };
  disks: Array<{ mount: string; usedPercent: number; freeBytes: number }>;
  topProcesses: Array<{ command: string; rssMb: number }>;
  brain: Array<{ id: string; kind: string; available: boolean }>;
}

interface DoctorReport {
  checks: Array<{ name: string; status: string; detail: string }>;
  summary: { pass: number; warn: number; fail: number; clientCheck: number };
}

const MODE_KEY = "ultron.resource-mode";

export function PresenceApp() {
  const amplitudeRef = useRef<number>(0);
  const [mode, setMode] = useState<ResourceMode>("normal");
  const [text, setText] = useState("");
  const [replies, setReplies] = useState<Array<{ who: "you" | "ultron"; line: string }>>([]);
  const [pendingConfirm, setPendingConfirm] = useState<{ id: string; ask: string } | null>(null);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [busy, setBusy] = useState(false);
  const lastSpokenRef = useRef<{ line: string; at: number }>({ line: "", at: 0 });

  const stream = useEventStream();

  const sayOnce = useCallback(
    (line: string) => {
      const cleaned = line.trim();
      if (!cleaned) return;
      const now = Date.now();
      if (lastSpokenRef.current.line === cleaned && now - lastSpokenRef.current.at < 3500) return;
      lastSpokenRef.current = { line: cleaned, at: now };
      voice.speak(cleaned);
      setReplies((r) => [...r.slice(-7), { who: "ultron", line: cleaned }]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const emitVoiceEvent = useCallback((type: string) => {
    void fetch("/api/events/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload: {} }),
    }).catch(() => undefined);
  }, []);

  const handleCommand = useCallback(
    async (command: string) => {
      const clean = command.trim();
      if (!clean) return;
      setReplies((r) => [...r.slice(-7), { who: "you", line: clean }]);
      setBusy(true);
      try {
        const res = await fetch("/api/interact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: clean }),
        });
        const reply = (await res.json()) as InteractReply;
        sayOnce(reply.speech);
        if (reply.confirmationId) {
          setPendingConfirm({ id: reply.confirmationId, ask: reply.speech });
        }
      } catch {
        sayOnce("I couldn't reach my core process. The server may be down.");
      } finally {
        setBusy(false);
      }
    },
    [sayOnce],
  );

  const voice = useVoice(amplitudeRef, {
    onCommand: (cmd) => void handleCommand(cmd),
    onSayEvent: emitVoiceEvent,
  });

  // Progress speech from the live event stream is spoken aloud.
  useEffect(() => {
    if (stream.lastSay) {
      sayOnce(stream.lastSay);
      stream.consumeSay();
    }
  }, [stream.lastSay, stream, sayOnce]);

  // Stats polling (mode-scaled interval)
  useEffect(() => {
    let cancelled = false;
    const interval = mode === "quiet" ? 10000 : mode === "normal" ? 5000 : 3000;
    const poll = async () => {
      try {
        const res = await fetch("/api/system/stats");
        if (!cancelled) setStats((await res.json()) as SystemStats);
      } catch {
        /* panel stays stale, honestly */
      }
    };
    void poll();
    const id = setInterval(poll, interval);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mode]);

  useEffect(() => {
    setMode((localStorage.getItem(MODE_KEY) as ResourceMode | null) ?? "normal");
  }, []);

  async function resolveConfirm(granted: boolean) {
    if (!pendingConfirm) return;
    setPendingConfirm(null);
    try {
      const res = await fetch("/api/interact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmId: pendingConfirm.id, granted }),
      });
      const data = (await res.json()) as { speech?: string };
      sayOnce(data.speech ?? (granted ? "Confirmed." : "Understood, I won't."));
    } catch {
      sayOnce("The confirmation didn't reach the server.");
    }
  }

  async function runDoctor() {
    setDoctor(null);
    try {
      const res = await fetch("/api/doctor");
      setDoctor((await res.json()) as DoctorReport);
      sayOnce("Diagnostics are complete. Review the panel.");
    } catch {
      sayOnce("Diagnostics failed to run.");
    }
  }

  return (
    <main className="presence-root">
      {/* top bar */}
      <header className="presence-top">
        <div className="flex items-center gap-3">
          <span className="presence-mark" />
          <span className="presence-title font-data">ULTRON · PRESENCE</span>
          <span className={`chip ${stream.connected ? "chip-gold" : ""}`}>
            {stream.connected ? "stream live" : "reconnecting"}
          </span>
          {stats?.brain.map((b) => (
            <span key={b.id} className={`chip ${b.available ? "chip-gold" : ""} hidden md:inline-block`}>
              {b.id}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="resource mode"
            value={mode}
            onChange={(e) => {
              const m = e.target.value as ResourceMode;
              setMode(m);
              localStorage.setItem(MODE_KEY, m);
            }}
            className="input-gold !py-1.5 !text-[10px] uppercase tracking-[0.2em]"
          >
            <option value="quiet">quiet</option>
            <option value="normal">normal</option>
            <option value="full">full</option>
          </select>
          <button onClick={runDoctor} className="btn-gold-ghost inline-flex items-center gap-2" title="ultron doctor">
            <Stethoscope size={13} /> <span className="hidden sm:inline">doctor</span>
          </button>
        </div>
      </header>

      {/* stage */}
      <div className="presence-stage">
        {/* left rail — system */}
        <aside className="presence-rail">
          <RailTitle icon={Cpu} label="system" />
          <StatRow
            label="CPU"
            value={stats ? `${Math.round((stats.cpu.loadRelative ?? 0) * 100)}%` : "—"}
            bar={stats?.cpu.loadRelative ?? 0}
            detail={stats ? `${stats.cpu.cores} cores · load ${stats.cpu.loadAvg1m}` : ""}
          />
          <StatRow
            label="mem"
            value={stats ? `${stats.memory.usedPercent}%` : "—"}
            bar={(stats?.memory.usedPercent ?? 0) / 100}
            detail={stats ? `${(stats.memory.totalBytes / 1024 ** 3).toFixed(1)} GiB` : ""}
          />
          <StatRow
            label="disk"
            value={stats?.disks[0] ? `${stats.disks[0].usedPercent}%` : "—"}
            bar={(stats?.disks[0]?.usedPercent ?? 0) / 100}
            detail={
              stats?.disks[0]
                ? `${(stats.disks[0].freeBytes / 1024 ** 3).toFixed(1)} GiB free`
                : "unavailable"
            }
          />
          <RailTitle icon={MemoryStick} label="top rss" />
          <div className="space-y-1 px-1">
            {(stats?.topProcesses ?? []).slice(0, 3).map((p, i) => (
              <p key={i} className="font-data truncate text-[10px] text-[var(--gold-dim)]">
                {p.command} <span className="text-[var(--gold-faint)]">{p.rssMb}MB</span>
              </p>
            ))}
            {stats && stats.topProcesses.length === 0 && (
              <p className="text-[10px] text-[var(--gold-faint)]">telemetry unavailable</p>
            )}
          </div>
        </aside>

        {/* core */}
        <section className="presence-core" aria-live="polite">
          <CoreCanvas state={stream.state} amplitudeRef={amplitudeRef} mode={mode} />
          {voice.awake && (
            <div className="presence-awake font-data">
              <Radio size={11} className="inline-block animate-pulse" /> awake — listening for a command
            </div>
          )}
        </section>

        {/* right rail — activity */}
        <aside className="presence-rail">
          <RailTitle icon={BrainCircuit} label="activity" />
          <div className="scroll-slim max-h-[42vh] space-y-1.5 overflow-y-auto px-1">
            {replies.length === 0 && (
              <p className="text-[10.5px] leading-relaxed text-[var(--gold-faint)]">
                Say “Ultron” to wake me, hold-space or tap the mic for
                push-to-talk, or type below.
              </p>
            )}
            {replies.map((r, i) => (
              <p
                key={i}
                className={`font-data text-[10.5px] leading-relaxed ${
                  r.who === "you" ? "text-[var(--gold-faint)]" : "text-[var(--gold-ink)]"
                }`}
              >
                <span className={r.who === "you" ? "text-[var(--gold-faint)]" : "text-[var(--amber)]"}>
                  {r.who === "you" ? "you › " : "ultron › "}
                </span>
                {r.line}
              </p>
            ))}
          </div>
          <RailTitle icon={Volume2} label="stream" />
          <div className="scroll-slim max-h-[26vh] space-y-1 overflow-y-auto px-1">
            {stream.events.slice(-8).reverse().map((e) => (
              <p key={e.id} className="font-data text-[9.5px] text-[var(--gold-faint)]">
                <span className="text-[var(--gold-dim)]">{e.type}</span>
                {typeof e.payload?.say === "string" ? ` — ${String(e.payload.say).slice(0, 60)}` : ""}
              </p>
            ))}
          </div>
        </aside>
      </div>

      {/* confirmation card */}
      {pendingConfirm && (
        <div className="presence-confirm" role="alertdialog" aria-label="confirmation required">
          <div className="flex items-center gap-3">
            <ShieldQuestion size={16} className="text-[var(--amber)]" />
            <p className="text-[12px] text-[var(--gold-ink)]">{pendingConfirm.ask}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => resolveConfirm(true)} className="btn-gold">
              allow
            </button>
            <button onClick={() => resolveConfirm(false)} className="btn-gold-ghost">
              deny
            </button>
          </div>
        </div>
      )}

      {/* doctor overlay */}
      {doctor && (
        <div className="presence-doctor scroll-slim">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-data text-[11px] tracking-[0.3em] uppercase text-[var(--gold-ink)]">
              doctor — pass {doctor.summary.pass} · warn {doctor.summary.warn} · fail {doctor.summary.fail}
            </h3>
            <button onClick={() => setDoctor(null)} className="btn-gold-ghost !px-2 !py-1">close</button>
          </div>
          {doctor.checks.map((c) => (
            <div key={c.name} className="flex items-baseline gap-3 border-b border-[rgba(255,176,46,0.08)] py-1.5">
              <span className="w-28 shrink-0 font-data text-[10px] uppercase tracking-[0.15em] text-[var(--gold-dim)]">
                {c.name}
              </span>
              <span
                className={`chip !py-0.5 ${
                  c.status === "pass" ? "chip-gold" : c.status === "fail" ? "chip-red" : ""
                }`}
              >
                {c.status}
              </span>
              <span className="font-data text-[10px] text-[var(--gold-dim)]">{c.detail}</span>
            </div>
          ))}
        </div>
      )}

      {/* STT visibility strip — you should always SEE the pipeline hearing you */}
      <div className="presence-stt font-data">
        {voice.speechError ? (
          <span className="text-[var(--deep-amber)]">mic issue — {voice.speechError}</span>
        ) : voice.listening ? (
          <span className="text-[var(--gold-dim)]">
            <span className="text-[var(--amber)]">listening</span> — say
            “ultron” to wake me
            {voice.interim && (
              <span className="text-[var(--gold-ink)]"> · hearing: {voice.interim}</span>
            )}
          </span>
        ) : voice.sttSupported ? (
          <span className="text-[var(--gold-faint)]">
            mic is off — click the mic for always-on listening, or the power
            button for a single command
          </span>
        ) : (
          <span className="text-[var(--gold-faint)]">
            speech recognition unavailable in this browser — typed commands
            work the same
          </span>
        )}
      </div>

      {/* bottom interaction bar */}
      <footer className="presence-bottom">
        <button
          onClick={async () => {
            if (voice.speaking) {
              voice.stopSpeaking();
              sayOnce("Stopping.");
            } else if (voice.listening) {
              voice.stopListening();
            } else {
              await voice.startListening();
            }
          }}
          className={`presence-btn ${voice.listening ? "presence-btn-live" : ""}`}
          title={voice.listening ? "stop listening / stop speaking" : "enable always-on (wake word)"}
        >
          {voice.listening ? (voice.speaking ? <Square size={15} /> : <Mic size={15} />) : <MicOff size={15} />}
        </button>
        <button onClick={voice.pushToTalk} className="presence-btn" title="push to talk (one command)">
          <Power size={14} />
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && text.trim()) {
              void handleCommand(text);
              setText("");
            }
          }}
          className="flex-1"
        >
          <input
            className="input-gold w-full"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              voice.sttSupported
                ? `or type a command… (try "open vs code", "create a 3d site called nova")`
                : "speech recognition unavailable here — type commands"
            }
            aria-label="command input"
          />
        </form>
      </footer>
    </main>
  );
}

function RailTitle({ icon: Icon, label }: { icon: typeof Cpu; label: string }) {
  return (
    <div className="mb-2 mt-1 flex items-center gap-2 px-1 first:mt-0">
      <Icon size={12} className="text-[var(--amber)]" />
      <span className="font-data text-[9px] tracking-[0.35em] uppercase text-[var(--gold-faint)]">
        {label}
      </span>
      <span className="ml-auto h-px flex-1 bg-[rgba(255,176,46,0.12)]" />
    </div>
  );
}

function StatRow({
  label,
  value,
  bar,
  detail,
}: {
  label: string;
  value: string;
  bar: number;
  detail: string;
}) {
  return (
    <div className="mb-3 px-1">
      <div className="flex items-baseline justify-between">
        <span className="font-data text-[9.5px] uppercase tracking-[0.25em] text-[var(--gold-faint)]">
          {label}
        </span>
        <span className="font-data text-[12px] text-[var(--gold-ink)]">{value}</span>
      </div>
      <div className="mt-1 h-[3px] overflow-hidden rounded bg-[rgba(255,176,46,0.1)]">
        <div
          className="h-full rounded bg-gradient-to-r from-[#ff8a3c] to-[#ffd76a] transition-all duration-700"
          style={{ width: `${Math.min(100, Math.max(0, bar * 100))}%` }}
        />
      </div>
      <p className="mt-1 font-data text-[9px] text-[var(--gold-faint)]">{detail}</p>
    </div>
  );
}
