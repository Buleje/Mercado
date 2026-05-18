import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/visual-verify/tiendas-footer-fix";
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

await page.goto(`http://localhost:3000/tiendas?_t=${Date.now()}`, {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await page.waitForTimeout(3000);

await page.evaluate(() => window.scrollTo({ top: 99999, behavior: "instant" }));
await page.waitForTimeout(800);

await page.screenshot({ path: `${OUT}/footer-bottom.png`, fullPage: false });
console.log("OK footer-bottom");

await browser.close();
