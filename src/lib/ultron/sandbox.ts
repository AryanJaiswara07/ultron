/**
 * Workspace sandbox — resolves user-supplied relative paths strictly inside
 * the configured workspace root.
 *
 * Guarantees (pinned by tests):
 *  - absolute paths are rejected
 *  - NUL bytes are rejected
 *  - ".." traversal that escapes the root is rejected
 *  - symlink escapes are rejected: the nearest existing ancestor of the
 *    target is resolved with realpath and must still sit inside the
 *    canonical workspace root
 *  - non-existent targets inside the sandbox resolve fine (for creation)
 *
 * This module is the ONLY sanctioned way to turn user-controlled path
 * fragments into workspace filesystem paths (architecture rule ARCH-SEC-02).
 */
import { realpath } from "node:fs/promises";
import path from "node:path";

export type SandboxErrorCode =
  | "ABSOLUTE_PATH"
  | "NUL_BYTE"
  | "ESCAPES_ROOT"
  | "SYMLINK_ESCAPE";

export class SandboxError extends Error {
  readonly code: SandboxErrorCode;
  constructor(code: SandboxErrorCode, message: string) {
    super(message);
    this.name = "SandboxError";
    this.code = code;
  }
}

export interface SandboxResolution {
  /** Absolute, normalized path inside the workspace. */
  readonly absolutePath: string;
  /** Canonical (realpath-resolved) workspace root. */
  readonly canonicalRoot: string;
  /** The normalized relative path that was requested. */
  readonly relativePath: string;
}

export async function resolveWorkspacePath(
  workspaceRoot: string,
  userPath: string,
): Promise<SandboxResolution> {
  const input = userPath ?? "";
  if (input.includes("\0")) {
    throw new SandboxError("NUL_BYTE", "Path contains a NUL byte.");
  }
  if (path.isAbsolute(input) || path.win32.isAbsolute(input) || /^[A-Za-z]:[\\/]/.test(input)) {
    throw new SandboxError("ABSOLUTE_PATH", `Absolute paths are not allowed: "${input}".`);
  }

  const normalized = path.normalize(input);
  const absolutePath = path.resolve(workspaceRoot, normalized);
  const rootAbsolute = path.resolve(workspaceRoot);

  if (!isInsideOrEqual(rootAbsolute, absolutePath)) {
    throw new SandboxError(
      "ESCAPES_ROOT",
      `Path "${input}" escapes the workspace root.`,
    );
  }

  // If the root itself does not exist yet it cannot contain symlinks, so the
  // lexical absolute is a safe canonical form for creation-time resolution.
  const canonicalRoot = await realpath(rootAbsolute).catch(() => rootAbsolute);
  const ancestor = await nearestExistingAncestor(absolutePath, rootAbsolute);
  if (ancestor !== null) {
    const canonicalAncestor = await safeRealpath(ancestor);
    if (!isInsideOrEqual(canonicalRoot, canonicalAncestor)) {
      throw new SandboxError(
        "SYMLINK_ESCAPE",
        `Path "${input}" resolves through a symlink outside the workspace.`,
      );
    }
  }

  return { absolutePath, canonicalRoot, relativePath: normalized };
}

/** Lexical containment check (case-insensitive to fail safe on Windows). */
export function isInsideOrEqual(root: string, candidate: string): boolean {
  const norm = (p: string) => {
    let out = p.replace(/[\\/]+/g, "/").toLowerCase();
    if (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
    return out;
  };
  const r = norm(root);
  const c = norm(candidate);
  return c === r || c.startsWith(r + "/");
}

async function safeRealpath(p: string): Promise<string> {
  return realpath(p);
}

/**
 * Walk up from `target` until an existing path is found. Returns null when no
 * ancestor up to (and including) `stopAt` exists on disk.
 */
async function nearestExistingAncestor(
  target: string,
  stopAt: string,
): Promise<string | null> {
  let current = target;
  const stop = path.resolve(stopAt);
  while (true) {
    try {
      await realpath(current);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return null;
      if (!isInsideOrEqual(stop, parent) && parent !== stop) {
        // We walked above the sandbox root without finding anything existing;
        // the root itself must be missing. Report null and let callers decide.
        return null;
      }
      current = parent;
    }
  }
}
