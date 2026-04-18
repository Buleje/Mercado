// Re-captura solo los módulos críticos post-Fase 4, cerrando onboarding cada vez.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const BASE = "http://localhost:3000";
const SLUG = "main";
const USER = "qaadmin";
const PASS = "Qa-admin-1234";
const OUT = "reports/visual-verify/2026-04-17-phase5-post";

const TABS = [
  "vendor-dashboard",
  "plata",
  "fiados",
  "prestamos",
  "facturacion",
  "cotizaciones",
  "contratos",
  "notas-credito",
  "guias-remision",
];

async function dismissModal(page) {
  // Set the actual storage keys the wizard checks
  await page.evaluate(() => {
    try {
      localStorage.setItem("onboarding-completed-main", "1");
      localStorage.setItem("onboarding-completed-luis", "1");
      localStorage.setItem("onboarding-completed-buleje", "1");
      localStorage.setItem("onboarding-completed-tienda-3", "1");
    } catch {}
  });
  // Force-remove onboarding modal from DOM
  await page.evaluate(() => {
    document.querySelectorAll('[role="dialog"]').forEach((el) => {
      if ((el.textContent ?? "").includes("Configura tu bodega")) el.remove();
    });
    // Remove any backdrop
    document.querySelectorAll('[data-state="open"], .fixed.inset-0').forEach((el) => {
      const t = el.textContent ?? "";
      if (t.includes("Configura tu bodega") || el.getAttribute("aria-hidden") === "true") {
        // Heuristic: if it has an ancestor dialog, already removed. Remove overlays.
        const rect = el.getBoundingClientRect();
        if (rect.width > 500 && rect.height > 400) el.remove();
      }
    });
    // Reset body overflow
    document.body.style.overflow = "";
  });
  await page.waitForTimeout(300);
}

async function main() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { "x-tenant-id": SLUG },
  });
  const page = await context.newPage();

  const loginResp = await page.request.post(`${BASE}/api/auth/login`, {
    headers: { "content-type": "application/json", "x-tenant-id": SLUG },
    data: { username: USER, password: PASS },
  });
  if (loginResp.status() !== 200) {
    console.error("Login fail", loginResp.status());
    process.exit(1);
  }

  const results = [];
  for (let i = 0; i < TABS.length; i++) {
    const tab = TABS[i];
    const n = String(i + 1).padStart(2, "0");
    const url = `${BASE}/t/${SLUG}/admin?tab=${tab}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(2000);
    await dismissModal(page);
    await page.waitForTimeout(2500);
    try { await page.waitForLoadState("networkidle", { timeout: 6_000 }); } catch {}
    const p = `${OUT}/${n}-${tab}.png`;
    await page.screenshot({ path: p, fullPage: false });
    results.push({ tab, path: p });
    console.log(`OK ${n}-${tab}`);
  }

  await browser.close();
  console.log("\nDONE", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
