import { describe, expect, it } from "vitest";

import { createBus } from "../src/lib/ultron/bus";

describe("ultron event bus", () => {
  it("fans published events out to subscribers with metadata", () => {
    const bus = createBus();
    const seen: string[] = [];
    const unsub = bus.subscribe((e) => seen.push(`${e.type}:${e.severity}`));
    const ev = bus.publish("task_started", { goal: "demo" });
    expect(ev.id).toBeTruthy();
    expect(ev.ts).toBeTruthy();
    expect(seen).toEqual(["task_started:info"]);
    unsub();
    bus.publish("task_completed", {});
    expect(seen).toHaveLength(1);
  });

  it("ring buffer is bounded and recent() returns newest last", () => {
    const bus = createBus();
    for (let i = 0; i < 400; i++) bus.publish("tool_started", { i });
    const recent = bus.recent(10);
    expect(recent).toHaveLength(10);
    expect(recent[9].payload.i).toBe(399);
    expect(bus.recent(999)).toHaveLength(300); // RING_LIMIT
  });

  it("persistor hook receives every event (Postgres adapter seam)", () => {
    const bus = createBus();
    const persisted: string[] = [];
    bus.setPersistor((type) => persisted.push(type));
    bus.publish("brain.selected", { provider: "deterministic" });
    bus.publish("doctor_completed", {});
    expect(persisted).toEqual(["brain.selected", "doctor_completed"]);
  });

  it("a throwing subscriber never breaks the pipeline", () => {
    const bus = createBus();
    bus.subscribe(() => {
      throw new Error("broken consumer");
    });
    const seen: string[] = [];
    bus.subscribe((e) => seen.push(e.type));
    bus.publish("wake_detected", {});
    expect(seen).toEqual(["wake_detected"]);
  });

  it("a throwing persistor never breaks the stream", () => {
    const bus = createBus();
    bus.setPersistor(() => {
      throw new Error("db down");
    });
    expect(() => bus.publish("interaction_started", {})).not.toThrow();
  });
});
