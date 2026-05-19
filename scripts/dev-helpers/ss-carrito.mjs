import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/visual-verify/carrito";
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

await page.addInitScript(() => {
  try {
    const tours = [
      "buleje-tour-marketplace-store",
      "buleje-tour-marketplace-home",
      "buleje-tour-marketplace",
      "buleje-tour-store-detail",
      "buleje-tour-tiendas",
      "buleje-tour-carrito",
      "onboarding-completed-main",
    ];
    tours.forEach((k) => localStorage.setItem(k, "1"));
    localStorage.setItem(
      "marketplace-cart",
      JSON.stringify({
        items: [
          { storeId: "s1", storeName: "Pizzeria Daily Fresh", storeSlug: "pizza-pucallpa", productId: 1, storeProductId: "sp1", name: "Pizza Familiar Pepperoni", price: 45, quantity: 1, unit: "und", image: "" },
          { storeId: "s1", storeName: "Pizzeria Daily Fresh", storeSlug: "pizza-pucallpa", productId: 2, storeProductId: "sp2", name: "Coca Cola 1.5L", price: 8, quantity: 2, unit: "botella", image: "" },
          { storeId: "s2", storeName: "Bodega Buleje", storeSlug: "buleje", productId: 3, storeProductId: "sp3", name: "Pan integral", price: 12, quantity: 1, unit: "und", image: "" },
        ],
      }),
    );
  } catch {}
});

await page.goto(`http://localhost:3000/marketplace/carrito?_t=${Date.now()}`, {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await page.waitForTimeout(3500);

await page.evaluate(() => {
  document.querySelectorAll('[role="dialog"]').forEach((d) => d.remove());
}).catch(() => {});
await page.waitForTimeout(500);

await page.screenshot({ path: `${OUT}/01-top.png`, fullPage: false });
await page.evaluate(() => window.scrollTo({ top: 400, behavior: "instant" }));
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/02-mid.png`, fullPage: false });
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await page.screenshot({ path: `${OUT}/03-full.png`, fullPage: true });
console.log("OK 3 captures");

await browser.close();
