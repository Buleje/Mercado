/**
 * Live REAL purchase — usa productos REALES de la DB para que el POST a
 * /api/marketplace/orders sea 200 y aparezca el modal de éxito.
 *
 * Strategy:
 *  1. Fetch real products from /api/marketplace/catalog?storeSlug=mi-pollo
 *  2. Inject them into the cart with REAL storeProductId + productId
 *  3. Pre-populate customer + address
 *  4. Navigate to /checkout/confirmar
 *  5. Click "Confirmar pedido" — POST should return 200
 *  6. Verify redirect to /tiendas + modal de éxito visible
 */
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: false,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
  args: ["--auto-open-devtools-for-tabs", "--no-sandbox", "--disable-dev-shm-usage"],
  slowMo: 200,
});

const ctx = await browser.newContext({ viewport: null });
await ctx.addInitScript(() => {
  ["browser-tour-completed", "marketplace-tour-completed", "buleje-tour-seen"].forEach((k) =>
    localStorage.setItem(k, "1"),
  );
  const removeTour = () => {
    document
      .querySelectorAll('[role="dialog"][aria-labelledby*="tour"]')
      .forEach((el) => el.remove());
    document.querySelectorAll('[data-tour-overlay]').forEach((el) => el.remove());
  };
  removeTour();
  if (document.body) new MutationObserver(removeTour).observe(document.body, { childList: true, subtree: true });
});

const page = await ctx.newPage();

const navTrace = [];
page.on("framenavigated", (f) => {
  if (f === page.mainFrame()) {
    const path = new URL(f.url()).pathname;
    navTrace.push(path);
    console.log(`  [nav] → ${path}`);
  }
});

page.on("response", async (res) => {
  if (res.url().includes("/api/marketplace/orders") && res.request().method() === "POST") {
    const status = res.status();
    let bodyText = "";
    try {
      bodyText = (await res.text()).slice(0, 300);
    } catch {}
    console.log(`  [POST orders ${status}] ${bodyText}`);
  }
});

console.log("\n=== LIVE REAL PURCHASE — productos reales de Mi Pollo ===\n");

// 1. Fetch productos reales
console.log("→ Fetching productos reales de Mi Pollo");
const products = await fetch("http://localhost:3000/api/marketplace/catalog?storeSlug=mi-pollo&limit=3")
  .then((r) => r.json())
  .then((d) => d.data || []);
console.log(`  ${products.length} productos encontrados:`);
products.forEach((p) => console.log(`    - ${p.name} (S/${p.price}) [storeProductId=${p.storeProductId}]`));

// 2. Setup browser con cart real
console.log("\n→ Setup: cart con productos reales + customer + address");
await page.goto("http://localhost:3000/marketplace", { waitUntil: "domcontentloaded" });

await page.evaluate((products) => {
  const cart = {
    items: products.map((p) => ({
      storeId: p.storeId,
      storeSlug: p.storeSlug,
      storeName: p.storeName,
      storeProductId: p.storeProductId,
      productId: p.productId,
      name: p.name,
      price: Number(p.price),
      quantity: 1,
      image: p.image || null,
      unit: p.unit || "uni",
    })),
  };
  localStorage.setItem("marketplace-cart", JSON.stringify(cart));

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
  localStorage.setItem(
    "marketplace-checkout-payment",
    JSON.stringify({ method: "efectivo", cashAmount: "" }),
  );
}, products);

await page.waitForTimeout(1500);

// 3. Navegar a /checkout/confirmar
console.log("\n→ Navegar a /checkout/confirmar");
await page.goto("http://localhost:3000/checkout/confirmar", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

if (!page.url().includes("/confirmar")) {
  console.log(`✗ rebotó a ${page.url()}. Trace: ${navTrace.join(" → ")}`);
  await ctx.close();
  await browser.close();
  process.exit(1);
}

// 4. Click confirmar
console.log("\n→ Click 'Confirmar pedido' — MIRA EL BROWSER");
const confirmBtn = await page.$('button:has-text("Confirmar pedido")');
if (confirmBtn) {
  try { await confirmBtn.scrollIntoViewIfNeeded({ timeout: 5000 }); } catch {}
  await confirmBtn.click({ force: true });
}

console.log("  Esperando POST + redirect (8s)...");
await page.waitForTimeout(8000);

console.log(`\n→ URL final: ${page.url()}`);
console.log(`→ Nav trace: ${navTrace.join(" → ")}`);

const onTiendas = page.url().includes("/tiendas");
console.log(`→ ${onTiendas ? "✓" : "✗"} Llegó a /tiendas`);

// Verificar si el modal de éxito está visible
const modalVisible = await page.evaluate(() => {
  const modal = document.querySelector('[role="dialog"][aria-labelledby="order-success-title"]');
  return modal !== null;
});
console.log(`→ ${modalVisible ? "✓ ✓ ✓" : "✗"} Modal de éxito visible`);

if (modalVisible) {
  console.log("\n   ¡FLUJO REAL COMPLETO! El modal está abierto en tu browser.");
  console.log("   Probá click en 'Minimizar' y verá el badge en navbar.\n");
}

console.log("Browser sigue abierto. Cierra cuando quieras.\n");

await new Promise((resolve) => {
  browser.on("disconnected", resolve);
  process.on("SIGINT", () => browser.close().then(resolve));
});
