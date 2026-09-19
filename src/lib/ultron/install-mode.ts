/**
 * Install-mode detection.
 *
 * ULTRON distinguishes two runtime modes:
 *
 * - "development": running from a repository checkout. Writable paths stay
 *   inside the checkout (data/, logs/, workspace/) so the developer workflow
 *   is unchanged.
 * - "installed": running as an installed application. Writable paths MUST
 *   resolve to platform-appropriate user directories, never into the
 *   installation directory.
 *
 * Detection is explicit-over-implicit:
 *   1. ULTRON_INSTALL_MODE=development|installed wins unconditionally.
 *   2. Otherwise, presence of checkout markers decides.
 *
 * The marker predicate is injectable so tests can exercise both branches
 * without touching the real filesystem layout of the host.
 */
export type InstallMode = "development" | "installed";

export const INSTALL_MODE_ENV = "ULTRON_INSTALL_MODE" as const;

/**
 * Files whose presence (all of them) identifies a development checkout.
 * `.ultron-checkout` is the unambiguous explicit marker; the remaining files
 * are the natural shape of this repository so existing checkouts keep working.
 */
export const CHECKOUT_MARKERS = [
  ".ultron-checkout",
  "next.config.ts",
  "package.json",
] as const;

export interface DetectInstallModeOptions {
  /** Directory to inspect (usually process.cwd()). */
  readonly cwd: string;
  /** Environment map (usually process.env). Injectable for tests. */
  readonly env: Record<string, string | undefined>;
  /** Returns true when `name` exists inside `cwd`. Injectable for tests. */
  readonly exists: (absolutePath: string) => boolean;
}

export function detectInstallMode(opts: DetectInstallModeOptions): InstallMode {
  const forced = opts.env[INSTALL_MODE_ENV]?.trim().toLowerCase();
  if (forced === "installed" || forced === "development") {
    return forced;
  }
  const markersPresent = CHECKOUT_MARKERS.every((marker) =>
    opts.exists(joinPath(opts.cwd, marker)),
  );
  return markersPresent ? "development" : "installed";
}

/** Minimal join that avoids importing node:path here so the logic stays
 * trivially portable in tests (platform-independent marker check). */
function joinPath(base: string, leaf: string): string {
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return base.endsWith(sep) ? `${base}${leaf}` : `${base}${sep}${leaf}`;
}
