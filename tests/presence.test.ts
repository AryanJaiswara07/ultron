import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  EVENT_STATE_MAP,
  PRESENCE_STATES,
  ULTRON_EVENT_TYPES,
} from "../src/lib/ultron/events";

const REPO = path.resolve(__dirname, "..");

describe("presence state machine contracts", () => {
  it("every mapped event type exists in the vocabulary", () => {
    const vocab = new Set<string>(ULTRON_EVENT_TYPES);
    for (const key of Object.keys(EVENT_STATE_MAP)) {
      expect(vocab.has(key)).toBe(true);
    }
  });

  it("every mapped state is a declared presence state", () => {
    const states = new Set<string>(PRESENCE_STATES);
    for (const value of Object.values(EVENT_STATE_MAP)) {
      expect(states.has(value)).toBe(true);
    }
  });

  it("the nine presence states are the declared ones", () => {
    expect([...PRESENCE_STATES].sort()).toEqual(
      [
        "CONFIRMATION",
        "ERROR",
        "EXECUTING",
        "IDLE",
        "LISTENING",
        "SPEAKING",
        "SUCCESS",
        "THINKING",
        "WARNING",
      ].sort(),
    );
  });
});

describe("client event ingestion contract", () => {
  it("ingest whitelist entries are all declared vocabulary types", async () => {
    const routeFile = await readFile(
      path.join(REPO, "src", "app", "api", "events", "ingest", "route.ts"),
      "utf8",
    );
    const whitelist = [...routeFile.matchAll(/"([a-z_.]+)"/g)]
      .map((m) => m[1])
      .filter((s) => s.includes("_"));
    const vocab = new Set<string>(ULTRON_EVENT_TYPES);
    expect(whitelist.length).toBeGreaterThanOrEqual(5);
    for (const entry of whitelist) {
      expect(vocab.has(entry)).toBe(true);
    }
  });
});
