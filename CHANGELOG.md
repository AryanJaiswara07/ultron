# Changelog

All notable changes to ULTRON are documented here. Version format follows
SemVer; the canonical version constant is `src/lib/ultron/version.ts`.

## [2.0.2] — Voice UX: wake variants, no ghost-think, visible hearing

### Fixed
- **"hey ultron" / "ok ultron" no longer become unresolved commands.**
  The normalize stage now treats every wake-phrase variant (with or without
  comma/`hey`/`okay`, punctuation) as a wake affirmation; wake+command in
  one breath ("hey ultron, open chrome") routes the command. Previously the
  wake phrase itself was dispatched as a request and fell through to the
  "no handler" fallback.
- **No more think-then-refuse beat**: the brain probe now happens BEFORE
  announcing "Let me think about that.", which is only published when a
  real reasoning provider is available and about to be used.
- STT errors are human-readable guidance (mic blocked / no internet / no
  input device) instead of raw `STT: <code>`.

### Added
- Presence page **hearing strip**: always-visible line showing mic state,
  the live interim transcript while listening, and honest fallback text —
  the pipeline's perception is now visible at all times.
- Real `help` / "what can you do" intent listing only live capabilities;
  the unresolved fallback points at it truthfully.
- Tests: wake variants (8 phrasings), wake+command, normalize empties,
  interaction regressions ("hey ultron" never hits the fallback), ghost-think
  absence, honest stop-with-nothing-running.

## [2.0.1] — Graceful database degradation + laptop onboarding

### Fixed
- **No more crash wall without PostgreSQL**: the DB module is now lazy —
  importing it never throws, never connects. Without `DATABASE_URL`, queries
  raise `DatabaseUnavailableError`, routes/pages degrade honestly (503s with
  reasons, null counts), and ULTRON stays fully usable (voice, intents,
  tools, scaffolds, stats, SSE) in a declared degraded mode. Previously the
  import-time `throw` produced a 500 on every page including `/`.
- Health now reports `{ ok:false, degraded:true, reason }` instead of a bare
  failure when unconfigured.
- Landing shows a one-line degraded-mode banner with exact setup steps.

### Added
- `.env.example` (committed) documenting every supported variable.
- `docs/SETUP-WINDOWS.md` degraded-mode note; `tests/db-config.test.ts`
  (6 tests) pinning the lazy-init contract.

## [2.0.0] — "Presence" (voice-first operating layer, PHASES 0–1 + core)

### Added
- **Event bus v2** with SSE streaming (`/api/stream`), typed vocabulary v2
  (wake/listen/think/speak/task/tool/confirmation lifecycle), client event
  ingestion with strict whitelist validation (`/api/events/ingest`).
- **BrainProvider abstraction** (`cloud`/`ollama`/`deterministic`) with
  availability probing, timeouts, and graceful degradation chain; cloud
  model is configured via env, never assumed to exist.
- **Voice pipeline (client, real Web Speech API)**: wake word "ultron",
  push-to-talk, VU-driven amplitude, TTS with barge-in ("ultron, stop"),
  pause/continue, honest fallback to text when STT is unavailable.
- **Presence visual**: canvas-rendered golden core (original geometry —
  rings, nodes, particle streams) with a real state machine
  (IDLE/LISTENING/THINKING/SPEAKING/EXECUTING/WARNING/CONFIRMATION/
  SUCCESS/ERROR) driven by the live event stream and audio amplitude;
  resource modes (quiet/normal/full) cap particles and frame rate.
- **Tool system** with registry, permission classes, confirmation tokens,
  timeouts, output caps, audit events; workspace tools are confined by the
  v1.16 sandbox; shell execution is allowlist-only.
- **Task orchestration** loop GOAL→PLAN→ACT→OBSERVE→VERIFY with
  pause/resume/stop, progress speech lines, failure recovery attempt.
- **Memory store** (inspectable, deletable, model-protected fields).
- **`/api/doctor`** runtime diagnostics with per-check real results, plus
  `/api/system/stats` (real CPU/RAM/disk/processes — no fabricated values).
- Docs: `ARCHITECTURE.md` (v2), `ROADMAP.md`, `SECURITY.md`.

### Environment honesty
Target hardware per brief is a Windows 11 ASUS TUF A15. This implementation
runs and is verified on a Linux container (4 CPU / 4 GB RAM / no GPU /
no microphone); voice input/output executes in the user's browser
(Web Speech API), and hardware-specific claims (GPU, temperatures,
app discovery on Windows) are reported as unavailable rather than simulated.

## [1.16.0] — Packaging & Installability

### Added
- **Centralized path resolution** (`src/lib/ultron/paths.ts`): every writable
  category (config, databases, transcripts, memory, identity, credentials,
  allowlist, logs, workspace, exports, visualiser, cache) resolves through
  one pure, injectable module. Per-OS user directories (XDG / macOS Library /
  Windows AppData) with `ULTRON_HOME` + per-category overrides.
- **Install-mode detection** (`src/lib/ultron/install-mode.ts`): development
  checkouts keep repo-local data; installed deployments resolve to user
  directories. Explicit override: `ULTRON_INSTALL_MODE`.
- **Hard startup invariant**: installed mode refuses to boot if any writable
  path resolves inside the installation root (`PathResolutionError`).
- **Non-destructive, idempotent migration** (`src/lib/ultron/migrate.ts`):
  detects legacy checkout data (`.env`, `data/`, `logs/`, `workspace/`),
  dry-run planning, explicit execution with confirmation, staging-based copy,
  per-item failure reporting, DB audit trail. Never deletes sources, never
  overwrites destinations.
- **CLI launcher** (`bin/ultron.mjs`): single `ultron`-style command that
  delegates to the canonical server startup; version is single-sourced from
  `version.ts`. ARCH-CLI-01 forbids duplicated bootstrap logic in `bin/`.
- **Environment loader** (`src/lib/ultron/env-loader.ts`): precedence
  process-env > config-dir `.env`; development keeps checkout `.env` /
  `.env.local`. Installed mode never reads the package directory. Secret
  values are masked at the loader.
- **Device credentials & allowlist** (`src/lib/ultron/devices.ts`): credential
  files in `<dataDir>/credentials` with `0600`/`0700` hardening on POSIX and
  honest `unsupported` reporting on Windows; DB stores SHA-256 fingerprints
  only; secrets shown exactly once.
- **Workspace sandbox** (`src/lib/ultron/sandbox.ts`): traversal/absolute/
  NUL/symlink-escape rejection with security-event recording.
- **Operations console** (`/console`): command chat (deterministic local
  engine), live path map, migration control with dry-run, device trust
  management, live audit event stream, redacted config view, sandbox probe.
- **Persistence schema**: `ultron_events`, `ultron_devices`,
  `ultron_migration_runs`, `ultron_conversations`, `ultron_messages`,
  `ultron_app_state`.
- **Architecture rule scanners** (`tests/architecture.test.ts`): 9 enforced
  invariants (ARCH-PATH-01/02, ARCH-SEC-01/02, ARCH-ENV-01, ARCH-CLI-01,
  ARCH-EV-01, ARCH-UI-01, ARCH-VER-01).
- **Test suite** (vitest): 9 suites covering paths, modes, env, sandbox,
  permissions, migration, devices, assistant, architecture, CLI contract.

### Changed
- `/api/health` now reports the ULTRON version alongside `ok`.
- Runtime bootstrap runs once per process via Next.js instrumentation.

### Security
- No writable user-data path can resolve inside the installation root.
- Secrets cannot flow to logs/API/UI unmasked.
- Windows POSIX-mode limitations are reported, not papered over.
- Upgraded `next` 16.2.6 → 16.3.5 (with matching `eslint-config-next`),
  resolving the critical `sharp`/libheif advisory (GHSA-rgj7-g3m4-5g8c)
  reachable through image optimization.

### Fixed
- Landing hero now actually renders the generated reactor visual
  (`public/images/core.jpg` via `next/image`, masked + screen-blended
  behind the CSS orb); it was previously generated but unreferenced.
- Migration directory merges recurse into pre-created destination
  subdirectories so bootstrap-created empty dirs can no longer shadow
  nested legacy content (caught by live installed-mode verification;
  regression-pinned in `tests/migrate.test.ts`).

[1.16.0]: https://example.invalid/ultron/releases/tag/v1.16.0
