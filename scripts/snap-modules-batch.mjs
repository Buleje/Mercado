import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/sidebar-buleje";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto("http://localhost:3000/admin", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(800);
const hasLogin = await page.locator('input[type="password"]').count() > 0;
if (hasLogin) {
  await page.fill('input[type="text"], input[name="username"]', "qaadmin").catch(() => {});
  await page.fill('input[type="password"]', "Qa-admin-1234").catch(() => {});
  await Promise.all([
    page.locator('button[type="submit"]').first().click(),
    page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
  ]);
  await page.waitForTimeout(2000);
}

await page.evaluate(() => {
  localStorage.setItem("admin-sidebar-theme", "buleje");
  localStorage.setItem("onboarding-completed-main", "1");
  // Cerrar saludo diario via la key real
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem(`morning-summary-${today}`, "shown");
});

const TABS = ["ventas-caja", "delivery-partners"];
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });

for (const tab of TABS) {
  await page.goto(`http://localhost:3000/admin?tab=${tab}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(10000);
  // Cerrar el modal saludo diario via click en X si aparece
  // No clicks — el modal ya está dismissed via localStorage
  const hdr = await page.evaluate(() => document.querySelector("h1, h2")?.textContent ?? "no-h1");
  console.log(`${tab}: ${hdr}`);
  await page.screenshot({ path: `${OUT}/admin-${tab}-audit.png`, clip: { x: 260, y: 60, width: 1100, height: 700 } });
  // Para clientes, navegar al sub-tab "mensajes masivos"
  if (tab === "clientes") {
    await page.evaluate(() => {
      localStorage.setItem("admin-last-tab-clientes", "mensajes");
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(8000);
    await page.screenshot({ path: `${OUT}/admin-clientes-mensajes-audit.png`, clip: { x: 260, y: 60, width: 1100, height: 800 } });
  }
}
console.log("errors:", errs.length);
if (errs.length) errs.slice(0, 3).forEach(e => console.log("  ", e));
await browser.close();
