// Visual verify — toma screenshots de páginas clave del proyecto.
// Uso: node scripts/visual-verify.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const BASE = process.env.VISUAL_BASE_URL ?? "http://localhost:3000";
const OUT = "reports/visual-verify/2026-04-17";

const targets = [
  { name: "01-home", url: "/" },
  { name: "02-design-system-index", url: "/design-system" },
  { name: "03-design-system-admin", url: "/design-system/admin" },
  { name: "04-design-system-customer", url: "/design-system/customer" },
  { name: "05-design-system-charts-v2", url: "/design-system/charts-v2" },
  { name: "06-marketplace-landing", url: "/marketplace" },
  { name: "07-admin-root", url: "/admin" },
  { name: "08-tenant-luis-admin", url: "/t/luis/admin" },
  { name: "09-superadmin", url: "/superadmin" },
];

async function main() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const results = [];
  for (const t of targets) {
    const url = `${BASE}${t.url}`;
    try {
      const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      await page.waitForTimeout(500);
      const status = resp?.status() ?? 0;
      const path = `${OUT}/${t.name}.png`;
      await page.screenshot({ path, fullPage: true });
      results.push({ name: t.name, url, status, path });
      console.log(`[${status}] ${t.name} → ${path}`);
    } catch (e) {
      results.push({ name: t.name, url, status: "ERR", error: String(e.message ?? e) });
      console.log(`[ERR] ${t.name} ${String(e.message ?? e).slice(0, 120)}`);
    }
  }

  await browser.close();
  console.log("\n=== SUMMARY ===");
  console.table(results.map(({ name, url, status }) => ({ name, url, status })));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
