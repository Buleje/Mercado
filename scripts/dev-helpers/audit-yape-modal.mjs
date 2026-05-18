import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "/home/usuario/proyectos/Mercado/reports/audit-tiendas-2026-05-18/screenshots";
mkdirSync(OUT, { recursive: true });

const CHROMIUM = "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome";
const BASE = "http://localhost:3000";
const TS = Date.now();

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });

// ── Storefront main SIN tour (dismiss localStorage) ───────────────────────
const ctxM = await browser.newContext({ ...devices["iPhone 14 Pro"], isMobile: true, hasTouch: true });
const page = await ctxM.newPage();

// Dismiss tour antes de navegar
await page.goto(`${BASE}/marketplace/main?_t=${TS}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2000);
// Cerrar tour si existe
try {
  const omitir = page.locator("text=Omitir tour");
  if (await omitir.isVisible({ timeout: 2000 })) {
    await omitir.click();
    await page.waitForTimeout(800);
  }
} catch {}
await page.screenshot({ path: `${OUT}/storefront_main_mobile_notour.png`, fullPage: false });
console.log("OK storefront_main_mobile_notour");

// Scroll a productos
await page.evaluate(() => window.scrollTo({ top: 400, behavior: "instant" }));
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/storefront_main_mobile_products_notour.png`, fullPage: false });
console.log("OK storefront_main_mobile_products_notour");

// Categories chips visible
await page.evaluate(() => window.scrollTo({ top: 200, behavior: "instant" }));
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/storefront_main_mobile_cats.png`, fullPage: false });
console.log("OK storefront_main_mobile_cats");

// Dark mode storefront sin tour
await page.evaluate(() => {
  document.documentElement.classList.add("dark");
  try { localStorage.setItem("theme", "dark"); } catch {}
});
await page.waitForTimeout(600);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/storefront_main_mobile_dark_notour.png`, fullPage: false });
console.log("OK storefront_main_mobile_dark_notour");

await ctxM.close();

// ── PaymentProofModal — renderizar en-page para captura ───────────────────
// No podemos activarlo desde UI sin login; lo renderizamos directamente con
// un script inline que monta el componente sobre un iframe/overlay simulado.
// En su lugar capturamos /marketplace/como-pagar que muestra Yape UI estática.
const ctxP = await browser.newContext({ ...devices["iPhone 14 Pro"], isMobile: true, hasTouch: true });
const pageP = await ctxP.newPage();
await pageP.goto(`${BASE}/marketplace/como-pagar?_t=${TS}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await pageP.waitForTimeout(3000);
await pageP.screenshot({ path: `${OUT}/como_pagar_mobile_light.png`, fullPage: false });
console.log("OK como_pagar_mobile_light");
await pageP.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
await pageP.waitForTimeout(600);
await pageP.screenshot({ path: `${OUT}/como_pagar_mobile_light_mid.png`, fullPage: false });
console.log("OK como_pagar_mobile_light_mid");
await ctxP.close();

// ── YapePaymentPanel — captura desde checkout con carrito real ────────────
// Simular carrito con item en localStorage y ir a checkout
const ctxC = await browser.newContext({ ...devices["iPhone 14 Pro"], isMobile: true, hasTouch: true });
const pageC = await ctxC.newPage();
await pageC.goto(`${BASE}/marketplace/main?_t=${TS}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await pageC.waitForTimeout(2000);

// Dismiss tour
try {
  const omitir = pageC.locator("text=Omitir tour");
  if (await omitir.isVisible({ timeout: 2000 })) {
    await omitir.click();
    await pageC.waitForTimeout(600);
  }
} catch {}

// Scroll y hacer click en el primer botón de agregar
await pageC.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
await pageC.waitForTimeout(1000);

// Intentar agregar primer producto
const addBtns = pageC.locator('button[aria-label*="gregar"], button:has(svg)').first();
try {
  const allBtns = await pageC.locator('button').all();
  // buscar botón de carrito con color accent
  for (const btn of allBtns) {
    const cls = await btn.getAttribute('class') || '';
    if (cls.includes('accent') || cls.includes('teal') || cls.includes('emerald')) {
      await btn.click({ timeout: 3000 }).catch(() => {});
      break;
    }
  }
} catch {}
await pageC.waitForTimeout(1000);
await pageC.screenshot({ path: `${OUT}/storefront_add_to_cart.png`, fullPage: false });
console.log("OK storefront_add_to_cart");

await ctxC.close();

// ── StepBar checkout — captura desktop con pasos ────────────────────────
const ctxD = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pageD = await ctxD.newPage();
await pageD.goto(`${BASE}/checkout?_t=${TS}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await pageD.waitForTimeout(2500);
await pageD.screenshot({ path: `${OUT}/checkout_desktop_light_stepbar.png`, fullPage: false });
console.log("OK checkout_desktop_light_stepbar");
await ctxD.close();

await browser.close();
console.log("DONE extra screenshots");
