import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const apiCalls = [];
page.on("response", r => {
  const u = r.url();
  if (u.includes("/api/orders") || u.includes("/api/products?active") || u.includes("check-exists")) {
    apiCalls.push(`${r.status()} ${r.request().method()} ${u.replace("http://localhost:3000","")}`);
  }
});

console.log("=== ESCENARIO REAL: cliente abre tienda, agrega producto, va a checkout ===\n");

await page.goto("http://localhost:3000/t/mi-pollo/tienda", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(4500);

console.log("STEP 1: Inyecto productId real de mi-pollo en carrito (simula click 'agregar')");
await page.evaluate(() => {
  // Usar productId 1252468 (real de mi-pollo)
  const realItem = [{
    id: 1252468, name: "Producto real mi-pollo", price: 5,
    quantity: 1, unit: "und", category: "Test", image: "",
    storeSlug: "mi-pollo"
  }];
  localStorage.setItem("buleje-mi-pollo-cart", JSON.stringify(realItem));
});

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);

console.log("STEP 2: Verificar que el carrito mantiene el producto válido");
const cartReal = await page.evaluate(() => localStorage.getItem("buleje-mi-pollo-cart"));
console.log("Carrito (debe tener 1252468):", cartReal);

console.log("\nSTEP 3: Simular POST a /api/orders con datos válidos");
const orderResult = await page.evaluate(async () => {
  const csrfMatch = document.cookie.match(/csrf-token=([^;]+)/);
  const csrf = csrfMatch ? csrfMatch[1] : "";
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
    credentials: "include",
    body: JSON.stringify({
      customer: { name: "Cliente Test", phone: "999111222" },
      items: [{ id: 1252468, name: "Test", price: 5, quantity: 1, unit: "und" }],
      total: 5,
      deliveryAddress: "calle test 123",
      paymentMethod: "efectivo",
    }),
  });
  return {
    status: res.status,
    body: await res.json().catch(() => ({})),
  };
});
console.log("Resultado POST /api/orders:", JSON.stringify(orderResult, null, 2));

console.log("\nSTEP 4: Test con productId INVÁLIDO (1252382 de main) — debe rechazar");
const orderResult2 = await page.evaluate(async () => {
  const csrfMatch = document.cookie.match(/csrf-token=([^;]+)/);
  const csrf = csrfMatch ? csrfMatch[1] : "";
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
    credentials: "include",
    body: JSON.stringify({
      customer: { name: "Cliente Test", phone: "999222333" },
      items: [{ id: 1252382, name: "Producto main", price: 4.8, quantity: 1, unit: "bolsa" }],
      total: 4.8,
      deliveryAddress: "calle test 456",
      paymentMethod: "efectivo",
    }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
});
console.log("Resultado con producto inválido:", JSON.stringify(orderResult2, null, 2));

console.log("\n=== Network ===");
apiCalls.slice(-15).forEach(c => console.log(c));

await browser.close();
