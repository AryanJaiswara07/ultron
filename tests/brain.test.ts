import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildBrainChain,
  completeWithFallback,
  isCloudBrainConfigured,
  selectBrain,
} from "../src/lib/ultron/brain/selector";
import {
  BrainUnavailableError,
  createCloudProvider,
  createOllamaProvider,
} from "../src/lib/ultron/brain/providers";
import { createDeterministicProvider } from "../src/lib/ultron/brain/intents";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cloud provider", () => {
  it("is unavailable without key+model (never assumed)", async () => {
    const p = createCloudProvider({ apiKey: undefined, model: undefined });
    expect(await p.isAvailable()).toBe(false);
    await expect(
      p.complete({ messages: [], timeoutMs: 1000, maxOutputTokens: 10 }),
    ).rejects.toBeInstanceOf(BrainUnavailableError);
  });

  it("calls the chat completions API with the configured model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://api.openai.com/v1/chat/completions");
        const body = JSON.parse(String(init?.body)) as { model: string };
        expect(body.model).toBe("astra-test-model");
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "Certainly, boss." } }] }),
          { status: 200 },
        );
      }),
    );
    const p = createCloudProvider({ apiKey: "k", model: "astra-test-model" });
    expect(await p.isAvailable()).toBe(true);
    const res = await p.complete({
      messages: [{ role: "user", content: "hi" }],
      timeoutMs: 1000,
      maxOutputTokens: 50,
    });
    expect(res.text).toBe("Certainly, boss.");
    expect(res.providerId).toBe("cloud");
  });

  it("surfaces HTTP failures so the chain can degrade", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const p = createCloudProvider({ apiKey: "k", model: "m" });
    await expect(
      p.complete({ messages: [], timeoutMs: 1000, maxOutputTokens: 10 }),
    ).rejects.toThrow("HTTP 500");
  });

  it("rejects empty completions (fail closed)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })),
    );
    const p = createCloudProvider({ apiKey: "k", model: "m" });
    await expect(
      p.complete({ messages: [], timeoutMs: 1000, maxOutputTokens: 10 }),
    ).rejects.toThrow("empty");
  });
});

describe("ollama provider", () => {
  it("availability probes /api/tags and fails cleanly when down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))));
    const p = createOllamaProvider({ baseUrl: "http://127.0.0.1:11434", model: "m" });
    expect(await p.isAvailable()).toBe(false);
  });

  it("complete hits /api/chat and parses the envelope", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/api/tags")) {
        return new Response(JSON.stringify({ models: [{ name: "m" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: { content: "Local answer." } }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const p = createOllamaProvider({ baseUrl: "http://127.0.0.1:11434/", model: "m" });
    expect(await p.isAvailable()).toBe(true);
    const res = await p.complete({
      messages: [{ role: "user", content: "hi" }],
      timeoutMs: 1000,
      maxOutputTokens: 20,
    });
    expect(res.text).toBe("Local answer.");
  });
});

describe("selection + graceful degradation", () => {
  it("auto chain is cloud → ollama → deterministic", () => {
    const chain = buildBrainChain({});
    expect(chain.map((p) => p.id)).toEqual(["cloud", "ollama", "deterministic"]);
  });

  it("forced deterministic mode is a single-provider chain", () => {
    const chain = buildBrainChain({ ULTRON_BRAIN: "deterministic" });
    expect(chain.map((p) => p.id)).toEqual(["deterministic"]);
  });

  it("selects deterministic when nothing else is configured", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
    const sel = await selectBrain({});
    expect(sel.provider.id).toBe("deterministic");
    expect(sel.chain).toContain("ollama");
  });

  it("isCloudBrainConfigured reports config presence", () => {
    expect(isCloudBrainConfigured({})).toBe(false);
    expect(
      isCloudBrainConfigured({ ULTRON_BRAIN_API_KEY: "k", ULTRON_BRAIN_MODEL: "m" }),
    ).toBe(true);
  });

  it("completeWithFallback degrades on provider failure and answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 503 })),
    );
    const res = await completeWithFallback(
      { messages: [{ role: "user", content: "open vs code" }], timeoutMs: 800, maxOutputTokens: 60 },
      {},
    );
    expect(res.providerId).toBe("deterministic");
    expect(res.text.toLowerCase()).toContain("opening");
  });

  it("deterministic provider always answers, zero cost", async () => {
    const p = createDeterministicProvider();
    expect(await p.isAvailable()).toBe(true);
    const res = await p.complete({
      messages: [{ role: "user", content: "unintelligible gibberish xyzzy" }],
      timeoutMs: 500,
      maxOutputTokens: 60,
    });
    expect(res.text.length).toBeGreaterThan(10);
    expect(res.providerId).toBe("deterministic");
  });
});
