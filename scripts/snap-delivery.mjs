import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "reports/delivery-redesign";
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { name: "login", url: "http://localhost:3000/delivery-app/login" },
  { name: "panel", url: "http://localhost:3000/delivery-app" },
  { name: "mapa", url: "http://localhost:3000/delivery-app/mapa" },
  { name: "ganancias", url: "http://localhost:3000/delivery-app/ganancias" },
  { name: "perfil", url: "http://localhost:3000/delivery-app/perfil" },
];

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

async function loginPartner(page) {
  await page.goto("http://localhost:3000/delivery-app/login", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(500);
  await page.fill('input[type="tel"]', "999333222");
  await page.fill('input[type="password"]', "Delivery2026!");
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForURL("**/delivery-app", { timeout: 15000 }).catch(() => {}),
  ]);
  await page.waitForTimeout(1500);
}

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  // login first
  try {
    await loginPartner(page);
    console.log(`✓ logged in (${vp.name})`);
  } catch (e) {
    console.log(`✗ login failed (${vp.name}): ${e.message}`);
  }
  for (const r of ROUTES) {
    try {
      await page.goto(r.url, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/${r.name}-${vp.name}.png`, fullPage: false });
      console.log(`OK ${r.name} ${vp.name}`);
    } catch (e) {
      console.log(`FAIL ${r.name} ${vp.name}: ${e.message}`);
    }
  }
  await ctx.close();
}
await browser.close();
