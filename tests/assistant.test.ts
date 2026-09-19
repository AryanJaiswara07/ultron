import { describe, expect, it } from "vitest";

import { runAssistant } from "../src/lib/ultron/assistant";
import { resolveAppPaths } from "../src/lib/ultron/paths";

const paths = resolveAppPaths({
  env: {},
  platform: "linux",
  homeDir: "/home/tester",
  installRoot: "/opt/pkg/ultron",
  mode: "installed",
});

const stats = {
  events: 12,
  devices: 2,
  conversations: 3,
  messages: 40,
  migrationRuns: 1,
};

function ask(input: string, legacyDetected = false) {
  return runAssistant({ input, paths, stats, legacyDetected });
}

describe("assistant command engine", () => {
  it("never claims to be a language model and never fabricates", () => {
    const reply = ask("write me a poem about the moon");
    expect(reply.intent).toBe("fallback");
    expect(reply.content.toLowerCase()).toContain("deterministic");
  });

  it("/status reports live counters", () => {
    const reply = ask("/status");
    expect(reply.intent).toBe("status");
    expect(reply.content).toContain("12");
    expect(reply.content).toContain("migration runs");
  });

  it("/paths enumerates the writable categories", () => {
    const reply = ask("paths");
    expect(reply.intent).toBe("paths");
    expect(reply.content).toContain(paths.credentialsDir);
    expect(reply.content).toContain("workspace");
  });

  it("natural language data-residency question maps to paths intent", () => {
    const reply = ask("where is my data stored?");
    expect(reply.intent).toBe("paths");
  });

  it("help lists real commands", () => {
    const reply = ask("help");
    expect(reply.intent).toBe("help");
    expect(reply.content).toContain("/status");
    expect(reply.content).toContain("/migrate");
    expect(reply.suggestions.length).toBeGreaterThan(0);
  });

  it("migrate intent reflects detection state", () => {
    expect(ask("migrate", true).content).toContain("detected");
    expect(ask("migrate", false).content).toContain("No legacy");
  });

  it("version intent reports the milestone version", () => {
    expect(ask("version").content).toContain("2.0");
  });
});
