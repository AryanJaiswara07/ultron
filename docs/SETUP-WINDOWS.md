# Running ULTRON on your laptop (Windows 11 — ASUS TUF A15)

Tested target: Windows 11, Chrome/Edge for voice. Everything below is
plain, inspectable — no hidden installers.

## 0. What you're installing

ULTRON = a local Next.js server (your computer's "core process") + the
Presence page (voice + golden core) running in your browser. Voice I/O uses
your browser's built-in speech APIs (free, no account). Reasoning runs:
deterministic (always) → Ollama (if you install it) → cloud (if you add a key).

## 1. Prerequisites

1. **Node.js 22 LTS** — https://nodejs.org (verify: `node -v` → v22.x)
2. **Git for Windows** — https://git-scm.com/download/win (verify: `git --version`)
3. **PostgreSQL 16 or 17** — https://www.postgresql.org/download/windows/
   - During install, set a password for the `postgres` user — remember it.
   - After install, open **SQL Shell (psql)**, press Enter through the
     defaults, then run:
     ```sql
     CREATE DATABASE app_db;
     ```

## 2. Get the code

```powershell
git clone <your-repo-url> ultron
cd ultron
```

## 3. Configure

Create `.env` in the repo root:

```ini
DATABASE_URL=postgresql://postgres:<your-postgres-password>@127.0.0.1:5432/app_db
```

Optional additions (any subset):

```ini
# Local brain via Ollama (recommended for this laptop — see §6)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b

# Cloud brain (any OpenAI-compatible endpoint)
ULTRON_BRAIN=cloud
ULTRON_BRAIN_API_KEY=sk-...
ULTRON_BRAIN_MODEL=your-model-id
```

## 4. Install, migrate, build, launch

```powershell
npm install
npx drizzle-kit push     # creates ULTRON's tables in app_db
npm run build
node bin/ultron.mjs      # the canonical startup path
```

Leave that window open — it IS ULTRON running locally.

## 5. Use it (voice)

1. Open **Chrome or Edge** → `http://localhost:3000/presence`
2. Click the **mic button** (bottom bar) and allow microphone permission.
   (First enable may need two clicks: one unlocks audio, one starts listening.)
3. Say **"Ultron"** — the core wakes (LISTENING state, you see/hear it).
4. Then speak:
   - *"open VS Code"* → app discovery reports what it can see (Windows app
     launching registry is the next roadmap phase; today it reports honestly)
   - *"what is using my RAM?"* → answers with **measured** processes
   - *"create a 3d website called nova"* → builds it into
     `<repo>\workspace\nova\` — open `index.html` in your browser
     (the 3D template loads three.js from CDN, so that page needs internet)
   - *"remember that my editor is VS Code"* → then *"what do you remember?"*
   - *"stop"* (while it's talking) → silence immediately
5. Prefer silence? Type in the bottom bar instead — same pipeline.
6. **Consequential actions** (e.g. running a shell command) ask first:
   a gold confirmation card appears → **allow / deny**. Nothing gated runs
   without it.

Voice troubleshooting (most common causes on Windows 11, in order):

1. **Click the mic button first.** Nothing listens until you do — the gold
   strip above the input always shows the current state ("mic is off…" /
   "listening — say 'ultron'" / live interim text as you speak). If you see
   your words appear there, the pipeline hears you.
2. **Browser speech service needs internet.** Chrome and Edge do *not*
   recognize speech offline on Windows — audio goes to Google/Microsoft's
   service. If the strip says "needs internet", that's the cause.
3. **Windows speech privacy setting.** Settings → Privacy & security →
   Speech → turn *online speech recognition* ON (required by Edge).
4. **Mic permission.** Click the lock icon in the address bar → microphone →
   Allow. Also Windows Settings → System → Sound → pick your headset input.
5. **Say the wake word as-is: "ultron".** "hey ultron", "ok ultron", and
   wake+command in one breath ("ultron, open chrome") all work as of v2.0.2.
   After the wake glow you can just speak the command.
6. Firefox has no speech recognition — typed mode still works fully.

## 6. Optional local brain (Ollama) — tuned for the A15

Your machine: Ryzen 7 / 16 GB RAM / RTX 3050 4 GB. Recommendation:

```powershell
# Install https://ollama.com/download/windows, then:
ollama pull llama3.2:3b    # ~2 GB download, comfortable on 16 GB RAM
```

Add `OLLAMA_MODEL=llama3.2:3b` to `.env`, restart `node bin/ultron.mjs`.
ULTRON probes Ollama at `http://localhost:11434` automatically; the top bar
shows which brain is live, and every degradation is announced, never silent.
An 8B model also works but is heavier; avoid >8B on 16 GB RAM.

## 7. Diagnostics (`ultron doctor`)

- Browser button: Presence page → **doctor** (top right)
- Raw JSON: `http://localhost:3000/api/doctor`
- CLI test suite (repo): `npx vitest run` — **137 tests** covering
  intents/brain/tools/orchestrator/security.

Expect warnings (not failures) on a fresh laptop for `ollama` and
`cloud brain` until you configure them; mic/speaker report
`client-check` (verified by the browser itself).

## 8. Where your data lives (laptop = dev checkout mode)

Running from the cloned repo is the supported development mode:
everything writable stays inside the checkout — `data\`, `logs\`,
`workspace\` (your generated projects land there), `.env` at root. Your
Postgres `app_db` holds events, tasks, memories, devices. Nothing is sent
anywhere unless you configure a cloud brain yourself.

## Troubleshooting

| symptom | fix |
|---|---|
| `db. … password authentication failed` | `.env` DATABASE_URL password must match the Postgres install password |
| `drizzle-kit push` can't connect | PostgreSQL service running? `services.msc` → postgresql-x64 |
| port 3000 busy | set `PORT=3001` before `node bin/ultron.mjs` |
| no speech out | system volume + first-click audio unlock; try PTT button |
| `npm run build` OOM | close Chrome tabs; this repo builds in ~2 GB |
| anything else | run doctor; the detail strings say exactly what failed |
