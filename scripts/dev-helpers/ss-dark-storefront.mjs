import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/visual-verify/ux-p0";
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

// 1. Set sessionStorage BEFORE navigation (matches real toggle behavior)
await page.addInitScript(() => {
  try {
    window.sessionStorage.setItem("buleje-theme-session-v2", "dark");
  } catch {}
});

await page.goto(`http://localhost:3000/marketplace/pizza-pucallpa?_t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/dark-storefront-mobile.png`, fullPage: false });
console.log("OK dark-storefront-mobile");

// Also check /tiendas dark
await page.goto(`http://localhost:3000/tiendas?_t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/dark-tiendas-mobile.png`, fullPage: false });
console.log("OK dark-tiendas-mobile");

// Check the actual DOM state
const state = await page.evaluate(() => {
  return {
    htmlClasses: document.documentElement.className,
    colorScheme: document.documentElement.style.colorScheme,
    sessionStored: window.sessionStorage.getItem("buleje-theme-session-v2"),
  };
});
console.log("STATE:", JSON.stringify(state, null, 2));

await ctx.close();
await browser.close();
