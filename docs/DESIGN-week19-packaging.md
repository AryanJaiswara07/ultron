# DESIGN — Week 19: Packaging & Installability (v1.16)

**Status:** implemented and verified in this repository.
**Scope:** make ULTRON properly installable; separate code from user data;
preserve dev-checkout workflow; preserve every existing security property.

> This document records the design *as implemented and measured* in this
> codebase. The original milestone brief referenced a Python lineage
> (`pyproject.toml`, `pip install .`); the equivalent packaging surface in
> this TypeScript/Next.js codebase is `package.json` + lockfile,
> `npm ci && npm run build`, and the `bin/ultron.mjs` launcher. Mapping:
> pyproject metadata ↔ package.json; console entry point ↔ `bin/ultron.mjs`;
> site-packages ↔ the read-only install root contract enforced by
> `PathResolutionError` and ARCH-* rule scanners.

## 1. Goals

1. Application code installs separately from user data.
2. User data survives upgrades (never inside the install root).
3. Config, databases, logs, credentials, workspace handled per-OS.
4. Development from a checkout keeps working unchanged.
5. No security guarantee weakened; Windows limitations documented honestly.

## 2. Decisions

### D1 — One centralized path module
`resolveAppPaths({ env, platform, homeDir, installRoot, mode })` is pure and
injectable. It owns every writable category: configuration, databases,
transcripts, memory, identity, device credentials, device allowlist, logs,
workspace, exports, visualiser output, cache. Architecture rule ARCH-PATH-01
forbids platform directory macros anywhere else.

### D2 — Two explicit modes
- **development** (checkout markers present): writable paths are repo-local
  (`data/`, `logs/`, `workspace/`); `.env` at root; nothing to migrate.
- **installed**: platform user directories (XDG / macOS Library / Windows
  AppData). Startup throws `PathResolutionError` if any writable path lands
  inside the install root — the site-packages class of bug is made
  impossible, not merely discouraged.

### D3 — Override ladder
`ULTRON_HOME` roots everything; per-category `ULTRON_CONFIG_DIR`,
`ULTRON_DATA_DIR`, `ULTRON_CACHE_DIR`, `ULTRON_LOG_DIR`,
`ULTRON_WORKSPACE_DIR` win more specifically; `ULTRON_INSTALL_MODE` forces
the mode. No hardcoded user paths anywhere (ARCH-PATH-02).

### D4 — Migration: safest strategy = copy-only, explicit, idempotent
Detection (`scanLegacyData`) and planning (`planMigration`) are always
side-effect free. Execution (`executeMigration`) requires explicit
confirmation, stages copies under `.ultron-partial` and swaps them in,
skips existing destinations (never overwrites), reports per-item failures
in isolation, and never deletes or mutates sources. Runs are audited to
PostgreSQL + the event log. Chosen over auto-migration because silent data
movement is worse than an explicit, reviewable operator action.

### D5 — One canonical startup path
Runtime bootstrap (`bootstrapUltron`) executes exactly once per process via
Next.js instrumentation regardless of launcher. `bin/ultron.mjs` contains no
bootstrap/path logic (ARCH-CLI-01); it verifies a build and delegates to
`next start`. Version is single-sourced (`src/lib/ultron/version.ts`),
surfaced via `--version`, the health endpoint, and the console.

### D6 — Configuration without site-packages `.env`
- development: `<checkout>/.env.local` then `<checkout>/.env` (unchanged).
- installed: `<configDir>/.env` only — never the package directory.
- Process env always wins; file values never clobber it.
- Secret values (SECRET/TOKEN/KEY/PASSWORD/CREDENTIAL/DATABASE_URL/…) are
  masked at the loader; only the masked view reaches API/UI/logs.

### D7 — Credentials & permissions, honestly
Credential files: `<dataDir>/credentials`, dir `0700`, files `0600` on POSIX
(verified with `stat` in tests). Windows: reported `unsupported` — no fake
0600 claims; documented NTFS ACL reality. Allowlist is a JSON document in the
data dir, also `0600`. Missing/corrupt allowlist degrades to empty
(fail-closed), never to allow-all.

### D8 — Workspace sandbox stays intact
Containment (`..` rejected), absolute paths rejected (POSIX + DOS forms),
NUL bytes rejected, symlink escapes rejected via realpath of the nearest
existing ancestor, non-existent in-sandbox targets allowed for creation.
Violations are recorded as `sandbox.violation` security events.

### D9 — Optional capabilities stay optional
Base runtime keeps a small footprint; heavyweight packs (vision, voice)
remain out of the base dependency set. No speculative abstractions for
future assistant features; seams (event vocabulary, assistant intents,
path categories) are the extension points.

### D10 — Enforcement, not aspiration
Nine architecture rules run as tests (`tests/architecture.test.ts`):
ARCH-PATH-01/02, ARCH-SEC-01/02, ARCH-ENV-01, ARCH-CLI-01, ARCH-EV-01,
ARCH-UI-01, ARCH-VER-01. Packaging invariants break the build, loudly.

## 3. Risks accepted

- Auto-detection of mode relies on checkout markers; operators can force the
  mode explicitly (`ULTRON_INSTALL_MODE`).
- Windows ACL hardening beyond profile-default inheritance requires native
  tooling; documented rather than silently unimplemented.
- Migration merges legacy `data/` contents rather than moving the directory
  wholesale, so already-installed user data is preserved on conflicts.

## 4. Verification

- 72 tests across 10 suites (paths per OS, modes, env, sandbox incl. real
  symlink escapes, permissions, migration incl. sabotage + idempotency,
  devices, assistant, architecture, CLI contract) — all passing.
- Production build, type generation, TypeScript strict check: see
  `docs/IMPLEMENTATION-REPORT-v1.16.md`.
