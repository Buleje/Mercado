// Phase 4 post-fix visual verify — solo los 7 módulos clave + landing
// Uso: node scripts/visual-verify-phase4-post.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const BASE = process.env.VISUAL_BASE_URL ?? "http://localhost:3000";
const SLUG = process.env.VISUAL_TENANT ?? "main";
const USER = process.env.VISUAL_USER ?? "qaadmin";
const PASS = process.env.VISUAL_PASS ?? "Qa-admin-1234";
const OUT = "reports/visual-verify/2026-04-17-phase4-post";

// Módulos clave tocados en Phase 4 — evidencia antes/después
const TABS = [
  "plata",           // (no tocado directo pero referencia)
  "fiados",          // D
  "prestamos",       // C
  "facturacion",     // E
  "cotizaciones",    // A (antes redirigía a compras)
  "contratos",       // A (antes redirigía a compras)
  "notas-credito",   // F
];

async function main() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { "x-tenant-id": SLUG },
  });
  const page = await context.newPage();

  console.log(`Login ${USER} @ ${SLUG}...`);
  await page.goto(`${BASE}/t/${SLUG}/admin`, { waitUntil: "domcontentloaded" });
  const loginResp = await page.request.post(`${BASE}/api/auth/login`, {
    headers: { "content-type": "application/json", "x-tenant-id": SLUG },
    data: { username: USER, password: PASS },
  });
  console.log(`Login HTTP ${loginResp.status()}`);
  if (loginResp.status() !== 200) {
    console.error("Login failed:", await loginResp.text());
    await browser.close();
    process.exit(1);
  }

  const results = [];
  const landing = `${BASE}/t/${SLUG}/admin`;
  await page.goto(landing, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2500);

  // onboarding con el botón ya teal (post-fix B)
  await page.evaluate(() => {
    try {
      localStorage.setItem("onboarding-dismissed", "true");
      localStorage.setItem("onboarding-checklist-dismissed", "true");
      localStorage.setItem("checklist-dismissed", "true");
    } catch {}
  });
  await page.screenshot({ path: `${OUT}/00-landing.png`, fullPage: false });
  results.push({ name: "00-landing", status: 200 });
  console.log(`[OK] 00-landing`);

  for (let i = 0; i < TABS.length; i++) {
    const tab = TABS[i];
    const n = String(i + 1).padStart(2, "0");
    const url = `${BASE}/t/${SLUG}/admin?tab=${tab}`;
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(3500);
      try {
        await page.waitForLoadState("networkidle", { timeout: 8_000 });
      } catch { /* fallback */ }
      const status = resp?.status() ?? 0;
      const path = `${OUT}/${n}-${tab}.png`;
      await page.screenshot({ path, fullPage: false });
      results.push({ name: `${n}-${tab}`, status });
      console.log(`[${status}] ${n}-${tab}`);
    } catch (e) {
      results.push({ name: `${n}-${tab}`, status: "ERR", error: String(e.message ?? e).slice(0, 80) });
      console.log(`[ERR] ${n}-${tab}`);
    }
  }

  await browser.close();
  console.log("\n=== SUMMARY ===");
  console.table(results);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
