/**
 * Reproduce el flujo completo del checkout para verificar el fix
 * "entrega → confirmar redirige a datos".
 */
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});

const page = await ctx.newPage();

const navigations = [];
page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame()) {
    navigations.push({ ts: Date.now(), url: frame.url() });
  }
});

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

// ── Step 1 — Carrito ──
console.log("→ /marketplace");
await page.goto("http://localhost:3000/marketplace", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(800);

// Cerrar tour si aparece
await page.evaluate(() => {
  document.querySelectorAll('[data-tour-overlay], [role="dialog"]').forEach((el) => el.remove());
});

// Inyectar items al carrito directo via localStorage. Clave correcta = "marketplace-cart".
// Usamos un productId numérico (la validación check-exists espera number).
// Como el endpoint check-exists no encontrará el id 999999 pero el guard
// preserva el cart si TODOS "desaparecerían", nuestro item sobrevive.
await page.evaluate(() => {
  const cart = {
    items: [
      {
        storeId: "main",
        storeSlug: "main",
        storeName: "Buleje",
        productId: 999999,
        name: "Producto Test",
        price: 12,
        quantity: 2,
        imageUrl: "",
        unit: "uni",
      },
    ],
  };
  localStorage.setItem("marketplace-cart", JSON.stringify(cart));
});

// Pre-poblar checkout-data en localStorage para saltarse /datos
await page.evaluate(() => {
  localStorage.setItem(
    "marketplace-checkout-customer",
    JSON.stringify({ name: "Carlos Test", phone: "999111222", email: "" }),
  );
  localStorage.setItem(
    "marketplace-checkout-address",
    JSON.stringify({
      address: "Jr. Test 123, Yarinacocha",
      zone: "Yarinacocha",
      notes: "",
      departmentCode: "",
      departmentName: "",
      provinceCode: "",
      provinceName: "",
      districtCode: "",
      districtName: "",
    }),
  );
});

// ── TEST 1: ir directo a /checkout/datos con cart vacío de localStorage debe quedar ahí ──
console.log("\n=== TEST 1: /checkout/datos con cart populado ===");
await page.goto("http://localhost:3000/checkout/datos", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
console.log(`  url: ${page.url()}`);
const test1Pass = page.url().includes("/checkout/datos");
console.log(test1Pass ? "  ✓ PASS — quedó en /datos" : "  ✗ FAIL — fue redirigido");

// ── TEST 2: ir directo a /checkout/entrega con customer válido en localStorage debe quedar ahí ──
console.log("\n=== TEST 2: /checkout/entrega con customer válido ===");
await page.goto("http://localhost:3000/checkout/entrega", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
console.log(`  url: ${page.url()}`);
const test2Pass = page.url().includes("/checkout/entrega");
console.log(test2Pass ? "  ✓ PASS — quedó en /entrega" : "  ✗ FAIL — fue redirigido");

// ── TEST 3 (el crítico): ir directo a /checkout/confirmar con customer + address válidos ──
console.log("\n=== TEST 3: /checkout/confirmar con datos completos (BUG REPORTADO) ===");
await page.goto("http://localhost:3000/checkout/confirmar", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
console.log(`  url: ${page.url()}`);
const test3Pass = page.url().includes("/checkout/confirmar");
console.log(test3Pass ? "  ✓ ✓ ✓ PASS — quedó en /confirmar (BUG FIXED)" : `  ✗ ✗ ✗ FAIL — fue a ${page.url()}`);

console.log("\n--- Navigations ---");
navigations.forEach((n) => console.log(`  ${new URL(n.url).pathname}`));

console.log("\n--- Console errors ---");
consoleErrors.slice(0, 10).forEach((e) => console.log(`  ${e.slice(0, 200)}`));

await ctx.close();
await browser.close();
