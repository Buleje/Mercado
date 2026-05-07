import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const networkLog = [];
page.on("response", r => {
  const url = r.url();
  if (url.includes("/api/")) {
    networkLog.push(`${r.status()} ${r.request().method()} ${url.replace("http://localhost:3000","")}`);
  }
});

console.log("=== STEP 1: Ir a /t/mi-pollo/tienda con localStorage limpio ===");
await page.goto("http://localhost:3000/t/mi-pollo/tienda", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(4500);

const inicial = await page.evaluate(() => ({
  cart: localStorage.getItem("buleje-mi-pollo-cart"),
  validIdsLoaded: typeof window !== "undefined" ? "no-acceso-a-ref" : null,
  productCardsCount: document.querySelectorAll("[class*='product']").length,
  hasAddButtons: document.querySelectorAll("button").length,
}));
console.log("Estado inicial:", inicial);

console.log("\n=== STEP 2: Buscar y clickear botón 'agregar al carrito' (primer producto) ===");
// Buscar botones que contengan "Agregar" o icono de carrito
let clicked = false;
for (const sel of [
  'button:has-text("Agregar")',
  '[aria-label*="Agregar"]',
  'button[class*="add-to-cart"]',
  '[data-testid*="add"]',
]) {
  try {
    const btn = page.locator(sel).first();
    const count = await btn.count();
    if (count > 0) {
      console.log(`  encontró ${count} botón con selector: ${sel}`);
      await btn.click({ timeout: 3000 });
      clicked = true;
      break;
    }
  } catch {}
}
if (!clicked) console.log("  ❌ NO se encontró botón de agregar");
await page.waitForTimeout(2000);

const cartAfterClick = await page.evaluate(() => localStorage.getItem("buleje-mi-pollo-cart"));
console.log("Carrito después del click:", cartAfterClick);

console.log("\n=== STEP 3: Network log ===");
networkLog.slice(0, 30).forEach(c => console.log(c));
const r429 = networkLog.filter(c => c.startsWith("429"));
const r400 = networkLog.filter(c => c.startsWith("400"));
console.log(`\nTotal 429: ${r429.length}, 400: ${r400.length}`);
r429.slice(0, 5).forEach(c => console.log("  429:", c));
r400.slice(0, 5).forEach(c => console.log("  400:", c));

await browser.close();
