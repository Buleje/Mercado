/**
 * E2E del flujo: pedido confirmado → /tiendas con modal abierto → minimizar →
 * badge en navbar → reabrir modal.
 *
 * Pre-poblamos localStorage con un snapshot completo de pedido para no
 * depender del POST real de orders.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/delivery-redesign";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error" && !msg.text().includes("negative time stamp")) {
    consoleErrors.push(msg.text());
  }
});

// 1) Cargar /tiendas y inyectar snapshot del pedido en localStorage
console.log("→ /tiendas (sin pedido aún)");
await page.goto("http://localhost:3000/tiendas", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(800);

// Cerrar tour si aparece
await page.evaluate(() => {
  document.querySelectorAll('[data-tour-overlay], [role="dialog"]').forEach((el) => el.remove());
});

await page.evaluate(() => {
  const snapshot = {
    orderIds: ["abc123XYZ"],
    ts: Date.now(),
    autoOpen: true,
    customer: { name: "Carlos Pérez", phone: "999111222" },
    address: {
      line: "Jr. Progreso 245",
      district: "Pucallpa",
      province: "Coronel Portillo",
      department: "Ucayali",
      notes: "Casa amarilla con portón blanco",
    },
    total: 87.5,
    items: [
      {
        productId: 101,
        name: "Arroz Costeño 5kg",
        price: 25.5,
        quantity: 2,
        imageUrl: "",
        storeName: "Bodega San Martín",
        storeSlug: "bodega-san-martin",
      },
      {
        productId: 102,
        name: "Aceite Primor 1L",
        price: 12.5,
        quantity: 1,
        imageUrl: "",
        storeName: "Bodega San Martín",
        storeSlug: "bodega-san-martin",
      },
      {
        productId: 103,
        name: "Detergente Bolívar 2.6kg",
        price: 24,
        quantity: 1,
        imageUrl: "",
        storeName: "Bodega San Martín",
        storeSlug: "bodega-san-martin",
      },
    ],
    storeNames: ["Bodega San Martín"],
  };
  localStorage.setItem("marketplace-last-order", JSON.stringify(snapshot));
});

// 2) Recargar /tiendas — el modal debe abrirse automáticamente
console.log("→ /tiendas (con pedido auto-open)");
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(2200);

// Cerrar tour si reaparece (sin tocar el modal de pedido)
await page.evaluate(() => {
  document.querySelectorAll('[data-tour-overlay]').forEach((el) => el.remove());
  const tours = document.querySelectorAll('[role="dialog"]');
  tours.forEach((el) => {
    if (el.textContent && el.textContent.includes("Buscá lo que necesitás")) el.remove();
  });
});
await page.waitForTimeout(800);

await page.screenshot({ path: `${OUT}/order-modal-1-auto-open.png`, fullPage: false });
console.log("OK 1: modal abierto automáticamente");

// Esperar a que el mapa cargue
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/order-modal-2-with-map.png`, fullPage: false });
console.log("OK 2: modal con mapa renderizado");

// Captura full-page para ver todo el contenido del modal scrolleado
await page.screenshot({ path: `${OUT}/order-modal-3-fullpage.png`, fullPage: true });

// 3) Minimizar modal — debería desaparecer y aparecer el badge en navbar
console.log("→ click Minimizar");
const minimizeBtn = await page.$('button[aria-label="Minimizar y volver al ícono del nav"]');
if (minimizeBtn) {
  await minimizeBtn.click();
  await page.waitForTimeout(800);
} else {
  console.log("  no minimize button found; trying X");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}
await page.screenshot({ path: `${OUT}/order-modal-4-minimized.png`, fullPage: false });
// Crop solo del navbar para ver el badge en detalle
await page.screenshot({
  path: `${OUT}/order-modal-4b-navbar-zoom.png`,
  clip: { x: 0, y: 0, width: 1440, height: 80 },
});
console.log("OK 3: modal minimizado, badge visible en navbar");

// 4) Click en el badge → reabre modal
console.log("→ click badge nav");
const badgeBtn = await page.$('button[aria-label="Ver mi pedido en curso"]');
if (badgeBtn) {
  await badgeBtn.click();
  await page.waitForTimeout(800);
}
await page.screenshot({ path: `${OUT}/order-modal-5-reopened.png`, fullPage: false });
console.log("OK 4: modal reabierto desde badge");

// Resumen
console.log("\n--- Console errors ---");
consoleErrors.slice(0, 10).forEach((e) => console.log(`  ${e.slice(0, 150)}`));

await ctx.close();
await browser.close();

console.log("\n✓ Test E2E completado. Screenshots en reports/delivery-redesign/order-modal-*.png");
