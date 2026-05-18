import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/visual-verify/sticky-cart-redesign";
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

// Pre-cargar items en carrito + cerrar tours/onboarding
await page.addInitScript(() => {
  const items = [
    { storeId: "test-store", productId: 1, name: "Coca Cola 500ml", price: 5.5, quantity: 1, unit: "und", image: "" },
    { storeId: "test-store", productId: 2, name: "Pan integral", price: 12.0, quantity: 2, unit: "und", image: "" },
    { storeId: "test-store", productId: 3, name: "Queso fresco 250g", price: 16.5, quantity: 1, unit: "g", image: "" },
  ];
  try {
    localStorage.setItem("marketplace-cart", JSON.stringify({ items }));
    // Cerrar todos los tours y onboardings
    localStorage.setItem("buleje-tour-marketplace-store", "1");
    localStorage.setItem("buleje-tour-marketplace-home", "1");
    localStorage.setItem("buleje-tour-store-detail", "1");
    localStorage.setItem("onboarding-completed-main", "1");
    localStorage.setItem("onboarding-completed-buleje", "1");
  } catch {}
});

await page.goto(`http://localhost:3000/marketplace/buleje?_t=${Date.now()}`, {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await page.waitForTimeout(4000);

// Si quedó algún modal abierto, intenta cerrarlo
const closeBtn = page.locator("button[aria-label*='Cerrar'], button[aria-label*='close']").first();
if (await closeBtn.count() > 0) {
  await closeBtn.tap().catch(() => {});
  await page.waitForTimeout(500);
}

// Screenshot strip cerrado pegado al BottomNav
await page.evaluate(() => window.scrollTo({ top: 400, behavior: "instant" }));
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/01-strip-closed.png`, fullPage: false });
console.log("OK 01-strip-closed");

// Tap en strip para expandir
const strip = page.locator("[aria-label*='resumen del carrito']").first();
if (await strip.count() > 0) {
  await strip.tap();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/02-strip-expanded.png`, fullPage: false });
  console.log("OK 02-strip-expanded");
}

await browser.close();
