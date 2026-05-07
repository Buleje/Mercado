import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
const checkoutErrors = [];
page.on("console", m => {
  const text = m.text();
  if (m.type() === "error") errors.push(text.slice(0, 200));
  if (text.includes("invalid_product")) checkoutErrors.push(text.slice(0, 250));
});
page.on("response", r => {
  const url = r.url();
  if (url.includes("/api/orders") && r.request().method() === "POST") {
    console.log(`[ORDERS POST] ${r.status()}`);
  }
});

console.log("=== ESCENARIO: Brandon navega tiendas de distintos tenants ===\n");

console.log("STEP 1: Limpio + ir a /tienda (storefront 'main')");
await page.goto("http://localhost:3000/tienda", { waitUntil: "domcontentloaded", timeout: 20000 });
await page.waitForTimeout(2500);

console.log("STEP 2: Forzar carrito 'main' con productId 1252382 (de main)");
await page.evaluate(() => {
  const item = [{ id: 1252382, name: "Producto main", price: 10, quantity: 1, unit: "und", category: "X", image: "", storeSlug: "main" }];
  localStorage.setItem("buleje-main-cart", JSON.stringify(item));
});

console.log("STEP 3: Verificar localStorage ANTES del cambio de tenant");
const before = await page.evaluate(() => ({
  mainCart: localStorage.getItem("buleje-main-cart"),
  miPolloCart: localStorage.getItem("buleje-mi-pollo-cart"),
}));
console.log("  main-cart:", before.mainCart);
console.log("  mi-pollo-cart:", before.miPolloCart);

console.log("\nSTEP 4: Navegar a /t/mi-pollo/tienda (cambio tenant)");
await page.goto("http://localhost:3000/t/mi-pollo/tienda", { waitUntil: "domcontentloaded", timeout: 20000 });
await page.waitForTimeout(4000);

console.log("STEP 5: Verificar localStorage DESPUÉS");
const after = await page.evaluate(() => ({
  mainCart: localStorage.getItem("buleje-main-cart"),
  miPolloCart: localStorage.getItem("buleje-mi-pollo-cart"),
  allKeys: Object.keys(localStorage).filter(k => k.includes("cart")),
}));
console.log("  main-cart:", after.mainCart);
console.log("  mi-pollo-cart:", after.miPolloCart);
console.log("  todas las keys cart:", after.allKeys);

console.log(`\n=== RESULTADO ===`);
const miPolloHas1252382 = after.miPolloCart && after.miPolloCart.includes("1252382");
if (miPolloHas1252382) {
  console.log("❌ BUG: el productId 1252382 (de main) MIGRÓ al carrito de mi-pollo");
} else {
  console.log("✅ OK: el carrito de mi-pollo NO recibió el producto de main");
}
console.log(`Errors: ${errors.length}, Checkout errors: ${checkoutErrors.length}`);

await browser.close();
