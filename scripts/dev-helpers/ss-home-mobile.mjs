import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/visual-verify/home-mobile";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

const ctx = await browser.newContext({
  ...devices["iPhone 14 Pro"],
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();

await page.goto(`http://localhost:3000/?_t=${Date.now()}`, {
  waitUntil: "domcontentloaded", timeout: 30000,
});
await page.waitForTimeout(4000);

// Top con todo (modal y promo bar incluidos)
await page.screenshot({ path: `${OUT}/01-with-modals.png`, fullPage: false });
console.log("OK 01-with-modals");

// Dismiss tour si aparece
await page.evaluate(() => {
  document.querySelectorAll('[role="dialog"]').forEach((d) => d.remove());
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/02-clean.png`, fullPage: false });
console.log("OK 02-clean");

await browser.close();
