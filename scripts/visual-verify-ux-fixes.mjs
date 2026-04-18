// Verificación UX de los 3 cambios: secciones, sidebar flyout, impersonation banner.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const BASE = "http://localhost:3000";
const SLUG = "main";
const USER = "qaadmin";
const PASS = "Qa-admin-1234";
const OUT = "reports/visual-verify/2026-04-17-ux-fixes";

async function dismissModal(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("onboarding-completed-main", "1");
      localStorage.setItem("onboarding-completed-luis", "1");
    } catch {}
    document.querySelectorAll('[role="dialog"]').forEach((el) => {
      if ((el.textContent ?? "").includes("Configura tu bodega")) el.remove();
    });
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

  // LOGIN
  const loginResp = await page.request.post(`${BASE}/api/auth/login`, {
    headers: { "content-type": "application/json", "x-tenant-id": SLUG },
    data: { username: USER, password: PASS },
  });
  if (loginResp.status() !== 200) { console.error("Login fail"); process.exit(1); }

  // 1. ADMIN LANDING — sidebar default + banner impersonation
  await page.goto(`${BASE}/t/${SLUG}/admin`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(2000);
  await dismissModal(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/01-admin-landing.png`, fullPage: false });
  console.log("OK 01-admin-landing");

  // 2. SIDEBAR HOVER — simular hover sobre Cobrar para abrir flyout lateral
  await page.hover('button:has-text("Cobrar"), a:has-text("Cobrar")').catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/02-sidebar-hover-cobrar.png`, fullPage: false });
  console.log("OK 02-sidebar-hover-cobrar");

  // 3. TIENDA PÚBLICA (logout primero para ver como público)
  await context.clearCookies();
  await page.goto(`${BASE}/t/${SLUG}/tienda`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/03-tienda-publica.png`, fullPage: true });
  console.log("OK 03-tienda-publica");

  // 4. TIENDA SCROLL — ver abajo las secciones
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/04-tienda-scroll-mid.png`, fullPage: false });
  console.log("OK 04-tienda-scroll-mid");

  await page.evaluate(() => window.scrollTo(0, 1500));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/05-tienda-scroll-bottom.png`, fullPage: false });
  console.log("OK 05-tienda-scroll-bottom");

  await browser.close();
  console.log("\nDONE", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
