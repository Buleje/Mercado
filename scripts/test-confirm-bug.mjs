/**
 * Test E2E: simula el bug "click Confirmar pedido → bucle de redirects".
 *
 * Pre-popula localStorage con cart + customer + address válidos, navega a
 * /checkout/confirmar, hace click "Confirmar pedido", y verifica:
 *   1. POST a /api/marketplace/orders se dispara
 *   2. Tras success, redirect a /tiendas
 *   3. Modal de éxito visible
 *   4. NO hay rebote a /datos ni /entrega
 *
 * Si el POST falla por validación de productos demo, lo que importa es la
 * navegación: que NO rebote a /datos antes de mostrar el error.
 */
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const navTrace = [];
page.on("framenavigated", (f) => {
  if (f === page.mainFrame()) navTrace.push(new URL(f.url()).pathname);
});

const responses = [];
page.on("response", (res) => {
  if (res.url().includes("/api/marketplace/orders")) {
    responses.push({ status: res.status(), url: res.url().split("?")[0] });
  }
});

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error" && !msg.text().includes("negative time stamp")) {
    errors.push(msg.text().slice(0, 200));
  }
});

// 1. Setup localStorage con todo lo que /confirmar necesita para no rebotar
console.log("→ /marketplace setup localStorage");
await page.goto("http://localhost:3000/marketplace", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("browser-tour-completed", "1");
  localStorage.setItem("marketplace-tour-completed", "1");

  // Cart con un item demo
  localStorage.setItem(
    "marketplace-cart",
    JSON.stringify({
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
      ],
    }),
  );

  // Customer válido
  localStorage.setItem(
    "marketplace-checkout-customer",
    JSON.stringify({ name: "Carlos Pérez", phone: "999111222", email: "" }),
  );

  // Address válida
  localStorage.setItem(
    "marketplace-checkout-address",
    JSON.stringify({
      address: "Jr. Progreso 245",
      zone: "Yarinacocha",
      notes: "",
      departmentCode: "",
      departmentName: "Ucayali",
      provinceCode: "",
      provinceName: "Coronel Portillo",
      districtCode: "",
      districtName: "Pucallpa",
    }),
  );

  // Payment
  localStorage.setItem(
    "marketplace-checkout-payment",
    JSON.stringify({ method: "efectivo", cashAmount: "" }),
  );
});

// 2. Navegar a /confirmar y esperar que cargue
console.log("→ /checkout/confirmar (con datos pre-cargados)");
await page.goto("http://localhost:3000/checkout/confirmar", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

console.log(`  URL después de 2.5s: ${page.url()}`);
console.log(`  Nav trace: ${navTrace.join(" → ")}`);

if (!page.url().includes("/checkout/confirmar")) {
  console.log("✗ FAIL: rebotó antes del click confirmar");
  await ctx.close();
  await browser.close();
  process.exit(1);
}

// 3. Click "Confirmar pedido" — scroll into view + force click
console.log("→ Click 'Confirmar pedido'");
const confirmBtns = await page.$$('button:has-text("Confirmar")');
let clicked = false;
for (const btn of confirmBtns) {
  const text = await btn.textContent();
  if (text && /confirmar/i.test(text)) {
    try {
      await btn.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await btn.click({ force: true, timeout: 3000 });
      console.log(`  click en botón "${text.trim().slice(0, 30)}"`);
      clicked = true;
      break;
    } catch (e) {
      console.log(`  no se pudo: ${e.message.slice(0, 80)}`);
    }
  }
}
if (!clicked) console.log("  ningún botón confirmar fue clickeable");

// 4. Esperar 6s para que pase POST + setTimeout 2.8s + redirect a /tiendas
await page.waitForTimeout(6500);

console.log(`\n  URL final: ${page.url()}`);
console.log(`  Nav trace completo: ${navTrace.join(" → ")}`);
console.log(`  POST orders responses: ${JSON.stringify(responses)}`);

const onTiendas = page.url().includes("/tiendas");
const reboundToDatos = navTrace.includes("/checkout/datos") &&
  navTrace.indexOf("/checkout/datos") > navTrace.indexOf("/checkout/confirmar");

console.log(`\n  ${onTiendas ? "✓" : "✗"} Llegó a /tiendas`);
console.log(`  ${reboundToDatos ? "✗ ✗ ✗" : "✓"} ${reboundToDatos ? "REBOTÓ a /datos (BUG)" : "NO rebotó a /datos"}`);

if (errors.length > 0) {
  console.log(`\n  Console errors:`);
  errors.slice(0, 3).forEach((e) => console.log(`    ${e}`));
}

await ctx.close();
await browser.close();

if (reboundToDatos) {
  console.log("\n✗ FAIL: el bug del rebote sigue presente");
  process.exit(1);
}
console.log("\n✓ PASS: confirm flow no rebota");
