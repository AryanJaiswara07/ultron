# ULTRON Roadmap — phase ledger v2.0.0

Legend: **[done]** implemented + tested here · **[partial]** real subset ·
**[planned]** designed, not claimed.

| Phase | Scope | Status |
|---|---|---|
| 0 Repo + architecture | docs, env recon, version | **done** (v2.0.0) |
| 1 Event system | bus, SSE, ingest, vocabulary v2, persistence | **done** |
| 2 Voice I/O | wake word, PTT, STT/TTS (browser), barge-in, VU | **done (client, browser-scoped)** |
| 3 Brain/provider abstraction | cloud/ollama/deterministic + degradation | **done** |
| 4 Conversation + memory | context refs, inspect/delete store | **done (core)** |
| 5 Tool system | registry, fs/shell/sysinfo/memory tools | **done (v1 set)** |
| 6 Security + permissions | policies, confirmations, audit (builds on v1.16) | **done (core)**; owner auth **planned** |
| 7 Computer control | **planned**: OS window/app control on Windows host | not claimed |
| 8 Browser control | **planned**: remote debugging protocol agent | not claimed |
| 9 Task orchestration | PAOV loop, steering, verification | **done (core loop)** |
| 10 Development agent | scaffold + verify project | **partial** (template scaffolds work; install/build steps gated on confirmations) |
| 11 3D site/game builders | **planned** (R3F/GSAP templates scaffold-ready) | not claimed |
| 12 System monitoring | real CPU/RAM/disk/process stats | **done**; GPU/temps **planned** (host-dependent) |
| 13 Desktop visual presence | golden core + state machine | **done (web presence)**; frameless/tray window **planned** |
| 14 Voice/visual sync | event-driven states, amplitude reactivity | **done** |
| 15 Proactive notifications | rate-limited, permission-gated | **planned** |
| 16 Device integrations | registry from v1.16 retained; real device I/O **planned** | not claimed |
| 17 Hardening | ongoing; rules are enforced by suite | **partial** |
| 18 Packaging | installable, data separation | **done (v1.16, carried forward)** |

## Next increments (priority order)
1. Windows host adapter for app discovery + launch (Phase 7) — target the A15.
2. Browser agent over CDP (Phase 8) with screenshot diffing + element testing.
3. Deeper dev agent: dependency install + build verification behind
   confirmation, with self-healing retry recipes (Phase 10).
4. Owner PIN/TOTP for high-risk authorization (Phase 6 extension).
5. Frameless desktop shell packaging (Tauri evaluation, Phase 13).

Every phase ships with tests and an honest ledger entry; nothing is marked
done unless executed in this repository (or explicitly labeled
"browser/client verified" where the runtime is the user's machine).
