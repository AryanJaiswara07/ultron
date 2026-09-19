import { describe, expect, it } from "vitest";

import { handleInteraction } from "../src/lib/ultron/interact";

/**
 * Interaction pipeline contracts. handleInteraction runs against the real
 * sandbox checkout (dev mode); provider probes fail fast (no Ollama here),
 * so deterministic paths are the ones exercised — which is exactly the
 * truth a fresh laptop experiences.
 */

describe("interaction — wake handling (v2.0.2 regression)", () => {
  it('"hey ultron" yields an affirmation, NEVER the unresolved fallback', async () => {
    const res = await handleInteraction("hey ultron");
    expect(res.intent).toBe("wake");
    expect(res.speech.length).toBeGreaterThan(2);
    expect(res.speech).not.toContain("don't have a handler");
    expect(res.speech).not.toContain("Let me think");
  });

  it('full wake+command in one breath executes the command', async () => {
    const res = await handleInteraction("hey ultron, what is using my ram");
    expect(res.intent).toBe("system.top");
  });
});

describe("interaction — unresolved guidance without a ghost think", () => {
  it("answers with capability guidance and points at 'what can you do'", async () => {
    const res = await handleInteraction("xyzzy quantum banana protocol");
    expect(res.intent).toBe("unresolved");
    expect(res.provider).toBe("deterministic");
    expect(res.speech).toContain("don't have a handler");
    expect(res.speech).toContain("what can you do");
    expect(res.speech).not.toContain("Let me think about that");
  });

  it("'what can you do' lists only real, live capabilities", async () => {
    const res = await handleInteraction("what can you do");
    expect(res.intent).toBe("help");
    expect(res.speech).toContain("open applications");
    expect(res.speech).toContain("scaffold");
  });
});

describe("interaction — steering with nothing running", () => {
  it("stop/pause report honestly instead of pretending", async () => {
    const res = await handleInteraction("stop");
    expect(res.speech.toLowerCase()).toContain("nothing");
  });
});
