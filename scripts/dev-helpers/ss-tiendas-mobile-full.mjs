import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/visual-verify/tiendas-mobile";
const LABEL = "after-v2";
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
await page.waitForTimeout(3500);

// 1. Top — Filtros should be visible
await page.screenshot({ path: `${OUT}/${LABEL}-01-top.png`, fullPage: false });
console.log("OK 01-top");

// 2. Open Filters drawer
const filtersBtn = page.locator('button[aria-label*="Filtros"]').first();
await filtersBtn.click({ timeout: 5000 }).catch((e) => console.log("filters click skipped:", e.message));
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/${LABEL}-02-filters-drawer.png`, fullPage: false });
console.log("OK 02-filters-drawer");

// Scroll the drawer to see Zona section
await page.evaluate(() => {
  const drawer = document.querySelector('[role="dialog"][aria-label="Filtros"] .overflow-y-auto');
  if (drawer) drawer.scrollTop = 100;
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/${LABEL}-03-filters-zona.png`, fullPage: false });
console.log("OK 03-filters-zona");

// Close drawer
await page.keyboard.press("Escape").catch(() => {});
// also try clicking backdrop
const backdrop = page.locator('[role="dialog"][aria-label="Filtros"] > div').first();
await backdrop.click({ position: { x: 10, y: 10 } }).catch(() => {});
await page.waitForTimeout(800);

// 4. Scroll down past subcategorias → sticky bar should appear
await page.evaluate(() => window.scrollTo({ top: 700, behavior: "instant" }));
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/${LABEL}-04-sticky-bar.png`, fullPage: false });
console.log("OK 04-sticky-bar");

// 5. Continue scrolling
await page.evaluate(() => window.scrollTo({ top: 1400, behavior: "instant" }));
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/${LABEL}-05-sticky-list.png`, fullPage: false });
console.log("OK 05-sticky-list");

await ctx.close();
await browser.close();
