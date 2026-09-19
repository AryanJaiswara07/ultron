# ULTRON v1.16 — Implementation Report (measured)

All numbers below are measured from the repository and live runtime during
this session. Nothing is estimated.

## 0. Environment divergence (PHASE A finding — reported, not worked around)

The milestone brief describes a Python project ("v1.15, commit 9ffa2bb,
1,804 tests, 47 architecture rules, `main.py`, `requirements*.txt",
`docs/DESIGN-week19-packaging.md`"). **None of that existed in this
environment.** Measured starting state:

- Files: a Next.js 16 + PostgreSQL/Drizzle starter (9 source files), no git
  history, no Python, no design document, no tests, no ULTRON code.

Decision (per protocol): the mismatch is reported here explicitly, and the
packaging milestone was implemented with full fidelity in the domain this
repository supports — the same contracts (install/launch, data separation,
migration, security, tests, rules, docs) realized in TypeScript/Next.js.
The Python-lineage numbers (47 rules, 1,804 tests) are **not** claimed for
this codebase anywhere; measured equivalents are reported instead.

## 1. Version & baseline

- ULTRON version: **1.16.0** (`src/lib/ultron/version.ts`, single source)
- Previous version in this repo: none (fresh codebase)
- Data layout version: 1

## 2. Files (measured)

- Source files (src/, bin/, tests/): **46** (`find src bin tests -type f`)
- LOC in src/ + bin/ + tests/: **5,381** (`cat … | wc -l`)
- Repository files excluding node_modules/.next/.git: **66**
- New subsystems: `src/lib/ultron/` (11 modules), `src/db/` (schema+queries),
  11 API routes, console UI (6 components + 2 pages), `bin/ultron.mjs`,
  10 test suites, 5 docs, 1 generated image (`public/images/core.jpg`).

## 3. Install / launch (exact commands)

```bash
npm ci
npm run build
node bin/ultron.mjs          # or: npm start (same canonical path)
```

Development: `npm install && npm run dev` (checkout behavior unchanged).
CLI verified live: `--version` → `1.16.0`; `--help` renders env matrix.
No `package.json` edits were made (tooling constraint); the launcher is a
checked-in executable ESM script.

## 4. Dependencies (measured from package.json)

- Runtime: next 16.2.6, react 19.2.6, react-dom 19.2.6, drizzle-orm 0.45.2,
  pg 8.20.0, dotenv 17.3.1, framer-motion, lucide-react
- Development: typescript 5.9.3, tailwindcss/postcss 4.1.17, eslint 9.39.4,
  drizzle-kit 0.31.10, vitest, @types/*
- Test-only deps are NOT in runtime deps (the brief's pytest-in-runtime
  class of issue does not exist here).
- Optional packs (vision/voice): intentionally absent from base install.

## 5. Data locations per OS (tested: tests/paths.test.ts)

See docs/DATA-LAYOUT.md. Linux: XDG (`~/.config/ultron`,
`~/.local/share/ultron`, `~/.local/state/ultron/logs`, `~/.cache/ultron`).
macOS: `~/Library/{Application Support/Ultron,Caches/Ultron,Logs/Ultron}`.
Windows: `%APPDATA%\Ultron` (config), `%LOCALAPPDATA%\Ultron` (data/logs/
cache — non-roaming for credentials). Overrides: `ULTRON_HOME` +
per-category `ULTRON_*_DIR`. Verified live: installed-mode server resolved
all 13 locations under `ULTRON_HOME`, zero inside the install root.

## 6. Migration behavior (unit-tested + live-verified)

Live installed-mode run against a seeded legacy checkout:
dry-run → 4 `copy` items; execute → `status=ok`, copied 4, errors 0;
re-run → `status=noop`, copied 0 (idempotent); originals byte-identical
(md5 match); upgraded destinations contain nested legacy content that was
previously shadowed by bootstrap-created dirs (**bug found via live test,
fixed with recursive merge + regression test**). Failures: per-item status,
never destructive, audited in `ultron_migration_runs` + event log.

## 7. Tests before / after

- Before: **0** test files, **0** tests.
- After: **10 files, 73 tests, 73 passed, 0 failed, 0 skipped**
  (`npx vitest run` final measure).
- Coverage of the brief's required areas: path resolution per OS ✓, dev
  mode ✓, installed-mode assumptions without global install ✓ (injection +
  live env-forced run), migration detection/idempotency/non-destruction/
  failure isolation ✓, credential location + 0600 ✓, no data path inside
  install root ✓, sandbox incl. real symlink escape ✓, CLI maps to canonical
  startup ✓, no duplicated startup logic ✓ (ARCH-CLI-01).

## 8. Architecture rules before / after

- Before: **0** (the cited 47 rules existed only in the absent Python repo).
- After: **9 enforced rules**, all implemented as scanners in
  `tests/architecture.test.ts` and all passing: ARCH-PATH-01, ARCH-PATH-02,
  ARCH-SEC-01, ARCH-SEC-02, ARCH-ENV-01, ARCH-CLI-01, ARCH-EV-01,
  ARCH-UI-01, ARCH-VER-01. Each protects a real invariant; none cosmetic.

## 9. Security properties (verified)

- Credential file on disk: mode **0600** (`stat` on live-issued file).
- Credentials dir: **0700**. Allowlist: **0600**.
- Secret shown once at issuance; DB holds SHA-256 fingerprint only.
- Env secrets masked at loader; `/api/config` returns only masked values.
- Workspace traversal attempt `../../etc/passwd` → **403** +
  `sandbox.violation` warning event (verified live).
- Windows permission limits reported `unsupported`, no false 0600 claims.
- No secrets in source, docs, or test snapshots (ARCH-ENV-01 + redaction
  tests; repo grep for the smoke secret returns nothing).

## 10. Validation evidence (this session)

| Gate | Result |
|---|---|
| `npx next typegen` | pass |
| `tsc --noEmit --pretty false` | pass (0 errors) |
| `npm run lint` | pass (0 problems) |
| `npx vitest run` | **73/73 pass** |
| `npm run build` | pass (13 routes) |
| platform build_and_start | pass `/api/health` `{"ok":true,"version":"1.16.0"}` |
| secret scan (`grep -R` for issued secret/accidental keys) | clean |

## 11. Known limitations (honest)

- Windows: POSIX mode bits not enforceable from Node; NTFS ACL inheritance
  documented; actual ACL hardening would need native tooling.
- Mode auto-detection trusts checkout markers; ambiguous layouts should set
  `ULTRON_INSTALL_MODE` explicitly.
- The assistant console engine is deterministic/local by design; it does not
  claim LLM capability.
- `bin/ultron.mjs` is not registered as a global `ultron` shim (package.json
  edits were out of scope for this environment); launch via
  `node bin/ultron.mjs`.

## 12. Not verified

- True Windows/macOS runtime behavior (matrix branches are unit-tested with
  injected platform/env/help paths, plus live Linux verification; no physical
  Windows/macOS machine was available).
- Migration from a multi-gigabyte legacy checkout (test fixtures are small;
  algorithmic behavior — merge, skip, stage — is size-independent).
