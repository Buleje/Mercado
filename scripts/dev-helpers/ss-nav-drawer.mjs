import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/visual-verify/nav-drawer";
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
    const keys = [
      "buleje-tour-marketplace-store",
      "buleje-tour-marketplace-home",
      "buleje-tour-store-detail",
      "buleje-tour-tiendas",
      "onboarding-completed-main",
      "onboarding-completed-buleje",
      "onboarding-completed-pizza-pucallpa",
    ];
    keys.forEach((k) => localStorage.setItem(k, "1"));
    // Pre-cargar 3 items en marketplace-cart
    localStorage.setItem("marketplace-cart", JSON.stringify({
      items: [
        { storeId: "s1", productId: 1, name: "Pizza Familiar", price: 35, quantity: 1, unit: "und", image: "" },
        { storeId: "s1", productId: 2, name: "Coca Cola 1.5L", price: 8, quantity: 2, unit: "botella", image: "" },
      ],
    }));
  } catch {}
});

await page.goto(`http://localhost:3000/marketplace/pizza-pucallpa?_t=${Date.now()}`, {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await page.waitForTimeout(3500);

// Force-remove any tour modal blocking the hamburger
await page.evaluate(() => {
  document.querySelectorAll('[role="dialog"]').forEach((d) => d.remove());
}).catch(() => {});
await page.waitForTimeout(400);

// Click hamburger
const hamburger = page.locator("button[aria-label='Menú de navegación']").first();
if (await hamburger.count() > 0) {
  await hamburger.tap();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/01-drawer-open.png`, fullPage: false });
  console.log("OK 01-drawer-open");
} else {
  console.log("hamburger NOT FOUND");
}

await browser.close();
