# ULTRON — v2.0.2 "Presence"

**A voice-first AI operating layer for your computer** — wake word, spoken
commands, real tools, golden core visual, event-driven everything. Built on
the v1.16 packaging substrate: code and user data stay separated, and every
writable path resolves through one centralized, test-covered module.

## Presence (v2.0.0)

Open `/presence`:

- **Voice-first**: wake word *"Ultron"*, push-to-talk, barge-in
  ("Ultron, stop" interrupts speech), pause/continue, concise progress
  speech — real Web Speech API in the user's browser (Chrome/Edge).
- **Golden core visual**: original canvas geometry driven ONLY by the live
  event stream + audio amplitude. It cannot show progress that didn't happen.
- **Real tools**: system stats (measured, never fabricated), sandboxed file
  ops, allowlisted shell with per-call confirmation, project scaffolds
  (website / react-app / cinematic 3D site) in the sandboxed workspace.
- **Brain chain**: cloud (`ULTRON_BRAIN_API_KEY` + `ULTRON_BRAIN_MODEL`) →
  Ollama (`OLLAMA_BASE_URL`) → deterministic local intents. Degradation is
  audited and spoken, never silent.
- **Orchestration**: GOAL→PLAN→ACT→OBSERVE→EVALUATE→VERIFY with
  pause/resume/stop and single-use confirmation tokens.
- **`ultron doctor`**: `GET /api/doctor` — real probes, honest statuses
  (client-only checks like microphone report `client-check`).
- **Memory**: inspectable (`GET /api/memories`) and deletable; protected
  entries refuse deletion.
- **Resource modes** (quiet/normal/full) and render pause on hidden tabs —
  designed for a Ryzen 7 + RTX 3050 4 GB / 16 GB laptop budget.

Hardware/runner honesty: this repo is verified on a Linux container. Voice
runs in the user's browser; Windows host capabilities (app registry, tray)
are roadmap-gated in `docs/ROADMAP.md` and are not claimed.

> **Provenance note (honest reporting):** this repository contains the v1.16
> implementation of ULTRON as a TypeScript/Next.js fullstack application. The
> earlier Python lineage referenced by the original milestone brief (v1.15,
> `requirements.txt`, `main.py`) is not part of this codebase. Every claim
> below is measured against the files and tests in *this* repository — see
> `docs/IMPLEMENTATION-REPORT-v1.16.md`.

---

## Quick start

### Run it on your laptop (Windows 11)

Full guide: [`docs/SETUP-WINDOWS.md`](docs/SETUP-WINDOWS.md) —
prerequisites (Node 22, Git, PostgreSQL), `.env`, schema push, `node
bin/ultron.mjs`, then `http://localhost:3000/presence` in Chrome/Edge with
microphone permission. A convenience `install.ps1` is included (reviewed but
not author-executed on Windows; the manual steps are identical).

### Install & run (production, this repo's canonical flow)

```bash
npm ci                 # install runtime + dev dependencies from lockfile
npm run build          # produce the production build (.next/BUILD_ID)
node bin/ultron.mjs    # launch — the canonical startup path
```

`bin/ultron.mjs` is a thin launcher: it verifies a production build exists
and delegates to `next start`, whose instrumentation hook runs the single
canonical bootstrap (`src/lib/ultron/bootstrap.ts`). There is no second
startup implementation anywhere in the repository — the architecture rule
ARCH-CLI-01 enforces this.

### Development (from a checkout)

```bash
npm install
npm run dev
```

Development checkouts behave exactly as before the packaging milestone:
writable paths stay inside the checkout (`data/`, `logs/`, `workspace/`),
`.env` is read from the repo root, and nothing requires migration. The
`.ultron-checkout` marker file (plus `next.config.ts` and `package.json`)
is what identifies a checkout; force either mode with
`ULTRON_INSTALL_MODE=development|installed`.

### The console

Open `/console` for the operations console: command chat, live path map,
migration control, device trust, audit events, redacted configuration.

---

## Where your data lives

All writable categories resolve to platform-appropriate user directories in
installed mode — **never inside the application package**:

| Platform | Configuration | Data & credentials | Logs | Cache |
|---|---|---|---|---|
| Linux | `~/.config/ultron` (XDG) | `~/.local/share/ultron` | `~/.local/state/ultron/logs` | `~/.cache/ultron` |
| macOS | `~/Library/Application Support/Ultron/Config` | `~/Library/Application Support/Ultron` | `~/Library/Logs/Ultron` | `~/Library/Caches/Ultron` |
| Windows | `%APPDATA%\Ultron` | `%LOCALAPPDATA%\Ultron` (machine-local, non-roaming) | `%LOCALAPPDATA%\Ultron\Logs` | `%LOCALAPPDATA%\Ultron\Cache` |

Categories covered: configuration, databases, transcripts, memory, identity,
device credentials, device allowlist, logs, workspace, exports, visualiser
output, cache. Full tables and the override matrix are in
[`docs/DATA-LAYOUT.md`](docs/DATA-LAYOUT.md).

### Overrides

| Variable | Effect |
|---|---|
| `ULTRON_HOME` | Root override for **all** writable directories |
| `ULTRON_CONFIG_DIR` | Override configuration directory |
| `ULTRON_DATA_DIR` | Override data directory |
| `ULTRON_CACHE_DIR` | Override cache directory |
| `ULTRON_LOG_DIR` | Override log directory |
| `ULTRON_WORKSPACE_DIR` | Override workspace directory |
| `ULTRON_INSTALL_MODE` | Force `development` or `installed` |
| `ULTRON_LEGACY_ROOT` | Point migration scanning at an old checkout |

If an override would place a writable path **inside the installation root**,
ULTRON refuses to start (`PathResolutionError`). Installed package
directories are never writable storage.

---

## Migration (from checkout-era data)

1. **Dry run first.** `GET /api/migration` (or the System tab) shows every
   planned copy: `.env` → config dir, `data/` → data dir, `logs/` → log dir,
   `workspace/` → workspace dir.
2. **Execute explicitly.** `POST /api/migration` with `{ "confirm": true }`.
3. Guarantees, pinned by `tests/migrate.test.ts`:
   - **Non-destructive** — sources are never deleted or modified.
   - **Idempotent** — re-runs copy nothing twice; existing destinations are
     skipped, never overwritten.
   - **Explicit failures** — per-item errors are reported; a failing item
     cannot corrupt prior data (copy-to-staging, then swap).
4. Every run is audited in the `ultron_migration_runs` table and the event log.

## Upgrades

Because *no* user data lives inside the application package, replacing the
installation (new build, new checkout, new deploy) cannot destroy data.
Configuration, databases, credentials, logs and workspace all persist in the
user directories above.

---

## Security model (preserved, not weakened)

- **Credentials**: files land in `<dataDir>/credentials` with real `0600` on
  POSIX (tests verify the mode bits); the directory itself is `0700`.
- **Windows honesty**: POSIX mode bits cannot be enforced from Node on
  Windows. ULTRON reports this as `unsupported` and relies on NTFS ACLs of the
  user profile instead of claiming `0600` semantics it cannot guarantee.
- **Secrets never leave**: the DB stores only SHA-256 fingerprints; env values
  are masked at the loader (`********(N chars)`) before they can reach logs,
  API responses or the UI.
- **Workspace sandbox**: traversal, absolute paths, NUL bytes and symlink
  escapes are rejected; violations are recorded as security events.
- **Architecture rules**: 9 scanners in `tests/architecture.test.ts` enforce
  the invariants above (centralized paths, confined env access, writes only
  via the core library, no duplicated CLI startup logic, and more).

## Dependencies

- **Runtime**: next, react, react-dom, drizzle-orm, pg, dotenv (env-file
  parsing), framer-motion + lucide-react (console UI).
- **Development**: typescript, tailwind/postcss, eslint, drizzle-kit, vitest.
- **Optional capability packs** (vision/voice and similar heavyweight
  features) are deliberately *not* part of the base dependency set; the base
  install stays lightweight.

## Testing

```bash
npx vitest run                 # full suite (unit + contract + architecture rules)
npx vitest run tests/paths     # targeted suites
```

Suites: path resolution (per-OS), install-mode detection, env loading &
redaction, workspace sandbox (incl. real symlink escapes), permission
hardening, migration (idempotency, non-destruction, failure isolation),
device credentials, assistant engine, architecture rules, CLI contract.

## Documentation

- [`docs/DATA-LAYOUT.md`](docs/DATA-LAYOUT.md) — per-OS paths, overrides, Windows notes
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — layers + enforced rules
- [`docs/DESIGN-week19-packaging.md`](docs/DESIGN-week19-packaging.md) — the packaging design as implemented
- [`docs/IMPLEMENTATION-REPORT-v1.16.md`](docs/IMPLEMENTATION-REPORT-v1.16.md) — measured results
- [`CHANGELOG.md`](CHANGELOG.md) — version history
