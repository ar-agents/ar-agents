import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * M2-3 (ROADMAP.md): proves the NEXT_PUBLIC_LAW_STATUS pre -> live switch
 * changes EXACTLY the intended behaviors and nothing else.
 *
 * Two things are tested:
 *  1. Every KNOWN consumer of the switch (LAW_STATUS / lawIsLive) renders the
 *     documented pre vs live behavior, in both languages where applicable.
 *  2. A DRIFT GUARD: greps the whole monorepo source tree for the identifiers
 *     LAW_STATUS / lawIsLive and asserts the set of matching files is EXACTLY
 *     KNOWN_CONSUMERS (see law-status.ts's COVERAGE comment, which this list
 *     mirrors). Adding a new branch on the switch without adding it here (and
 *     to the COVERAGE comment) fails this test; removing a branch without
 *     updating the list also fails it, so the list can never go stale in
 *     either direction.
 */

// ── 1. the switch itself resolves from the env var ─────────────────────────

describe("LAW_STATUS / lawIsLive resolve from NEXT_PUBLIC_LAW_STATUS", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_LAW_STATUS;
  });

  it("defaults to pre when unset", async () => {
    delete process.env.NEXT_PUBLIC_LAW_STATUS;
    const mod = await freshLawStatus();
    expect(mod.LAW_STATUS).toBe("pre");
    expect(mod.lawIsLive).toBe(false);
  });

  it("defaults to pre for any value other than the literal string 'live'", async () => {
    for (const bogus of ["Live", "LIVE", "true", "1", "pre", ""]) {
      process.env.NEXT_PUBLIC_LAW_STATUS = bogus;
      const mod = await freshLawStatus();
      expect(mod.LAW_STATUS, `value ${JSON.stringify(bogus)}`).toBe("pre");
      expect(mod.lawIsLive, `value ${JSON.stringify(bogus)}`).toBe(false);
    }
  });

  it("flips to live only for the exact string 'live'", async () => {
    process.env.NEXT_PUBLIC_LAW_STATUS = "live";
    const mod = await freshLawStatus();
    expect(mod.LAW_STATUS).toBe("live");
    expect(mod.lawIsLive).toBe(true);
  });
});

async function freshLawStatus() {
  // NEXT_PUBLIC_LAW_STATUS is read at module top-level (mirrors how Next.js
  // inlines NEXT_PUBLIC_* at build time -- one build, one value). vitest
  // caches the module after first import, so force a fresh evaluation per
  // env value instead of relying on Next's build-time inlining (which vitest
  // does not perform).
  vi.resetModules();
  return import("../src/app/law-status");
}

// ── 2. pure copy consumers: exact pre vs live text, both languages ─────────

describe("homeLawCopy (page.tsx honesty banner + note)", () => {
  it("pre, es", async () => {
    const { homeLawCopy } = await import("../src/app/law-status");
    expect(homeLawCopy("pre", true)).toEqual({
      banner: "El anteproyecto de Ley de Sociedades está en el Senado. Todavía no es ley.",
      note: "Generás y operás todo hoy. Registrás el día que sea ley.",
    });
  });

  it("pre, en", async () => {
    const { homeLawCopy } = await import("../src/app/law-status");
    expect(homeLawCopy("pre", false)).toEqual({
      banner: "The draft Companies Law is in the Senate. It is not law yet.",
      note: "Build and operate everything today. Register the day it becomes law.",
    });
  });

  it("live, es: banner disappears, note flips to 'registro abierto'", async () => {
    const { homeLawCopy } = await import("../src/app/law-status");
    expect(homeLawCopy("live", true)).toEqual({ banner: null, note: "Registro abierto." });
  });

  it("live, en: banner disappears, note flips to 'registration open'", async () => {
    const { homeLawCopy } = await import("../src/app/law-status");
    expect(homeLawCopy("live", false)).toEqual({ banner: null, note: "Registration open." });
  });
});

describe("leyEstado (/ley 'Estado' line)", () => {
  it("pre, es", async () => {
    const { leyEstado } = await import("../src/app/law-status");
    expect(leyEstado("pre", true)).toBe("Estado: en el Senado. Todavía no es ley.");
  });

  it("pre, en", async () => {
    const { leyEstado } = await import("../src/app/law-status");
    expect(leyEstado("pre", false)).toBe("Status: in the Senate. Not law yet.");
  });

  it("live, es", async () => {
    const { leyEstado } = await import("../src/app/law-status");
    expect(leyEstado("live", true)).toBe("Estado: vigente.");
  });

  it("live, en", async () => {
    const { leyEstado } = await import("../src/app/law-status");
    expect(leyEstado("live", false)).toBe("Status: in force.");
  });
});

// ── 3. drift guard: every real usage of the switch is a KNOWN, tested one ──

/**
 * Every file (repo-root-relative) that may reference the identifiers
 * LAW_STATUS or lawIsLive, with why. Keep in lockstep with law-status.ts's
 * COVERAGE comment -- this is the machine-checked mirror of that prose.
 */
const KNOWN_CONSUMERS: ReadonlyArray<string> = [
  // The switch's own definition + the pure copy functions tested above.
  "apps/landing/src/app/law-status.ts",
  // Real branches on the switch, tested above.
  "apps/landing/src/app/page.tsx",
  "apps/landing/src/app/ley/page.tsx",
  // This test file itself (KNOWN_CONSUMERS below mentions the identifiers).
  "apps/landing/test/law-status-switch.test.ts",
  // Comment-only: documents that the CTA does NOT branch on LAW_STATUS.
  "apps/landing/src/app/nav.tsx",
  // Comment-only pointer to a SEPARATE, not-wired switch (the `status`
  // field's own doc comment + ar.ts's usage of it). See law-status.ts's
  // COVERAGE comment and DAY-ONE.md's "code gaps for law-day".
  "packages/core/src/jurisdiction.ts",
  "packages/core/src/jurisdictions/ar.ts",
  // KNOWN GAP: hardcoded coach prose asserting "LAW_STATUS=pre", not actually
  // env-driven. Tracked in ROADMAP.md M2-3 follow-ups, not fixed here.
  "apps/studio/src/coach/corpus.ts",
  "apps/studio/src/coach/corpus/argentina.md",
];

/** Directories to scan for the identifiers, relative to the monorepo root. */
const SCAN_ROOTS = [
  "apps/landing/src",
  "apps/landing/test",
  "apps/studio/src",
  "apps/sociedad-ia-starter/src",
  "packages/core/src",
];

const SKIP_DIRS = new Set(["node_modules", "dist", ".next", "coverage", ".turbo"]);
const SCANNABLE_EXT = new Set([".ts", ".tsx", ".md"]);
const SWITCH_IDENTIFIER = /\bLAW_STATUS\b|\blawIsLive\b/;

function repoRoot(): string {
  // this file: apps/landing/test/law-status-switch.test.ts
  return join(__dirname, "..", "..", "..");
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // directory doesn't exist (e.g. a package with no src/ yet)
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (SCANNABLE_EXT.has(name.slice(name.lastIndexOf(".")))) {
      out.push(full);
    }
  }
}

describe("LAW_STATUS drift guard", () => {
  it("every file referencing LAW_STATUS/lawIsLive is in KNOWN_CONSUMERS, and vice versa", () => {
    const root = repoRoot();
    const files: string[] = [];
    for (const scanRoot of SCAN_ROOTS) walk(join(root, scanRoot), files);

    const actual = new Set<string>();
    for (const abs of files) {
      const text = readFileSync(abs, "utf8");
      if (SWITCH_IDENTIFIER.test(text)) {
        actual.add(relative(root, abs).split("\\").join("/"));
      }
    }

    const expected = new Set(KNOWN_CONSUMERS);

    const undocumented = [...actual].filter((f) => !expected.has(f));
    const stale = [...expected].filter((f) => !actual.has(f));

    expect(
      undocumented,
      "new file(s) reference LAW_STATUS/lawIsLive but are missing from KNOWN_CONSUMERS " +
        "(and law-status.ts's COVERAGE comment) -- add a test above for the new behavior, " +
        "or a documented reason it needs none, before adding it to the list",
    ).toEqual([]);

    expect(
      stale,
      "KNOWN_CONSUMERS lists file(s) that no longer reference LAW_STATUS/lawIsLive -- " +
        "remove them (and update law-status.ts's COVERAGE comment) to keep the list honest",
    ).toEqual([]);
  });
});
