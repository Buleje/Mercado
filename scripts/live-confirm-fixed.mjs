/**
 * Live demo — bug "rebote a /datos" arreglado.
 *
 * Para que veas el fix funcionando:
 *  1. Abre browser con cart + customer + address válidos pre-cargados
 *  2. Va a /checkout/confirmar
 *  3. Click "Confirmar pedido"
 *  4. Si POST exitoso → toast paiche → redirect a /tiendas → modal éxito
 *  5. Si POST falla (productos demo) → muestra error en pantalla SIN rebotar
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

page.on("response", (res) => {
  if (res.url().includes("/api/marketplace/orders") && res.request().method() === "POST") {
    console.log(`  [POST orders] ${res.status()}`);
  }
});

console.log("\n=== DEMO BUG FIX: confirmar pedido NO rebota ===\n");

// Pre-cargar cart + customer + address
console.log("→ Setup: cart + customer + address en localStorage");
await page.goto("http://localhost:3000/marketplace", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem(
    "marketplace-cart",
    JSON.stringify({
      items: [{
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
      }],
    }),
  );
  localStorage.setItem(
    "marketplace-checkout-customer",
    JSON.stringify({ name: "Carlos Pérez", phone: "999111222", email: "" }),
  );
  localStorage.setItem(
    "marketplace-checkout-address",
    JSON.stringify({
      address: "Jr. Progreso 245, Pucallpa",
      zone: "Yarinacocha",
      notes: "Casa amarilla",
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
});

await page.waitForTimeout(1500);

console.log("\n→ Navegar a /checkout/confirmar");
await page.goto("http://localhost:3000/checkout/confirmar", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

console.log(`\n→ URL después de cargar: ${page.url()}`);
if (!page.url().includes("/confirmar")) {
  console.log("✗ rebotó antes de poder hacer click. Trace:", navTrace.join(" → "));
}

console.log("\n→ Click 'Confirmar pedido' (mira el browser)");
const confirmBtn = await page.$('button:has-text("Confirmar pedido")');
if (confirmBtn) {
  try {
    await confirmBtn.scrollIntoViewIfNeeded({ timeout: 5000 });
  } catch {}
  await confirmBtn.click({ force: true });
}

await page.waitForTimeout(7000);

console.log(`\n→ URL final: ${page.url()}`);
console.log(`→ Nav trace completo: ${navTrace.join(" → ")}`);
const reboundToDatos = navTrace.lastIndexOf("/checkout/datos") > navTrace.indexOf("/checkout/confirmar");
console.log(`→ Rebote a /datos: ${reboundToDatos ? "✗ SÍ (BUG)" : "✓ NO (FIX OK)"}`);

console.log("\nBrowser sigue abierto para que sigas mirando. Cierra cuando quieras.\n");

await new Promise((resolve) => {
  browser.on("disconnected", resolve);
  process.on("SIGINT", () => browser.close().then(resolve));
});
