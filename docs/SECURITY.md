# ULTRON Security Model — v2.0.0

ULTRON controls a computer. Security is architectural, not cosmetic.
All rules below are enforced in code and test-pinned.

## Principles

1. **The model never executes.** Brain providers emit proposals; the tool
   registry validates against permission classes before anything runs.
2. **Fail closed.** Unknown intents, unparseable provider output, missing
   confirmations and permission gaps all degrade to *no action + spoken
   explanation*, never to best-effort execution.
3. **Workspace confinement.** All file tools resolve through
   `resolveWorkspacePath` (containment, traversal, NUL, symlink-escape
   rejection — 73-test legacy suite + new contract tests).
4. **Allowlisted shell.** `shell.exec` accepts a fixed verb list
   (`node`, `npm`, `npx`, `git`, `ls`, `cat`), forbids metacharacters and
   chained commands, confines `cwd` to the workspace, caps output, enforces
   timeouts. Destructive verbs (`rm`, `del`, `format`, …) are not on the list.
5. **Explicit confirmation for consequential actions.** Tools are classes:
   `read` (free), `write` (audited), `system` (audited), `install` /
   `destructive` (confirmation token required, TTL-limited, single-use).
   Confirmation events (`confirmation_required/granted/denied`) are auditable.
6. **Secrets stay server-side.** API keys live in env; masked at the loader;
   never serialized to clients (ARCH-ENV-01 + redaction tests).
7. **Untrusted input is treated as untrusted.** Web content, transcripts and
   LLM output are data, not instructions; prompt-injection lines from a
   provider cannot invoke tools outside the registry schema.
8. **Audit everything.** Every tool call, confirmation, task transition and
   client voice event is persisted (Postgres) and streamed (SSE).
9. **Resource limits.** Command timeouts (default 15 s), output caps
   (64 KiB), SSE heartbeats, idle render pauses, quiet-mode caps.

## Owner authentication (current state)

Presence is assertion-based today (single local user). High-risk operations
require confirmation even from the owner; PIN/TOTP is the planned upgrade
(roadmap Phase 6 extension) before any remote exposure is contemplated.
Voice alone is never an authorization factor.

## Threat notes (honest gaps)

- Browser STT/TTS quality/permissions depend on the user's browser; the
  system degrades to text and says so.
- Shell allowlist is sound for the v1 verb set; adding verbs is a security
  change requiring tests (path-injection and argument-injection suites).
- SSE emits no secrets; payloads are schema-shaped and whitelisted
  (client ingest validates against a literal event whitelist).
