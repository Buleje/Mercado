/**
 * Captura screenshot del badge de notificación en TenantCard.
 * Pre-condición: hay orders en status "pendiente" en la DB (ya generamos
 * varios con scripts/test-order-creates-offer.mjs).
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "reports/delivery-redesign";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

async function loginSuper(page) {
  await page.goto("http://localhost:3000/superadmin/login", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.fill('input[placeholder="Usuario"]', "superadmin").catch(() => {});
  await page.fill('input[placeholder="Contraseña"]', "Super2026!").catch(() => {});
  await page.click('button[type="submit"]').catch(() => {});
  await page.waitForURL("**/superadmin/**", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await loginSuper(page);
await page.goto("http://localhost:3000/superadmin/tenants", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(5000); // dar tiempo al loadTenants + pending-counts
console.log("OK login + tenants");

// Buscar Mi Pollo (tenant que tiene orders pendientes)
const miPolloCard = await page.$('div:has(div:text("Mi Pollo"))');
if (miPolloCard) {
  await miPolloCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
}

// Captura full lista
await page.screenshot({ path: `${OUT}/super-tenants-with-badge.png`, fullPage: false });
console.log("OK screenshot list");

// Click en el badge "X pendientes"
const badge = await page.$('button[title*="pendiente"]');
if (badge) {
  await badge.click();
  await page.waitForTimeout(4500); // tiempo para que termine el GET de detalles
  await page.screenshot({ path: `${OUT}/super-tenants-pending-modal.png`, fullPage: false });
  console.log("OK screenshot modal");

  // Expandir el primer pedido (chevron lo gira)
  const firstRow = await page.$('aside ul > li:first-child > button');
  if (firstRow) {
    await firstRow.click().catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/super-tenants-pending-expanded.png`, fullPage: false });
    console.log("OK screenshot expanded");
  }
} else {
  console.log("✗ no se encontró badge — quizás no hay pedidos pendientes en este tenant");
}

await ctx.close();
await browser.close();
