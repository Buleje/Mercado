import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "reports/delivery-redesign";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  storageState: {
    cookies: [],
    origins: [
      {
        origin: "http://localhost:3000",
        localStorage: [
          { name: "browser-tour-completed", value: "1" },
          { name: "marketplace-tour-completed", value: "1" },
          {
            name: "marketplace-cart-v1",
            value: JSON.stringify({
              items: [
                {
                  storeId: "main",
                  storeSlug: "main",
                  storeName: "Buleje",
                  productId: "demo-1",
                  name: "Producto demo",
                  price: 12,
                  quantity: 2,
                  imageUrl: "",
                  unit: "uni",
                },
              ],
            }),
          },
        ],
      },
    ],
  },
});

const page = await ctx.newPage();

// 1. Carrito
await page.goto("http://localhost:3000/marketplace/carrito", { waitUntil: "networkidle", timeout: 30000 });
await page.evaluate(() => {
  document.querySelectorAll('[role="dialog"]').forEach((el) => (el.style.display = "none"));
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/checkout-1-carrito.png`, fullPage: false });
console.log("OK carrito");

// 2. Datos
await page.goto("http://localhost:3000/checkout/datos", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/checkout-2-datos.png`, fullPage: false });
console.log("OK datos");

// 3. Loader paiche en navegación
await page.fill('#ck-name', "Carlos Test").catch(() => {});
await page.fill('#ck-phone', "999111222").catch(() => {});
await page.waitForTimeout(300);
const pSubmit = page.click('button[type="submit"]:has-text("Continuar")').catch(() => {});
await page.waitForTimeout(140); // captura el overlay
await page.screenshot({ path: `${OUT}/checkout-loader-paiche.png`, fullPage: false });
console.log("OK loader");
await pSubmit;
await page.waitForTimeout(2000);

// 4. Entrega
await page.screenshot({ path: `${OUT}/checkout-3-entrega.png`, fullPage: false });
console.log("OK entrega");

await ctx.close();
await browser.close();
