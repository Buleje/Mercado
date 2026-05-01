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
  await page.waitForTimeout(2000);
}

for (const vp of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  try {
    await loginSuper(page);
    console.log(`✓ logged in (${vp.name})`);
  } catch (e) {
    console.log(`✗ login failed (${vp.name}): ${e.message}`);
  }
  try {
    await page.goto("http://localhost:3000/superadmin/repartidores", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/super-repartidores-${vp.name}.png`, fullPage: false });
    await page.screenshot({ path: `${OUT}/super-repartidores-${vp.name}-full.png`, fullPage: true });
    console.log(`OK super-repartidores ${vp.name}`);
  } catch (e) {
    console.log(`FAIL super-repartidores ${vp.name}: ${e.message}`);
  }
  await ctx.close();
}
await browser.close();
