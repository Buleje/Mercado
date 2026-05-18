import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/visual-verify/checkout-datos";
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
      "buleje-tour-marketplace-store","buleje-tour-marketplace-home",
      "buleje-tour-marketplace","buleje-tour-store-detail","buleje-tour-tiendas",
      "buleje-tour-carrito","buleje-tour-checkout","onboarding-completed-main",
    ];
    tours.forEach((k) => localStorage.setItem(k, "1"));
    localStorage.setItem("marketplace-cart", JSON.stringify({
      items: [
        { storeId: "s1", storeName: "Pizzeria Daily Fresh", storeSlug: "pizza-pucallpa", productId: 1, storeProductId: "sp1", name: "Pizza Familiar", price: 45, quantity: 1, unit: "und", image: "" },
        { storeId: "s2", storeName: "Bodega Buleje", storeSlug: "buleje", productId: 2, storeProductId: "sp2", name: "Pan", price: 12, quantity: 1, unit: "und", image: "" },
      ],
    }));
  } catch {}
});

await page.goto(`http://localhost:3000/checkout/datos?_t=${Date.now()}`, {
  waitUntil: "domcontentloaded", timeout: 30000,
});
await page.waitForTimeout(3500);
await page.evaluate(() => {
  document.querySelectorAll('[role="dialog"]').forEach((d) => d.remove());
}).catch(() => {});
await page.waitForTimeout(500);

await page.screenshot({ path: `${OUT}/01-top.png`, fullPage: false });
await page.screenshot({ path: `${OUT}/02-full.png`, fullPage: true });
console.log("OK 2 captures");

await browser.close();
