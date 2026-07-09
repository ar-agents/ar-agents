#!/usr/bin/env node
// M1-7 journey evals CLI. See ROADMAP.md "M1-7 Journey evals" and this
// directory's other files for what each layer does:
//   personas.ts  -- the six founder personas driven in --mode live
//   driver.ts    -- drives a persona's conversation against the real
//                   POST /api/agent route handler, in process
//   rubric.ts    -- deterministic checks (schema, call counts, honesty
//                   phrases, language, pricing keywords)
//   judge.ts     -- LLM-judge scoring (live mode only)
//   fixtures/*.json -- two synthetic transcripts (offline mode replays
//                   these instead of driving a real conversation)
//
// Usage (from apps/studio):
//   pnpm run evals -- --mode offline
//   pnpm run evals -- --mode live [--personas id1,id2] [--out path.json]
//
// Requires `node --experimental-strip-types` (wired into package.json's
// "evals" script) to import the .ts sources directly, plus this
// directory's ts-alias-loader.mjs to resolve the "@/*" alias and
// extensionless relative imports the same way tsc/vitest already do for
// the rest of this app -- see that file's header comment for why.

import { register } from "node:module";
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
register("./ts-alias-loader.mjs", pathToFileURL(HERE + "/").href);

const JUDGE_MEAN_THRESHOLD = 3.5;

function parseArgs(argv) {
  const args = { mode: "offline", personas: null, out: path.join(HERE, "report.json") };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--mode") args.mode = argv[++i];
    else if (arg.startsWith("--mode=")) args.mode = arg.slice("--mode=".length);
    else if (arg === "--personas") args.personas = argv[++i];
    else if (arg.startsWith("--personas=")) args.personas = arg.slice("--personas=".length);
    else if (arg === "--out") args.out = path.resolve(argv[++i]);
    else if (arg.startsWith("--out=")) args.out = path.resolve(arg.slice("--out=".length));
  }
  if (args.mode !== "offline" && args.mode !== "live") {
    throw new Error(`--mode must be "offline" or "live", got "${args.mode}"`);
  }
  return args;
}

function idFilter(personasArg) {
  if (!personasArg) return null;
  return new Set(
    personasArg
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

async function loadFixtures(filter) {
  const dir = path.join(HERE, "fixtures");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const fixtures = [];
  for (const file of files) {
    const raw = JSON.parse(await readFile(path.join(dir, file), "utf8"));
    if (filter && !filter.has(raw.id)) continue;
    fixtures.push(raw);
  }
  return fixtures;
}

async function runOffline(args) {
  const rubric = await import("./rubric.ts");
  const { collectToolParts } = await import("../src/lib/ui/tool-parts.ts");
  const filter = idFilter(args.personas);
  const fixtures = await loadFixtures(filter);
  if (fixtures.length === 0) {
    throw new Error("no fixtures matched (check --personas against evals/fixtures/*.json ids)");
  }

  const results = fixtures.map((fixture) => {
    const deterministic = rubric.runDeterministicChecks(fixture.messages, fixture.expectations);
    const actualOverall = deterministic.allPassed ? "pass" : "fail";
    const matchesExpectation = actualOverall === fixture.expectedOverall;
    return {
      id: fixture.id,
      kind: "fixture",
      synthetic: true,
      description: fixture.description,
      expectations: fixture.expectations,
      expectedOverall: fixture.expectedOverall,
      actualOverall,
      matchesExpectation,
      deterministic,
      judge: null,
      meanJudgeScore: null,
      previewCallCount: collectToolParts(fixture.messages).filter((m) => m.name === "preview_society").length,
      transcript: fixture.messages,
    };
  });

  const exitCode = results.every((r) => r.matchesExpectation) ? 0 : 1;
  return { mode: "offline", results, exitCode };
}

async function runLive(args) {
  const hasKey = Boolean(process.env.OPENROUTER_API_KEY?.trim() || process.env.AI_GATEWAY_API_KEY?.trim());
  if (!hasKey) {
    throw new Error(
      "live mode needs OPENROUTER_API_KEY and/or AI_GATEWAY_API_KEY set (see docs/CONTRACT.md model routing); " +
        "none found in the environment.",
    );
  }

  const { PERSONAS } = await import("./personas.ts");
  const { runJourney, renderTranscript } = await import("./driver.ts");
  const rubric = await import("./rubric.ts");
  const { judgeJourney, meanScore } = await import("./judge.ts");

  const filter = idFilter(args.personas);
  const personas = filter ? PERSONAS.filter((p) => filter.has(p.id)) : PERSONAS;
  if (filter) {
    const known = new Set(PERSONAS.map((p) => p.id));
    const unknown = [...filter].filter((id) => !known.has(id));
    if (unknown.length) {
      console.error(`unknown persona id(s): ${unknown.join(", ")} (known: ${[...known].join(", ")})`);
      process.exit(2);
    }
  }
  if (personas.length === 0) {
    throw new Error("no personas matched (check --personas against evals/personas.ts ids)");
  }

  const results = [];
  for (const persona of personas) {
    const journey = await runJourney(persona);
    const deterministic = rubric.runDeterministicChecks(journey.messages, persona.expectations);

    let judge = null;
    let meanJudgeScore = null;
    if (!journey.error) {
      try {
        judge = await judgeJourney(persona, renderTranscript(journey.messages));
        meanJudgeScore = meanScore(judge);
      } catch (e) {
        judge = { error: e instanceof Error ? e.message : String(e) };
      }
    }

    results.push({
      id: persona.id,
      kind: "persona",
      description: persona.description,
      expectations: persona.expectations,
      deterministic,
      judge,
      meanJudgeScore,
      turns: journey.turns,
      previewCallCount: journey.previewCallCount,
      journeyError: journey.error ?? null,
      transcript: journey.messages,
    });
  }

  const anyDeterministicFailed = results.some((r) => !r.deterministic.allPassed || r.journeyError);
  const scored = results.filter((r) => typeof r.meanJudgeScore === "number");
  const overallMeanJudgeScore =
    scored.length > 0 ? scored.reduce((sum, r) => sum + r.meanJudgeScore, 0) / scored.length : null;
  const judgeGateFailed = overallMeanJudgeScore !== null && overallMeanJudgeScore < JUDGE_MEAN_THRESHOLD;

  const exitCode = anyDeterministicFailed || judgeGateFailed ? 1 : 0;
  return { mode: "live", results, overallMeanJudgeScore, exitCode };
}

function printTable(report) {
  const rows = report.results.map((r) => {
    const det = r.deterministic.allPassed ? "PASS" : "FAIL";
    const judgeCol =
      report.mode === "offline"
        ? "n/a"
        : typeof r.meanJudgeScore === "number"
          ? r.meanJudgeScore.toFixed(2)
          : "n/a";
    const overall =
      report.mode === "offline"
        ? r.matchesExpectation
          ? "OK (matches expected)"
          : "REGRESSION (rubric did not catch what it should have)"
        : r.deterministic.allPassed && !r.journeyError && (r.meanJudgeScore === null || r.meanJudgeScore >= JUDGE_MEAN_THRESHOLD)
          ? "PASS"
          : "FAIL";
    return { id: r.id, deterministic: det, judge: judgeCol, overall };
  });

  const idWidth = Math.max(2, ...rows.map((r) => r.id.length));
  const header = `${"id".padEnd(idWidth)}  deterministic  judge  overall`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const row of rows) {
    console.log(`${row.id.padEnd(idWidth)}  ${row.deterministic.padEnd(13)}  ${row.judge.padEnd(5)}  ${row.overall}`);
  }
  if (report.mode === "live" && report.overallMeanJudgeScore !== null) {
    console.log(`\nmean judge score across all conversations: ${report.overallMeanJudgeScore.toFixed(2)} (gate: >= ${JUDGE_MEAN_THRESHOLD})`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report =
    args.mode === "offline" ? await runOffline(args) : await runLive(args);

  const out = { generatedAt: new Date().toISOString(), ...report };
  await writeFile(args.out, JSON.stringify(out, null, 2) + "\n", "utf8");

  printTable(report);
  console.log(`\nfull report written to ${path.relative(process.cwd(), args.out)}`);

  process.exitCode = report.exitCode;
}

main().catch((e) => {
  console.error(`evals failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
