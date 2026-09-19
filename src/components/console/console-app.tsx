"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Cpu,
  FolderTree,
  MessagesSquare,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

import { ChatPanel } from "./chat-panel";
import { SystemPanel } from "./system-panel";
import { DevicesPanel } from "./devices-panel";
import { EventsPanel } from "./events-panel";
import { ConfigPanel } from "./config-panel";

type Tab = "chat" | "system" | "devices" | "events" | "config";

const TABS: Array<{ key: Tab; label: string; icon: typeof Cpu; hint: string }> = [
  { key: "chat", label: "Console", icon: MessagesSquare, hint: "command interface" },
  { key: "system", label: "System", icon: FolderTree, hint: "paths + migration" },
  { key: "devices", label: "Devices", icon: Radio, hint: "trust + credentials" },
  { key: "events", label: "Events", icon: Activity, hint: "audit trail" },
  { key: "config", label: "Config", icon: SlidersHorizontal, hint: "redacted view" },
];

export function ConsoleApp() {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <main className="relative flex min-h-screen flex-col">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(1000px 500px at 85% -10%, rgba(34,211,238,0.07), transparent 60%), radial-gradient(800px 500px at 0% 100%, rgba(139,92,246,0.07), transparent 55%)",
        }}
      />

      {/* header */}
      <header className="relative z-10 flex items-center justify-between border-b border-[var(--line)] px-5 py-4 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="btn-ghost !px-3 !py-2 inline-flex items-center gap-2"
            aria-label="Back to landing"
          >
            <ArrowLeft size={13} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="display-xl text-lg tracking-[0.08em]">Ultron Console</h1>
              <span className="chip chip-live hidden items-center gap-2 sm:flex">
                <span className="pulse-dot" /> live
              </span>
            </div>
            <p className="tag mt-1 !text-[9px]">operations · v2.0 · one startup path</p>
          </div>
        </div>
        <div className="hidden items-center gap-3 font-data text-[10px] tracking-[0.25em] text-[var(--ink-faint)] uppercase md:flex">
          <Link href="/presence" className="chip chip-warn">presence</Link>
          <span className="inline-flex items-center gap-2">
            <ShieldCheck size={13} className="text-[var(--green)]" />
            sandbox armed
          </span>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 gap-6 px-5 py-6">
        {/* rail */}
        <nav className="flex w-14 flex-col gap-2 lg:w-52">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`group flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-all duration-200 ${
                  active
                    ? "border-[rgba(103,232,249,0.35)] bg-[rgba(34,211,238,0.07)] shadow-[0_0_24px_rgba(34,211,238,0.1)]"
                    : "border-[var(--line)] bg-[rgba(10,13,22,0.5)] hover:border-[rgba(103,232,249,0.2)]"
                }`}
              >
                <t.icon
                  size={16}
                  strokeWidth={1.9}
                  className={active ? "text-[var(--cyan-hot)]" : "text-[var(--ink-faint)] group-hover:text-[var(--ink-dim)]"}
                />
                <span className="hidden lg:block">
                  <span
                    className={`block text-[11px] font-semibold tracking-[0.22em] uppercase ${
                      active ? "text-[var(--ink)]" : "text-[var(--ink-dim)]"
                    }`}
                  >
                    {t.label}
                  </span>
                  <span className="tag !text-[8px] !tracking-[0.18em]">{t.hint}</span>
                </span>
              </button>
            );
          })}
          <div className="mt-auto hidden rounded-lg border border-[var(--line)] p-3 lg:block">
            <p className="tag !text-[8px]">launch</p>
            <p className="font-data mt-2 text-[10px] leading-relaxed text-[var(--ink-dim)]">
              node bin/ultron.mjs
            </p>
          </div>
        </nav>

        {/* content */}
        <section className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="h-full"
            >
              {tab === "chat" && <ChatPanel />}
              {tab === "system" && <SystemPanel />}
              {tab === "devices" && <DevicesPanel />}
              {tab === "events" && <EventsPanel />}
              {tab === "config" && <ConfigPanel />}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </main>
  );
}
