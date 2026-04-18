// Visual verify del admin — login + recorre TODOS los tabs + screenshot c/u.
// Uso: node scripts/visual-verify-admin.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const BASE = process.env.VISUAL_BASE_URL ?? "http://localhost:3000";
const SLUG = process.env.VISUAL_TENANT ?? "main";
const USER = process.env.VISUAL_USER ?? "qaadmin";
const PASS = process.env.VISUAL_PASS ?? "Qa-admin-1234";
const OUT = "reports/visual-verify/2026-04-17-admin";

// Tabs del admin (5 hubs × n tabs) — de tab-categories.ts
const TABS = [
  // Hoy
  "vendor-dashboard", "ai-command", "sugerencias-ia", "asistente-ia", "metas-logros",
  // Operar
  "ventas-caja", "pedidos", "productos", "inventario", "compras",
  // Cobrar
  "plata", "fiados", "prestamos", "facturacion", "cotizaciones", "guias-remision", "notas-credito", "contratos",
  // Crecer
  "clientes", "marketplace", "marketplace-chat", "delivery-partners", "delivery-live",
  // Conocer
  "analytics-pro", "forecasting", "rendimiento", "support-inbox", "colas", "auditoria",
  // Mi Tienda + Config
  "store-customizer", "pagina-inicio", "config", "plan",
];

async function main() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { "x-tenant-id": SLUG },
  });
  const page = await context.newPage();

  // ── LOGIN ─────────────────────────────────────────────────
  console.log(`Login ${USER} @ ${SLUG}...`);
  await page.goto(`${BASE}/t/${SLUG}/admin`, { waitUntil: "domcontentloaded" });

  // Intento: POST directo al API (más fiable que fill form)
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

  // ── LANDING AUTENTICADO ────────────────────────────────────
  const results = [];
  const landing = `${BASE}/t/${SLUG}/admin`;
  await page.goto(landing, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2500);

  // Cerrar modal de onboarding si aparece
  await page.evaluate(() => {
    try {
      localStorage.setItem("onboarding-dismissed", "true");
      localStorage.setItem("onboarding-checklist-dismissed", "true");
      localStorage.setItem("checklist-dismissed", "true");
    } catch {}
  });
  try {
    // Click en botón "Saltar por ahora" o cerrar X
    const skip = await page.getByRole("button", { name: /saltar/i }).first();
    if (await skip.isVisible({ timeout: 1500 })) await skip.click();
  } catch {}
  try {
    const closeX = await page.locator('[aria-label="close" i], [aria-label*="cerrar" i], button:has-text("×")').first();
    if (await closeX.isVisible({ timeout: 1500 })) await closeX.click();
  } catch {}
  await page.waitForTimeout(500);

  await page.screenshot({ path: `${OUT}/00-landing.png`, fullPage: false });
  results.push({ name: "00-landing", tab: "—", status: 200 });
  console.log(`[OK] 00-landing`);

  // ── LOOP POR TABS ──────────────────────────────────────────
  for (let i = 0; i < TABS.length; i++) {
    const tab = TABS[i];
    const n = String(i + 1).padStart(2, "0");
    const url = `${BASE}/t/${SLUG}/admin?tab=${tab}`;
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(2000);
      // Cerrar cualquier modal onboarding que reaparezca
      try {
        const skip = page.getByRole("button", { name: /saltar/i }).first();
        if (await skip.isVisible({ timeout: 800 })) await skip.click();
      } catch {}
      try {
        const closeBtn = page.locator('button[aria-label*="cerrar" i], button[aria-label*="close" i]').first();
        if (await closeBtn.isVisible({ timeout: 800 })) await closeBtn.click();
      } catch {}
      await page.waitForTimeout(1500);
      try {
        await page.waitForLoadState("networkidle", { timeout: 8_000 });
      } catch { /* fallback: just proceed */ }
      const status = resp?.status() ?? 0;
      const path = `${OUT}/${n}-${tab}.png`;
      await page.screenshot({ path, fullPage: false });
      results.push({ name: `${n}-${tab}`, tab, status });
      console.log(`[${status}] ${n}-${tab}`);
    } catch (e) {
      results.push({ name: `${n}-${tab}`, tab, status: "ERR", error: String(e.message ?? e).slice(0, 80) });
      console.log(`[ERR] ${n}-${tab} :: ${String(e.message ?? e).slice(0, 80)}`);
    }
  }

  await browser.close();
  console.log("\n=== SUMMARY ===");
  console.table(results.map(({ name, status }) => ({ name, status })));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
