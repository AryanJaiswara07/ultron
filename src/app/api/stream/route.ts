import { ultronBus, type UltronEvent } from "@/lib/ultron/bus";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15000;
const REPLAY_COUNT = 25;

/**
 * Server-Sent Events stream of the ULTRON bus. The presence visual and any
 * operator UI consume this to stay synchronized with execution — the stream
 * IS the synchronization contract (nothing else fabricates progress).
 */
export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // client disconnected between checks — cleanup runs in cancel()
        }
      };

      send(`retry: 3000\n\n`);
      send(`event: hello\ndata: ${JSON.stringify({ ok: true, ts: new Date().toISOString() })}\n\n`);

      for (const event of ultronBus.recent(REPLAY_COUNT)) {
        send(serialize(event));
      }

      unsubscribe = ultronBus.subscribe((event) => {
        send(serialize(event));
      });

      heartbeat = setInterval(() => {
        send(`event: ping\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`);
      }, HEARTBEAT_MS);

      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });

      function cleanup() {
        if (heartbeat) clearInterval(heartbeat);
        if (unsubscribe) unsubscribe();
        unsubscribe = null;
        heartbeat = null;
      }
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function serialize(event: UltronEvent): string {
  return `event: ultron\ndata: ${JSON.stringify(event)}\n\n`;
}
