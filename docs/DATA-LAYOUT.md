# ULTRON Data Layout — v1.16

Everything below is **tested behavior**, resolved by
`src/lib/ultron/paths.ts` (the only module allowed to decide where any
writable byte lives) and pinned by `tests/paths.test.ts`.

## Mode summary

| Mode | Trigger | Writable locations |
|---|---|---|
| `development` | checkout markers present (`.ultron-checkout` + `next.config.ts` + `package.json`), or `ULTRON_INSTALL_MODE=development` | repo checkout itself: `data/`, `logs/`, `workspace/`, `.env` at root |
| `installed` | no markers, or `ULTRON_INSTALL_MODE=installed` | platform user directories (tables below) |

If an override would place a writable path inside the installation root in
installed mode, ULTRON **refuses to start** with `PathResolutionError`.

## Installed-mode directory map

### Linux (XDG Base Directory)

| Category | Path (defaults) | Honours |
|---|---|---|
| Configuration | `~/.config/ultron` | `$XDG_CONFIG_HOME` |
| Data root | `~/.local/share/ultron` | `$XDG_DATA_HOME` |
| Databases | `~/.local/share/ultron/databases` | — |
| Transcripts | `~/.local/share/ultron/transcripts` | — |
| Memory | `~/.local/share/ultron/memory` | — |
| Identity | `~/.local/share/ultron/identity` | — |
| Device credentials | `~/.local/share/ultron/credentials` (0700; files 0600) | — |
| Device allowlist | `~/.local/share/ultron/device-allowlist.json` (0600) | — |
| Exports | `~/.local/share/ultron/exports` | — |
| Visualiser output | `~/.local/share/ultron/visualizer` | — |
| Workspace (sandboxed) | `~/.local/share/ultron/workspace` | — |
| Logs | `~/.local/state/ultron/logs` | `$XDG_STATE_HOME` |
| Cache | `~/.cache/ultron` | `$XDG_CACHE_HOME` |

### macOS

| Category | Path |
|---|---|
| Configuration | `~/Library/Application Support/Ultron/Config` |
| Data root (+ all data sub-categories) | `~/Library/Application Support/Ultron` |
| Workspace | `~/Library/Application Support/Ultron/Workspace` |
| Logs | `~/Library/Logs/Ultron` |
| Cache | `~/Library/Caches/Ultron` |

### Windows

| Category | Path |
|---|---|
| Configuration (roaming, non-sensitive) | `%APPDATA%\Ultron` |
| Data root — **machine-local** | `%LOCALAPPDATA%\Ultron` |
| Device credentials / databases | `%LOCALAPPDATA%\Ultron\credentials`, `...\databases` |
| Logs | `%LOCALAPPDATA%\Ultron\Logs` |
| Cache | `%LOCALAPPDATA%\Ultron\Cache` |
| Workspace | `%LOCALAPPDATA%\Ultron\Workspace` |
| Fallback without env vars | `%USERPROFILE%\AppData\Roaming` / `...\Local` |

Credentials and databases deliberately resolve under the **local** (not
roaming) profile so secrets can never roam to other machines.

## Override matrix

| Variable | Scope |
|---|---|
| `ULTRON_HOME` | roots **all** categories under `<home>/{config,data,cache,logs,workspace}` |
| `ULTRON_CONFIG_DIR` | configuration only |
| `ULTRON_DATA_DIR` | data root (databases, transcripts, memory, identity, credentials, allowlist, exports, visualiser derive from it) |
| `ULTRON_CACHE_DIR` | cache only |
| `ULTRON_LOG_DIR` | logs only |
| `ULTRON_WORKSPACE_DIR` | workspace only |
| `ULTRON_INSTALL_MODE` | `development` \| `installed` |
| `ULTRON_LEGACY_ROOT` | directory scanned for migration candidates |

Precedence: per-category override > `ULTRON_HOME` > platform defaults.

## `.env` loading

| Mode | Files consulted (in precedence order) |
|---|---|
| development | `<checkout>/.env.local`, then `<checkout>/.env` |
| installed | `<configDir>/.env` **only** — the application package is never a config source |

Real environment variables always win; file values never clobber them. All
secret-looking values are masked (`********(N chars)`) in every API/UI/log
representation.

## Permissions & honesty

| Platform | Credential files | Credential dir | Notes |
|---|---|---|---|
| Linux/macOS | `0600` (verified in tests) | `0700` | real chmod |
| Windows | **reported `unsupported`** | **reported `unsupported`** | Node cannot set NTFS ACLs; files inherit the ACL of the user profile directory, which Windows restricts to the owning user + SYSTEM by default. We do not claim 0600 semantics we cannot enforce. |

## What happens on upgrade

Nothing, to your data. No user data lives in the installation directory, so:
- replacing the package/build cannot delete data;
- databases, memories, transcripts, credentials, logs, workspace and config
  stay exactly where they are;
- the data-layout version (`ULTRON_DATA_LAYOUT_VERSION = 1`) bumps if a
  future release ever needs a layout migration.

## What happens during migration (checkout → installed)

- Detected categories: `.env`, `data/`, `logs/`, `workspace/`.
- Dry-run plan first; execution requires explicit confirmation.
- Copy-only; sources preserved; existing destinations skipped; failures
  reported per item; every run audited to the database + event log.

## PostgreSQL note

This deployment's structured data (events, devices, conversations, migration
audit) lives in PostgreSQL via `DATABASE_URL` — by construction outside the
application package. `DATABASE_URL` itself is treated as a secret and masked
everywhere it is reported.
