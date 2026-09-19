/**
 * ULTRON version identity.
 *
 * Single source of truth for the application version. Consumed by the HTTP
 * API, the CLI banner, the instrumentation bootstrap and the documentation
 * contract tests.
 */
export const ULTRON_VERSION = "2.0.2" as const;
export const ULTRON_CODENAME = "Presence" as const;

/** Schema/data-layout version. Bump when persistent layout migrations appear. */
export const ULTRON_DATA_LAYOUT_VERSION = 1 as const;

/** Machine name used for directory naming inside platform user directories. */
export const ULTRON_DIR_NAME = "Ultron" as const;

/** Machine name (lowercase) used for XDG-style directory naming on Linux. */
export const ULTRON_DIR_NAME_XDG = "ultron" as const;

/** Display name. */
export const ULTRON_DISPLAY_NAME = "ULTRON" as const;

/**
 * Environment variable that forces a data-root override for every writable
 * category. Individual per-category overrides exist as well (see paths.ts).
 */
export const ULTRON_HOME_ENV = "ULTRON_HOME" as const;
