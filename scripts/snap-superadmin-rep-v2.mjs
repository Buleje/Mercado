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
  await page.waitForTimeout(500);
  await page.fill('input[name="username"], input[type="text"]', "superadmin").catch(() => {});
  await page.fill('input[type="password"]', "Super2026!").catch(() => {});
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForURL("**/superadmin/**", { timeout: 15000 }).catch(() => {}),
  ]);
  await page.waitForTimeout(1500);
}

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await loginSuper(page);
await page.goto("http://localhost:3000/superadmin/repartidores", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1500);

// 1. Lista
await page.screenshot({ path: `${OUT}/super-rep-v2-list.png`, fullPage: false });
console.log("OK list");

// 2. Drawer
await page.click('button[aria-label="Ver detalle"]').catch(() => {});
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/super-rep-v2-drawer-resumen.png`, fullPage: false });
console.log("OK drawer resumen");

// 3. Drawer · documentos
await page.click('button:has-text("Documentos")').catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/super-rep-v2-drawer-documentos.png`, fullPage: false });
console.log("OK drawer documentos");

// 4. Drawer · métricas
await page.click('button:has-text("Métricas")').catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/super-rep-v2-drawer-metricas.png`, fullPage: false });
console.log("OK drawer metricas");

// Cerrar drawer
await page.keyboard.press("Escape").catch(() => {});
await page.click('aside button[aria-label="Cerrar"]').catch(() => {});
await page.waitForTimeout(500);

// 5. Modal Rechazar
await page.click('button:has-text("Rechazar")').catch(() => {});
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/super-rep-v2-modal-rechazar.png`, fullPage: false });
console.log("OK modal rechazar");
await page.keyboard.press("Escape").catch(() => {});
await page.waitForTimeout(400);
await page.click('button:has-text("Cancelar")').catch(() => {});
await page.waitForTimeout(400);

// Para activos, capturar modal Acceder. Cambio filtro:
await page.click('button:has-text("Activos")').catch(() => {});
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/super-rep-v2-list-activos.png`, fullPage: false });
console.log("OK list activos");

await page.click('button:has-text("Acceder"):not(:has-text("ahora")):not(:has-text("a su"))').catch(() => {});
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/super-rep-v2-modal-acceder.png`, fullPage: false });
console.log("OK modal acceder");

await ctx.close();
await browser.close();
