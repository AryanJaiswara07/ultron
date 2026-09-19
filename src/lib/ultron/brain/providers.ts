/**
 * BrainProvider abstraction — v2.0.0.
 *
 * ULTRON owns memory, tools, permissions, orchestration, voice and
 * verification. Providers only think. The chain degrades gracefully:
 *
 *   cloud (requires key + configured model)
 *     → ollama (requires reachable OLLAMA_BASE_URL)
 *       → deterministic (always available, zero cost)
 *
 * Availability is PROBED, never assumed; a provider that fails a call is
 * reported and the chain falls through for that interaction
 * (event: brain.degraded).
 */
import type { UltronEventPayload } from "../events";

export interface BrainMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface BrainRequest {
  readonly messages: BrainMessage[];
  /** Hard latency bound per provider call. */
  readonly timeoutMs: number;
  /** Max tokens to generate (providers map or ignore). */
  readonly maxOutputTokens: number;
}

export interface BrainResponse {
  readonly text: string;
  readonly providerId: string;
  readonly latencyMs: number;
}

export interface BrainProvider {
  readonly id: string;
  readonly kind: "cloud" | "ollama" | "deterministic";
  isAvailable(): Promise<boolean>;
  complete(request: BrainRequest): Promise<BrainResponse>;
  /** Diagnostic info safe to surface (no secrets). */
  describe(): UltronEventPayload;
}

export class BrainUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrainUnavailableError";
  }
}

/* ------------------------------ cloud provider ---------------------------- */

export interface CloudProviderOptions {
  readonly apiKey: string | undefined;
  /** Model identifier from configuration — never assumed to exist. */
  readonly model: string | undefined;
  readonly baseUrl?: string;
}

export function createCloudProvider(opts: CloudProviderOptions): BrainProvider {
  const baseUrl = (opts.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  return {
    id: "cloud",
    kind: "cloud",
    describe: () => ({
      modelConfigured: Boolean(opts.model),
      keyConfigured: Boolean(opts.apiKey),
    }),
    async isAvailable() {
      return Boolean(opts.apiKey && opts.model);
    },
    async complete(request) {
      if (!opts.apiKey || !opts.model) {
        throw new BrainUnavailableError(
          "Cloud brain requires ULTRON_BRAIN_API_KEY and ULTRON_BRAIN_MODEL.",
        );
      }
      const started = Date.now();
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model: opts.model,
          messages: request.messages,
          max_tokens: request.maxOutputTokens,
          stream: false,
        }),
        signal: AbortSignal.timeout(request.timeoutMs),
      });
      if (!res.ok) {
        throw new Error(`Cloud brain HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("Cloud brain returned an empty completion.");
      return { text, providerId: "cloud", latencyMs: Date.now() - started };
    },
  };
}

/* ----------------------------- ollama provider ---------------------------- */

export interface OllamaProviderOptions {
  readonly baseUrl: string; // e.g. http://localhost:11434
  readonly model: string;   // e.g. llama3.1:8b
  readonly probeTimeoutMs?: number;
}

export function createOllamaProvider(opts: OllamaProviderOptions): BrainProvider {
  const base = opts.baseUrl.replace(/\/$/, "");
  const probeTimeout = opts.probeTimeoutMs ?? 1200;
  return {
    id: "ollama",
    kind: "ollama",
    describe: () => ({ model: opts.model, baseUrl: base }),
    async isAvailable() {
      try {
        const res = await fetch(`${base}/api/tags`, {
          signal: AbortSignal.timeout(probeTimeout),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { models?: Array<{ name?: string }> };
        // Available only if the server responds; model listing is advisory.
        return Array.isArray(data.models);
      } catch {
        return false;
      }
    },
    async complete(request) {
      const started = Date.now();
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: opts.model,
          messages: request.messages,
          stream: false,
          options: { num_predict: request.maxOutputTokens },
        }),
        signal: AbortSignal.timeout(request.timeoutMs),
      });
      if (!res.ok) {
        throw new Error(`Ollama HTTP ${res.status}`);
      }
      const data = (await res.json()) as { message?: { content?: string } };
      const text = data.message?.content?.trim();
      if (!text) throw new Error("Ollama returned an empty completion.");
      return { text, providerId: "ollama", latencyMs: Date.now() - started };
    },
  };
}
