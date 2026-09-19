/**
 * Brain selection + graceful degradation.
 *
 * Order (ULTRON_BRAIN=auto): cloud → ollama → deterministic.
 * A provider that is unavailable OR fails mid-call degrades for that
 * interaction only, and the degradation is audited (brain.degraded) so the
 * user always knows which brain answered — never a silent swap.
 */
import { ultronBus } from "../bus";
import {
  createDeterministicProvider,
  routeIntent,
} from "./intents";
import {
  BrainUnavailableError,
  createCloudProvider,
  createOllamaProvider,
  type BrainProvider,
  type BrainRequest,
  type BrainResponse,
} from "./providers";

export interface BrainSelection {
  readonly provider: BrainProvider;
  readonly chain: string[];
}

/** Cloud brain config probe (env access confined to the ultron lib). */
export function isCloudBrainConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env.ULTRON_BRAIN_API_KEY && env.ULTRON_BRAIN_MODEL);
}

export function buildBrainChain(
  env: Record<string, string | undefined> = process.env,
): BrainProvider[] {
  const forced = (env.ULTRON_BRAIN ?? "auto").toLowerCase();
  const deterministic = createDeterministicProvider();

  const cloud = createCloudProvider({
    apiKey: env.ULTRON_BRAIN_API_KEY,
    model: env.ULTRON_BRAIN_MODEL,
    baseUrl: env.ULTRON_BRAIN_BASE_URL,
  });
  const ollama = createOllamaProvider({
    baseUrl: env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    model: env.OLLAMA_MODEL ?? "llama3.1:8b",
  });

  switch (forced) {
    case "cloud":
      return [cloud, deterministic];
    case "ollama":
      return [ollama, deterministic];
    case "deterministic":
    case "offline":
      return [deterministic];
    default:
      return [cloud, ollama, deterministic];
  }
}

/** First available provider in the chain (probes, never assumes). */
export async function selectBrain(
  env?: Record<string, string | undefined>,
): Promise<BrainSelection> {
  const chain = buildBrainChain(env);
  const tried: string[] = [];
  for (const provider of chain) {
    tried.push(provider.id);
    if (await provider.isAvailable().catch(() => false)) {
      if (provider.id !== chain[chain.length - 1].id || chain.length === 1) {
        ultronBus.publish("brain.selected", {
          provider: provider.id,
          chainLength: chain.length,
        });
      }
      return { provider, chain: tried };
    }
    if (provider.id !== "deterministic") {
      ultronBus.publish(
        "brain.degraded",
        { from: provider.id, reason: "availability probe failed" },
        "warning",
      );
    }
  }
  // Unreachable by construction (deterministic is always available) but
  // kept defensive to fail closed.
  throw new BrainUnavailableError("No brain provider available.");
}

/** Complete with per-call degradation: failure falls to the next provider. */
export async function completeWithFallback(
  request: BrainRequest,
  env?: Record<string, string | undefined>,
): Promise<BrainResponse> {
  const chain = buildBrainChain(env);
  let lastError: unknown = null;
  for (const provider of chain) {
    if (!(await provider.isAvailable().catch(() => false))) continue;
    try {
      const res = await provider.complete(request);
      ultronBus.publish("brain.selected", {
        provider: res.providerId,
        latencyMs: res.latencyMs,
      });
      return res;
    } catch (error) {
      lastError = error;
      ultronBus.publish(
        "brain.degraded",
        {
          from: provider.id,
          reason: error instanceof Error ? error.message : String(error),
        },
        "warning",
      );
    }
  }
  throw new BrainUnavailableError(
    `All brain providers failed. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

/** Convenience for the interaction layer: fast local routing decision. */
export { routeIntent };
