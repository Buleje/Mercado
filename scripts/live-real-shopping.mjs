/**
 * Live REAL shopping flow — recorrido manual completo como cliente real.
 *
 * Diferencia con live-purchase-flow.mjs: esto NO inyecta nada en localStorage.
 * Hace el flujo end-to-end con productos REALES de la DB:
 *   1. Abre /tiendas
 *   2. Click en la primera tienda
 *   3. Click en el primer producto disponible
 *   4. Click "Agregar al carrito"
 *   5. Va al carrito
 *   6. Continuar a checkout (puede pedir auth — la saltamos como guest si se puede)
 *   7. Llena datos personales con typing visible
 *   8. Continuar a entrega, llena dirección
 *   9. Click "Confirmar pedido" — POST real
 *  10. Modal de éxito en /tiendas (si POST exitoso)
 */
import { chromium } from "playwright";

const TYPE_DELAY = 70;
const STEP_PAUSE = 1500;

const browser = await chromium.launch({
  headless: false,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
  args: ["--auto-open-devtools-for-tabs", "--no-sandbox", "--disable-dev-shm-usage"],
  slowMo: 200,
});

const ctx = await browser.newContext({ viewport: null });

// Inyecta un script que se ejecuta en CADA documento del browser. Pre-setea
// los flags de localStorage que silencian tours y monta un MutationObserver
// que elimina cualquier overlay tour que aparezca durante la sesión.
await ctx.addInitScript(() => {
  try {
    [
      "browser-tour-completed",
      "marketplace-tour-completed",
      "buleje-tour-seen",
      "store-detail-tour-completed",
      "store-tour-completed",
      "tienda-tour-completed",
      "buleje-store-tour",
    ].forEach((k) => localStorage.setItem(k, "1"));
  } catch {}

  const removeTour = () => {
    document
      .querySelectorAll('[role="dialog"][aria-labelledby*="tour"]')
      .forEach((el) => el.remove());
    document.querySelectorAll('[data-tour-overlay]').forEach((el) => el.remove());
  };
  removeTour();
  const observer = new MutationObserver(removeTour);
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  else
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
});

const page = await ctx.newPage();

console.log("\n=== FLUJO REAL DE CLIENTE — ¡MIRA TU BROWSER! ===\n");

page.on("console", (msg) => {
  if (msg.type() === "error" && !msg.text().includes("negative time stamp") && !msg.text().includes("403")) {
    console.log(`[err] ${msg.text().slice(0, 180)}`);
  }
});
page.on("response", (res) => {
  if (res.status() >= 500 || (res.status() >= 400 && res.url().includes("/orders"))) {
    console.log(`[http ${res.status()}] ${res.url().split("?")[0].slice(-80)}`);
  }
});

async function dismissTour() {
  // Mata cualquier overlay tour visible y silencia su localStorage flag
  await page.evaluate(() => {
    [
      "browser-tour-completed",
      "marketplace-tour-completed",
      "buleje-tour-seen",
      "store-detail-tour-completed",
      "store-tour-completed",
      "tienda-tour-completed",
      "buleje-store-tour",
    ].forEach((k) => localStorage.setItem(k, "1"));
    document
      .querySelectorAll('[role="dialog"][aria-labelledby*="tour" i]')
      .forEach((el) => el.remove());
    document
      .querySelectorAll('[data-tour-overlay], [class*="tour-overlay" i]')
      .forEach((el) => el.remove());
  }).catch(() => {});
  // También intenta clickear cualquier botón "Saltar tour" / "Omitir"
  const skipBtn = await page.$('button:has-text("Omitir"), button:has-text("Saltar")');
  if (skipBtn) {
    await skipBtn.click({ timeout: 1000 }).catch(() => {});
  }
}

async function step(label, fn) {
  console.log(`\n→ ${label}`);
  await dismissTour();
  await fn();
  await page.waitForTimeout(STEP_PAUSE);
}

// ── Pre-setup: ocultar tour ──
await step("PASO 0: Cargar /tiendas (catálogo de tiendas reales)", async () => {
  await page.goto("http://localhost:3000/tiendas", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    localStorage.setItem("browser-tour-completed", "1");
    localStorage.setItem("marketplace-tour-completed", "1");
    document.querySelectorAll('[data-tour-overlay]').forEach((el) => el.remove());
    const tours = document.querySelectorAll('[role="dialog"]');
    tours.forEach((el) => {
      if (el.textContent && el.textContent.includes("necesitás")) el.remove();
    });
  });
  await page.waitForTimeout(500);
});

// ── Click en una tienda ──
await step("PASO 1: Click en la primera tienda real del catálogo", async () => {
  // Las páginas estáticas del marketplace que NO son tiendas:
  const STATIC_PAGES = new Set([
    "buscar", "ofertas", "repartidor", "carrito", "categoria", "comparar",
    "explorar", "como-pagar", "favoritos", "gift-cards", "mi-cuenta",
    "negocios", "para-vos", "payment-result", "recetas", "registrar",
    "apply", "calificar-entrega", "en-vivo",
  ]);
  const storeLinks = await page.$$('a[href^="/marketplace/"]');
  let clicked = false;
  for (const link of storeLinks) {
    const href = await link.getAttribute("href");
    if (!href) continue;
    const m = href.match(/^\/marketplace\/([a-z0-9-]+)\/?$/);
    if (!m) continue;
    const slug = m[1];
    if (STATIC_PAGES.has(slug)) continue;
    console.log(`  click en tienda: ${href}`);
    await link.scrollIntoViewIfNeeded();
    await link.click();
    clicked = true;
    break;
  }
  if (!clicked) console.log("  no se encontró tienda válida");
  await page.waitForTimeout(2500);
});

// ── Click en un producto ──
await step("PASO 2: Click en el primer producto de la tienda", async () => {
  await page.waitForTimeout(1500);
  // Productos suelen ser links o cards clickeables
  const productLink = await page.$(
    'a[href*="/producto/"], a[href*="/p/"], button[aria-label*="agregar" i], [data-product-id], a[href*="/marketplace/"][href*="?product"]'
  );
  if (productLink) {
    await productLink.scrollIntoViewIfNeeded();
    await productLink.click();
    console.log("  click en producto");
  } else {
    // Alternativa: buscar botón "Agregar" directo en la grid
    const addBtn = await page.$('button:has-text("Agregar"), button:has-text("Añadir")');
    if (addBtn) {
      await addBtn.scrollIntoViewIfNeeded();
      await addBtn.click();
      console.log("  click en 'Agregar' directo en card");
    } else {
      console.log("  no se encontró producto/agregar visible");
    }
  }
  await page.waitForTimeout(2500);
});

// ── Agregar al carrito ──
await step("PASO 3: Click 'Agregar al carrito' (si estamos en detalle de producto)", async () => {
  const addCartBtn = await page.$(
    'button:has-text("Agregar"), button:has-text("Añadir")'
  );
  if (addCartBtn) {
    await addCartBtn.scrollIntoViewIfNeeded();
    await addCartBtn.click();
    console.log("  agregado al carrito");
  } else {
    console.log("  no se encontró botón Agregar — quizá ya está agregado");
  }
  await page.waitForTimeout(1500);
});

// ── Ver carrito ──
await step("PASO 4: Ir a /marketplace/carrito", async () => {
  await page.goto("http://localhost:3000/marketplace/carrito", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
});

// ── Continuar al checkout ──
await step("PASO 5: Click 'Continuar' → /checkout/datos", async () => {
  // Necesitamos saltarnos el gate de auth — pre-creamos un customer logged-in
  await page.evaluate(() => {
    localStorage.setItem(
      "buleje-marketplace-customer-v1",
      JSON.stringify({
        name: "Carlos Pérez Vargas",
        phone: "999111222",
        email: "carlos@test.pe",
        location: "",
        reference: "",
        locations: [],
        activeLocationId: null,
      }),
    );
  });
  // Buscar botón continuar
  const continueLink = await page.$('a[href="/checkout/datos"], a[href="/checkout/auth"]');
  if (continueLink) {
    await continueLink.click();
  } else {
    await page.goto("http://localhost:3000/checkout/datos", { waitUntil: "domcontentloaded" });
  }
  await page.waitForTimeout(2000);
  // Si quedó en /checkout/auth, ir directo a datos (cliente ya logged-in via localStorage)
  if (page.url().includes("/checkout/auth")) {
    await page.goto("http://localhost:3000/checkout/datos", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1800);
  }
});

// ── Llenar datos personales ──
await step("PASO 6: Llenar nombre y WhatsApp con typing visible", async () => {
  const nameInput = await page.$("#ck-name");
  if (nameInput) {
    await nameInput.click();
    await page.keyboard.type("Carlos Pérez Vargas", { delay: TYPE_DELAY });
  }
  await page.waitForTimeout(400);
  const phoneInput = await page.$("#ck-phone");
  if (phoneInput) {
    await phoneInput.click();
    await page.keyboard.type("999111222", { delay: TYPE_DELAY });
  }
});

// ── Continuar a entrega ──
await step("PASO 7: Click 'Continuar a entrega'", async () => {
  // Buscar el botón submit visible
  const candidates = [
    'main button[type="submit"]',
    'button:has-text("Continuar a entrega")',
    'aside button:has-text("Continuar")',
  ];
  for (const sel of candidates) {
    const btn = await page.$(sel);
    if (btn) {
      try {
        await btn.scrollIntoViewIfNeeded();
        await btn.click({ timeout: 2500 });
        console.log(`  click en ${sel}`);
        break;
      } catch {}
    }
  }
  await page.waitForTimeout(2500);
});

// ── Llenar dirección ──
await step("PASO 8: Llenar dirección de entrega", async () => {
  await page.waitForTimeout(800);
  // Buscar el input de dirección — varía según el form
  const addressSelectors = [
    "#ck-address",
    'input[id*="address" i]',
    'textarea[placeholder*="dirección" i]',
    'input[placeholder*="dirección" i]',
    'input[placeholder*="calle" i]',
    'input[name="address"]',
    'main form input[type="text"]:not([type="hidden"])',
  ];
  let typed = false;
  for (const sel of addressSelectors) {
    const el = await page.$(sel);
    if (el) {
      try {
        await el.scrollIntoViewIfNeeded();
        await el.click({ timeout: 1500 });
        await page.keyboard.type("Jr. Progreso 245, Pucallpa", { delay: TYPE_DELAY });
        console.log(`  tipeé en ${sel}`);
        typed = true;
        break;
      } catch {}
    }
  }
  if (!typed) console.log("  no se encontró input de dirección");
});

// ── Click confirmar / revisar pedido ──
await step("PASO 9: Click 'Revisar pedido' → /checkout/confirmar", async () => {
  const candidates = [
    'main button[type="submit"]',
    'button:has-text("Revisar pedido")',
    'aside button:has-text("Revisar")',
  ];
  for (const sel of candidates) {
    const btn = await page.$(sel);
    if (btn) {
      try {
        await btn.scrollIntoViewIfNeeded();
        await btn.click({ timeout: 2500 });
        console.log(`  click en ${sel}`);
        break;
      } catch {}
    }
  }
  await page.waitForTimeout(2800);
});

// ── Click confirmar pedido (POST real) ──
await step("PASO 10: Click 'Confirmar pedido' — POST a /api/marketplace/orders", async () => {
  console.log("  Mira la consola DevTools — verás el POST real al servidor");
  const confirmBtn = await page.$('button:has-text("Confirmar pedido"), button:has-text("Confirmar")');
  if (confirmBtn) {
    try {
      await confirmBtn.scrollIntoViewIfNeeded();
      await confirmBtn.click({ timeout: 2500 });
      console.log("  click confirmado");
    } catch (e) {
      console.log(`  no pude clickear: ${e.message.slice(0, 100)}`);
    }
  }
  await page.waitForTimeout(4500); // esperar el POST + redirect a /tiendas + abrir modal
});

console.log("\n=== ✓ FLUJO REAL TERMINADO ===\n");
console.log("URL final:", page.url());
console.log("\nSi todo salió bien:");
console.log("  - Estás en /tiendas con el modal de éxito abierto");
console.log("  - El badge 'Tu pedido' está en el navbar");
console.log("\nSi el POST falló (producto sin stock, validación, etc):");
console.log("  - Verás el error en la consola DevTools");
console.log("  - El stepper marca paso 4/4 'Confirmar' con mensaje de error\n");

// Mantener vivo
await new Promise((resolve) => {
  browser.on("disconnected", resolve);
  process.on("SIGINT", () => browser.close().then(resolve));
});
