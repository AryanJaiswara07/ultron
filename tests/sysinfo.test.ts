import { describe, expect, it } from "vitest";

import {
  getSystemInfo,
  getTopProcesses,
  probeCommand,
} from "../src/lib/ultron/sysinfo";

describe("system information — measured, never fabricated", () => {
  it("returns real host values within sane bounds", async () => {
    const info = await getSystemInfo();
    expect(info.cpu.cores).toBeGreaterThan(0);
    expect(info.cpu.model.length).toBeGreaterThan(0);
    expect(info.memory.totalBytes).toBeGreaterThan(0);
    expect(info.memory.usedPercent).toBeGreaterThanOrEqual(0);
    expect(info.memory.usedPercent).toBeLessThanOrEqual(100);
    expect(info.uptimeSeconds).toBeGreaterThan(0);
    expect(info.gpu.available).toBe(false);
    expect(info.gpu.note.length).toBeGreaterThan(5);
  });

  it("top processes returns shaped entries or an honest empty list", async () => {
    const top = await getTopProcesses("rss", 3);
    expect(Array.isArray(top)).toBe(true);
    expect(top.length).toBeLessThanOrEqual(3);
    for (const p of top) {
      expect(p.pid).toBeGreaterThan(0);
      expect(p.rssMb).toBeGreaterThanOrEqual(0);
      expect(p.command.length).toBeGreaterThan(0);
    }
  });

  it("probeCommand detects real binaries and real absences", async () => {
    const node = await probeCommand("node", ["--version"]);
    expect(node.available).toBe(true);
    expect(node.version).toContain("v");
    const fake = await probeCommand("definitely-not-a-real-binary-xyz", ["--version"]);
    expect(fake.available).toBe(false);
  });
});
