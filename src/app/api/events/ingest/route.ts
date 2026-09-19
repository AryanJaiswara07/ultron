import { ultronBus } from "@/lib/ultron/bus";
import type { UltronEventPayload, UltronEventType } from "@/lib/ultron/events";

export const dynamic = "force-dynamic";

/**
 * Client voice/presence → server bus ingestion.
 * The whitelist is a literal set of accepted event types — real validation
 * code (and ARCH-EV-01 proof that client-sourced types are genuinely
 * handled, not dead vocabulary). Unlisted types are rejected.
 */
const CLIENT_EVENT_WHITELIST = new Set<string>([
  "wake_detected",
  "listening_started",
  "speech_detected",
  "transcription_ready",
  "speaking_started",
  "speaking_finished",
]);

const MAX_PAYLOAD_KEYS = 12;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    type?: string;
    payload?: Record<string, unknown>;
  };
  const type = body.type ?? "";
  if (!CLIENT_EVENT_WHITELIST.has(type)) {
    return Response.json(
      { error: "Event type not accepted from clients.", type },
      { status: 403 },
    );
  }

  // Shape the payload through the scalar-only contract; drop anything else.
  const payload: UltronEventPayload = {};
  const raw = body.payload ?? {};
  let count = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (count >= MAX_PAYLOAD_KEYS) break;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      payload[key.slice(0, 48)] =
        typeof value === "string" ? value.slice(0, 240) : value;
      count += 1;
    }
  }
  payload.source = "client";

  const event = ultronBus.publish(type as UltronEventType, payload, "info");
  return Response.json({ ok: true, id: event.id }, { status: 202 });
}
