// Repro: ¿al agregar al carrito y cerrar el modal con X se pierde el producto?
import { chromium } from "playwright";

const URL = "http://localhost:3000/marketplace";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("buleje-tour-marketplace-2026-04", "done");
    localStorage.setItem("marketplace:welcome-coupon:v1", "dismissed");
    localStorage.setItem("onboarding-completed-main", "1");
    localStorage.removeItem("marketplace-cart");
  } catch {}
});
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);

const cartCount = () =>
  page.evaluate(() => {
    try {
      const raw = localStorage.getItem("marketplace-cart");
      if (!raw) return 0;
      const s = JSON.parse(raw);
      const items = s.items ?? s ?? [];
      return Array.isArray(items) ? items.reduce((a, i) => a + (i.quantity ?? 0), 0) : 0;
    } catch {
      return -1;
    }
  });

const before = await cartCount();

// Buscar el primer botón "Agregar ... al carrito" (UnifiedProductCard)
const addBtn = page.locator('button[aria-label^="Agregar"]').first();
const found = await addBtn.count().catch(() => 0);
if (!found) {
  console.log("NO se encontró botón Agregar — abortando");
  await browser.close();
  process.exit(0);
}
await addBtn.scrollIntoViewIfNeeded().catch(() => {});
await addBtn.click().catch((e) => console.log("click err", e.message));
await page.waitForTimeout(1200);

const afterAddBeforeClose = await cartCount();

// Capturar el modal abierto
await page.screenshot({ path: "reports/marketplace-qa/cart-modal-open.png" });

// Cerrar con la X (aria-label "Cerrar")
const xBtn = page.locator('button[aria-label="Cerrar"]').first();
const xFound = await xBtn.count().catch(() => 0);
if (xFound) {
  await xBtn.click().catch((e) => console.log("x click err", e.message));
  await page.waitForTimeout(800);
} else {
  console.log("NO se encontró botón X 'Cerrar'");
}

const afterClose = await cartCount();

console.log(JSON.stringify({ before, afterAddBeforeClose, afterClose }, null, 2));
console.log(
  afterClose > before
    ? "OK: el producto QUEDA en el carrito tras cerrar con X"
    : "BUG: el producto NO quedó en el carrito tras cerrar con X",
);
await browser.close();
