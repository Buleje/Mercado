import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const consoleEvents = [];
page.on("console", m => consoleEvents.push(`[${m.type()}] ${m.text().slice(0, 220)}`));

console.log("=== STEP 1: Cargar /t/mi-pollo/tienda con localStorage limpio ===");
await page.goto("http://localhost:3000/t/mi-pollo/tienda", { waitUntil: "domcontentloaded", timeout: 20000 });
await page.waitForTimeout(4500); // Esperar que validProductIdsRef se popule

console.log("=== STEP 2: Verificar que validProductIdsRef está populado ===");
const validIdsCount = await page.evaluate(async () => {
  const res = await fetch("/api/products?active=true");
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data.length : null;
});
console.log(`Productos retornados por /api/products: ${validIdsCount}`);

console.log("\n=== STEP 3: Simular addItem con productId 1252382 (de MAIN) ===");
const result = await page.evaluate(() => {
  // Buscar el botón add-to-cart de algún producto y simular el flujo.
  // En lugar de buscar el botón real, vamos a probar via dispatch directo
  // del context. Pero como el context no es accesible globalmente, vamos
  // a hacer un truco: poblar localStorage CON un producto fantasma y reload.
  // Pero esto NO testeria addItem; testaría hidratación.
  // Mejor: abrir DevTools, llamar a window.__cartTest si existiera.
  // Como fallback: forzar agregar via localStorage Y verificar que en próximo
  // paint el cart-context lo limpia o lo rechaza.
  const fake = [{ id: 1252382, name: "Fantasma main", price: 10, quantity: 1, unit: "und", category: "X", image: "", storeSlug: "mi-pollo" }];
  localStorage.setItem("buleje-mi-pollo-cart", JSON.stringify(fake));
  return { populated: true };
});
console.log("Item fantasma forzado en localStorage:", result);

console.log("\n=== STEP 4: Reload — el cart-context debe LIMPIAR el item ===");
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(4500);

const after = await page.evaluate(() => localStorage.getItem("buleje-mi-pollo-cart"));
console.log("Carrito post-reload:", after);

const isClean = after === "[]" || after === null;
console.log(isClean
  ? "\n✅ PASS: el cart-context limpió el item fantasma al hidratar"
  : "\n❌ FAIL: el item fantasma sigue en el carrito");

console.log("\n=== Console warnings 'rechazando add' (defensa adicional) ===");
const rejectWarns = consoleEvents.filter(e => e.includes("rechazando add"));
console.log(`Warnings de rechazo: ${rejectWarns.length}`);
rejectWarns.slice(0, 3).forEach(e => console.log(e));

await browser.close();
