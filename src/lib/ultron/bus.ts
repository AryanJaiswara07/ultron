/**
 * In-process event bus — the backbone of presence/voice/UI synchronization.
 *
 * One bus per server process (module singleton, safe under `next start`).
 * Published events: (1) appended to a bounded ring buffer for replay,
 * (2) fanned out to live subscribers (SSE stream), (3) asynchronously
 * persisted through an injectable persistor (Postgres in production; unset
 * in unit tests, keeping the bus pure there).
 */
import { randomUUID } from "node:crypto";

import type {
  EventSeverity,
  UltronEventPayload,
  UltronEventType,
} from "./events";

export interface UltronEvent {
  readonly id: string;
  readonly type: UltronEventType;
  readonly severity: EventSeverity;
  readonly payload: UltronEventPayload;
  readonly ts: string;
}

export type EventSubscriber = (event: UltronEvent) => void;
export type EventPersistor = (
  type: UltronEventType,
  payload: UltronEventPayload,
  severity: EventSeverity,
) => void;

const RING_LIMIT = 300;

class UltronBus {
  private readonly subscribers = new Set<EventSubscriber>();
  private readonly ring: UltronEvent[] = [];
  private persistor: EventPersistor | null = null;

  setPersistor(persistor: EventPersistor | null): void {
    this.persistor = persistor;
  }

  publish(
    type: UltronEventType,
    payload: UltronEventPayload = {},
    severity: EventSeverity = "info",
  ): UltronEvent {
    const event: UltronEvent = {
      id: randomUUID(),
      type,
      severity,
      payload,
      ts: new Date().toISOString(),
    };
    this.ring.push(event);
    if (this.ring.length > RING_LIMIT) this.ring.splice(0, this.ring.length - RING_LIMIT);
    for (const sub of this.subscribers) {
      try {
        sub(event);
      } catch {
        // a broken subscriber must never break the pipeline
      }
    }
    if (this.persistor) {
      try {
        this.persistor(type, payload, severity);
      } catch {
        // persistence is best-effort; the live stream is authoritative
      }
    }
    return event;
  }

  subscribe(fn: EventSubscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  recent(limit = 50): UltronEvent[] {
    return this.ring.slice(-Math.max(1, Math.min(limit, RING_LIMIT)));
  }

  /** Test/introspection hook. */
  subscriberCount(): number {
    return this.subscribers.size;
  }
}

/** Global singleton used by the server process. */
export const ultronBus = new UltronBus();

/** Isolated factory for unit tests. */
export function createBus(): UltronBus {
  return new UltronBus();
}
