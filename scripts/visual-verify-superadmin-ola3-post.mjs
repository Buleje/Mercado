// Captura screenshots del superadmin post Ola 3 (setup score, security, residual chrome).
// Variante del visual-verify-superadmin.mjs focalizada en los modulos tocados
// por el cierre de identidad superadmin — incluye verificacion de 404 en
// project-intel e integraciones (eliminados en Ola 3).
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "reports/visual-verify/2026-04-17-superadmin-ola3-post";

const envFile = readFileSync(".env.local", "utf-8");
const USER = envFile.match(/^SUPERADMIN_USERNAME="?([^"\n]+)/m)?.[1] ?? "platform";
const PASS = envFile.match(/^SUPERADMIN_PASSWORD="?([^"\n]+)/m)?.[1] ?? "";

const PAGES = [
  { name: "00-dashboard",      url: "/superadmin/dashboard" },
  { name: "01-setup-score",    url: "/superadmin/setup" },
  { name: "02-security",       url: "/superadmin/security" },
  { name: "03-stores",         url: "/superadmin/stores" },
  { name: "04-analytics",      url: "/superadmin/analytics" },
  { name: "05-recetario",      url: "/superadmin/recetario" },
  { name: "06-marketplace-suppliers", url: "/superadmin/marketplace/suppliers" },
  { name: "07-tenants",        url: "/superadmin/tenants" },
];

// Verificacion de paths eliminados — deben dar 404 clean.
const DEAD_PATHS = [
  { name: "dead-01-project-intel", url: "/superadmin/project-intel" },
  { name: "dead-02-integraciones", url: "/superadmin/integraciones" },
];

async function main() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });
  if (!PASS) {
    console.error("SUPERADMIN_PASSWORD no esta en .env.local");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log(`Login platform/${USER}...`);
  const loginResp = await page.request.post(`${BASE}/api/superadmin/auth`, {
    headers: { "content-type": "application/json" },
    data: { username: USER, password: PASS },
  });
  console.log(`Login HTTP ${loginResp.status()}`);
  if (loginResp.status() !== 200) {
    console.error("Login fail:", await loginResp.text());
    await browser.close();
    process.exit(1);
  }

  const results = [];
  for (const p of [...PAGES, ...DEAD_PATHS]) {
    const url = `${BASE}${p.url}`;
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(2500);
      try { await page.waitForLoadState("networkidle", { timeout: 6_000 }); } catch {}
      const status = resp?.status() ?? 0;
      const path = `${OUT}/${p.name}.png`;
      await page.screenshot({ path, fullPage: false });
      results.push({ name: p.name, url: p.url, status });
      console.log(`[${status}] ${p.name}`);
    } catch (e) {
      results.push({ name: p.name, url: p.url, status: "ERR", error: String(e.message ?? e).slice(0, 80) });
      console.log(`[ERR] ${p.name} :: ${String(e.message ?? e).slice(0, 80)}`);
    }
  }

  await browser.close();
  console.log("\n=== SUMMARY ===");
  console.table(results);
  console.log(`\nDONE ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
