/**
 * Live browser — abre Chromium con WSLg en modo visible para que el usuario
 * pueda ver el flujo en vivo. Mantiene el browser abierto hasta Ctrl+C o
 * que cierre la ventana manualmente.
 *
 * Captura console.error / console.warn / pageerror y los imprime en el
 * terminal — útil para diagnosticar lo que el usuario reportaba.
 *
 * Pre-popula localStorage con un snapshot de pedido para que el modal de
 * éxito aparezca al cargar /tiendas.
 */
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: false,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
  args: [
    "--auto-open-devtools-for-tabs",
    "--no-sandbox",
    "--disable-dev-shm-usage",
  ],
});

const ctx = await browser.newContext({ viewport: null });
const page = await ctx.newPage();

console.log("\n=== Live browser abierto con DevTools ===\n");
console.log("La ventana de Chromium se abrió en tu Windows vía WSLg.");
console.log("La consola está abierta a la derecha — ahí verás errores y logs en tiempo real.\n");

page.on("console", (msg) => {
  const t = msg.type();
  if (t === "error" || t === "warning") {
    console.log(`[browser ${t}] ${msg.text().slice(0, 250)}`);
  }
});
page.on("pageerror", (err) => {
  console.log(`[pageerror] ${err.message.slice(0, 250)}`);
});
page.on("requestfailed", (req) => {
  const url = req.url();
  if (url.includes("/_next") || url.includes("favicon")) return;
  console.log(`[fail] ${req.method()} ${url} :: ${req.failure()?.errorText ?? "?"}`);
});
page.on("response", (res) => {
  if (res.status() >= 400 && !res.url().includes("/_next/")) {
    console.log(`[http ${res.status()}] ${res.url()}`);
  }
});

// Pre-poblar el snapshot del último pedido y datos del checkout
await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  // Snapshot de pedido recién confirmado (auto-open del modal en /tiendas)
  const snapshot = {
    orderIds: ["abc123XYZ", "def456ABC"],
    ts: Date.now(),
    autoOpen: true,
    customer: { name: "Carlos Pérez Vargas", phone: "999111222" },
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

  // También pre-popular datos del checkout para que puedas navegar el flujo
  // sin romperte filling forms
  localStorage.setItem(
    "marketplace-checkout-customer",
    JSON.stringify({ name: "Carlos Pérez Vargas", phone: "999111222", email: "" }),
  );
  localStorage.setItem(
    "marketplace-checkout-address",
    JSON.stringify({
      address: "Jr. Progreso 245, Pucallpa",
      zone: "Yarinacocha",
      notes: "Casa amarilla con portón blanco",
      departmentCode: "",
      departmentName: "Ucayali",
      provinceCode: "",
      provinceName: "Coronel Portillo",
      districtCode: "",
      districtName: "Pucallpa",
    }),
  );

  // Tour completado para no obstruir
  localStorage.setItem("browser-tour-completed", "1");
  localStorage.setItem("marketplace-tour-completed", "1");
});

console.log("→ Cargando /tiendas con snapshot del pedido (modal abrirá automáticamente)\n");
await page.goto("http://localhost:3000/tiendas", { waitUntil: "domcontentloaded" });

console.log("✓ Listo. El modal de éxito debería estar visible.");
console.log("Lo que puedes hacer ahora en la ventana del browser:\n");
console.log("  1. Ver el modal de éxito con mapa, items, cliente.");
console.log("  2. Click en 'Minimizar' (o el botón – arriba derecha del modal).");
console.log("  3. Ver el badge teal 'Tu pedido · 4' en el navbar (con animación pulse).");
console.log("  4. Click en el badge para reabrir el modal.");
console.log("  5. Navegar a /marketplace, /marketplace/buscar, etc — el badge sigue.");
console.log("  6. La consola DevTools (panel a la derecha) te muestra los errores en vivo.\n");
console.log("Para cerrar: cierra la ventana del browser O presiona Ctrl+C aquí.\n");

// Mantener el script vivo hasta que el browser se cierre
await new Promise((resolve) => {
  browser.on("disconnected", resolve);
  process.on("SIGINT", () => {
    console.log("\nCerrando browser...");
    browser.close().then(resolve);
  });
});

console.log("Browser cerrado. Saliendo.");
process.exit(0);
