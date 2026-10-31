// One-shot: siembra carrito + screenshot de /checkout/datos (modo invitado).
import { chromium } from "playwright";
import path from "node:path";

const BASE = "http://localhost:3000";
const CHROMIUM = path.join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome");
const out = process.argv[2] || "/tmp/checkout-datos.png";
const dark = process.argv.includes("--dark");

const CART = {
  items: [{
    storeId: "demo", storeName: "Bodega Demo", storeSlug: "mi-pollo",
    storeProductId: "demo-1", productId: 999999, name: "Arroz Costeño 5kg",
    price: 2490, quantity: 2, image: null, unit: "und", basePrice: 2490, stock: null,
  }],
};

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  // origen para fijar localStorage
  await page.goto(`${BASE}/marketplace`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.evaluate((cart) => {
    try { localStorage.setItem("marketplace-cart", JSON.stringify(cart)); } catch {}
  }, CART);
  if (dark) await page.evaluate(() => { document.documentElement.classList.add("dark"); try { localStorage.setItem("theme","dark"); } catch {} });
  await page.goto(`${BASE}/checkout/datos`, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (dark) await page.evaluate(() => document.documentElement.classList.add("dark"));
  try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}
  await page.waitForTimeout(1500);
  const phoneArg = process.argv.find((a) => a.startsWith("--phone="));
  if (phoneArg) {
    const phone = phoneArg.split("=")[1];
    await page.fill("#guest-phone", phone);
    await page.waitForTimeout(1800); // debounce 450ms + fetch
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: out, fullPage: false });
  console.log(JSON.stringify({ ok: true, url: page.url(), title: await page.title(), out }));
} finally {
  await browser.close();
}
