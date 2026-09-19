import { bootstrapUltron } from "@/lib/ultron/bootstrap";

export const dynamic = "force-dynamic";

/**
 * Effective configuration, redaction-safe. Secret-looking values are masked
 * by the env loader before they ever reach this response — raw secrets are
 * never serialised to the client or to logs.
 */
export async function GET() {
  const ctx = await bootstrapUltron();
  return Response.json({
    mode: ctx.paths.mode,
    dotenvFile: ctx.paths.dotenvFile,
    sources: ctx.env.sources,
    values: ctx.env.redacted, // masked at the source
    warnings: ctx.warnings,
  });
}
