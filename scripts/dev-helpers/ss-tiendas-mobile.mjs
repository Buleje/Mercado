import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = process.env.OUT || "reports/visual-verify/tiendas-mobile";
const LABEL = process.env.LABEL || "baseline";
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

await page.goto(`http://localhost:3000/tiendas?_t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(3000);

// Top
await page.screenshot({ path: `${OUT}/${LABEL}-01-top.png`, fullPage: false });
console.log("OK 01-top");

// Scroll to find subcategorias
await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/${LABEL}-02-mid.png`, fullPage: false });
console.log("OK 02-mid");

await page.evaluate(() => window.scrollTo({ top: 1200, behavior: "instant" }));
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/${LABEL}-03-list.png`, fullPage: false });
console.log("OK 03-list");

// Full page
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/${LABEL}-full.png`, fullPage: true });
console.log("OK full");

await ctx.close();
await browser.close();
