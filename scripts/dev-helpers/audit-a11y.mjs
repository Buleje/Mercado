#!/usr/bin/env node
/**
 * audit-a11y — corre axe-core sobre rutas críticas y reporta violaciones WCAG.
 *
 * Uso:
 *   node scripts/dev-helpers/audit-a11y.mjs              # rutas default
 *   node scripts/dev-helpers/audit-a11y.mjs /marketplace/main /admin
 *
 * Output: tabla + JSON detallado guardado en reports/a11y/<timestamp>.json
 */
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3000";
const TENANT = "main";
const CHROMIUM = path.join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome");

const DEFAULT_ROUTES = [
  "/marketplace/main",
  "/marketplace",
  "/marketplace/ofertas",
];

async function main() {
  const args = process.argv.slice(2);
  const routes = args.length > 0 ? args : DEFAULT_ROUTES;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(process.cwd(), "reports/a11y");
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { "x-tenant-id": TENANT },
  });
  const page = await ctx.newPage();

  const allReports = [];
  console.log("Ruta                          Violations  Critical  Serious  Tags");
  console.log("─".repeat(75));

  for (const route of routes) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(800);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();

      const critical = results.violations.filter((v) => v.impact === "critical").length;
      const serious = results.violations.filter((v) => v.impact === "serious").length;
      const total = results.violations.length;
      const verdict = critical > 0 ? "🔴" : serious > 0 ? "🟡" : total > 0 ? "🟢" : "✅";
      const padded = route.padEnd(30, " ");
      console.log(`${verdict} ${padded}${String(total).padEnd(12, " ")}${String(critical).padEnd(10, " ")}${String(serious).padEnd(9, " ")}${results.testEngine.name}`);

      allReports.push({
        route,
        timestamp: ts,
        violations: results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          helpUrl: v.helpUrl,
          nodeCount: v.nodes.length,
          firstNodeHTML: v.nodes[0]?.html?.slice(0, 200) ?? "",
        })),
      });
    } catch (err) {
      console.log(`❌ ${route.padEnd(30, " ")}error: ${err.message?.slice(0, 60)}`);
    }
  }

  await browser.close();
  const reportPath = path.join(outDir, `${ts}.json`);
  writeFileSync(reportPath, JSON.stringify(allReports, null, 2));
  console.log("\nReporte completo:", path.relative(process.cwd(), reportPath));

  // Top 5 violations across all routes
  const all = allReports.flatMap((r) => r.violations);
  const byId = new Map();
  for (const v of all) byId.set(v.id, (byId.get(v.id) ?? 0) + v.nodeCount);
  const top = [...byId.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (top.length > 0) {
    console.log("\nTop 5 issues (por nodos afectados):");
    for (const [id, count] of top) console.log(`  · ${id} (${count} nodos)`);
  }
}

main().catch((err) => {
  console.error("audit-a11y failed:", err.message);
  process.exit(1);
});
