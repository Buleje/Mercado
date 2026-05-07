import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
const responseCodes = [];
page.on("response", r => {
  const url = r.url();
  if (url.includes("/api/products") || url.includes("/api/orders") || url.includes("check-exists")) {
    responseCodes.push(`${r.status()} ${r.request().method()} ${url.replace("http://localhost:3000","")}`);
  }
});
page.on("console", m => { if (m.type() === "error") errors.push(`[${m.type()}] ${m.text().slice(0, 250)}`); });

console.log("=== STEP 1: Navegar a /t/mi-pollo/tienda con localStorage limpio ===");
await page.goto("http://localhost:3000/t/mi-pollo/tienda", { waitUntil: "domcontentloaded", timeout: 20000 });
await page.waitForTimeout(3500);

// Inspeccionar productos rendered
const productInfo = await page.evaluate(() => {
  const productCards = document.querySelectorAll("[data-product-id], [data-id]");
  const ids = Array.from(productCards).slice(0, 10).map(el => 
    el.getAttribute("data-product-id") || el.getAttribute("data-id"));
  return {
    cardsCount: productCards.length,
    firstIds: ids.filter(Boolean),
    cartLocal: localStorage.getItem("buleje-mi-pollo-cart"),
    mainCart: localStorage.getItem("buleje-main-cart"),
    allKeys: Object.keys(localStorage).filter(k => k.includes("cart"))
  };
});
console.log("Productos rendered:", productInfo);

console.log("\n=== STEP 2: Forzar agregar productId 1252382 al carrito de mi-pollo ===");
await page.evaluate(() => {
  const fakeCart = JSON.stringify([{
    id: 1252382, name: "Test", price: 10, quantity: 1, unit: "und",
    category: "Test", image: "", storeSlug: "mi-pollo"
  }]);
  localStorage.setItem("buleje-mi-pollo-cart", fakeCart);
});

console.log("\n=== STEP 3: Reload para que el cart-context lo hidrate y valide ===");
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

const cartAfter = await page.evaluate(() => localStorage.getItem("buleje-mi-pollo-cart"));
console.log("Carrito después de reload (debe estar limpio si fix funcionó):", cartAfter);

console.log("\n=== STEP 4: Network calls ===");
responseCodes.forEach(c => console.log(c));

console.log(`\n=== ERRORS (${errors.length}) ===`);
errors.slice(0, 5).forEach(e => console.log(e));

await browser.close();
