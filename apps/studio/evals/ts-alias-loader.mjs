// A minimal Node ESM loader (registered via `node:module`'s `register()`)
// that lets `node --experimental-strip-types evals/run.mjs` import this
// app's TypeScript sources directly.
//
// Two conventions used throughout apps/studio/src need help that tsc/vite/
// vitest normally provide but plain Node does not:
//   1. the "@/*" -> "./src/*" path alias (tsconfig.json, vitest.config.ts);
//   2. extensionless relative imports (e.g. `from "./corpus"` in
//      src/coach/system-prompt.ts) -- Node's ESM resolver requires an
//      explicit extension on a relative specifier.
//
// This exists only for evals/run.mjs. `--mode offline` needs it because
// evals/rubric.ts imports `@/lib/society` and `@/lib/ui/tool-parts`.
// `--mode live` needs it because evals/driver.ts imports the real route
// handler (`src/app/api/agent/route.ts`), which is full of `@/...` imports.
// No new dependency: built entirely on `node:fs` and `node:url`.

import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC_ROOT = new URL("../src/", import.meta.url);
// "" first, so a specifier that already carries its own extension (rare in
// this codebase, but cheap to support) still resolves without a rewrite.
const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

/** True only for a regular FILE at this URL -- src/coach has both
 *  corpus.ts and a corpus/ directory, and existsSync() alone can't tell
 *  them apart, which previously sent "./corpus" straight into Node's
 *  ERR_UNSUPPORTED_DIR_IMPORT instead of the .ts sibling. */
function isFile(url) {
  try {
    return statSync(fileURLToPath(url)).isFile();
  } catch {
    return false;
  }
}

function firstExistingCandidate(base, specifier) {
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = new URL(specifier + suffix, base);
    if (isFile(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // "@/lib/models" etc -> apps/studio/src/lib/models.ts
  if (specifier.startsWith("@/")) {
    const found = firstExistingCandidate(SRC_ROOT, specifier.slice(2));
    if (found) return nextResolve(found.href, context);
    // Nothing matched: let the default resolver produce its normal
    // ERR_MODULE_NOT_FOUND against the (unresolved) alias target, so the
    // failure message is still Node-native and points at a real path.
    return nextResolve(new URL(specifier.slice(2), SRC_ROOT).href, context);
  }

  // Plain relative imports (e.g. "./corpus", "../src/lib/society"): try the
  // default resolver first (handles specifiers that DO carry an extension),
  // fall back to appending TS extensions only on a not-found error.
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    try {
      return await nextResolve(specifier, context);
    } catch (err) {
      // ERR_MODULE_NOT_FOUND: no extensionless match at all (e.g. "./corpus"
      // with only corpus.ts on disk). ERR_UNSUPPORTED_DIR_IMPORT: the
      // specifier happens to also be a directory name (e.g. src/coach has
      // both corpus.ts and corpus/) -- Node tries to import the directory
      // itself and refuses, rather than falling back to the sibling file.
      const RETRYABLE = new Set(["ERR_MODULE_NOT_FOUND", "ERR_UNSUPPORTED_DIR_IMPORT"]);
      if (!err || !RETRYABLE.has(err.code)) throw err;
      const parent = context.parentURL;
      if (!parent) throw err;
      const found = firstExistingCandidate(new URL(parent), specifier);
      if (found) return nextResolve(found.href, context);
      throw err;
    }
  }

  return nextResolve(specifier, context);
}
