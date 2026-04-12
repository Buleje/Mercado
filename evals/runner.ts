/**
 * Eval Runner — Orchestrates all evaluation test suites.
 *
 * Usage:
 *   npx tsx evals/runner.ts [zone]
 *
 * Zones: checkout | fiado | sunat | multi-tenant | all (default: all)
 *
 * Each zone runs its eval files via vitest and reports pass/fail scores.
 */

import { execSync } from "child_process";
import path from "path";

// ── Configuration ────────────────────────────────────────────────────────────

const ZONES = ["checkout", "fiado", "sunat", "multi-tenant"] as const;
type Zone = (typeof ZONES)[number];

const ZONE_DESCRIPTIONS: Record<Zone, string> = {
  checkout: "CheckoutModal — cart, payments, state machine",
  fiado: "Fiado Digital — credit scoring, limits, plans",
  sunat: "SUNAT — boletas, IGV, XML, RUC validation",
  "multi-tenant": "Multi-Tenant — isolation, context, DB patterns",
};

// ── Types ────────────────────────────────────────────────────────────────────

type ZoneResult = {
  zone: Zone;
  passed: number;
  failed: number;
  total: number;
  score: string;
  duration: string;
  error?: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function runZone(zone: Zone): ZoneResult {
  const evalDir = path.resolve(__dirname, zone);
  const start = Date.now();

  try {
    const configPath = path.resolve(__dirname, "vitest.eval.config.ts");
    const output = execSync(
      `npx vitest run "${evalDir}" --config "${configPath}" --reporter=verbose 2>&1`,
      {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf-8",
        timeout: 30_000,
        env: { ...process.env, NODE_ENV: "test" },
      },
    );

    const passMatch = output.match(/(\d+)\s+passed/);
    const failMatch = output.match(/(\d+)\s+failed/);
    const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
    const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
    const total = passed + failed;
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    return {
      zone,
      passed,
      failed,
      total,
      score: total > 0 ? `${((passed / total) * 100).toFixed(0)}%` : "N/A",
      duration: `${elapsed}s`,
    };
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const output = (err as { stdout?: string }).stdout ?? "";

    const passMatch = output.match(/(\d+)\s+passed/);
    const failMatch = output.match(/(\d+)\s+failed/);
    const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
    const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
    const total = passed + failed;

    return {
      zone,
      passed,
      failed,
      total,
      score: total > 0 ? `${((passed / total) * 100).toFixed(0)}%` : "0%",
      duration: `${elapsed}s`,
      error: total === 0 ? "Failed to run" : undefined,
    };
  }
}

function printSummary(results: ZoneResult[]): void {
  const totalPassed = results.reduce((s, r) => s + r.passed, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);
  const totalTests = totalPassed + totalFailed;

  console.log("\n" + "=".repeat(70));
  console.log("  BODEGA SAN MARTIN — EVAL RESULTS");
  console.log("=".repeat(70));
  console.log("");
  console.log(
    padRight("Zone", 20) +
      padRight("Passed", 10) +
      padRight("Failed", 10) +
      padRight("Score", 10) +
      padRight("Time", 10),
  );
  console.log("-".repeat(60));

  for (const r of results) {
    const status = r.error ? ` [${r.error}]` : "";
    console.log(
      padRight(r.zone, 20) +
        padRight(String(r.passed), 10) +
        padRight(String(r.failed), 10) +
        padRight(r.score, 10) +
        padRight(r.duration, 10) +
        status,
    );
  }

  console.log("-".repeat(60));
  const overallScore =
    totalTests > 0 ? `${((totalPassed / totalTests) * 100).toFixed(0)}%` : "N/A";
  console.log(
    padRight("TOTAL", 20) +
      padRight(String(totalPassed), 10) +
      padRight(String(totalFailed), 10) +
      padRight(overallScore, 10),
  );
  console.log("=".repeat(70));
  console.log("");

  if (totalFailed > 0) {
    process.exitCode = 1;
  }
}

function padRight(str: string, len: number): string {
  return str.padEnd(len);
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  const arg = process.argv[2]?.toLowerCase() ?? "all";

  let zonesToRun: Zone[];
  if (arg === "all") {
    zonesToRun = [...ZONES];
  } else if (ZONES.includes(arg as Zone)) {
    zonesToRun = [arg as Zone];
  } else {
    console.error(`Unknown zone: "${arg}". Valid: ${ZONES.join(", ")}, all`);
    process.exit(1);
  }

  console.log(`\nRunning evals for: ${zonesToRun.join(", ")}`);
  for (const zone of zonesToRun) {
    console.log(`  ${zone}: ${ZONE_DESCRIPTIONS[zone]}`);
  }
  console.log("");

  const results = zonesToRun.map(runZone);
  printSummary(results);
}

main();
