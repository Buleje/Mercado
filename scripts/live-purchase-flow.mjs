/**
 * Live purchase flow — recorre el flujo completo de compra paso a paso.
 *
 * El usuario ve cada paso en tiempo real con delays entre acciones para
 * poder seguir lo que está pasando.
 *
 * Pasos:
 *   1. Abre /marketplace
 *   2. Inyecta items al cart (saltea búsqueda de producto que requiere DB)
 *   3. Va a /marketplace/carrito
 *   4. Continúa a /checkout/datos
 *   5. Llena nombre + teléfono (typing visible)
 *   6. Continuar a /checkout/entrega
 *   7. Llena dirección
 *   8. Continuar a /checkout/confirmar
 *   9. Click "Confirmar pedido" (el POST puede fallar — backup: inyectamos
 *      snapshot del pedido y vamos a /tiendas)
 *  10. Modal de éxito aparece en /tiendas
 *  11. Minimizar → ver badge en navbar
 *  12. Reabrir desde el badge
 */
import { chromium } from "playwright";

const STEP_DELAY = 2000;   // ms entre pasos para que veas cada acción
const TYPE_DELAY = 80;     // ms entre teclas para typing visible

const browser = await chromium.launch({
  headless: false,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
  args: ["--auto-open-devtools-for-tabs", "--no-sandbox", "--disable-dev-shm-usage"],
  slowMo: 250, // pausa 250ms entre cada acción Playwright para visibilidad
});

const ctx = await browser.newContext({ viewport: null });
const page = await ctx.newPage();

console.log("\n=== LIVE PURCHASE FLOW ===\n");
console.log("Mira la ventana de Chromium en tu Windows. Voy a recorrer el flujo.\n");

// Capturar errores en vivo
page.on("console", (msg) => {
  if (msg.type() === "error" && !msg.text().includes("negative time stamp")) {
    console.log(`[browser error] ${msg.text().slice(0, 200)}`);
  }
});
page.on("pageerror", (err) => console.log(`[pageerror] ${err.message.slice(0, 200)}`));

async function step(label, fn) {
  console.log(`\n→ ${label}`);
  await fn();
  await page.waitForTimeout(STEP_DELAY);
}

// ── Step 0: marketplace home + setup ──
await step("PASO 0: Cargar /marketplace y desactivar tour", async () => {
  await page.goto("http://localhost:3000/marketplace", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("browser-tour-completed", "1");
    localStorage.setItem("marketplace-tour-completed", "1");
    localStorage.setItem("buleje-tour-seen", "1");
    document.querySelectorAll('[data-tour-overlay]').forEach((el) => el.remove());
    const tours = document.querySelectorAll('[role="dialog"]');
    tours.forEach((el) => {
      if (el.textContent && el.textContent.includes("necesitás")) el.remove();
    });
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    document.querySelectorAll('[data-tour-overlay]').forEach((el) => el.remove());
    const tours = document.querySelectorAll('[role="dialog"]');
    tours.forEach((el) => {
      if (el.textContent && el.textContent.includes("necesitás")) el.remove();
    });
  });
});

// ── Step 1: agregar items al cart ──
await step("PASO 1: Agregar productos al carrito (3 items, S/ 87.50)", async () => {
  await page.evaluate(() => {
    const cart = {
      items: [
        {
          storeId: "main",
          storeSlug: "main",
          storeName: "Bodega San Martín",
          storeProductId: "demo-101",
          productId: 999101,
          name: "Arroz Costeño 5kg",
          price: 25.5,
          quantity: 2,
          image: null,
          unit: "uni",
        },
        {
          storeId: "main",
          storeSlug: "main",
          storeName: "Bodega San Martín",
          storeProductId: "demo-102",
          productId: 999102,
          name: "Aceite Primor 1L",
          price: 12.5,
          quantity: 1,
          image: null,
          unit: "uni",
        },
        {
          storeId: "main",
          storeSlug: "main",
          storeName: "Bodega San Martín",
          storeProductId: "demo-103",
          productId: 999103,
          name: "Detergente Bolívar 2.6kg",
          price: 24,
          quantity: 1,
          image: null,
          unit: "uni",
        },
      ],
    };
    localStorage.setItem("marketplace-cart", JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent("marketplace-cart-update", { detail: cart }));
  });
});

// ── Step 2: navegar a carrito ──
await step("PASO 2: Ir a /marketplace/carrito", async () => {
  await page.goto("http://localhost:3000/marketplace/carrito", { waitUntil: "domcontentloaded" });
});

// ── Step 3: continuar a datos ──
await step("PASO 3: Click en 'Continuar' para ir a /checkout/datos", async () => {
  // Pre-seteamos un customer logged-in para saltar el modal de auth
  await page.evaluate(() => {
    localStorage.setItem(
      "buleje-marketplace-customer-v1",
      JSON.stringify({
        name: "",
        phone: "",
        email: "",
      }),
    );
  });
  await page.goto("http://localhost:3000/checkout/datos", { waitUntil: "domcontentloaded" });
});

// ── Step 4: llenar datos personales ──
await step("PASO 4: Llenar nombre y WhatsApp (typing visible)", async () => {
  const nameInput = await page.$("#ck-name");
  if (nameInput) {
    await nameInput.click();
    await page.keyboard.type("Carlos Pérez Vargas", { delay: TYPE_DELAY });
  }
  await page.waitForTimeout(500);
  const phoneInput = await page.$("#ck-phone");
  if (phoneInput) {
    await phoneInput.click();
    await page.keyboard.type("999111222", { delay: TYPE_DELAY });
  }
});

// ── Step 5: continuar a entrega ──
await step("PASO 5: Click 'Continuar a entrega'", async () => {
  // Buscamos el botón submit del form (mobile) o el del summary (desktop)
  const continueBtn = await page.$('button[type="submit"]');
  if (continueBtn) await continueBtn.click();
  // Si el botón está en el summary
  const summaryBtn = await page.$('aside button:has-text("Continuar")');
  if (summaryBtn) {
    try {
      await summaryBtn.click({ timeout: 1500 });
    } catch {}
  }
});

// ── Step 6: llenar dirección ──
await step("PASO 6: Llenar dirección (typing visible)", async () => {
  await page.waitForTimeout(1500);
  // Buscar el input de address — puede ser textarea o input
  const addressInput = await page
    .$('textarea[placeholder*="dirección" i], input[id*="address" i], input[placeholder*="dirección" i], input[placeholder*="calle" i]');
  if (addressInput) {
    await addressInput.click();
    await page.keyboard.type("Jr. Progreso 245, Pucallpa", { delay: TYPE_DELAY });
  } else {
    console.log("  (campo dirección no encontrado; intentando primer input visible del form)");
    const firstInput = await page.$('main form input[type="text"], main form input:not([type="hidden"]):not([type="submit"])');
    if (firstInput) {
      await firstInput.click();
      await page.keyboard.type("Jr. Progreso 245, Pucallpa", { delay: TYPE_DELAY });
    }
  }
});

// ── Step 7: confirmar (saltamos POST real e inyectamos snapshot) ──
await step("PASO 7: Saltar POST real → inyectar pedido confirmado y ir a /tiendas", async () => {
  console.log("  (En vivo el POST a /api/marketplace/orders falla por validación de productos");
  console.log("   — para demostrar el modal de éxito inyectamos el snapshot directo.)");
  await page.evaluate(() => {
    const snapshot = {
      orderIds: ["abc123XYZ"],
      ts: Date.now(),
      autoOpen: true,
      customer: { name: "Carlos Pérez Vargas", phone: "999111222" },
      address: {
        line: "Jr. Progreso 245, Pucallpa",
        district: "Pucallpa",
        province: "Coronel Portillo",
        department: "Ucayali",
        notes: "Casa amarilla con portón blanco",
      },
      total: 87.5,
      items: [
        { productId: 999101, name: "Arroz Costeño 5kg", price: 25.5, quantity: 2, imageUrl: "", storeName: "Bodega San Martín", storeSlug: "main" },
        { productId: 999102, name: "Aceite Primor 1L", price: 12.5, quantity: 1, imageUrl: "", storeName: "Bodega San Martín", storeSlug: "main" },
        { productId: 999103, name: "Detergente Bolívar 2.6kg", price: 24, quantity: 1, imageUrl: "", storeName: "Bodega San Martín", storeSlug: "main" },
      ],
      storeNames: ["Bodega San Martín"],
    };
    localStorage.setItem("marketplace-last-order", JSON.stringify(snapshot));
    // Vaciar cart
    localStorage.setItem("marketplace-cart", JSON.stringify({ items: [] }));
    window.dispatchEvent(new CustomEvent("marketplace-cart-update", { detail: { items: [] } }));
  });
  await page.goto("http://localhost:3000/tiendas", { waitUntil: "domcontentloaded" });
});

// ── Step 8: ver modal de éxito ──
await step("PASO 8: Modal de éxito apareció automáticamente", async () => {
  await page.waitForTimeout(2500); // esperar que cargue el mapa
  console.log("  Verifica:");
  console.log("    - Hero teal con '¡Listo, Carlos!'");
  console.log("    - Mapa Leaflet centrado en la dirección");
  console.log("    - 3 items con cantidades y subtotales");
  console.log("    - Datos del cliente con WhatsApp + Llamar");
});

await page.waitForTimeout(3500);

// ── Step 9: minimizar modal ──
await step("PASO 9: Click 'Minimizar' — modal cierra, badge aparece en nav", async () => {
  const minBtn = await page.$('button[aria-label="Minimizar y volver al ícono del nav"]');
  if (minBtn) await minBtn.click();
  else {
    const minTextBtn = await page.$('button:has-text("Minimizar")');
    if (minTextBtn) await minTextBtn.click();
  }
  console.log("  Mira el navbar: el pill teal 'Tu pedido · 4' está pulsando.");
});

// ── Step 10: reabrir desde el badge ──
await step("PASO 10: Click en el badge del nav — modal vuelve a aparecer", async () => {
  const badge = await page.$('button[aria-label="Ver mi pedido en curso"]');
  if (badge) await badge.click();
});

console.log("\n=== ✓ FLUJO COMPLETO ===\n");
console.log("El browser sigue abierto para que sigas explorando.");
console.log("La consola DevTools (panel derecho) tiene todos los logs.");
console.log("Cuando termines de revisar, cierra la ventana de Chromium o presiona Ctrl+C aquí.\n");

await new Promise((resolve) => {
  browser.on("disconnected", resolve);
  process.on("SIGINT", () => {
    console.log("\nCerrando browser...");
    browser.close().then(resolve);
  });
});

console.log("Browser cerrado.");
process.exit(0);
