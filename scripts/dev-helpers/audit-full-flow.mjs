import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "/home/usuario/proyectos/Mercado/reports/audit-tiendas-2026-05-18/screenshots";
mkdirSync(OUT, { recursive: true });

const CHROMIUM = "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome";
const BASE = "http://localhost:3000";
const TS = Date.now();

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`OK ${name}`);
}
async function shotFull(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`OK ${name}`);
}

// ── MOBILE LIGHT ─────────────────────────────────────────────────────────────
const ctxML = await browser.newContext({ ...devices["iPhone 14 Pro"], isMobile: true, hasTouch: true });
const mPage = await ctxML.newPage();

// 1. /tiendas mobile light
await mPage.goto(`${BASE}/tiendas?_t=${TS}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await mPage.waitForTimeout(3000);
await shot(mPage, "tiendas_mobile_light_top");
await mPage.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
await mPage.waitForTimeout(600);
await shot(mPage, "tiendas_mobile_light_mid");
await mPage.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await mPage.waitForTimeout(400);

// 2. /marketplace mobile light
await mPage.goto(`${BASE}/marketplace?_t=${TS}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await mPage.waitForTimeout(3000);
await shot(mPage, "marketplace_mobile_light_top");
await mPage.evaluate(() => window.scrollTo({ top: 700, behavior: "instant" }));
await mPage.waitForTimeout(600);
await shot(mPage, "marketplace_mobile_light_mid");

// 3. /marketplace/main mobile light
await mPage.goto(`${BASE}/marketplace/main?_t=${TS}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await mPage.waitForTimeout(4000);
await shot(mPage, "storefront_main_mobile_light_top");
await mPage.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
await mPage.waitForTimeout(700);
await shot(mPage, "storefront_main_mobile_light_products");

// 4. /marketplace/pizza-pucallpa mobile light
await mPage.goto(`${BASE}/marketplace/pizza-pucallpa?_t=${TS}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await mPage.waitForTimeout(4000);
await shot(mPage, "storefront_pizza_mobile_light_top");
await mPage.evaluate(() => window.scrollTo({ top: 700, behavior: "instant" }));
await mPage.waitForTimeout(700);
await shot(mPage, "storefront_pizza_mobile_light_products");

// 5. /checkout mobile light
await mPage.goto(`${BASE}/checkout?_t=${TS}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await mPage.waitForTimeout(3000);
await shot(mPage, "checkout_mobile_light");

// DARK MODE mobile
await mPage.evaluate(() => { document.documentElement.classList.add("dark"); try { localStorage.setItem("theme","dark"); } catch {} });
await mPage.waitForTimeout(600);
await mPage.goto(`${BASE}/tiendas?_t=${TS+1}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await mPage.waitForTimeout(3000);
await mPage.evaluate(() => { document.documentElement.classList.add("dark"); try { localStorage.setItem("theme","dark"); } catch {} });
await mPage.waitForTimeout(400);
await shot(mPage, "tiendas_mobile_dark_top");

await mPage.goto(`${BASE}/marketplace/main?_t=${TS+2}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await mPage.waitForTimeout(4000);
await mPage.evaluate(() => { document.documentElement.classList.add("dark"); try { localStorage.setItem("theme","dark"); } catch {} });
await mPage.waitForTimeout(500);
await shot(mPage, "storefront_main_mobile_dark_top");

await mPage.goto(`${BASE}/checkout?_t=${TS+3}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await mPage.waitForTimeout(3000);
await mPage.evaluate(() => { document.documentElement.classList.add("dark"); try { localStorage.setItem("theme","dark"); } catch {} });
await mPage.waitForTimeout(500);
await shot(mPage, "checkout_mobile_dark");

await ctxML.close();

// ── DESKTOP LIGHT ─────────────────────────────────────────────────────────────
const ctxDL = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const dPage = await ctxDL.newPage();

await dPage.goto(`${BASE}/tiendas?_t=${TS}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await dPage.waitForTimeout(3000);
await shot(dPage, "tiendas_desktop_light");

await dPage.goto(`${BASE}/marketplace?_t=${TS}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await dPage.waitForTimeout(3000);
await shot(dPage, "marketplace_desktop_light");

await dPage.goto(`${BASE}/marketplace/main?_t=${TS}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await dPage.waitForTimeout(4000);
await shot(dPage, "storefront_main_desktop_light");
await dPage.evaluate(() => window.scrollTo({ top: 700, behavior: "instant" }));
await dPage.waitForTimeout(700);
await shot(dPage, "storefront_main_desktop_light_products");

await dPage.goto(`${BASE}/checkout?_t=${TS}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await dPage.waitForTimeout(3000);
await shot(dPage, "checkout_desktop_light");

// Desktop dark
await dPage.evaluate(() => { document.documentElement.classList.add("dark"); try { localStorage.setItem("theme","dark"); } catch {} });
await dPage.waitForTimeout(500);
await dPage.goto(`${BASE}/marketplace/main?_t=${TS+4}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await dPage.waitForTimeout(4000);
await dPage.evaluate(() => { document.documentElement.classList.add("dark"); try { localStorage.setItem("theme","dark"); } catch {} });
await dPage.waitForTimeout(500);
await shot(dPage, "storefront_main_desktop_dark");

await dPage.goto(`${BASE}/tiendas?_t=${TS+5}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await dPage.waitForTimeout(3000);
await dPage.evaluate(() => { document.documentElement.classList.add("dark"); try { localStorage.setItem("theme","dark"); } catch {} });
await dPage.waitForTimeout(500);
await shot(dPage, "tiendas_desktop_dark");

await ctxDL.close();
await browser.close();
console.log("DONE all screenshots");
