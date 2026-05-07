import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

console.log("=== Test: simular agregar producto INVÁLIDO al carrito (sin reload) ===\n");
await page.goto("http://localhost:3000/t/mi-pollo/tienda", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(4500); // Esperar validProductIdsRef

// Simular acción runtime: agregar 1252382 directamente al cart vía localStorage Y dispatch
const result = await page.evaluate(() => {
  // 1. Verificar lo que tiene validProductIdsRef vía /api/products
  const valid1252382 = false; // Sabemos que NO es de mi-pollo
  
  // 2. Forzar el item DIRECTAMENTE en localStorage simulando que se agregó
  const fakeFromBackground = [{
    id: 1252382, name: "Fantasma de main", price: 4.8,
    quantity: 1, unit: "bolsa", category: "Test", image: "",
    storeSlug: "mi-pollo" // taggeado falsamente
  }];
  localStorage.setItem("buleje-mi-pollo-cart", JSON.stringify(fakeFromBackground));
  return { polluted: true };
});
console.log("Item fantasma forzado:", result);

// Reload — el fix debería limpiarlo
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(4500);

const cartFinal = await page.evaluate(() => localStorage.getItem("buleje-mi-pollo-cart"));
console.log("\nCarrito post-reload (debe ser []):", cartFinal);

// Intentar checkout con ese carrito
const orderResult = await page.evaluate(async () => {
  const items = JSON.parse(localStorage.getItem("buleje-mi-pollo-cart") || "[]");
  if (items.length === 0) return { skip: "carrito vacío - PASS limpieza" };
  
  // Si quedó algo, intentar checkout
  const csrf = (document.cookie.match(/csrf-token=([^;]+)/) || [])[1] || "";
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
    credentials: "include",
    body: JSON.stringify({
      customer: { name: "T", phone: "999111222" },
      items: items.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity, unit: i.unit })),
      total: items.reduce((s, i) => s + i.price * i.quantity, 0),
      deliveryAddress: "X",
      paymentMethod: "efectivo",
    }),
  });
  return { status: res.status, body: await res.json() };
});
console.log("\nResultado del intento de orden:", JSON.stringify(orderResult, null, 2));

await browser.close();
