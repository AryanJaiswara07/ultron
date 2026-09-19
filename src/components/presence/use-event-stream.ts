"use client";

import { useEffect, useRef, useState } from "react";
import {
  EVENT_STATE_MAP,
  type PresenceState,
  type UltronEventType,
} from "@/lib/ultron/events";

export interface StreamEvent {
  id: string;
  type: UltronEventType;
  payload: Record<string, string | number | boolean | null | undefined>;
  severity: string;
  ts: string;
}

export interface TaskProgress {
  taskId?: string;
  say?: string;
  step?: string;
  ok?: boolean;
}

interface EventStreamResult {
  state: PresenceState;
  events: StreamEvent[];
  /** Latest progress speech line from the bus (spoken by the voice layer). */
  lastSay: string | null;
  connected: boolean;
  consumeSay: () => string | null;
}

const TRANSIENT: PresenceState[] = ["SUCCESS", "THINKING", "WARNING", "CONFIRMATION"];
const DECAYS: Record<string, number> = { SUCCESS: 3500, THINKING: 6000, WARNING: 5000, CONFIRMATION: 20000 };

/**
 * Subscribes to /api/stream (SSE) and folds events into the presence state
 * machine. The stream is the ONLY source of truth for displayed progress.
 */
export function useEventStream(): EventStreamResult {
  const [state, setState] = useState<PresenceState>("IDLE");
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [lastSay, setLastSay] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const decayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/stream");

    source.addEventListener("hello", () => setConnected(true));
    source.addEventListener("ultron", (raw) => {
      try {
        const event = JSON.parse((raw as MessageEvent).data) as StreamEvent;
        setEvents((prev) => [...prev.slice(-24), event]);

        const mapped = EVENT_STATE_MAP[event.type];
        if (mapped) {
          setState((current) => {
            // don't let a late "thinking" squash a confirmation prompt
            if (current === "CONFIRMATION" && mapped === "THINKING") return current;
            return mapped;
          });
          if (decayTimer.current) clearTimeout(decayTimer.current);
          if (TRANSIENT.includes(mapped)) {
            decayTimer.current = setTimeout(
              () => setState("IDLE"),
              DECAYS[mapped] ?? 4000,
            );
          }
        }

        const say = event.payload?.say;
        if (typeof say === "string" && say.length > 0) {
          setLastSay(say);
        }
      } catch {
        // malformed frame — ignore, stream self-heals via retry
      }
    });
    source.onerror = () => setConnected(false);

    return () => {
      source.close();
      if (decayTimer.current) clearTimeout(decayTimer.current);
    };
  }, []);

  return {
    state,
    events,
    lastSay,
    connected,
    consumeSay: () => {
      const say = lastSay;
      setLastSay(null);
      return say;
    },
  };
}
