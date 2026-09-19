/**
 * Next.js instrumentation hook — the single canonical runtime bootstrap for
 * ULTRON. Every way of launching the app (`next start`, the `ultron` CLI
 * launcher, `next dev`) flows through here exactly once per process.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { bootstrapUltron } = await import("@/lib/ultron/bootstrap");
    const { recordEvent } = await import("@/db/queries");
    const { ultronBus } = await import("@/lib/ultron/bus");
    // The bus is authoritative for the live stream; Postgres is the audit.
    ultronBus.setPersistor((type, payload, severity) => {
      void recordEvent(type, payload, severity);
    });
    const ctx = await bootstrapUltron();
    await recordEvent("system.boot", {
      version: ctx.version,
      mode: ctx.paths.mode,
      legacyDataDetected: ctx.legacyScan.anythingPresent,
      warnings: ctx.warnings.length,
    });
    await recordEvent("config.loaded", {
      sources: ctx.env.sources.filter((s) => s.found).length,
      keysLoaded: Object.keys(ctx.env.values).length,
    });
    if (ctx.legacyScan.anythingPresent && ctx.paths.mode === "installed") {
      await recordEvent(
        "system.migration.detected",
        { legacyRoot: ctx.legacyScan.legacyRoot },
        "warning",
      );
    }
  } catch (error) {
    // Boot diagnostics must never crash the server; the system API surfaces
    // bootstrap state for operators instead.
    console.error(
      "[ultron] bootstrap warning:",
      error instanceof Error ? error.message : error,
    );
  }
}
