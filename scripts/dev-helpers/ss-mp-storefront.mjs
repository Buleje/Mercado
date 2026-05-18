import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/visual-verify/ux-p0";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

// MOBILE
const ctxM = await browser.newContext({ ...devices["iPhone 14 Pro"], isMobile: true, hasTouch: true });
const pageM = await ctxM.newPage();
await pageM.goto(`http://localhost:3000/marketplace/pizza-pucallpa?_t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await pageM.waitForTimeout(2500);
await pageM.screenshot({ path: `${OUT}/mp-storefront-mobile-light.png`, fullPage: false });
console.log("OK mobile-light");

await pageM.evaluate(() => { document.documentElement.classList.add("dark"); try { localStorage.setItem("theme", "dark"); } catch {} });
await pageM.waitForTimeout(700);
await pageM.screenshot({ path: `${OUT}/mp-storefront-mobile-dark.png`, fullPage: false });
console.log("OK mobile-dark");

// Scroll to products area
await pageM.evaluate(() => { document.documentElement.classList.remove("dark"); try { localStorage.setItem("theme", "light"); } catch {} });
await pageM.waitForTimeout(500);
await pageM.evaluate(() => window.scrollTo({ top: 800, behavior: "auto" }));
await pageM.waitForTimeout(800);
await pageM.screenshot({ path: `${OUT}/mp-storefront-mobile-products.png`, fullPage: false });
console.log("OK mobile-products");

await ctxM.close();

// CHECKOUT (mobile)
const ctxC = await browser.newContext({ ...devices["iPhone 14 Pro"], isMobile: true, hasTouch: true });
const pageC = await ctxC.newPage();
await pageC.goto(`http://localhost:3000/checkout?_t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await pageC.waitForTimeout(3000);
await pageC.screenshot({ path: `${OUT}/checkout-mobile-light.png`, fullPage: false });
console.log("OK checkout-mobile");
await ctxC.close();

await browser.close();
