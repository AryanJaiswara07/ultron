# ULTRON Architecture — v2.0.0 "Presence"

A voice-controlled AI operating layer for the user's computer. Not a chatbot:
a persistent presence that listens, thinks, speaks, acts, observes, adapts
and reports. This document describes the architecture **as implemented in
this repository**, with verification status per subsystem.

## The loop

```
MIC → VAD (browser) → STT (Web Speech API) ─┐
                                            ▼
TEXT input ────────────────────────► INTENT ROUTER
                                            │
                                  deterministic first (zero cost)
                                            │  else
                                            ▼
                                    BRAIN PROVIDER
                              cloud → ollama → deterministic
                                            │
                                   TOOL ORCHESTRATOR
                          (permissions + confirmations + audit)
                                            │
                ┌───────────────┬───────────┴──┬────────────┐
                ▼               ▼              ▼            ▼
           WORKSPACE FS     SYSTEM INFO    SHELL (allow)  MEMORY
                │               │              │            │
                └───────────────┴──────┬───────┴────────────┘
                                       ▼
                                  OBSERVATION → VERIFICATION
                                       │
                              PLAN/ACT/EVALUATE loop
                                       │
                                  SPOKEN SUMMARY → TTS → SPEAKER
                                       │
                    EVENT BUS ◄── every stage emits typed events
                       │  (SSE /api/stream + Postgres audit)
                       ▼
              PRESENCE VISUAL (state machine, audio-reactive)
```

## Subsystems & verification status

| Subsystem | Implementation | Verified by |
|---|---|---|
| Paths/security substrate (v1.16) | `src/lib/ultron/` paths, sandbox, permissions, env-loader | 73-test suite, live runs |
| Event bus v2 | `bus.ts` ring buffer + Postgres + SSE | `tests/bus.test.ts`, live SSE curl |
| Brain provider chain | `brain/providers.ts` cloud/ollama/deterministic | `tests/brain.test.ts` (mocked fetch, fallback chain) |
| Intent routing | `brain/intents.ts` phrase-variation tables | `tests/intents.test.ts` (>20 phrasings) |
| Tool registry | `tools/registry.ts` + handlers | `tests/tools.test.ts` incl. sandbox + allowlist |
| Task orchestrator | `org/orchestrator.ts` PAOV loop, pause/resume/stop | `tests/orchestrator.test.ts` (happy + failure + confirm gating) |
| Memory | `ultron_memories` table + API | `tests/memory.test.ts` |
| Voice (client) | `useVoiceUltron` — Web Speech API STT/TTS, wake word, barge-in, VU | manual-contract: runs in Chrome/Edge on the user's machine; server-side contracts unit-tested |
| Presence visual | canvas core + state machine + resource modes | `tests/presence.test.ts` (state machine logic) + live page |
| System info | `sysinfo.ts` os/statfs/`ps` — real measured values | `tests/doctor.test.ts` shape asserts |
| Doctor | `/api/doctor` real probes | live GET verified |
| Persistence | PostgreSQL via Drizzle | existing milest. + this suite |

## Distinction from a chatbot

- Voice is the primary surface; text is a fallback, not the product.
- The visual is driven by the **same event stream** as execution — it cannot
  show progress that did not happen (UI/voice synchronization contract).
- Actions flow through a permission/confirmation layer with audit, never
  directly from model output to execution.
- The deterministic intent layer handles common commands locally at zero
  cost; the LLM (when configured) is invoked for reasoning, not plumbing.

## Provider abstraction

`BrainProvider`: `{ id, kind, isAvailable(), complete(req) }`. Chain:
`ULTRON_BRAIN=auto` → try `cloud` (requires API key + `ULTRON_ASTRA_MODEL`),
then `ollama` (`OLLAMA_BASE_URL`), always ending at `deterministic`.
Providers only *suggest* tool calls; orchestration, permissions, memory and
verification stay inside ULTRON. ULTRON is not a wrapper.

## Resource modes (A15-class constraints)

`quiet | normal | full` — particle count, frame-rate cap and polling
intervals scale down in quiet mode; rendering pauses entirely when the tab
is hidden; mic capture uses downscaled analysis (FFT size 256).

## Hardware transparency

This repo is verified on a Linux container without GPU/mic. Anything the
host cannot provide is reported as unavailable (doctor + stats), never
simulated. Windows-target behavior (app discovery, tray, startup) is
roadmap-gated and explicitly unclaimed until implemented and tested.
