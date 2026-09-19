"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, CheckCircle2, Copy, KeyRound, Plus, Radio, RotateCcw } from "lucide-react";

interface Device {
  id: string;
  name: string;
  fingerprint: string;
  status: "pending" | "allowed" | "blocked" | "revoked" | string;
  issuedAt: string;
  credentialPath: string;
}

interface IssuedNotice {
  deviceId: string;
  secret: string;
  hardening: { status: string; detail: string };
  notice: string;
}

const STATUS_STYLE: Record<string, string> = {
  allowed: "chip-live",
  pending: "chip-warn",
  blocked: "",
  revoked: "",
};

export function DevicesPanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<IssuedNotice | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await fetch("/api/devices").then((r) => r.json());
    setDevices(data.devices ?? []);
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

  async function issue() {
    const trimmed = name.trim();
    if (trimmed.length < 2 || busy) return;
    setBusy(true);
    setError(null);
    setIssued(null);
    try {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "issuance failed");
      } else {
        setIssued({
          deviceId: data.device.id,
          secret: data.secret,
          hardening: data.hardening,
          notice: data.notice,
        });
        setName("");
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    await fetch(`/api/devices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await refresh();
  }

  return (
    <div className="scroll-slim h-[calc(100vh-160px)] space-y-5 overflow-y-auto pr-1">
      {/* issuance */}
      <div className="panel panel-glow corner p-5">
        <div className="mb-4 flex items-center gap-3">
          <KeyRound size={15} className="text-[var(--cyan)]" />
          <h3 className="text-[12px] font-semibold tracking-[0.22em] uppercase">
            Issue device credential
          </h3>
          <span className="tag ml-auto !text-[9px]">0600 POSIX · outside package</span>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            issue();
          }}
          className="flex gap-3"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-core flex-1"
            placeholder="device name — e.g. living-room-sensor"
            maxLength={80}
          />
          <button type="submit" className="btn-core inline-flex items-center gap-2" disabled={busy}>
            <Plus size={13} /> Issue
          </button>
        </form>
        {error && <p className="mt-3 text-[11px] text-[var(--red)]">{error}</p>}

        {issued && (
          <div className="mt-4 rounded-md border border-[rgba(103,232,249,0.3)] bg-[rgba(34,211,238,0.05)] p-4 fade-up">
            <p className="tag mb-2 !text-[9px]">secret — shown exactly once</p>
            <div className="flex flex-wrap items-center gap-3">
              <code className="font-data rounded bg-[rgba(7,9,15,0.9)] px-3 py-2 text-[12px] text-[var(--cyan-hot)]">
                {issued.secret}
              </code>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(issued.secret);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
                className="btn-ghost inline-flex items-center gap-2 !px-3 !py-2"
              >
                <Copy size={12} /> {copied ? "copied" : "copy"}
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--ink-dim)]">
              {issued.notice}
            </p>
            <p className="font-data mt-2 text-[10px] text-[var(--ink-faint)]">
              hardening: {issued.hardening.status} — {issued.hardening.detail}
            </p>
          </div>
        )}
      </div>

      {/* roster */}
      <div className="panel p-5">
        <div className="mb-4 flex items-center gap-3">
          <Radio size={15} className="text-[var(--violet-hot)]" />
          <h3 className="text-[12px] font-semibold tracking-[0.22em] uppercase">
            Device roster
          </h3>
          <span className="tag ml-auto !text-[9px]">{devices.length} registered</span>
        </div>
        {devices.length === 0 ? (
          <p className="text-[12px] text-[var(--ink-faint)]">
            No devices registered yet. Issue the first credential above.
          </p>
        ) : (
          <div className="space-y-3">
            {devices.map((d) => (
              <div
                key={d.id}
                className="rounded-md border border-[var(--line)] bg-[rgba(7,9,15,0.5)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-[13px] font-semibold">{d.name}</span>
                      <span className={`chip ${STATUS_STYLE[d.status] ?? ""}`}>
                        {d.status}
                      </span>
                    </div>
                    <p className="font-data mt-1.5 break-all text-[10px] text-[var(--ink-faint)]">
                      fp:{d.fingerprint.slice(0, 24)}… · issued{" "}
                      {new Date(d.issuedAt).toLocaleString()}
                    </p>
                    <p className="font-data mt-1 break-all text-[10px] text-[var(--ink-faint)]">
                      {d.credentialPath}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStatus(d.id, "allowed")}
                      disabled={d.status === "allowed"}
                      className="btn-ghost inline-flex items-center gap-1.5 !px-3 !py-2 !text-[9px]"
                    >
                      <CheckCircle2 size={11} /> allow
                    </button>
                    <button
                      onClick={() => setStatus(d.id, "blocked")}
                      disabled={d.status === "blocked"}
                      className="btn-ghost inline-flex items-center gap-1.5 !px-3 !py-2 !text-[9px]"
                    >
                      <Ban size={11} /> block
                    </button>
                    <button
                      onClick={() => setStatus(d.id, "pending")}
                      disabled={d.status === "pending"}
                      className="btn-ghost inline-flex items-center gap-1.5 !px-3 !py-2 !text-[9px]"
                    >
                      <RotateCcw size={11} /> reset
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
