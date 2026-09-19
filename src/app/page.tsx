import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Database,
  FolderLock,
  HardDrive,
  KeyRound,
  ListChecks,
  ScrollText,
  ShieldCheck,
  Terminal,
} from "lucide-react";

import { Orb } from "@/components/orb";
import { bootstrapUltron } from "@/lib/ultron/bootstrap";
import { databaseConfigured } from "@/db";
import { systemCounts } from "@/db/queries";
import { ULTRON_VERSION } from "@/lib/ultron/version";

export const dynamic = "force-dynamic";

const MARQUEE_ITEMS = [
  "CODE ≠ DATA",
  "USER DATA SURVIVES UPGRADES",
  "CREDENTIALS 0600 POSIX",
  "IDEMPOTENT MIGRATION",
  "ZERO SECRETS IN LOGS",
  "SANDBOXED WORKSPACE",
  "SYMLINK ESCAPE PROTECTION",
  "ONE CANONICAL STARTUP PATH",
  "XDG · APPDATA · LIBRARY",
];

export default async function LandingPage() {
  const ctx = await bootstrapUltron().catch(() => null);
  const counts = await systemCounts().catch(() => null);
  const mode = ctx?.paths.mode ?? "development";
  const dbOffline = !databaseConfigured() || counts === null;

  const residency = [
    {
      icon: FolderLock,
      label: "Configuration",
      path: ctx?.paths.configDir ?? "—",
      note: ".env loaded from user config dir",
    },
    {
      icon: Database,
      label: "Databases",
      path: ctx?.paths.databasesDir ?? "—",
      note: "outside the package, upgrade-safe",
    },
    {
      icon: KeyRound,
      label: "Device credentials",
      path: ctx?.paths.credentialsDir ?? "—",
      note: "0600 attempt on POSIX, honest on Windows",
    },
    {
      icon: ScrollText,
      label: "Logs",
      path: ctx?.paths.logDir ?? "—",
      note: "secrets redacted at source",
    },
    {
      icon: HardDrive,
      label: "Workspace",
      path: ctx?.paths.workspaceDir ?? "—",
      note: "sandboxed, symlink-escape proof",
    },
    {
      icon: ListChecks,
      label: "Device allowlist",
      path: ctx?.paths.deviceAllowlistFile ?? "—",
      note: "never world-readable install paths",
    },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* ambient */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 600px at 70% -10%, rgba(34,211,238,0.09), transparent 60%), radial-gradient(900px 500px at 10% 110%, rgba(139,92,246,0.08), transparent 60%)",
        }}
      />
      <div className="grid-floor" />

      {/* degraded-mode notice: honest, actionable — never a crash wall */}
      {dbOffline && (
        <div className="relative z-20 border-b border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.06)] px-6 py-2.5">
          <p className="font-data mx-auto max-w-7xl text-[11px] tracking-wide text-[var(--amber)]">
            [degraded mode] database offline — ULTRON stays fully usable but
            persistence is paused. Setup: copy .env.example to .env, point
            DATABASE_URL at PostgreSQL, run npx drizzle-kit push, restart.
          </p>
        </div>
      )}

      {/* nav */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <OrbMark />
          <span className="tag !text-[11px] !tracking-[0.4em] text-[var(--ink)]">
            ULTRON
          </span>
          <span className="chip font-data">v{ULTRON_VERSION}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="chip chip-live hidden items-center gap-2 sm:flex">
            <span className="pulse-dot" />
            {mode === "development" ? "DEV CHECKOUT" : "INSTALLED"}
          </span>
          <Link href="/console" className="btn-ghost hidden sm:block">
            Console
          </Link>
          <Link
            href="/presence"
            className="btn-gold !px-4 !py-2.5 hidden sm:inline-block"
          >
            Presence
          </Link>
        </div>
      </header>

      {/* hero */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-10 pb-24 lg:pt-16">
        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="tag fade-up mb-6 flex items-center gap-3">
              <span className="inline-block h-px w-10 bg-[var(--cyan)]" />
              Voice-first operating layer — v2.0 &ldquo;Presence&rdquo;
            </p>
            <h1 className="display-xl text-[clamp(3.4rem,10vw,8.2rem)]">
              <span
                className="glitch bg-gradient-to-br from-[#f4f7ff] via-[#c8d4f2] to-[#7d8cb4] bg-clip-text text-transparent"
                data-text="ULTRON"
              >
                ULTRON
              </span>
            </h1>
            <p className="display-xl mt-1 text-[clamp(1.15rem,3vw,2rem)] text-[var(--cyan)]">
              Code installs. Data belongs
              <span className="text-[var(--violet-hot)]"> to you.</span>
            </p>
            <p className="mt-7 max-w-xl text-[15px] leading-relaxed text-[var(--ink-dim)]">
              The packaging milestone. ULTRON now runs as a properly installed
              application: every writable byte — configuration, databases,
              credentials, logs, workspace — resolves to platform-appropriate
              user directories, never into the installed package. Upgrades
              cannot destroy your data. Development from a checkout works
              exactly as before.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/console" className="btn-core inline-flex items-center gap-2">
                Enter console <ArrowRight size={14} strokeWidth={2.4} />
              </Link>
              <a
                href="#residency"
                className="btn-ghost inline-flex items-center gap-2"
              >
                Data residency map
              </a>
            </div>

            {/* live counters */}
            <div className="mt-12 grid max-w-lg grid-cols-3 gap-3">
              {[
                { n: ULTRON_VERSION, l: "milestone" },
                { n: String(counts?.events ?? 0).padStart(3, "0"), l: "audit events" },
                { n: "14", l: "writable categories" },
              ].map((s) => (
                <div key={s.l} className="panel px-4 py-3">
                  <div className="font-data text-xl text-[var(--cyan-hot)]">
                    {s.n}
                  </div>
                  <div className="tag mt-1 !text-[9px]">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div
              className="pointer-events-none absolute -inset-[12%]"
              aria-hidden="true"
              style={{
                maskImage:
                  "radial-gradient(circle at 50% 50%, black 26%, transparent 74%)",
                WebkitMaskImage:
                  "radial-gradient(circle at 50% 50%, black 26%, transparent 74%)",
              }}
            >
              <Image
                src="/images/core.jpg"
                alt=""
                fill
                priority
                sizes="(min-width: 1024px) 42vw, 90vw"
                className="object-cover opacity-60 mix-blend-screen"
              />
            </div>
            <Orb className="relative z-10" />
            <div className="pointer-events-none absolute inset-x-0 -bottom-2 z-10 flex justify-center">
              <span
                className="chip font-data"
                style={{ borderColor: "rgba(103,232,249,0.25)" }}
              >
                CORE ONLINE — {mode.toUpperCase()} MODE
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* marquee */}
      <div className="relative z-10 border-y border-[var(--line)] bg-[rgba(7,9,15,0.7)] py-3 backdrop-blur">
        <div className="marquee-track font-data text-[11px] tracking-[0.3em] text-[var(--ink-faint)]">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span key={i} className="flex items-center gap-12">
              {item}
              <span className="text-[var(--cyan)]">◆</span>
            </span>
          ))}
        </div>
      </div>

      {/* data residency map */}
      <section id="residency" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="tag mb-3">01 — Data residency</p>
            <h2 className="display-xl text-3xl text-[var(--ink)] sm:text-4xl">
              Every writable byte, <span className="text-[var(--cyan)]">mapped live</span>
            </h2>
          </div>
          <p className="max-w-md text-[13px] leading-relaxed text-[var(--ink-dim)]">
            Resolved at runtime on this very machine by the centralized path
            module — the only place in the codebase allowed to decide where
            data lives.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {residency.map((r, i) => (
            <article
              key={r.label}
              className="panel panel-glow corner group p-5 transition-transform duration-300 hover:-translate-y-1"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center justify-between">
                <r.icon
                  size={18}
                  strokeWidth={1.8}
                  className="text-[var(--cyan)] transition-colors group-hover:text-[var(--cyan-hot)]"
                />
                <span className="font-data text-[10px] text-[var(--ink-faint)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-4 text-[13px] font-semibold tracking-[0.14em] uppercase">
                {r.label}
              </h3>
              <p className="font-data mt-2 break-all text-[11px] leading-relaxed text-[var(--ink-dim)]">
                {r.path}
              </p>
              <p className="mt-3 text-[11px] text-[var(--ink-faint)]">{r.note}</p>
            </article>
          ))}
        </div>
      </section>

      {/* guarantees */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-28">
        <div className="divider-glow mb-16" />
        <p className="tag mb-3">02 — Migration contract</p>
        <h2 className="display-xl max-w-3xl text-3xl sm:text-4xl">
          Upgrade without <span className="text-[var(--violet-hot)]">fear</span>
        </h2>
        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              icon: ShieldCheck,
              title: "Non-destructive",
              body: "Migration copies .env, data/, logs/ and workspace/ into user directories. Sources are never deleted, truncated or modified — verified by tests.",
            },
            {
              icon: ListChecks,
              title: "Idempotent",
              body: "Re-running a migration over an already-migrated tree copies nothing twice. Existing destinations are skipped, never overwritten.",
            },
            {
              icon: Terminal,
              title: "Explicit",
              body: "A dry-run plan shows every source and destination before a single byte moves. Execution requires explicit confirmation.",
            },
            {
              icon: KeyRound,
              title: "Honest permissions",
              body: "Credentials get real 0600 on POSIX. On Windows we report the NTFS ACL reality instead of claiming POSIX semantics we cannot enforce.",
            },
          ].map((g) => (
            <article key={g.title} className="panel p-5">
              <g.icon size={18} strokeWidth={1.8} className="text-[var(--violet-hot)]" />
              <h3 className="mt-4 text-[13px] font-semibold tracking-[0.14em] uppercase">
                {g.title}
              </h3>
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--ink-dim)]">
                {g.body}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-16 flex flex-wrap items-center justify-between gap-6">
          <p className="font-data text-[11px] tracking-[0.2em] text-[var(--ink-faint)] uppercase">
            Linux XDG · macOS Library · Windows AppData — zero hardcoded paths
          </p>
          <Link href="/console" className="btn-core inline-flex items-center gap-2">
            Open the operations console <ArrowRight size={14} strokeWidth={2.4} />
          </Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-[var(--line)] py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6">
          <span className="font-data text-[10px] tracking-[0.3em] text-[var(--ink-faint)] uppercase">
            ULTRON v{ULTRON_VERSION} — packaging &amp; installability
          </span>
          <span className="font-data text-[10px] tracking-[0.3em] text-[var(--ink-faint)] uppercase">
            One canonical startup path — node bin/ultron.mjs
          </span>
        </div>
      </footer>
    </main>
  );
}

function OrbMark() {
  return (
    <span className="relative inline-block h-5 w-5">
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 35% 30%, #fff, var(--cyan) 45%, rgba(34,211,238,0.1) 75%)",
          boxShadow: "0 0 14px rgba(34,211,238,0.8)",
        }}
      />
    </span>
  );
}
